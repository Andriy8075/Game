import type { Server } from "@colyseus/core";
import { ColyseusTestServer } from "@colyseus/testing";

/** Avoid 2568, which `boot()` always uses and which other local game servers may already hold. */
const TEST_PORT = 2578;

export async function bootGameServer(server: Server) {
  await server.listen(TEST_PORT);
  return new ColyseusTestServer(server);
}
