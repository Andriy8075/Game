import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import {
  BANDAGE_HEAL,
  BASTION_DAMAGE_FACTOR,
  BASTION_MS,
  BOT_DAMAGE,
  BOT_MAX_HP,
  BOT_SPEED,
  FIRE_DAMAGE,
  FLASH_RADIUS,
  FLASH_SLOW_MS,
  FRAG_DAMAGE,
  FRAG_RADIUS,
  GALE_MS,
  GALE_SPEED_FACTOR,
  GAME_ROOM_NAME,
  HARVEST,
  HEAVY_ARMOR,
  LIGHT_ARMOR,
  MAX_HIRED_BOTS,
  MoveInput,
  PLAYER_DAMAGE,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  RAMSPIKE_DISTANCE,
  SLOW_SPEED_FACTOR,
  STARTER_WEAPON_ID,
  THROW_COOLDOWN_MS,
  TICK_RATE,
  WALL_HP,
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

    for (const slot of ["frag", "flash", "incendiary", "bandage", "bastion", "gale", "ramspike", "wall", "arm", "gun"] as const) {
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


  it("places a barricade in front of the aim and spends wood, stone, or iron", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);
    player.x = 220;
    player.y = 2200;
    player.angle = 0;
    player.inventory.wood = 2;
    player.inventory.stone = 1;
    player.inventory.iron = 1;
    sendMessage(client, "hold", "gun");
    await waitTicks(room, 1);
    sendMessage(client, "place-wall", "auto");
    await waitTicks(room, 2);
    expect(room.state.walls.size).toBe(0);

    sendMessage(client, "hold", "wall");
    await waitTicks(room, 1);
    sendMessage(client, "place-wall", "auto");
    await waitTicks(room, 2);
    expect(room.state.walls.size).toBe(0);
    expect(player.inventory.wood).toBe(2);

    player.inventory.wood = 3;
    player.inventory.stone = 2;
    player.inventory.iron = 2;
    sendMessage(client, "place-wall", "auto");
    await waitTicks(room, 2);

    expect(player.inventory.wood).toBe(0);
    expect(player.inventory.stone).toBe(2);
    expect(player.inventory.iron).toBe(2);
    const wall = onlyWall(room);
    expect(wall.material).toBe("wood");
    expect(wall.hp).toBe(WALL_HP);
    expect(wall.x).toBeGreaterThan(player.x + PLAYER_RADIUS);
    expect(wall.ownerId).toBe(client.sessionId);

    await waitTicks(room, 12);
    sendMessage(client, "place-wall", "stone");
    await waitTicks(room, 2);
    expect(room.state.walls.size).toBe(1);
    expect(player.inventory.stone).toBe(2);
  });

  it("places a stone barricade from the selected slot when wood is short", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);
    player.x = 220;
    player.y = 2200;
    player.inventory.stone = 2;

    sendMessage(client, "hold", "wall");
    await waitTicks(room, 1);
    player.angle = Math.PI / 2;
    sendMessage(client, "place-wall", "auto");
    await waitTicks(room, 2);

    const wall = onlyWall(room);
    expect(wall.material).toBe("stone");
    expect(wall.height).toBeLessThan(wall.width);
    expect(wall.y).toBeGreaterThan(player.y);
    expect(player.inventory.stone).toBe(0);
  });

  it("does not spend resources when the wall would cover another player", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const other = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);
    const target = requirePlayer(room, other.sessionId);
    player.x = 220;
    player.y = 2200;
    player.angle = 0;
    target.x = 255;
    target.y = 2200;
    player.inventory.iron = 2;

    sendMessage(client, "hold", "wall");
    await waitTicks(room, 1);
    sendMessage(client, "place-wall", "iron");
    await waitTicks(room, 2);
    expect(room.state.walls.size).toBe(0);
    expect(player.inventory.iron).toBe(2);
  });

  it("blocks movement and stops bullets until a few shots break it", async () => {
    const room = await openRoom();
    const shooterClient = await colyseus.connectTo(room);
    const targetClient = await colyseus.connectTo(room);
    const shooter = requirePlayer(room, shooterClient.sessionId);
    const target = requirePlayer(room, targetClient.sessionId);
    shooter.x = 220;
    shooter.y = 2200;
    shooter.angle = 0;
    target.x = 700;
    target.y = 2200;
    shooter.inventory.wood = 3;
    sendMessage(shooterClient, "hold", "wall");
    await waitTicks(room, 1);

    sendMessage(shooterClient, "place-wall", "wood");
    await waitTicks(room, 2);
    const wall = onlyWall(room);
    const startX = shooter.x;

    sendMove(shooterClient, 1, 0);
    await waitTicks(room, 20);
    expect(shooter.x).toBeGreaterThan(startX);
    expect(shooter.x).toBeLessThan(wall.x);

    shooter.x = 220;
    shooter.y = 2200;
    shooter.angle = 0;
    sendMessage(shooterClient, "hold", "gun");
    await waitTicks(room, 1);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);
    expect(target.hp).toBe(PLAYER_MAX_HP);
    expect(onlyWall(room).hp).toBe(WALL_HP - PLAYER_DAMAGE);

    await waitTicks(room, 12);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);
    expect(room.state.walls.size).toBe(0);
    expect(target.hp).toBe(PLAYER_MAX_HP);

    await waitTicks(room, 12);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);
    expect(target.hp).toBe(PLAYER_MAX_HP - PLAYER_DAMAGE);
  });

  it("caps each player at a handful of walls", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);
    player.inventory.wood = 30;
    player.angle = 0;
    sendMessage(client, "hold", "wall");
    await waitTicks(room, 1);

    for (let i = 0; i < 8; i += 1) {
      player.x = 200;
      player.y = 200 + i * 140;
      sendMessage(client, "place-wall", "wood");
      await waitTicks(room, 12);
    }

    expect(room.state.walls.size).toBe(8);
    expect(player.inventory.wood).toBe(6);

    player.y = 200 + 8 * 140;
    sendMessage(client, "place-wall", "wood");
    await waitTicks(room, 12);
    expect(room.state.walls.size).toBe(8);
    expect(player.inventory.wood).toBe(6);
  });

  it("hires a weak bot that walks to the nearest other player and shoots them", async () => {
    const room = await openRoom();
    const ownerClient = await colyseus.connectTo(room);
    const enemyClient = await colyseus.connectTo(room);
    const owner = requirePlayer(room, ownerClient.sessionId);
    const enemy = requirePlayer(room, enemyClient.sessionId);
    owner.x = 220;
    owner.y = 2200;
    enemy.x = 1100;
    enemy.y = 2200;

    sendMessage(ownerClient, "craft", "hire-bot");
    await waitTicks(room, 2);
    expect(room.state.bots.size).toBe(0);

    owner.inventory.wood = 3;
    owner.inventory.stone = 3;
    owner.inventory.iron = 2;
    sendMessage(ownerClient, "craft", "hire-bot");
    await waitTicks(room, 2);
    const bot = onlyBot(room);
    const startX = bot.x;
    expect(bot.hp).toBe(BOT_MAX_HP);
    expect(bot.maxHp).toBeLessThan(PLAYER_MAX_HP);
    expect(bot.ownerId).toBe(ownerClient.sessionId);
    expect(owner.inventory.wood).toBe(0);
    expect(owner.inventory.iron).toBe(0);

    const approachTicks = 40;
    await waitTicks(room, approachTicks);
    expect(bot.x).toBeGreaterThan(startX + BOT_SPEED * (approachTicks / TICK_RATE) * 0.5);
    expect(enemy.hp).toBe(PLAYER_MAX_HP);
    expect(owner.hp).toBe(PLAYER_MAX_HP);

    await waitTicks(room, 280);
    const dealt = PLAYER_MAX_HP - enemy.hp;
    expect(dealt).toBeGreaterThan(0);
    expect(dealt % BOT_DAMAGE).toBe(0);
    expect(BOT_DAMAGE).toBeLessThan(PLAYER_DAMAGE);
    expect(owner.hp).toBe(PLAYER_MAX_HP);
  });

  it("deals one weak hit when the enemy is already in range", async () => {
    const room = await openRoom();
    const ownerClient = await colyseus.connectTo(room);
    const enemyClient = await colyseus.connectTo(room);
    const owner = requirePlayer(room, ownerClient.sessionId);
    const enemy = requirePlayer(room, enemyClient.sessionId);
    owner.x = 220;
    owner.y = 2200;
    enemy.x = 400;
    enemy.y = 2200;
    owner.inventory.wood = 3;
    owner.inventory.stone = 3;
    owner.inventory.iron = 2;
    sendMessage(ownerClient, "craft", "hire-bot");
    await waitTicks(room, 1);
    expect(enemy.hp).toBe(PLAYER_MAX_HP - BOT_DAMAGE);
    expect(owner.hp).toBe(PLAYER_MAX_HP);
  });

  it("walks a hired bot around the yard fence to reach a player", async () => {
    const room = await openRoom();
    const ownerClient = await colyseus.connectTo(room);
    const enemyClient = await colyseus.connectTo(room);
    const owner = requirePlayer(room, ownerClient.sessionId);
    const enemy = requirePlayer(room, enemyClient.sessionId);
    owner.x = 200;
    owner.y = 200;
    enemy.x = 1280;
    enemy.y = 500;
    owner.inventory.wood = 3;
    owner.inventory.stone = 3;
    owner.inventory.iron = 2;
    sendMessage(ownerClient, "craft", "hire-bot");
    await waitTicks(room, 1);
    const bot = onlyBot(room);
    bot.x = 1280;
    bot.y = 1000;

    await waitTicks(room, 90);
    expect(bot.y).toBeGreaterThan(1080);
    expect(enemy.hp).toBe(PLAYER_MAX_HP);
  });

  it("lets a player destroy a hired bot and stops at the hire cap", async () => {
    const room = await openRoom();
    const ownerClient = await colyseus.connectTo(room);
    const enemyClient = await colyseus.connectTo(room);
    const owner = requirePlayer(room, ownerClient.sessionId);
    const enemy = requirePlayer(room, enemyClient.sessionId);
    owner.x = 220;
    owner.y = 2200;
    enemy.x = 2200;
    enemy.y = 2200;
    owner.inventory.wood = 3 * (MAX_HIRED_BOTS + 1);
    owner.inventory.stone = 3 * (MAX_HIRED_BOTS + 1);
    owner.inventory.iron = 2 * (MAX_HIRED_BOTS + 1);

    for (let hire = 0; hire < MAX_HIRED_BOTS + 1; hire += 1) {
      sendMessage(ownerClient, "craft", "hire-bot");
    }
    await waitTicks(room, 2);
    expect(room.state.bots.size).toBe(MAX_HIRED_BOTS);
    expect(owner.inventory.wood).toBe(3);
    expect(owner.inventory.stone).toBe(3);
    expect(owner.inventory.iron).toBe(2);

    const bots = [...room.state.bots.values()];
    const bot = bots[0];
    if (!bot) {
      throw new Error("missing hired bots");
    }
    bot.x = 480;
    bot.y = 2200;
    for (const spare of bots.slice(1)) {
      spare.x = 220;
      spare.y = 1800;
    }
    sendShot(ownerClient, 0);
    await waitTicks(room, 2);
    expect(bot.hp).toBe(BOT_MAX_HP - PLAYER_DAMAGE);

    await waitTicks(room, 10);
    sendShot(ownerClient, 0);
    await waitTicks(room, 2);
    expect(room.state.bots.size).toBe(MAX_HIRED_BOTS - 1);

    await ownerClient.leave();
    await waitTicks(room, 1);
    expect(room.state.bots.size).toBe(0);
    expect(room.state.players.has(enemyClient.sessionId)).toBe(true);
  });


  it("crafts Bastion Potion and Gale Potion, then spends them on protection and speed", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const shooterClient = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);
    const shooter = requirePlayer(room, shooterClient.sessionId);

    player.inventory.wood = 2;
    player.inventory.stone = 2;
    player.inventory.iron = 2;
    player.inventory.gold = 1;
    sendMessage(client, "craft", "bastion");
    sendMessage(client, "craft", "gale");
    await waitTicks(room, 2);
    expect(player.inventory.bastion).toBe(1);
    expect(player.inventory.gale).toBe(1);
    expect(player.inventory.wood).toBe(0);
    expect(player.inventory.stone).toBe(0);
    expect(player.inventory.iron).toBe(0);
    expect(player.inventory.gold).toBe(0);

    sendMessage(client, "use", "bastion");
    sendMessage(client, "use", "gale");
    await waitTicks(room, 2);
    expect(player.inventory.bastion).toBe(0);
    expect(player.inventory.gale).toBe(0);
    expect(player.wardMs).toBeGreaterThan(BASTION_MS - 200);
    expect(player.hasteMs).toBeGreaterThan(GALE_MS - 200);

    player.x = 200;
    player.y = 1500;
    sendMove(client, 0, 0);
    await waitTicks(room, 1);
    const start = player.x;
    for (let step = 0; step < 20; step += 1) {
      sendMove(client, 1, 0);
      await waitTicks(room, 1);
    }
    const gained = player.x - start;
    const boosted = PLAYER_SPEED * GALE_SPEED_FACTOR * 20 / TICK_RATE;
    expect(gained).toBeGreaterThan(PLAYER_SPEED * 20 / TICK_RATE);
    expect(gained).toBeLessThan(boosted + 12);

    sendMove(client, 0, 0);
    placeDuel(shooter, player);
    await waitTicks(room, 4);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);
    expect(player.hp).toBe(PLAYER_MAX_HP - Math.max(1, Math.round(PLAYER_DAMAGE * BASTION_DAMAGE_FACTOR)));
  });

  it("crafts one Ramspike, shoves the player forward, and drops the new gear on death", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const shooterClient = await colyseus.connectTo(room);
    const player = requirePlayer(room, client.sessionId);
    const shooter = requirePlayer(room, shooterClient.sessionId);

    player.inventory.stone = 2;
    player.inventory.iron = 2;
    sendMessage(client, "craft", "ramspike");
    await waitTicks(room, 2);
    expect(player.inventory.ramspike).toBe(1);
    expect(player.inventory.stone).toBe(0);
    expect(player.inventory.iron).toBe(0);

    player.x = 200;
    player.y = 1500;
    player.angle = 0;
    sendMessage(client, "use", "ramspike");
    await waitTicks(room, 2);
    expect(player.inventory.ramspike).toBe(0);
    expect(player.x).toBeGreaterThan(200 + RAMSPIKE_DISTANCE - 30);
    expect(player.x).toBeLessThan(200 + RAMSPIKE_DISTANCE + 8);
    expect(player.y).toBeCloseTo(1500, 0);

    const parked = player.x;
    sendMessage(client, "use", "ramspike");
    await waitTicks(room, 2);
    expect(player.x).toBeCloseTo(parked, 4);

    player.inventory.bastion = 2;
    player.inventory.gale = 2;
    player.inventory.ramspike = 2;
    player.wardMs = 4000;
    player.hasteMs = 4000;
    player.held = "ramspike";
    player.hp = Math.max(1, Math.round(PLAYER_DAMAGE * BASTION_DAMAGE_FACTOR));
    player.armor = 0;
    sendMove(client, 0, 0);
    placeDuel(shooter, player);
    await waitTicks(room, 4);
    sendShot(shooterClient, 0);
    await waitTicks(room, 4);

    expect(player.hp).toBe(PLAYER_MAX_HP);
    expect(player.inventory.bastion).toBe(0);
    expect(player.inventory.gale).toBe(0);
    expect(player.inventory.ramspike).toBe(0);
    expect(player.wardMs).toBe(0);
    expect(player.hasteMs).toBe(0);
    expect(player.held).toBe("gun");

  });
});

type InputClient = {
  sessionId: string;
  leave: () => Promise<unknown>;
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

function onlyBot(room: RoomState) {
  const bot = [...room.state.bots.values()][0];
  if (!bot) {
    throw new Error("missing bot");
  }
  return bot;
}

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

function onlyWall(room: RoomState): { x: number; y: number; width: number; height: number; hp: number; material: string; ownerId: string } {
  const wall = [...room.state.walls.values()][0];
  if (!wall || room.state.walls.size !== 1) {
    throw new Error(`expected one wall, found ${room.state.walls.size}`);
  }
  return wall;
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
