export const GAME_ROOM_NAME = "game";
export const TICK_RATE = 30;
export const MAX_CLIENTS = 16;
export const INTERP_DELAY_MS = 100;

export const WORLD_WIDTH = 3200;
export const WORLD_HEIGHT = 2400;

export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 180;
export const PLAYER_MAX_HP = 100;
export const PLAYER_NAME_MAX_LENGTH = 16;
export const DEFAULT_PLAYER_NAME = "Player";

/** Starter Sidearm stats. The rest of the arsenal lives in the weapon catalog. */
export const PLAYER_DAMAGE = 20;
export const FIRE_COOLDOWN_MS = 250;
export const WEAPON_RANGE = 720;
export const MUZZLE_OFFSET = PLAYER_RADIUS + 6;

export const GATHER_REACH = 36;
export const GATHER_COOLDOWN_MS = 420;

export const BANDAGE_HEAL = 40;
export const LIGHT_ARMOR = 40;
export const HEAVY_ARMOR = 80;

export const THROW_COOLDOWN_MS = 600;
export const GRENADE_SPEED = 420;
export const GRENADE_FUSE_MS = 850;
export const GRENADE_RADIUS = 8;
export const FRAG_DAMAGE = 45;
export const FRAG_RADIUS = 120;
export const FLASH_RADIUS = 140;
export const FLASH_SLOW_MS = 1800;
export const SLOW_SPEED_FACTOR = 0.45;
export const FIRE_RADIUS = 90;
export const FIRE_TTL_MS = 2800;
export const FIRE_TICK_MS = 400;
export const FIRE_DAMAGE = 8;

/** Short cover. Two sidearm shots break one; heavier guns break it faster. */
export const WALL_HP = 40;
export const WALL_LENGTH = 96;
export const WALL_THICKNESS = 18;
export const WALL_GAP = 10;
export const WALL_PLACE_COOLDOWN_MS = 300;
export const WALL_MAX_PER_PLAYER = 8;

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
