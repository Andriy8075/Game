export const GAME_ROOM_NAME = "game";
export const TICK_RATE = 30;
export const MAX_CLIENTS = 16;
export const INTERP_DELAY_MS = 100;

export const WORLD_WIDTH = 3200;
export const WORLD_HEIGHT = 2400;

export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 180;
export const PLAYER_MAX_HP = 100;
export const PLAYER_DAMAGE = 20;
export const PLAYER_NAME_MAX_LENGTH = 16;
export const DEFAULT_PLAYER_NAME = "Player";

export const FIRE_COOLDOWN_MS = 250;
export const WEAPON_RANGE = 720;
export const MUZZLE_OFFSET = PLAYER_RADIUS + 6;

export const PLAYER_COLORS = [
  0x4fc3f7,
  0xff8a65,
  0x81c784,
  0xba68c8,
  0xffd54f,
  0x90caf9,
  0xef9a9a,
  0xa5d6a7,
] as const;
