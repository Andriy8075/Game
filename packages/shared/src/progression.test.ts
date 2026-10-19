import { describe, expect, it } from "vitest";
import { STARTER_WEAPON_ID } from "./weapons/catalog";
import {
  XP_PER_KILL,
  XP_PER_LEVEL,
  formatAccountLevel,
  grantKillXp,
  joinBonusChance,
  resolveMenuWeapon,
  rollJoinLoadout,
  suggestedPlayerName,
  weaponsOfferedAtLevel,
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

  it("adds kill xp and carries whole levels", () => {
    expect(grantKillXp(1, 0)).toEqual({ level: 1, xp: XP_PER_KILL });
    expect(grantKillXp(1, 80)).toEqual({ level: 2, xp: 20 });
    expect(grantKillXp(3, 90)).toEqual({ level: 4, xp: 30 });
    expect(formatAccountLevel(3, 40)).toBe(`Level 3 · 40/${XP_PER_LEVEL}`);
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
