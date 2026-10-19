import { sanitizePlayerName } from "./playerName";
import { STARTER_WEAPON_ID, getWeapon, weaponsForSource, type WeaponDef, type WeaponId } from "./weapons/catalog";

export const XP_PER_LEVEL = 100;
export const XP_PER_KILL = 40;
export const KILLS_TO_WIN = 10;

const BONUS_CHANCE_CAP = 0.45;

export function grantKillXp(level: number, xp: number): { level: number; xp: number } {
  let nextLevel = Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
  let nextXp = (Number.isFinite(xp) && xp > 0 ? xp : 0) + XP_PER_KILL;
  while (nextXp >= XP_PER_LEVEL) {
    nextXp -= XP_PER_LEVEL;
    nextLevel += 1;
  }
  return { level: nextLevel, xp: nextXp };
}

export function formatAccountLevel(level: number, xp: number): string {
  return `Level ${level} · ${xp}/${XP_PER_LEVEL}`;
}

export function suggestedPlayerName(displayName: string | undefined): string {
  return sanitizePlayerName(displayName);
}

/** Starter gun, plus menu guns whose required level the account has reached. Guests pass 0. */
export function weaponsOfferedAtLevel(level: number): WeaponDef[] {
  return weaponsForSource("starter").concat(
    weaponsForSource("menu").filter((weapon) => level >= (weapon.requiredLevel ?? Number.POSITIVE_INFINITY)),
  );
}

export function resolveMenuWeapon(requested: string | undefined, level: number): WeaponDef {
  const offered = weaponsOfferedAtLevel(level);
  return offered.find((weapon) => weapon.id === requested) ?? getWeapon(STARTER_WEAPON_ID);
}

export function joinBonusChance(level: number): number {
  if (!Number.isFinite(level) || level < 1) {
    return 0;
  }
  return Math.min(BONUS_CHANCE_CAP, 0.05 + 0.03 * (Math.floor(level) - 1));
}

export type JoinBonus = {
  frag: number;
  bandage: number;
  lightArmor: boolean;
  weaponId?: WeaponId;
};

/**
 * Independent rolls for a frag, a bandage, light armor, and a pickup gun.
 * The gun roll runs only when the menu choice is the Sidearm.
 * Level 0 (guests) never receives a bonus. The same roll is not repeated on respawn.
 */
export function rollJoinLoadout(level: number, random: () => number, menuWeaponId: string): JoinBonus {
  const chance = joinBonusChance(level);
  const bonus: JoinBonus = { frag: 0, bandage: 0, lightArmor: false };
  if (chance <= 0) {
    return bonus;
  }
  if (random() < chance) {
    bonus.frag = 1;
  }
  if (random() < chance) {
    bonus.bandage = 1;
  }
  if (random() < chance) {
    bonus.lightArmor = true;
  }
  if (menuWeaponId === STARTER_WEAPON_ID && random() < chance) {
    const guns = weaponsForSource("pickup");
    const index = Math.min(guns.length - 1, Math.max(0, Math.floor(random() * guns.length)));
    const gun = guns[index];
    if (gun) {
      bonus.weaponId = gun.id;
    }
  }
  return bonus;
}
