import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import {
  DEFAULT_PLAYER_NAME,
  GAME_ROOM_NAME,
  HARVEST,
  HEAVY_ARMOR,
  LIGHT_ARMOR,
  MoveInput,
  PICKUP_SLOTS,
  PLAYER_DAMAGE,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  STARTER_WEAPON_ID,
  TICK_RATE,
  getObstacle,
  getWeapon,
  weaponsForSource,
  type GameState,
} from "@io-game/shared";
import { createGameServer } from "../src/app.config";
import { GameRoom } from "../src/rooms/GameRoom";
import { connectPlaying, flush, waitTicks } from "./clock";

describe("GameRoom", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    const gameServer = createGameServer({
      greet: false,
      gracefullyShutdown: false,
    });
    await gameServer.listen(2598);
    colyseus = new ColyseusTestServer(gameServer);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  function openRoom(): Promise<GameRoom> {
    return colyseus.createRoom(GAME_ROOM_NAME, { manualTime: true }) as Promise<GameRoom>;
  }

  it("joins a player into the room", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);

    expect(client.sessionId).toBeTruthy();
    expect(room.state.players.has(client.sessionId)).toBe(true);
    expect(client.state.players.has(client.sessionId)).toBe(true);
    expect(room.state.players.get(client.sessionId)?.name).toBe(DEFAULT_PLAYER_NAME);
  });

  it("stores the menu name on the player", async () => {
    const room = await colyseus.createRoom<GameState>(GAME_ROOM_NAME, {});
    const client = await colyseus.connectTo(room, { name: "  Nova  " });
    const player = room.state.players.get(client.sessionId);

    expect(player?.name).toBe("Nova");
  });

  it("rejects a blank menu name", async () => {
    const room = await colyseus.createRoom<GameState>(GAME_ROOM_NAME, {});
    const client = await colyseus.connectTo(room, { name: "   \n  " });
    const player = room.state.players.get(client.sessionId);

    expect(player?.name).toBe(DEFAULT_PLAYER_NAME);
  });

  it("removes a player when they leave", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    await client.leave(true);
    await flush();

    expect(room.state.players.has(client.sessionId)).toBe(false);
  });

  it("moves the player from authoritative input", async () => {
    const room = await openRoom();
    const [client] = await connectPlaying(colyseus, room);
    const player = room.state.players.get(client.sessionId);
    if (!player) {
      throw new Error("missing player");
    }

    player.x = 220;
    player.y = 220;
    const startX = player.x;

    sendMove(client, 1, 0);
    await waitTicks(room, 8);

    expect(player.x).toBeGreaterThan(startX);
  });

  it("rejects speed hacks by clamping movement axes", async () => {
    const room = await openRoom();
    const [honestClient, cheaterClient] = await connectPlaying(colyseus, room, {}, {});
    const honest = room.state.players.get(honestClient.sessionId);
    const cheater = room.state.players.get(cheaterClient.sessionId);
    if (!honest || !cheater) {
      throw new Error("missing players");
    }

    honest.x = 240;
    honest.y = 240;
    cheater.x = 240;
    cheater.y = 360;

    sendMove(honestClient, 1, 0);
    sendMove(cheaterClient, 127, 0);
    await waitTicks(room, 8);

    expect(cheater.x - 240).toBeCloseTo(honest.x - 240, 1);
  });

  it("stops players from walking through buildings", async () => {
    const room = await openRoom();
    const [client] = await connectPlaying(colyseus, room);
    const player = room.state.players.get(client.sessionId);
    const building = getObstacle("hq");
    if (!player || !building || building.kind !== "building") {
      throw new Error("missing player or building");
    }

    player.x = building.x - PLAYER_RADIUS - 2;
    player.y = building.y + building.height / 2;

    sendMove(client, 1, 0);
    await waitTicks(room, 20);

    expect(player.x).toBeLessThan(building.x);
  });

  it("applies hitscan damage with a clear line of sight", async () => {
    const room = await openRoom();
    const [shooterClient, targetClient] = await connectPlaying(colyseus, room, {}, {});
    const shooter = room.state.players.get(shooterClient.sessionId);
    const target = room.state.players.get(targetClient.sessionId);
    if (!shooter || !target) {
      throw new Error("missing players");
    }

    shooter.x = 220;
    shooter.y = 2200;
    shooter.angle = 0;
    target.x = 480;
    target.y = 2200;
    const startHp = target.hp;

    sendShot(shooterClient, 0);
    await waitTicks(room, 4);

    expect(target.hp).toBeLessThan(startHp);
  });

  it("blocks shots with buildings", async () => {
    const room = await openRoom();
    const [shooterClient, targetClient] = await connectPlaying(colyseus, room, {}, {});
    const shooter = room.state.players.get(shooterClient.sessionId);
    const target = room.state.players.get(targetClient.sessionId);
    const building = getObstacle("hq");
    if (!shooter || !target || !building || building.kind !== "building") {
      throw new Error("missing players or building");
    }

    shooter.x = building.x - 90;
    shooter.y = building.y + building.height / 2;
    shooter.angle = 0;
    target.x = building.x + building.width + 90;
    target.y = shooter.y;
    const startHp = target.hp;

    sendShot(shooterClient, 0);
    await waitTicks(room, 4);

    expect(target.hp).toBe(startHp);
  });

  it("places only field pickups on the map", async () => {
    const room = await colyseus.createRoom<GameState>(GAME_ROOM_NAME, {});
    const allowed = new Set<string>(weaponsForSource("pickup").map((weapon) => weapon.id));

    expect(room.state.pickups.size).toBe(PICKUP_SLOTS.length);
    for (const pickup of room.state.pickups.values()) {
      expect(allowed.has(pickup.weaponId)).toBe(true);
    }
  });

  it("equips a weapon when the player stands on its pickup", async () => {
    const room = await openRoom();
    const [client] = await connectPlaying(colyseus, room);
    const player = room.state.players.get(client.sessionId);
    const pickup = [...room.state.pickups.values()][0];
    if (!player || !pickup) {
      throw new Error("missing player or pickup");
    }

    const weaponId = pickup.weaponId;
    player.x = pickup.x;
    player.y = pickup.y;
    await waitTicks(room, 3);

    expect(player.weaponId).toBe(weaponId);
    expect(player.damage).toBe(getWeapon(weaponId).damage);
    expect(room.state.pickups.size).toBe(PICKUP_SLOTS.length - 1);
  });

  it("respects the equipped weapon fire cooldown", async () => {
    const room = await openRoom();
    const [shooterClient, targetClient] = await connectPlaying(colyseus, room, {}, {});
    const shooter = room.state.players.get(shooterClient.sessionId);
    const target = room.state.players.get(targetClient.sessionId);
    if (!shooter || !target) {
      throw new Error("missing players");
    }

    shooter.x = 220;
    shooter.y = 2200;
    shooter.angle = 0;
    target.x = 480;
    target.y = 2200;
    const sidearm = getWeapon(STARTER_WEAPON_ID);
    const startHp = target.hp;

    sendShot(shooterClient, 0);
    await waitTicks(room, 2);
    expect(target.hp).toBe(startHp - sidearm.damage);

    sendShot(shooterClient, 0);
    await waitTicks(room, 2);
    expect(target.hp).toBe(startHp - sidearm.damage);
    expect(shooter.weaponId).toBe(STARTER_WEAPON_ID);

    await waitTicks(room, 10);

    sendShot(shooterClient, 0);
    await waitTicks(room, 2);
    expect(target.hp).toBe(startHp - sidearm.damage * 2);
  });

  it("fires again on the first tick after cooldown while the trigger is held", async () => {
    const room = await openRoom();
    const [shooterClient, targetClient] = await connectPlaying(colyseus, room, {}, {});
    const shooter = room.state.players.get(shooterClient.sessionId);
    const target = room.state.players.get(targetClient.sessionId);
    if (!shooter || !target) {
      throw new Error("missing players");
    }

    shooter.x = 220;
    shooter.y = 2200;
    shooter.angle = 0;
    target.x = 480;
    target.y = 2200;
    const sidearm = getWeapon(STARTER_WEAPON_ID);
    const startHp = target.hp;
    const dtMs = 1000 / TICK_RATE;
    const shotTicks: number[] = [];
    let previousHp = startHp;

    for (let tick = 1; tick <= 40 && shotTicks.length < 3; tick += 1) {
      sendShot(shooterClient, 0);
      await waitTicks(room, 1);
      if (target.hp < previousHp) {
        shotTicks.push(tick);
        previousHp = target.hp;
      }
    }

    expect(shotTicks).toHaveLength(3);
    expect(target.hp).toBe(startHp - sidearm.damage * 3);
    for (let index = 1; index < shotTicks.length; index += 1) {
      const between = (shotTicks[index]! - shotTicks[index - 1]!) * dtMs;
      expect(between).toBeGreaterThanOrEqual(sidearm.fireCooldownMs);
      expect(between - dtMs).toBeLessThan(sidearm.fireCooldownMs);
    }
  });

  it("gathers wood from a nearby tree and ignores far nodes", async () => {
    const room = await openRoom();
    const [client] = await connectPlaying(colyseus, room);
    const player = room.state.players.get(client.sessionId);
    const tree = getObstacle("tree-1");
    if (!player || !tree || tree.kind !== "tree") {
      throw new Error("missing player or tree");
    }

    expect(room.state.nodes.get("iron-1")?.remaining).toBe(HARVEST.iron.charges);
    expect(room.state.nodes.get("gold-1")?.remaining).toBe(HARVEST.gold.charges);

    player.x = 1600;
    player.y = 2200;
    sendGather(client);
    await waitTicks(room, 3);
    expect(player.inventory.wood).toBe(0);

    player.x = tree.x;
    player.y = tree.y + tree.radius + PLAYER_RADIUS + 8;
    sendGather(client);
    await waitTicks(room, 3);
    expect(player.inventory.wood).toBe(0);

    sendMessage(client, "hold", "arm");
    await waitTicks(room, 2);
    expect(player.held).toBe("arm");
    sendGather(client);
    await waitTicks(room, 3);

    expect(player.inventory.wood).toBe(1);
    expect(room.state.nodes.get("tree-1")?.remaining).toBe(HARVEST.tree.charges - 1);
  });

  it("crafts a bandage from wood and heals with it", async () => {
    const room = await openRoom();
    const [client] = await connectPlaying(colyseus, room);
    const player = room.state.players.get(client.sessionId);
    if (!player) {
      throw new Error("missing player");
    }

    player.inventory.wood = 1;
    player.hp = 40;
    sendMessage(client, "craft", "bandage");
    await waitTicks(room, 2);
    expect(player.inventory.bandage).toBe(0);

    player.inventory.wood = 2;
    sendMessage(client, "craft", "bandage");
    await waitTicks(room, 2);
    expect(player.inventory.wood).toBe(0);
    expect(player.inventory.bandage).toBe(1);

    sendMessage(client, "use", "bandage");
    await waitTicks(room, 2);
    expect(player.hp).toBe(80);
    expect(player.inventory.bandage).toBe(0);
  });

  it("equips armor that absorbs bullet damage", async () => {
    const room = await openRoom();
    const [shooterClient, targetClient] = await connectPlaying(colyseus, room, {}, {});
    const shooter = room.state.players.get(shooterClient.sessionId);
    const target = room.state.players.get(targetClient.sessionId);
    if (!shooter || !target) {
      throw new Error("missing players");
    }

    target.inventory.iron = 4;
    target.inventory.stone = 3;
    sendMessage(targetClient, "craft", "lightArmor");
    await waitTicks(room, 2);
    expect(target.armor).toBe(LIGHT_ARMOR);
    expect(target.craftedLight).toBe(true);
    expect(target.inventory.lightArmor).toBe(0);

    shooter.x = 220;
    shooter.y = 2200;
    shooter.angle = 0;
    target.x = 480;
    target.y = 2200;
    await waitTicks(room, 18);

    sendShot(shooterClient, 0);
    await waitTicks(room, 4);

    expect(target.hp).toBe(PLAYER_MAX_HP);
    expect(target.armor).toBe(LIGHT_ARMOR - PLAYER_DAMAGE);
  });

  it("upgrades light armor to heavy and refuses another light craft", async () => {
    const room = await openRoom();
    const [client] = await connectPlaying(colyseus, room);
    const player = room.state.players.get(client.sessionId);
    if (!player) {
      throw new Error("missing player");
    }

    player.inventory.iron = 9;
    player.inventory.stone = 3;
    player.inventory.gold = 3;
    sendMessage(client, "craft", "lightArmor");
    await waitTicks(room, 2);
    expect(player.armor).toBe(LIGHT_ARMOR);
    expect(player.craftedLight).toBe(true);

    sendMessage(client, "craft", "heavyArmor");
    await waitTicks(room, 2);
    expect(player.armor).toBe(HEAVY_ARMOR);
    expect(player.maxArmor).toBe(HEAVY_ARMOR);
    expect(player.craftedHeavy).toBe(true);
    expect(player.inventory.iron).toBe(0);
    expect(player.inventory.gold).toBe(0);

    player.inventory.iron = 3;
    player.inventory.stone = 2;
    sendMessage(client, "craft", "lightArmor");
    await waitTicks(room, 2);
    expect(player.inventory.iron).toBe(3);
    expect(player.inventory.stone).toBe(2);
    expect(player.armor).toBe(HEAVY_ARMOR);

    sendMessage(client, "craft", "heavyArmor");
    await waitTicks(room, 2);
    expect(player.inventory.iron).toBe(3);
    expect(player.armor).toBe(HEAVY_ARMOR);
  });

  it("throws a frag grenade that damages a player in the blast", async () => {
    const room = await openRoom();
    const [shooterClient, targetClient] = await connectPlaying(colyseus, room, {}, {});
    const shooter = room.state.players.get(shooterClient.sessionId);
    const target = room.state.players.get(targetClient.sessionId);
    if (!shooter || !target) {
      throw new Error("missing players");
    }

    shooter.x = 200;
    shooter.y = 2200;
    shooter.angle = 0;
    shooter.inventory.frag = 1;
    target.x = 560;
    target.y = 2200;
    const startHp = target.hp;

    sendMessage(shooterClient, "hold", "frag");
    await waitTicks(room, 2);
    expect(shooter.held).toBe("frag");
    expect(shooter.inventory.frag).toBe(1);
    expect(room.state.grenades.size).toBe(0);

    sendMessage(shooterClient, "throw", "frag");
    await waitTicks(room, 40);

    expect(shooter.inventory.frag).toBe(0);
    expect(target.hp).toBeLessThan(startHp);
    expect(shooter.hp).toBe(PLAYER_MAX_HP);
  });

  it("keeps a guest on the sidearm even if they ask for a menu gun", async () => {
    const room = await openRoom();
    room.random = () => 0;
    const client = await colyseus.connectTo(room, { name: "Guest", weaponId: "horizon" });
    const player = room.state.players.get(client.sessionId);

    expect(player?.weaponId).toBe(STARTER_WEAPON_ID);
    expect(player?.inventory.frag).toBe(0);
    expect(player?.inventory.bandage).toBe(0);
    expect(player?.armor).toBe(0);
  });

  it("refuses light armor when the new price is not met", async () => {
    const room = await openRoom();
    const [client] = await connectPlaying(colyseus, room);
    const player = room.state.players.get(client.sessionId);
    if (!player) {
      throw new Error("missing player");
    }

    player.inventory.iron = 3;
    player.inventory.stone = 2;
    sendMessage(client, "craft", "lightArmor");
    await waitTicks(room, 2);

    expect(player.armor).toBe(0);
    expect(player.inventory.iron).toBe(3);
    expect(player.inventory.stone).toBe(2);
  });

  it("ends the match when only one player is alive and ignores further damage", async () => {
    const room = await openRoom();
    const [shooterClient, targetClient] = await connectPlaying(colyseus, room, { name: "Nova" }, { name: "Rook" });
    const shooter = room.state.players.get(shooterClient.sessionId);
    const target = room.state.players.get(targetClient.sessionId);
    if (!shooter || !target) {
      throw new Error("missing players");
    }

    target.hp = PLAYER_DAMAGE;
    target.armor = 0;
    shooter.x = 220;
    shooter.y = 2200;
    shooter.angle = 0;
    target.x = 480;
    target.y = 2200;
    await waitTicks(room, 18);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);

    expect(shooter.kills).toBe(1);
    expect(target.alive).toBe(false);
    expect(target.hp).toBe(0);
    expect(room.state.phase).toBe("ended");
    expect(room.state.winnerName).toBe("Nova");
    expect(room.state.winnerId).toBe(shooterClient.sessionId);

    const deadX = target.x;
    const deadY = target.y;
    sendShot(shooterClient, 0);
    sendMove(targetClient, 1, 0);
    await waitTicks(room, 4);

    expect(target.hp).toBe(0);
    expect(target.x).toBe(deadX);
    expect(target.y).toBe(deadY);
    expect(shooter.kills).toBe(1);
    expect(target.alive).toBe(false);
  });

  it("serves a health endpoint", async () => {
    const response = await colyseus.http.get("/health");
    expect(response.data).toEqual({ ok: true });
  });
});

