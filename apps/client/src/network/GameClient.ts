import { Client, type Room } from "@colyseus/sdk";
import { GAME_ROOM_NAME, GameState, STARTER_WEAPON_ID, sanitizePlayerName } from "@io-game/shared";

const DEFAULT_SERVER_URL = "http://localhost:2567";

export type GameRoom = Room;

export function getServerUrl(): string {
  return import.meta.env.VITE_COLYSEUS_URL ?? DEFAULT_SERVER_URL;
}

let gameClient: Client | undefined;

export function getGameClient(): Client {
  gameClient ??= new Client(getServerUrl());
  return gameClient;
}

export async function connectToGame(name: string, weaponId: string = STARTER_WEAPON_ID): Promise<GameRoom> {
  return getGameClient().joinOrCreate(
    GAME_ROOM_NAME,
    { name: sanitizePlayerName(name), weaponId },
    GameState,
  );
}
