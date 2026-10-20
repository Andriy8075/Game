import { defineRoom, defineServer, type ServerOptions } from "@colyseus/core";
import { GAME_ROOM_NAME, normalizeHotbarOrder } from "@io-game/shared";
import { auth } from "colyseus";
import { accountAuthSettings, configureAccountAuth, isGoogleConfigured, sessionSecret } from "./accounts/auth";
import { closeDb, migrateAccounts } from "./accounts/connection";
import { setHotbarOrder } from "./accounts/store";
import { GameRoom } from "./rooms/GameRoom";

type JsonRes = {
  status: (code: number) => JsonRes;
  json: (body: unknown) => void;
};

type AuthReq = {
  auth?: { id?: unknown };
  body?: unknown;
};

function readJsonBody(req: AuthReq): unknown {
  const body = req.body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return undefined;
    }
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString("utf8"));
    } catch {
      return undefined;
    }
  }
  return body;
}

function saveHotbar(req: AuthReq, res: JsonRes): void {
  void (async () => {
    const id = typeof req.auth?.id === "string" ? req.auth.id : undefined;
    if (!id) {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    const payload = readJsonBody(req);
    const requested = payload && typeof payload === "object" && "order" in payload
      ? (payload as { order: unknown }).order
      : payload;
    const updated = await setHotbarOrder(id, normalizeHotbarOrder(requested));
    if (!updated) {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    res.json({ hotbarOrder: updated.hotbarOrder });
  })().catch(() => {
    res.status(500).json({ error: "save_failed" });
  });
}

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
      app.put("/account/hotbar", auth.middleware(), saveHotbar);
    },
    ...overrides,
  });
  server.onShutdown(() => closeDb());
  return server;
}
