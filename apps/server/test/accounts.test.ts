import pg from "pg";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type ColyseusTestServer } from "@colyseus/testing";
import { GAME_ROOM_NAME } from "@io-game/shared";
import { createGameServer } from "../src/app.config";
import { databaseUrl, getDb, migrateAccounts } from "../src/accounts/connection";
import {
  AccountConflictError,
  connectGoogleAccount,
  createEmailAccount,
  findAccountByEmail,
  listWeapons,
} from "../src/accounts/store";
import type { GameState as ServerGameState } from "../src/rooms/schema/GameState";
import { bootGameServer } from "./bootGameServer";

async function postgresReachable(): Promise<boolean> {
  const url = new URL(databaseUrl());
  url.pathname = "/postgres";
  const client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 1500,
  });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function truncateAccounts(): Promise<void> {
  await getDb().execute(sql`truncate table "account_weapons", "accounts" restart identity cascade`);
}

const ready = await postgresReachable();

describe.skipIf(!ready)("account store", () => {
  beforeAll(async () => {
    const migrated = await migrateAccounts();
    expect(migrated).toBe(true);
  });

  beforeEach(async () => {
    await truncateAccounts();
  });

  it("creates an email account at level 1 with no weapons", async () => {
    const created = await createEmailAccount("Ada@Example.com", "scrypt$salt$hash");
    const found = await findAccountByEmail("ada@example.com");

    expect(found?.id).toBe(created.id);
    expect(found?.level).toBe(1);
    expect(found?.passwordHash).toBe("scrypt$salt$hash");
    expect(await listWeapons(created.id)).toEqual([]);
  });

  it("rejects a duplicate email", async () => {
    await createEmailAccount("ada@example.com", "scrypt$salt$hash");
    await expect(createEmailAccount("ada@example.com", "scrypt$other$other")).rejects.toBeInstanceOf(
      AccountConflictError,
    );
  });

  it("links a Google id onto an existing email", async () => {
    const created = await createEmailAccount("ada@example.com", "scrypt$salt$hash");
    const linked = await connectGoogleAccount({
      googleId: "google-ada",
      email: "Ada@Example.com",
      name: "Nova",
    });

    expect(linked.id).toBe(created.id);
    expect(linked.level).toBe(1);
    expect(linked.displayName).toBe("ada");
    expect((await findAccountByEmail("ada@example.com"))?.googleId).toBe("google-ada");
    expect(await listWeapons(created.id)).toEqual([]);
  });
});

describe.skipIf(!ready)("account http", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    const migrated = await migrateAccounts();
    expect(migrated).toBe(true);
    colyseus = await bootGameServer(
      createGameServer({
        greet: false,
        gracefullyShutdown: false,
      }),
    );
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  beforeEach(async () => {
    await colyseus.cleanup();
    await truncateAccounts();
  });

  it("registers and logs in with email and password", async () => {
    const email = "pilot@example.com";
    const registered = await colyseus.sdk.auth.registerWithEmailAndPassword(email, "secret12");
    expect(registered.user).toMatchObject({ email, level: 1 });
    expect(registered.token).toBeTruthy();

    await colyseus.sdk.auth.signOut();
    const loggedIn = await colyseus.sdk.auth.signInWithEmailAndPassword(email, "secret12");
    expect(loggedIn.user).toMatchObject({ email, level: 1 });
    expect(loggedIn.token).toBeTruthy();
  });

  it("rejects the wrong password", async () => {
    const email = "pilot@example.com";
    await colyseus.sdk.auth.registerWithEmailAndPassword(email, "secret12");
    await colyseus.sdk.auth.signOut();
    await expect(colyseus.sdk.auth.signInWithEmailAndPassword(email, "wrong-password")).rejects.toThrow(
      /invalid_credentials/,
    );
  });

  it("joins a room with the account token and still allows a guest", async () => {
    const email = "pilot@example.com";
    const registered = await colyseus.sdk.auth.registerWithEmailAndPassword(email, "secret12");
    const room = await colyseus.createRoom<ServerGameState>(GAME_ROOM_NAME, {});
    const joined = await colyseus.connectTo(room, { name: "Ada" });
    const authed = room.clients.get(joined.sessionId);

    expect(authed?.auth).toMatchObject({
      id: registered.user.id,
      email,
      level: 1,
    });

    await colyseus.sdk.auth.signOut();
    const guest = await colyseus.connectTo(room, { name: "Guest" });
    const guestClient = room.clients.get(guest.sessionId);
    expect(guest.sessionId).toBeTruthy();
    expect(guestClient?.auth).toBe(true);
  });

  it("rejects a bad token", async () => {
    const room = await colyseus.createRoom<ServerGameState>(GAME_ROOM_NAME, {});
    colyseus.sdk.auth.token = "not-a-jwt";
    await expect(colyseus.connectTo(room)).rejects.toThrow(/onAuth failed/);
  });
});
