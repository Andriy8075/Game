import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { grantXp, normalizeHotbarOrder, sanitizePlayerName, XP_PER_KILL, XP_PER_WIN } from "@io-game/shared";
import { accountWeapons, accounts, getDb } from "./connection";

export class AccountConflictError extends Error {
  constructor() {
    super("email_already_in_use");
    this.name = "AccountConflictError";
  }
}

export type AccountRow = typeof accounts.$inferSelect;

export type PublicAccount = {
  id: string;
  email: string;
  displayName: string;
  level: number;
  xp: number;
  hotbarOrder: string[] | null;
};

export type AuthAccount = PublicAccount & {
  password: string | null;
};

export type GoogleProfile = {
  googleId: string | undefined;
  email: string | undefined;
  name: string | undefined;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function publicAccount(account: AccountRow): PublicAccount {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    level: account.level,
    xp: account.xp,
    hotbarOrder: account.hotbarOrder == null ? null : normalizeHotbarOrder(account.hotbarOrder),
  };
}

export function authAccount(account: AccountRow): AuthAccount {
  return {
    ...publicAccount(account),
    password: account.passwordHash,
  };
}

function displayNameFromEmail(email: string): string {
  return sanitizePlayerName(email.split("@")[0] ?? "");
}

function displayNameForGoogle(name: string | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return sanitizePlayerName(trimmed);
  }
  return displayNameFromEmail(email);
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("code" in error && error.code === "23505") {
    return true;
  }
  if ("cause" in error) {
    return isUniqueViolation(error.cause);
  }
  return false;
}

export async function findAccountByEmail(email: string): Promise<AccountRow | null> {
  const rows = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.email, normalizeEmail(email)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findAccountById(id: string): Promise<AccountRow | null> {
  const rows = await getDb().select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findAccountByGoogleId(googleId: string): Promise<AccountRow | null> {
  const rows = await getDb().select().from(accounts).where(eq(accounts.googleId, googleId)).limit(1);
  return rows[0] ?? null;
}

export async function createEmailAccount(email: string, passwordHash: string): Promise<AccountRow> {
  const normalized = normalizeEmail(email);
  try {
    const rows = await getDb()
      .insert(accounts)
      .values({
        id: randomUUID(),
        email: normalized,
        passwordHash,
        displayName: displayNameFromEmail(normalized),
      })
      .returning();
    const created = rows[0];
    if (!created) {
      throw new Error("insert_failed");
    }
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AccountConflictError();
    }
    throw error;
  }
}

export async function addAccountXp(accountId: string, amount: number): Promise<PublicAccount | null> {
  return getDb().transaction(async (tx) => {
    const rows = await tx.select().from(accounts).where(eq(accounts.id, accountId)).for("update").limit(1);
    const account = rows[0];
    if (!account) {
      return null;
    }
    const next = grantXp(account.level, account.xp, amount);
    if (next.level === account.level && next.xp === account.xp) {
      return publicAccount(account);
    }
    await tx.update(accounts).set({ level: next.level, xp: next.xp }).where(eq(accounts.id, accountId));
    return publicAccount({ ...account, level: next.level, xp: next.xp });
  });
}

export async function addKillXp(accountId: string): Promise<PublicAccount | null> {
  return addAccountXp(accountId, XP_PER_KILL);
}

export async function addWinXp(accountId: string): Promise<PublicAccount | null> {
  return addAccountXp(accountId, XP_PER_WIN);
}

export async function setHotbarOrder(accountId: string, order: unknown): Promise<PublicAccount | null> {
  const account = await findAccountById(accountId);
  if (!account) {
    return null;
  }
  const next = normalizeHotbarOrder(order);
  await getDb().update(accounts).set({ hotbarOrder: next }).where(eq(accounts.id, accountId));
  return publicAccount({ ...account, hotbarOrder: next });
}

export async function listWeapons(accountId: string): Promise<Array<{ weaponId: string; source: string }>> {
  const rows = await getDb()
    .select({
      weaponId: accountWeapons.weaponId,
      source: accountWeapons.source,
    })
    .from(accountWeapons)
    .where(eq(accountWeapons.accountId, accountId));
  return rows;
}

export async function connectGoogleAccount(profile: GoogleProfile): Promise<PublicAccount> {
  const googleId = profile.googleId?.trim();
  const email = profile.email ? normalizeEmail(profile.email) : "";
  if (!googleId || !email) {
    throw new Error("google_profile_incomplete");
  }

  const byGoogle = await findAccountByGoogleId(googleId);
  if (byGoogle) {
    return publicAccount(byGoogle);
  }

  const byEmail = await findAccountByEmail(email);
  if (byEmail) {
    if (byEmail.googleId && byEmail.googleId !== googleId) {
      throw new Error("google_already_linked");
    }
    if (!byEmail.googleId) {
      await getDb().update(accounts).set({ googleId }).where(eq(accounts.id, byEmail.id));
    }
    return publicAccount({ ...byEmail, googleId });
  }

  try {
    const rows = await getDb()
      .insert(accounts)
      .values({
        id: randomUUID(),
        email,
        googleId,
        displayName: displayNameForGoogle(profile.name, email),
      })
      .returning();
    const created = rows[0];
    if (!created) {
      throw new Error("insert_failed");
    }
    return publicAccount(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AccountConflictError();
    }
    throw error;
  }
}