type InputClient = {
  input: (options?: { type: typeof MoveInput }) => {
    data: {
      moveX: number;
      moveY: number;
      aimAngle: number;
      fire: boolean;
      gather: boolean;
    };
    send: () => void;
  };
  send: (type: string, payload?: unknown) => void;
};

function sendMove(client: InputClient, moveX: number, moveY: number): void {
  const input = client.input({ type: MoveInput });
  input.data.moveX = moveX as -1 | 0 | 1;
  input.data.moveY = moveY as -1 | 0 | 1;
  input.data.aimAngle = 0;
  input.data.fire = false;
  input.data.gather = false;
  input.send();
}

function sendGather(client: InputClient): void {
  const input = client.input({ type: MoveInput });
  input.data.moveX = 0;
  input.data.moveY = 0;
  input.data.aimAngle = 0;
  input.data.fire = false;
  input.data.gather = true;
  input.send();
}

function sendMessage(client: InputClient, type: string, payload: unknown): void {
  client.send(type, payload);
}

function sendShot(client: InputClient, aimAngle: number): void {
  const input = client.input({ type: MoveInput });
  input.data.moveX = 0;
  input.data.moveY = 0;
  input.data.aimAngle = aimAngle;
  input.data.fire = true;
  input.data.gather = false;
  input.send();
}

