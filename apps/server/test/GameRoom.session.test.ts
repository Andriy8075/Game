import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import {
  COUNTDOWN_MS,
  GAME_ROOM_NAME,
  MATCH_COUNTDOWN,
  MATCH_ENDED,
  MATCH_PLAYING,
  MATCH_WAITING,
  MoveInput,
  PLAYER_MAX_HP,
  TICK_RATE,
  ZONE_PHASES,
  ZONE_START_RADIUS,
} from "@io-game/shared";
import { createGameServer } from "../src/app.config";
import { GameRoom } from "../src/rooms/GameRoom";
import { connectPlaying, flush, waitTicks } from "./clock";

describe("battle royale sessions", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    const gameServer = createGameServer({
      greet: false,
      gracefullyShutdown: false,
    });
    await gameServer.listen(2600);
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

  it("waits until two players join, then counts down 20 seconds", async () => {
    const room = await openRoom();
    await colyseus.connectTo(room, { name: "Ada" });
    expect(room.state.phase).toBe(MATCH_WAITING);
    expect(room.state.countdownSec).toBe(0);

    await colyseus.connectTo(room, { name: "Rook" });
    expect(room.state.phase).toBe(MATCH_COUNTDOWN);
    expect(room.state.countdownSec).toBe(COUNTDOWN_MS / 1000);

    await waitTicks(room, TICK_RATE * 10);
    expect(room.state.phase).toBe(MATCH_COUNTDOWN);
    expect(room.state.countdownSec).toBe(10);

    await waitTicks(room, TICK_RATE * 10);
    expect(room.state.phase).toBe(MATCH_PLAYING);
    expect(room.state.rosterSize).toBe(2);
    await flush();
    expect(room.locked).toBe(true);
  });

  it("resets the countdown when a player leaves before the battle starts", async () => {
    const room = await openRoom();
    await colyseus.connectTo(room, { name: "Ada" });
    const rook = await colyseus.connectTo(room, { name: "Rook" });
    expect(room.state.phase).toBe(MATCH_COUNTDOWN);

    await rook.leave(true);
    await flush();
    expect(room.state.phase).toBe(MATCH_WAITING);
    expect(room.state.countdownSec).toBe(0);
    expect(room.state.players.size).toBe(1);
  });

  it("refuses late joins after the battle starts", async () => {
    const room = await openRoom();
    await connectPlaying(colyseus, room, { name: "Ada" }, { name: "Rook" });
    expect(room.state.phase).toBe(MATCH_PLAYING);
    await flush();
    await expect(colyseus.connectTo(room, { name: "Late" })).rejects.toThrow();
  });

  it("does not move or shoot while the lobby is waiting", async () => {
    const room = await openRoom();
    const client = await colyseus.connectTo(room);
    const player = room.state.players.get(client.sessionId);
    if (!player) {
      throw new Error("missing player");
    }
    const startX = player.x;
    sendShot(client, 0);
    sendMove(client, 1, 0);
    sendMessage(client, "hold", "arm");
    await waitTicks(room, 8);
    expect(player.x).toBe(startX);
    expect(player.held).toBe("gun");
    expect(room.state.phase).toBe(MATCH_WAITING);
  });

  it("declares the last living player the winner when an opponent leaves", async () => {
    const room = await openRoom();
    const [ada, rook] = await connectPlaying(colyseus, room, { name: "Ada" }, { name: "Rook" });
    await rook.leave(true);
    await flush();
    expect(room.state.phase).toBe(MATCH_ENDED);
    expect(room.state.winnerName).toBe("Ada");
    expect(room.state.winnerId).toBe(ada.sessionId);
    expect(room.state.players.get(ada.sessionId)?.alive).toBe(true);
  });

  it("keeps a solo force-start match running so unit tests can still play", async () => {
    const room = await openRoom();
    const [client] = await connectPlaying(colyseus, room);
    const player = room.state.players.get(client.sessionId);
    if (!player) {
      throw new Error("missing player");
    }
    player.hp = 1;
    await waitTicks(room, 4);
    expect(room.state.phase).toBe(MATCH_PLAYING);
    expect(player.alive).toBe(true);
  });

  it("damages players in the smoke and not those in the circle", async () => {
    const room = await openRoom();
    const [edgeClient, centerClient] = await connectPlaying(colyseus, room, { name: "Edge" }, { name: "Center" });
    const edge = room.state.players.get(edgeClient.sessionId);
    const center = room.state.players.get(centerClient.sessionId);
    if (!edge || !center) {
      throw new Error("missing players");
    }

    const holdTicks = Math.ceil(ZONE_PHASES[0]!.holdMs / (1000 / TICK_RATE));
    const shrinkTicks = Math.ceil((ZONE_PHASES[0]!.shrinkMs * 0.6) / (1000 / TICK_RATE));
    edge.x = 240;
    edge.y = 240;
    center.x = 1600;
    center.y = 1200;
    await waitTicks(room, holdTicks + shrinkTicks);

    expect(room.state.zoneRadius).toBeLessThan(ZONE_START_RADIUS);
    expect(room.state.zoneShrinking).toBe(true);
    expect(edge.hp).toBeLessThan(PLAYER_MAX_HP);
    expect(center.hp).toBe(PLAYER_MAX_HP);
    expect(edge.armor).toBe(0);
  });

  it("credits the smoke when it eliminates a player", async () => {
    const room = await openRoom();
    const [edgeClient, centerClient] = await connectPlaying(colyseus, room, { name: "Edge" }, { name: "Center" });
    const edge = room.state.players.get(edgeClient.sessionId);
    const center = room.state.players.get(centerClient.sessionId);
    if (!edge || !center) {
      throw new Error("missing players");
    }

    edge.hp = 2;
    edge.x = 240;
    edge.y = 240;
    center.x = 1600;
    center.y = 1200;
    const holdTicks = Math.ceil(ZONE_PHASES[0]!.holdMs / (1000 / TICK_RATE));
    const shrinkTicks = Math.ceil((ZONE_PHASES[0]!.shrinkMs * 0.6) / (1000 / TICK_RATE));
    await waitTicks(room, holdTicks + shrinkTicks);

    expect(edge.alive).toBe(false);
    expect(edge.killerName).toBe("the smoke");
    expect(room.state.phase).toBe(MATCH_ENDED);
    expect(room.state.winnerName).toBe("Center");
    expect(center.alive).toBe(true);
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

function sendMove(client: InputClient, moveX: number, moveY: number): void {
  const input = client.input({ type: MoveInput });
  input.data.moveX = moveX as -1 | 0 | 1;
  input.data.moveY = moveY as -1 | 0 | 1;
  input.data.aimAngle = 0;
  input.data.fire = false;
  input.data.gather = false;
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

