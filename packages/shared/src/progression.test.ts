import { describe, expect, it } from "vitest";
import { PLAYER_MAX_HP } from "./constants";
import { STARTER_WEAPON_ID } from "./weapons/catalog";
import {
  MAX_LEVEL,
  XP_PER_KILL,
  XP_PER_LEVEL,
  XP_PER_WIN,
  formatAccountLevel,
  grantXp,
  hpBonusPercent,
  joinBonusChance,
  maxHpForLevel,
  resolveMenuWeapon,
  rollJoinLoadout,
  suggestedPlayerName,
  weaponsOfferedAtLevel,
  xpToNextLevel,
} from "./progression";

describe("account progression", () => {
  it("suggests a sanitized display name", () => {
    expect(suggestedPlayerName("  Nova  ")).toBe("Nova");
    expect(suggestedPlayerName(undefined)).toBe("Player");
  });

  it("offers menu guns only after their level", () => {
    expect(weaponsOfferedAtLevel(0).map((weapon) => weapon.id)).toEqual(["sidearm"]);
    expect(weaponsOfferedAtLevel(1).map((weapon) => weapon.id)).toEqual(["sidearm"]);
    expect(weaponsOfferedAtLevel(5).map((weapon) => weapon.id)).toEqual(["sidearm", "vanguard"]);
    expect(weaponsOfferedAtLevel(12).map((weapon) => weapon.id)).toEqual(["sidearm", "vanguard", "horizon"]);
  });

  it("rejects a menu gun the account has not earned", () => {
    expect(resolveMenuWeapon("horizon", 0).id).toBe(STARTER_WEAPON_ID);
    expect(resolveMenuWeapon("horizon", 4).id).toBe(STARTER_WEAPON_ID);
    expect(resolveMenuWeapon("vanguard", 5).id).toBe("vanguard");
    expect(resolveMenuWeapon("horizon", 12).id).toBe("horizon");
    expect(resolveMenuWeapon("forge", 20).id).toBe(STARTER_WEAPON_ID);
    expect(resolveMenuWeapon(undefined, 12).id).toBe(STARTER_WEAPON_ID);
  });

  it("raises the xp needed per level and stops at 20", () => {
    expect(xpToNextLevel(1)).toBe(XP_PER_LEVEL);
    expect(xpToNextLevel(2)).toBe(125);
    expect(xpToNextLevel(3)).toBe(150);
    expect(xpToNextLevel(19)).toBe(550);
    expect(xpToNextLevel(20)).toBe(0);
    expect(grantXp(1, 0, XP_PER_KILL)).toEqual({ level: 1, xp: XP_PER_KILL });
    expect(grantXp(1, 80, XP_PER_KILL)).toEqual({ level: 2, xp: 20 });
    expect(grantXp(3, 140, XP_PER_KILL)).toEqual({ level: 4, xp: 30 });
    expect(grantXp(1, 0, XP_PER_WIN)).toEqual({ level: 2, xp: 50 });
    expect(grantXp(20, 40, XP_PER_WIN)).toEqual({ level: MAX_LEVEL, xp: 0 });
    expect(grantXp(19, 540, XP_PER_KILL)).toEqual({ level: MAX_LEVEL, xp: 0 });
  });

  it("formats level, xp, and the hp bonus", () => {
    expect(formatAccountLevel(1, 0)).toBe(`Level 1 · 0/${XP_PER_LEVEL} · +1% HP`);
    expect(formatAccountLevel(3, 40)).toBe("Level 3 · 40/150 · +3% HP");
    expect(formatAccountLevel(20, 80)).toBe("Level 20 · MAX · +20% HP");
  });

  it("gives 1% more max hp per level and none to guests", () => {
    expect(hpBonusPercent(0)).toBe(0);
    expect(maxHpForLevel(0)).toBe(PLAYER_MAX_HP);
    expect(maxHpForLevel(1)).toBe(101);
    expect(maxHpForLevel(20)).toBe(120);
    expect(maxHpForLevel(99)).toBe(120);
  });

  it("raises the join bonus chance with level and caps it", () => {
    expect(joinBonusChance(0)).toBe(0);
    expect(joinBonusChance(1)).toBeCloseTo(0.05);
    expect(joinBonusChance(5)).toBeCloseTo(0.17);
    expect(joinBonusChance(12)).toBeCloseTo(0.38);
    expect(joinBonusChance(40)).toBeCloseTo(0.45);
  });

  it("usually grants nothing at level 1 and more at a high level", () => {
    const quiet = rollJoinLoadout(1, () => 0.5, STARTER_WEAPON_ID);
    expect(quiet).toEqual({ frag: 0, bandage: 0, lightArmor: false });

    const lucky = rollJoinLoadout(1, () => 0, STARTER_WEAPON_ID);
    expect(lucky.frag).toBe(1);
    expect(lucky.bandage).toBe(1);
    expect(lucky.lightArmor).toBe(true);
    expect(lucky.weaponId).toBe("splinter");

    const high = rollJoinLoadout(12, () => 0.2, STARTER_WEAPON_ID);
    expect(high.frag).toBe(1);
    expect(high.bandage).toBe(1);
    expect(high.lightArmor).toBe(true);
    expect(high.weaponId).toBe("splinter");

    const missed = rollJoinLoadout(12, () => 0.5, STARTER_WEAPON_ID);
    expect(missed).toEqual({ frag: 0, bandage: 0, lightArmor: false });
  });

  it("does not replace a menu gun and never bonuses a guest", () => {
    const kept = rollJoinLoadout(12, () => 0, "vanguard");
    expect(kept.weaponId).toBeUndefined();
    expect(kept.frag).toBe(1);

    const guest = rollJoinLoadout(0, () => 0, STARTER_WEAPON_ID);
    expect(guest).toEqual({ frag: 0, bandage: 0, lightArmor: false });
  });
});
