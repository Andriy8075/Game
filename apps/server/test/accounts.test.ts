import pg from "pg";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type ColyseusTestServer } from "@colyseus/testing";
import { GAME_ROOM_NAME, LIGHT_ARMOR, MoveInput, PLAYER_DAMAGE, STARTER_WEAPON_ID, XP_PER_KILL } from "@io-game/shared";
import { createGameServer } from "../src/app.config";
import { accounts, databaseUrl, getDb, migrateAccounts } from "../src/accounts/connection";
import {
  AccountConflictError,
  addKillXp,
  connectGoogleAccount,
  createEmailAccount,
  findAccountByEmail,
  findAccountById,
  listWeapons,
} from "../src/accounts/store";
import { GameRoom } from "../src/rooms/GameRoom";
import type { GameState as ServerGameState } from "../src/rooms/schema/GameState";
import { bootGameServer } from "./bootGameServer";
import { waitTicks } from "./clock";

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
    expect(found?.xp).toBe(0);
    expect(found?.passwordHash).toBe("scrypt$salt$hash");
    expect(await listWeapons(created.id)).toEqual([]);
  });

  it("saves kill xp and raises the level", async () => {
    const created = await createEmailAccount("ada@example.com", "scrypt$salt$hash");
    const once = await addKillXp(created.id);
    const twice = await addKillXp(created.id);
    const third = await addKillXp(created.id);

    expect(once).toMatchObject({ level: 1, xp: XP_PER_KILL });
    expect(twice).toMatchObject({ level: 1, xp: XP_PER_KILL * 2 });
    expect(third).toMatchObject({ level: 2, xp: 20 });
    expect(await addKillXp("missing-account")).toBeNull();
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
    expect(registered.user).toMatchObject({ email, level: 1, xp: 0, displayName: "pilot" });
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
      xp: 0,
    });

    await colyseus.sdk.auth.signOut();
    const guest = await colyseus.connectTo(room, { name: "Guest" });
    const guestClient = room.clients.get(guest.sessionId);
    expect(guest.sessionId).toBeTruthy();
    expect(guestClient?.auth).toBe(true);
  });

  it("accepts a menu weapon only when the account level allows it", async () => {
    const email = "pilot@example.com";
    const registered = await colyseus.sdk.auth.registerWithEmailAndPassword(email, "secret12");
    const lowRoom = await colyseus.createRoom<ServerGameState>(GAME_ROOM_NAME, { manualTime: true });
    const low = await colyseus.connectTo(lowRoom, { name: "Ada", weaponId: "horizon" });
    expect(lowRoom.state.players.get(low.sessionId)?.weaponId).toBe(STARTER_WEAPON_ID);

    await getDb().update(accounts).set({ level: 12 }).where(eq(accounts.id, registered.user.id));
    const highRoom = await colyseus.createRoom<ServerGameState>(GAME_ROOM_NAME, { manualTime: true });
    const high = await colyseus.connectTo(highRoom, { name: "Ada", weaponId: "horizon" });
    expect(highRoom.state.players.get(high.sessionId)?.weaponId).toBe("horizon");

    await colyseus.sdk.auth.signOut();
    const guest = await colyseus.connectTo(highRoom, { name: "Guest", weaponId: "vanguard" });
    expect(highRoom.state.players.get(guest.sessionId)?.weaponId).toBe(STARTER_WEAPON_ID);
  });

  it("rolls a join bonus once and does not restore it after death", async () => {
    const email = "pilot@example.com";
    await colyseus.sdk.auth.registerWithEmailAndPassword(email, "secret12");
    const room = (await colyseus.createRoom<ServerGameState>(GAME_ROOM_NAME, { manualTime: true })) as unknown as GameRoom;
    room.random = () => 0;
    const joined = await colyseus.connectTo(room, { name: "Ada" });
    const player = room.state.players.get(joined.sessionId);
    if (!player) {
      throw new Error("missing player");
    }

    expect(player.inventory.frag).toBe(1);
    expect(player.inventory.bandage).toBe(1);
    expect(player.armor).toBe(LIGHT_ARMOR);
    expect(player.craftedLight).toBe(true);
    expect(player.weaponId).toBe("splinter");

    player.inventory.wood = 4;
    player.inventory.stone = 2;
    player.held = "bandage";
    await colyseus.sdk.auth.signOut();
    const guest = await colyseus.connectTo(room, { name: "Guest" });
    const shooter = room.state.players.get(guest.sessionId);
    if (!shooter) {
      throw new Error("missing shooter");
    }
    room.forceStart();

    player.hp = PLAYER_DAMAGE;
    player.armor = 0;
    shooter.x = 220;
    shooter.y = 2200;
    shooter.angle = 0;
    player.x = 480;
    player.y = 2200;
    await waitTicks(room, 18);
    sendShot(guest, 0);
    await waitTicks(room, 4);

    expect(player.alive).toBe(false);
    expect(player.hp).toBe(0);
    expect(player.weaponId).toBe("splinter");
    expect(player.inventory.wood).toBe(4);
    expect(player.inventory.stone).toBe(2);
    expect(player.inventory.frag).toBe(1);
  });

  it("gives kill xp to a signed-in shooter and none when a guest gets the kill", async () => {
    const email = "pilot@example.com";
    const registered = await colyseus.sdk.auth.registerWithEmailAndPassword(email, "secret12");
    const room = (await colyseus.createRoom<ServerGameState>(GAME_ROOM_NAME, { manualTime: true })) as unknown as GameRoom;
    const shooterClient = await colyseus.connectTo(room, { name: "Ada" });
    await colyseus.sdk.auth.signOut();
    const victimClient = await colyseus.connectTo(room, { name: "Guest" });
    const shooter = room.state.players.get(shooterClient.sessionId);
    const victim = room.state.players.get(victimClient.sessionId);
    if (!shooter || !victim) {
      throw new Error("missing players");
    }
    room.forceStart();

    victim.hp = PLAYER_DAMAGE;
    victim.armor = 0;
    shooter.x = 220;
    shooter.y = 2200;
    shooter.angle = 0;
    victim.x = 480;
    victim.y = 2200;
    await waitTicks(room, 18);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);

    const afterKill = await waitForXp(registered.user.id, XP_PER_KILL);
    expect(afterKill?.level).toBe(1);
    expect(afterKill?.xp).toBe(XP_PER_KILL);
    expect(room.state.phase).toBe("ended");

    const rematch = (await colyseus.createRoom<ServerGameState>(GAME_ROOM_NAME, { manualTime: true })) as unknown as GameRoom;
    await colyseus.sdk.auth.signOut();
    const guestShooter = await colyseus.connectTo(rematch, { name: "Guest" });
    await colyseus.sdk.auth.signInWithEmailAndPassword(email, "secret12");
    const signedVictim = await colyseus.connectTo(rematch, { name: "Ada" });
    const guest = rematch.state.players.get(guestShooter.sessionId);
    const signed = rematch.state.players.get(signedVictim.sessionId);
    if (!guest || !signed) {
      throw new Error("missing rematch players");
    }
    rematch.forceStart();
    signed.hp = PLAYER_DAMAGE;
    signed.armor = 0;
    guest.x = 220;
    guest.y = 2200;
    guest.angle = 0;
    signed.x = 480;
    signed.y = 2200;
    await waitTicks(rematch, 18);
    sendShot(guestShooter, 0);
    await waitTicks(rematch, 4);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const afterDeath = await findAccountById(registered.user.id);
    expect(afterDeath?.xp).toBe(XP_PER_KILL);
    expect(afterDeath?.level).toBe(1);
  });

  it("rejects a bad token", async () => {
    const room = await colyseus.createRoom<ServerGameState>(GAME_ROOM_NAME, {});
    colyseus.sdk.auth.token = "not-a-jwt";
    await expect(colyseus.connectTo(room)).rejects.toThrow(/onAuth failed/);
  });
});

async function waitForXp(accountId: string, xp: number) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const account = await findAccountById(accountId);
    if (account?.xp === xp) {
      return account;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return findAccountById(accountId);
}

function sendShot(client: { input: (options?: { type: typeof MoveInput }) => { data: { moveX: number; moveY: number; aimAngle: number; fire: boolean; gather: boolean }; send: () => void } }, aimAngle: number): void {
  const input = client.input({ type: MoveInput });
  input.data.moveX = 0;
  input.data.moveY = 0;
  input.data.aimAngle = aimAngle;
  input.data.fire = true;
  input.data.gather = false;
  input.send();
}
