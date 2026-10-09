import { Client, type Room } from "@colyseus/sdk";
import { GAME_ROOM_NAME, GameState, sanitizePlayerName } from "@io-game/shared";

const DEFAULT_SERVER_URL = "http://localhost:2567";

export type GameRoom = Room;

export function getServerUrl(): string {
  return import.meta.env.VITE_COLYSEUS_URL ?? DEFAULT_SERVER_URL;
}

export async function connectToGame(name: string): Promise<GameRoom> {
  const client = new Client(getServerUrl());
  return client.joinOrCreate(GAME_ROOM_NAME, { name: sanitizePlayerName(name) }, GameState);
}
