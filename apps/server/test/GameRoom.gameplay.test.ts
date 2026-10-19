import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import {
  BANDAGE_HEAL,
  FIRE_DAMAGE,
  FLASH_RADIUS,
  FLASH_SLOW_MS,
  FRAG_DAMAGE,
  FRAG_RADIUS,
  GAME_ROOM_NAME,
  HARVEST,
  HEAVY_ARMOR,
  LIGHT_ARMOR,
  MoveInput,
  PLAYER_DAMAGE,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  SLOW_SPEED_FACTOR,
  STARTER_WEAPON_ID,
  THROW_COOLDOWN_MS,
  TICK_RATE,
  getObstacle,
  type CircleObstacle,
} from "@io-game/shared";
import { createGameServer } from "../src/app.config";
import { GameRoom } from "../src/rooms/GameRoom";
import { waitTicks } from "./clock";

const GATHER_GAP_TICKS = 16;

describe("gather, craft, and combat", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    const gameServer = createGameServer({
      greet: false,
      gracefullyShutdown: false,
    });
    await gameServer.listen(2599);
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

  it("switches between the gun, grenades, bandage, and arm, and ignores armor", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);

    for (const slot of ["frag", "flash", "incendiary", "bandage", "arm", "gun"] as const) {
      sendMessage(client, "hold", slot);
      await waitTicks(room, 1);
      expect(player.held).toBe(slot);
    }

    sendMessage(client, "hold", "lightArmor");
    sendMessage(client, "hold", "heavyArmor");
    sendMessage(client, "hold", "pickaxe");
    await waitTicks(room, 2);
    expect(player.held).toBe("gun");
  });

  it("puts wood, stone, iron, and gold into the inventory only while the arm is out", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);
    const nodes = [node("tree-1"), node("stone-1"), node("iron-1"), node("gold-1")];

    sendMessage(client, "hold", "gun");
    await waitTicks(room, 1);
    await standAt(player, nodes[0]);
    sendGather(client);
    await waitTicks(room, 3);
    expect(player.inventory.wood).toBe(0);

    sendMessage(client, "hold", "arm");
    await waitTicks(room, 1);
    for (const obstacle of nodes) {
      const before = room.state.nodes.get(obstacle.id)?.remaining ?? 0;
      await standAt(player, obstacle);
      sendGather(client);
      await waitTicks(room, GATHER_GAP_TICKS);
      expect(player.inventory[HARVEST[obstacle.kind].resource]).toBe(1);
      expect(room.state.nodes.get(obstacle.id)?.remaining).toBe(before - 1);
    }
  });

  it("waits out the gather cooldown and stops when the node is empty", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);
    const gold = node("gold-1");

    sendMessage(client, "hold", "arm");
    await waitTicks(room, 1);
    await standAt(player, gold);

    sendGather(client);
    await waitTicks(room, 2);
    sendGather(client);
    await waitTicks(room, 2);
    expect(player.inventory.gold).toBe(1);

    await waitTicks(room, GATHER_GAP_TICKS);
    sendGather(client);
    await waitTicks(room, 3);
    expect(player.inventory.gold).toBe(HARVEST.gold.charges);
    expect(room.state.nodes.get(gold.id)?.remaining).toBe(0);

    sendGather(client);
    await waitTicks(room, GATHER_GAP_TICKS);
    sendGather(client);
    await waitTicks(room, 3);
    expect(player.inventory.gold).toBe(HARVEST.gold.charges);
  });

  it("grows a depleted gold vein back", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);
    const gold = node("gold-1");

    sendMessage(client, "hold", "arm");
    await waitTicks(room, 1);
    await gatherTimes(room, client, player, gold, HARVEST.gold.charges);
    expect(room.state.nodes.get(gold.id)?.remaining).toBe(0);

    const ticks = Math.ceil(HARVEST.gold.respawnMs / (1000 / TICK_RATE)) + 2;
    await waitTicks(room, ticks);
    expect(room.state.nodes.get(gold.id)?.remaining).toBe(HARVEST.gold.charges);
  });

  it("does not shoot while the arm or a grenade is selected", async () => {
    const room = await openRoom();
    const shooterClient = await colyseus.connectTo(room);
    const targetClient = await colyseus.connectTo(room);
    const shooter = requirePlayer(room, shooterClient.sessionId);
    const target = requirePlayer(room, targetClient.sessionId);
    placeDuel(shooter, target);

    sendMessage(shooterClient, "hold", "arm");
    await waitTicks(room, 1);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);
    expect(target.hp).toBe(PLAYER_MAX_HP);

    sendMessage(shooterClient, "hold", "frag");
    await waitTicks(room, 1);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);
    expect(target.hp).toBe(PLAYER_MAX_HP);

    sendMessage(shooterClient, "hold", "gun");
    await waitTicks(room, 1);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);
    expect(target.hp).toBe(PLAYER_MAX_HP - PLAYER_DAMAGE);
  });

  it("crafts grenades and bandages only when every resource is paid", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);

    player.inventory.stone = 2;
    sendMessage(client, "craft", "frag");
    sendMessage(client, "craft", "not-a-recipe");
    await waitTicks(room, 2);
    expect(player.inventory.frag).toBe(0);
    expect(player.inventory.stone).toBe(2);

    player.inventory.wood = 6;
    player.inventory.stone = 4;
    player.inventory.iron = 3;
    player.inventory.gold = 1;
    sendMessage(client, "craft", "frag");
    sendMessage(client, "craft", "flash");
    sendMessage(client, "craft", "incendiary");
    sendMessage(client, "craft", "bandage");
    await waitTicks(room, 2);

    expect(player.inventory.frag).toBe(1);
    expect(player.inventory.flash).toBe(1);
    expect(player.inventory.incendiary).toBe(1);
    expect(player.inventory.bandage).toBe(1);
    expect(player.inventory.wood).toBe(2);
    expect(player.inventory.stone).toBe(1);
    expect(player.inventory.iron).toBe(1);
    expect(player.inventory.gold).toBe(0);
  });

  it("heals with a bandage, caps at full health, and keeps the bandage when it cannot be used", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);

    player.hp = PLAYER_MAX_HP;
    player.inventory.bandage = 1;
    sendMessage(client, "use", "bandage");
    await waitTicks(room, 2);
    expect(player.hp).toBe(PLAYER_MAX_HP);
    expect(player.inventory.bandage).toBe(1);

    player.hp = 10;
    sendMessage(client, "use", "bandage");
    await waitTicks(room, 2);
    expect(player.hp).toBe(10 + BANDAGE_HEAL);
    expect(player.inventory.bandage).toBe(0);

    player.hp = PLAYER_MAX_HP - 5;
    sendMessage(client, "use", "bandage");
    await waitTicks(room, 2);
    expect(player.hp).toBe(PLAYER_MAX_HP - 5);

    player.inventory.bandage = 1;
    player.hp = PLAYER_MAX_HP - 5;
    sendMessage(client, "use", "bandage");
    await waitTicks(room, 2);
    expect(player.hp).toBe(PLAYER_MAX_HP);
    expect(player.inventory.bandage).toBe(0);
  });

  it("does not equip armor by using an inventory stack", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);

    player.inventory.lightArmor = 1;
    sendMessage(client, "use", "lightArmor");
    sendMessage(client, "use", "heavyArmor");
    await waitTicks(room, 2);
    expect(player.armor).toBe(0);
    expect(player.inventory.lightArmor).toBe(1);
  });

  it("throws a frag only from the hand and deals full damage at the blast center", async () => {
    const room = await openRoom();
    const throwerClient = await colyseus.connectTo(room);
    const targetClient = await colyseus.connectTo(room);
    const thrower = requirePlayer(room, throwerClient.sessionId);
    const target = requirePlayer(room, targetClient.sessionId);

    thrower.x = 200;
    thrower.y = 2200;
    thrower.angle = 0;
    thrower.inventory.frag = 2;
    target.x = 3000;
    target.y = 2200;

    sendMessage(throwerClient, "throw", "frag");
    await waitTicks(room, 2);
    expect(room.state.grenades.size).toBe(0);
    expect(thrower.inventory.frag).toBe(2);

    sendMessage(throwerClient, "hold", "flash");
    await waitTicks(room, 1);
    sendMessage(throwerClient, "throw", "frag");
    await waitTicks(room, 2);
    expect(room.state.grenades.size).toBe(0);

    sendMessage(throwerClient, "hold", "frag");
    await waitTicks(room, 1);
    sendMessage(throwerClient, "throw", "frag");
    await waitTicks(room, 1);
    const impact = projectGrenade(onlyGrenade(room));
    target.x = impact.x;
    target.y = impact.y;

    await waitUntil(room, () => room.state.grenades.size === 0);
    expect(thrower.inventory.frag).toBe(1);
    expect(target.hp).toBe(PLAYER_MAX_HP - FRAG_DAMAGE);
    expect(thrower.hp).toBe(PLAYER_MAX_HP);
    expect(FRAG_RADIUS).toBeGreaterThan(0);
  });

  it("slows players inside a flash blast and leaves others alone", async () => {
    const room = await openRoom();
    const throwerClient = await colyseus.connectTo(room);
    const caughtClient = await colyseus.connectTo(room);
    const safeClient = await colyseus.connectTo(room);
    const thrower = requirePlayer(room, throwerClient.sessionId);
    const caught = requirePlayer(room, caughtClient.sessionId);
    const safe = requirePlayer(room, safeClient.sessionId);

    thrower.x = 200;
    thrower.y = 2200;
    thrower.angle = 0;
    thrower.inventory.flash = 1;
    safe.x = 200;
    safe.y = 400;
    sendMessage(throwerClient, "hold", "flash");
    await waitTicks(room, 1);
    sendMessage(throwerClient, "throw", "flash");
    await waitTicks(room, 1);
    const impact = projectGrenade(onlyGrenade(room));
    caught.x = impact.x;
    caught.y = impact.y;
    expect(Math.hypot(safe.x - impact.x, safe.y - impact.y)).toBeGreaterThan(FLASH_RADIUS);

    await waitUntil(room, () => room.state.grenades.size === 0);
    expect(caught.hp).toBe(PLAYER_MAX_HP);
    expect(caught.slowMs).toBeGreaterThan(FLASH_SLOW_MS - 100);
    expect(caught.slowMs).toBeLessThanOrEqual(FLASH_SLOW_MS);
    expect(safe.slowMs).toBe(0);
    expect(thrower.slowMs).toBe(0);

    caught.x = 900;
    caught.y = 2100;
    safe.x = 900;
    safe.y = 2300;
    sendMove(caughtClient, 1, 0);
    sendMove(safeClient, 1, 0);
    await waitTicks(room, 8);
    const slowed = caught.x - 900;
    const normal = safe.x - 900;
    expect(normal).toBeGreaterThan(slowed);
    expect(slowed).toBeGreaterThan(normal * (SLOW_SPEED_FACTOR - 0.15));
    expect(slowed).toBeLessThan(normal * (SLOW_SPEED_FACTOR + 0.15));
  });

  it("burns players standing in an incendiary patch", async () => {
    const room = await openRoom();
    const throwerClient = await colyseus.connectTo(room);
    const targetClient = await colyseus.connectTo(room);
    const thrower = requirePlayer(room, throwerClient.sessionId);
    const target = requirePlayer(room, targetClient.sessionId);

    thrower.x = 200;
    thrower.y = 2200;
    thrower.angle = 0;
    thrower.inventory.incendiary = 1;
    sendMessage(throwerClient, "hold", "incendiary");
    await waitTicks(room, 1);
    sendMessage(throwerClient, "throw", "incendiary");
    await waitTicks(room, 1);
    const impact = projectGrenade(onlyGrenade(room));
    target.x = impact.x;
    target.y = impact.y;

    await waitUntil(room, () => room.state.grenades.size === 0);
    expect(room.state.hazards.size).toBe(1);
    expect(target.hp).toBe(PLAYER_MAX_HP - FIRE_DAMAGE);
    expect(thrower.hp).toBe(PLAYER_MAX_HP);
  });

  it("refuses a second throw until the cooldown has passed", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);
    player.x = 200;
    player.y = 2200;
    player.angle = 0;
    player.inventory.frag = 2;
    sendMessage(client, "hold", "frag");
    await waitTicks(room, 1);

    sendMessage(client, "throw", "frag");
    await waitTicks(room, 2);
    sendMessage(client, "throw", "frag");
    await waitTicks(room, 2);
    expect(player.inventory.frag).toBe(1);
    expect(room.state.grenades.size).toBe(1);

    const cooldownTicks = Math.ceil(THROW_COOLDOWN_MS / (1000 / TICK_RATE)) + 2;
    await waitTicks(room, cooldownTicks);
    sendMessage(client, "throw", "frag");
    await waitTicks(room, 2);
    expect(player.inventory.frag).toBe(0);
  });

  it("farms stone and iron, crafts a frag, and damages a player with it", async () => {
    const room = await openRoom();
    const minerClient = await colyseus.connectTo(room);
    const targetClient = await colyseus.connectTo(room);
    const miner = requirePlayer(room, minerClient.sessionId);
    const target = requirePlayer(room, targetClient.sessionId);

    sendMessage(minerClient, "hold", "arm");
    await waitTicks(room, 1);
    await gatherTimes(room, minerClient, miner, node("stone-1"), 2);
    await gatherTimes(room, minerClient, miner, node("iron-1"), 1);
    expect(miner.inventory.stone).toBe(2);
    expect(miner.inventory.iron).toBe(1);

    sendMessage(minerClient, "craft", "frag");
    await waitTicks(room, 2);
    expect(miner.inventory.frag).toBe(1);
    expect(miner.inventory.stone).toBe(0);
    expect(miner.inventory.iron).toBe(0);

    miner.x = 200;
    miner.y = 2200;
    miner.angle = 0;
    target.x = 3000;
    target.y = 2200;
    sendMessage(minerClient, "hold", "frag");
    await waitTicks(room, 1);
    expect(room.state.grenades.size).toBe(0);
    sendMessage(minerClient, "throw", "frag");
    await waitTicks(room, 1);
    const impact = projectGrenade(onlyGrenade(room));
    target.x = impact.x;
    target.y = impact.y;

    await waitUntil(room, () => room.state.grenades.size === 0);
    expect(miner.inventory.frag).toBe(0);
    expect(target.hp).toBe(PLAYER_MAX_HP - FRAG_DAMAGE);
    expect(miner.hp).toBe(PLAYER_MAX_HP);
  });

  it("farms wood, crafts a bandage, and heals a gunshot", async () => {
    const room = await openRoom();
    const minerClient = await colyseus.connectTo(room);
    const shooterClient = await colyseus.connectTo(room);
    const miner = requirePlayer(room, minerClient.sessionId);
    const shooter = requirePlayer(room, shooterClient.sessionId);

    sendMessage(minerClient, "hold", "arm");
    await waitTicks(room, 1);
    await gatherTimes(room, minerClient, miner, node("tree-1"), 2);
    expect(miner.inventory.wood).toBe(2);

    sendMessage(minerClient, "craft", "bandage");
    await waitTicks(room, 2);
    expect(miner.inventory.bandage).toBe(1);
    expect(miner.inventory.wood).toBe(0);

    placeDuel(shooter, miner);
    await waitTicks(room, 18);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);
    expect(miner.hp).toBe(PLAYER_MAX_HP - PLAYER_DAMAGE);

    sendMessage(minerClient, "use", "bandage");
    await waitTicks(room, 2);
    expect(miner.hp).toBe(PLAYER_MAX_HP);
    expect(miner.inventory.bandage).toBe(0);
  });

  it("drops crafted gear on death and keeps the join gun", async () => {
    const room = await openRoom();
    const shooterClient = await colyseus.connectTo(room);
    const targetClient = await colyseus.connectTo(room);
    const shooter = requirePlayer(room, shooterClient.sessionId);
    const target = requirePlayer(room, targetClient.sessionId);

    target.inventory.iron = 11;
    target.inventory.gold = 7;
    target.inventory.wood = 4;
    target.inventory.stone = 2;
    sendMessage(targetClient, "craft", "forge-cannon");
    sendMessage(targetClient, "craft", "heavyArmor");
    await waitTicks(room, 2);
    expect(target.weaponId).toBe("forge");
    expect(target.armor).toBe(HEAVY_ARMOR);

    target.inventory.frag = 2;
    target.inventory.bandage = 1;
    target.held = "frag";
    target.hp = PLAYER_DAMAGE;
    target.armor = 0;
    placeDuel(shooter, target);
    await waitTicks(room, 18);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);

    expect(target.hp).toBe(PLAYER_MAX_HP);
    expect(target.inventory.frag).toBe(0);
    expect(target.inventory.bandage).toBe(0);
    expect(target.armor).toBe(0);
    expect(target.maxArmor).toBe(0);
    expect(target.craftedHeavy).toBe(false);
    expect(target.held).toBe("gun");
    expect(target.weaponId).toBe(STARTER_WEAPON_ID);
    expect(target.inventory.wood).toBe(4);
    expect(target.inventory.stone).toBe(2);
    expect(shooter.kills).toBe(1);
    expect(target.deaths).toBe(1);

    target.inventory.iron = 4;
    target.inventory.stone = 3;
    sendMessage(targetClient, "craft", "lightArmor");
    await waitTicks(room, 2);
    expect(target.armor).toBe(LIGHT_ARMOR);
    expect(target.craftedLight).toBe(true);
  });
});

