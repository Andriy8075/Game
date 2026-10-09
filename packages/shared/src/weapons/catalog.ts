import { FIRE_COOLDOWN_MS, PLAYER_DAMAGE, WEAPON_RANGE } from "../constants";

/** How a player is allowed to obtain the weapon. Menu selection and crafting are defined here and wired up later. */
export type WeaponSource = "starter" | "pickup" | "menu" | "craft";

export type WeaponId =
  | "sidearm"
  | "splinter"
  | "buckshot"
  | "longshot"
  | "repeater"
  | "vanguard"
  | "horizon"
  | "forge"
  | "whisper";

export type WeaponDef = {
  id: WeaponId;
  name: string;
  source: WeaponSource;
  damage: number;
  /** Hitscan distance in world units. */
  range: number;
  /** Milliseconds between shots. Lower values fire more often. */
  fireCooldownMs: number;
  color: number;
  /** Global account level required before the main menu can offer this weapon. */
  requiredLevel?: number;
  /** Crafting recipe id. The crafting bench is not implemented yet. */
  recipeId?: string;
};

export const STARTER_WEAPON_ID: WeaponId = "sidearm";

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: "sidearm",
    name: "Sidearm",
    source: "starter",
    damage: PLAYER_DAMAGE,
    range: WEAPON_RANGE,
    fireCooldownMs: FIRE_COOLDOWN_MS,
    color: 0xfff59d,
  },
  {
    id: "splinter",
    name: "Splinter",
    source: "pickup",
    damage: 11,
    range: 540,
    fireCooldownMs: 110,
    color: 0x80deea,
  },
  {
    id: "buckshot",
    name: "Buckshot",
    source: "pickup",
    damage: 46,
    range: 250,
    fireCooldownMs: 720,
    color: 0xff8a65,
  },
  {
    id: "longshot",
    name: "Longshot",
    source: "pickup",
    damage: 64,
    range: 1360,
    fireCooldownMs: 880,
    color: 0xce93d8,
  },
  {
    id: "repeater",
    name: "Repeater",
    source: "pickup",
    damage: 22,
    range: 860,
    fireCooldownMs: 170,
    color: 0xa5d6a7,
  },
  {
    id: "vanguard",
    name: "Vanguard",
    source: "menu",
    damage: 34,
    range: 800,
    fireCooldownMs: 200,
    color: 0x90caf9,
    requiredLevel: 5,
  },
  {
    id: "horizon",
    name: "Horizon",
    source: "menu",
    damage: 50,
    range: 1180,
    fireCooldownMs: 500,
    color: 0xffd54f,
    requiredLevel: 12,
  },
  {
    id: "forge",
    name: "Forge Cannon",
    source: "craft",
    damage: 80,
    range: 440,
    fireCooldownMs: 1050,
    color: 0xff7043,
    recipeId: "forge-cannon",
  },
  {
    id: "whisper",
    name: "Whisper",
    source: "craft",
    damage: 16,
    range: 980,
    fireCooldownMs: 95,
    color: 0xb0bec5,
    recipeId: "whisper-kit",
  },
];

const WEAPONS_BY_ID = new Map<WeaponId, WeaponDef>(WEAPONS.map((weapon) => [weapon.id, weapon]));

export function getWeapon(id: string | undefined): WeaponDef {
  if (id && WEAPONS_BY_ID.has(id as WeaponId)) {
    return WEAPONS_BY_ID.get(id as WeaponId)!;
  }
  return WEAPONS_BY_ID.get(STARTER_WEAPON_ID)!;
}

export function weaponsForSource(source: WeaponSource): WeaponDef[] {
  return WEAPONS.filter((weapon) => weapon.source === source);
}

export function shotsPerSecond(weapon: WeaponDef): number {
  return 1000 / weapon.fireCooldownMs;
}

export function formatWeaponStats(weapon: WeaponDef): string {
  return `${weapon.name}   ${weapon.damage} dmg   ${weapon.range} range   ${shotsPerSecond(weapon).toFixed(1)} shots/s`;
}
