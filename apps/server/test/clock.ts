import type { ColyseusTestServer } from "@colyseus/testing";
import type { GameRoom } from "../src/rooms/GameRoom";

/** Let a websocket message land before the simulation consumes it. */
export async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
}

/** Deliver pending client messages, then run `ticks` simulation steps with no wall-clock wait. */
export async function waitTicks(room: GameRoom, ticks: number): Promise<void> {
  await flush();
  if (ticks > 0) {
    room.advance(ticks);
  }
}

/** Join every client first, then skip the lobby so gameplay tests can start immediately. */
export async function connectPlaying(
  colyseus: ColyseusTestServer,
  room: GameRoom,
  ...allOptions: Array<object | undefined>
) {
  const options = allOptions.length > 0 ? allOptions : [undefined];
  const clients = [];
  for (const opts of options) {
    clients.push(await colyseus.connectTo(room, opts));
  }
  room.forceStart();
  return clients;
}