type InputClient = {
  sessionId: string;
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

type RoomState = GameRoom;

function requirePlayer(room: RoomState, sessionId: string) {
  const player = room.state.players.get(sessionId);
  if (!player) {
    throw new Error("missing player");
  }
  return player;
}

function node(id: string): CircleObstacle {
  const obstacle = getObstacle(id);
  if (!obstacle || obstacle.kind === "building" || obstacle.kind === "fence") {
    throw new Error(`missing harvest node ${id}`);
  }
  return obstacle as CircleObstacle;
}

async function standAt(player: { x: number; y: number }, obstacle: CircleObstacle): Promise<void> {
  player.x = obstacle.x;
  player.y = obstacle.y + obstacle.radius + PLAYER_RADIUS + 8;
}

async function gatherTimes(room: RoomState, client: InputClient, player: { x: number; y: number }, obstacle: CircleObstacle, times: number): Promise<void> {
  await standAt(player, obstacle);
  for (let count = 0; count < times; count += 1) {
    sendGather(client);
    await waitTicks(room, GATHER_GAP_TICKS);
  }
}

function placeDuel(shooter: { x: number; y: number; angle: number }, target: { x: number; y: number }): void {
  shooter.x = 220;
  shooter.y = 2200;
  shooter.angle = 0;
  target.x = 480;
  target.y = 2200;
}

function projectGrenade(grenade: { x: number; y: number; vx: number; vy: number; fuseMs: number }): { x: number; y: number } {
  const dt = 1 / TICK_RATE;
  const dtMs = 1000 / TICK_RATE;
  let x = grenade.x;
  let y = grenade.y;
  let fuse = grenade.fuseMs;
  while (fuse > 0) {
    x += grenade.vx * dt;
    y += grenade.vy * dt;
    fuse -= dtMs;
  }
  return { x, y };
}

function onlyGrenade(room: RoomState): { x: number; y: number; vx: number; vy: number; fuseMs: number } {
  const grenade = [...room.state.grenades.values()][0];
  if (!grenade) {
    throw new Error("missing grenade");
  }
  return grenade;
}

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

async function waitUntil(room: GameRoom, ready: () => boolean): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    if (ready()) {
      return;
    }
    await waitTicks(room, 1);
  }
  throw new Error("timed out waiting for the room");
}
