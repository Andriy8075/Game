import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { DEFAULT_PLAYER_NAME, GAME_ROOM_NAME, MoveInput, PLAYER_RADIUS, getObstacle } from "@io-game/shared";
import { createGameServer } from "../src/app.config";
import type { GameState } from "../src/rooms/schema/GameState";

describe("GameRoom", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(
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
  });

  it("joins a player into the room", async () => {
    const room = await colyseus.createRoom<GameState>(GAME_ROOM_NAME, {});
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
    const room = await colyseus.createRoom<GameState>(GAME_ROOM_NAME, {});
    const client = await colyseus.connectTo(room);
    await client.leave(true);
    await waitTicks(room, 3);

    expect(room.state.players.has(client.sessionId)).toBe(false);
  });

  it("moves the player from authoritative input", async () => {
    const room = await colyseus.createRoom<GameState>(GAME_ROOM_NAME, {});
    const client = await colyseus.connectTo(room);
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
    const room = await colyseus.createRoom<GameState>(GAME_ROOM_NAME, {});
    const honestClient = await colyseus.connectTo(room);
    const cheaterClient = await colyseus.connectTo(room);
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
    const room = await colyseus.createRoom<GameState>(GAME_ROOM_NAME, {});
    const client = await colyseus.connectTo(room);
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
    const room = await colyseus.createRoom<GameState>(GAME_ROOM_NAME, {});
    const shooterClient = await colyseus.connectTo(room);
    const targetClient = await colyseus.connectTo(room);
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
    const room = await colyseus.createRoom<GameState>(GAME_ROOM_NAME, {});
    const shooterClient = await colyseus.connectTo(room);
    const targetClient = await colyseus.connectTo(room);
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
    };
    send: () => void;
  };
};

function sendMove(client: InputClient, moveX: number, moveY: number): void {
  const input = client.input({ type: MoveInput });
  input.data.moveX = moveX as -1 | 0 | 1;
  input.data.moveY = moveY as -1 | 0 | 1;
  input.data.aimAngle = 0;
  input.data.fire = false;
  input.send();
}

function sendShot(client: InputClient, aimAngle: number): void {
  const input = client.input({ type: MoveInput });
  input.data.moveX = 0;
  input.data.moveY = 0;
  input.data.aimAngle = aimAngle;
  input.data.fire = true;
  input.send();
}

async function waitTicks(room: { waitForNextTimestep: () => Promise<void> }, ticks: number): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    await room.waitForNextTimestep();
  }
}
