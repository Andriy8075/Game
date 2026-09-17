import { defineRoom, defineServer, type ServerOptions } from "@colyseus/core";
import { GAME_ROOM_NAME } from "@io-game/shared";
import { GameRoom } from "./rooms/GameRoom";

export function createGameServer(overrides: Partial<ServerOptions> = {}) {
  return defineServer({
    greet: false,
    rooms: {
      [GAME_ROOM_NAME]: defineRoom(GameRoom),
    },
    express: (app) => {
      app.get("/health", (_req: unknown, res: { json: (body: unknown) => void }) => {
        res.json({ ok: true });
      });
    },
    ...overrides,
  });
}
