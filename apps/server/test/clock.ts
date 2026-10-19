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
