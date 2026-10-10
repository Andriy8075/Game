import { defineRoom, defineServer, type ServerOptions } from "@colyseus/core";
import { GAME_ROOM_NAME } from "@io-game/shared";
import { accountAuthSettings, configureAccountAuth, isGoogleConfigured, sessionSecret } from "./accounts/auth";
import { closeDb, migrateAccounts } from "./accounts/connection";
import { GameRoom } from "./rooms/GameRoom";

export function createGameServer(overrides: Partial<ServerOptions> = {}) {
  configureAccountAuth();
  const server = defineServer({
    greet: false,
    beforeListen: async () => {
      await migrateAccounts();
    },
    auth: {
      settings: accountAuthSettings(),
      oauth: { cookieSecret: sessionSecret() },
    },
    rooms: {
      [GAME_ROOM_NAME]: defineRoom(GameRoom),
    },
    express: (app) => {
      app.get("/health", (_req: unknown, res: { json: (body: unknown) => void }) => {
        res.json({ ok: true });
      });
      app.get("/auth/config", (_req: unknown, res: { json: (body: unknown) => void }) => {
        res.json({ google: isGoogleConfigured() });
      });
    },
    ...overrides,
  });
  server.onShutdown(() => closeDb());
  return server;
}
