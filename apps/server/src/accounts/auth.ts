import { auth, JWT, type JwtPayload } from "colyseus";
import {
  authAccount,
  connectGoogleAccount,
  createEmailAccount,
  findAccountByEmail,
  findAccountById,
  publicAccount,
  type GoogleProfile,
} from "./store";

const DEV_SECRET = "io-shooter-dev-jwt-secret";

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? DEV_SECRET;
}

export function configureAccountAuth(): void {
  JWT.settings.secret = process.env.JWT_SECRET ?? DEV_SECRET;
  auth.backend_url = process.env.AUTH_BACKEND_URL ?? "http://localhost:2567";

  if (!isGoogleConfigured()) {
    return;
  }

  auth.oauth.addProvider("google", {
    key: process.env.GOOGLE_CLIENT_ID ?? "",
    secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    scope: ["openid", "email", "profile"],
  });
}

async function onFindUserByEmail(email: string) {
  const account = await findAccountByEmail(email);
  return account ? authAccount(account) : null;
}

async function onRegisterWithEmailAndPassword(email: string, passwordHash: string) {
  await createEmailAccount(email, passwordHash);
}

function readProfileString(profile: Record<string, unknown>, key: string): string | undefined {
  const value = profile[key];
  return typeof value === "string" ? value : undefined;
}

async function onOAuthProviderCallback(
  data: { profile?: Record<string, unknown> },
  provider: string,
) {
  if (provider !== "google") {
    throw new Error("unsupported_provider");
  }

  const profile = data.profile ?? {};
  const googleProfile: GoogleProfile = {
    googleId: readProfileString(profile, "sub") ?? readProfileString(profile, "id"),
    email: readProfileString(profile, "email"),
    name: readProfileString(profile, "name"),
  };
  return connectGoogleAccount(googleProfile);
}

async function onParseToken(token: JwtPayload) {
  const id = token.id;
  if (typeof id !== "string") {
    throw new Error("invalid_token");
  }
  const account = await findAccountById(id);
  if (!account) {
    throw new Error("invalid_token");
  }
  return publicAccount(account);
}

export function accountAuthSettings() {
  return {
    onFindUserByEmail,
    onRegisterWithEmailAndPassword,
    onOAuthProviderCallback,
    onParseToken,
  };
}
