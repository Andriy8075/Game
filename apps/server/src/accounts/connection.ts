import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { check, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import pg from "pg";
import { fileURLToPath } from "node:url";

const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/io_shooter";

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  displayName: text("display_name").notNull(),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountWeapons = pgTable(
  "account_weapons",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    weaponId: text("weapon_id").notNull(),
    source: text("source").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.weaponId] }),
    check("account_weapons_source_check", sql`${table.source} in ('opened', 'bought')`),
  ],
);

const schema = { accounts, accountWeapons };

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

let pool: pg.Pool | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!database) {
    pool = new pg.Pool({
      connectionString: databaseUrl(),
      connectionTimeoutMillis: 3000,
    });
    database = drizzle(pool, { schema });
  }
  return database;
}

export async function closeDb(): Promise<void> {
  const current = pool;
  pool = undefined;
  database = undefined;
  await current?.end();
}

export async function ensureDatabase(): Promise<void> {
  const url = new URL(databaseUrl());
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error("Unsupported database name");
  }

  const admin = new URL(url.toString());
  admin.pathname = "/postgres";
  const client = new pg.Client({
    connectionString: admin.toString(),
    connectionTimeoutMillis: 3000,
  });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }
}

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function migrateAccounts(): Promise<boolean> {
  try {
    await ensureDatabase();
    await migrate(getDb(), { migrationsFolder });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Account database is unavailable: ${message}`);
    await closeDb();
    return false;
  }
}
