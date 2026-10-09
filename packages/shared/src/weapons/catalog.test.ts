import { describe, expect, it } from "vitest";
import { FIRE_COOLDOWN_MS, PLAYER_DAMAGE, WEAPON_RANGE } from "../constants";
import {
  STARTER_WEAPON_ID,
  WEAPONS,
  formatWeaponStats,
  getWeapon,
  shotsPerSecond,
  weaponsForSource,
} from "./catalog";

describe("weapon catalog", () => {
  it("gives every weapon a name plus damage, range, and fire rate", () => {
    const ids = new Set<string>();
    for (const weapon of WEAPONS) {
      expect(weapon.name.length).toBeGreaterThan(0);
      expect(weapon.damage).toBeGreaterThan(0);
      expect(weapon.range).toBeGreaterThan(0);
      expect(weapon.fireCooldownMs).toBeGreaterThan(0);
      expect(ids.has(weapon.id)).toBe(false);
      ids.add(weapon.id);
    }
  });

  it("keeps the starter Sidearm on the original hitscan stats", () => {
    const sidearm = getWeapon(STARTER_WEAPON_ID);
    expect(sidearm.source).toBe("starter");
    expect(sidearm.damage).toBe(PLAYER_DAMAGE);
    expect(sidearm.range).toBe(WEAPON_RANGE);
    expect(sidearm.fireCooldownMs).toBe(FIRE_COOLDOWN_MS);
    expect(getWeapon(undefined).id).toBe(STARTER_WEAPON_ID);
    expect(getWeapon("not-a-weapon").id).toBe(STARTER_WEAPON_ID);
  });

  it("spreads pickup weapons across close, mid, and long ranges", () => {
    const pickups = weaponsForSource("pickup");
    const splinter = getWeapon("splinter");
    const buckshot = getWeapon("buckshot");
    const longshot = getWeapon("longshot");
    const repeater = getWeapon("repeater");
    const sidearm = getWeapon("sidearm");

    expect(pickups.map((weapon) => weapon.id)).toEqual(["splinter", "buckshot", "longshot", "repeater"]);
    expect(splinter.fireCooldownMs).toBeLessThan(sidearm.fireCooldownMs);
    expect(splinter.damage).toBeLessThan(sidearm.damage);
    expect(buckshot.damage).toBeGreaterThan(sidearm.damage);
    expect(buckshot.range).toBeLessThan(sidearm.range);
    expect(longshot.range).toBeGreaterThan(repeater.range);
    expect(longshot.fireCooldownMs).toBeGreaterThan(repeater.fireCooldownMs);
    expect(shotsPerSecond(splinter)).toBeGreaterThan(shotsPerSecond(buckshot));
  });

  it("reserves menu weapons for a later level gate", () => {
    const menu = weaponsForSource("menu");
    expect(menu.map((weapon) => [weapon.id, weapon.requiredLevel])).toEqual([
      ["vanguard", 5],
      ["horizon", 12],
    ]);
    expect(getWeapon("horizon").damage).toBeGreaterThan(getWeapon("vanguard").damage);
    expect(getWeapon("horizon").range).toBeGreaterThan(getWeapon("vanguard").range);
  });

  it("reserves crafted weapons for a later crafting bench", () => {
    const craft = weaponsForSource("craft");
    expect(craft.map((weapon) => [weapon.id, weapon.recipeId])).toEqual([
      ["forge", "forge-cannon"],
      ["whisper", "whisper-kit"],
    ]);
    expect(getWeapon("forge").damage).toBeGreaterThan(getWeapon("whisper").damage);
    expect(getWeapon("whisper").fireCooldownMs).toBeLessThan(getWeapon("forge").fireCooldownMs);
  });

  it("formats the stats shown on the hud", () => {
    expect(formatWeaponStats(getWeapon("sidearm"))).toBe("Sidearm   20 dmg   720 range   4.0 shots/s");
  });
});
