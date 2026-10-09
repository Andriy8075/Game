import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS } from "../constants";
import { weaponsForSource } from "./catalog";
import {
  PICKUP_RADIUS,
  PICKUP_SLOTS,
  isPickupSlotClear,
  overlapsPickup,
  pickupWeaponAt,
  randomPickupWeapon,
} from "./pickups";

describe("weapon pickups", () => {
  it("places every slot on open ground, apart from the others", () => {
    expect(PICKUP_SLOTS.length).toBeGreaterThan(0);
    for (const slot of PICKUP_SLOTS) {
      expect(isPickupSlotClear(slot.x, slot.y)).toBe(true);
    }

    for (let i = 0; i < PICKUP_SLOTS.length; i += 1) {
      for (let j = i + 1; j < PICKUP_SLOTS.length; j += 1) {
        const a = PICKUP_SLOTS[i]!;
        const b = PICKUP_SLOTS[j]!;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        expect(distance).toBeGreaterThan((PLAYER_RADIUS + PICKUP_RADIUS) * 4);
      }
    }
  });

  it("only rolls weapons that can be picked up", () => {
    const allowed = new Set(weaponsForSource("pickup").map((weapon) => weapon.id));
    const seen = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const id = randomPickupWeapon(() => i / 20);
      expect(allowed.has(id)).toBe(true);
      seen.add(id);
    }
    expect(seen.size).toBe(allowed.size);
    expect(pickupWeaponAt(-1)).toBe("repeater");
  });

  it("detects when a player body reaches a pickup", () => {
    expect(overlapsPickup(100, 100, 100, 100)).toBe(true);
    expect(overlapsPickup(100, 100, 100 + PLAYER_RADIUS + PICKUP_RADIUS, 100)).toBe(true);
    expect(overlapsPickup(100, 100, 100 + PLAYER_RADIUS + PICKUP_RADIUS + 1, 100)).toBe(false);
  });
});
