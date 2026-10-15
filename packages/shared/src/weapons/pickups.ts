import { PLAYER_RADIUS } from "../constants";
import { isBlocked } from "../simulation/collision";
import { weaponsForSource, type WeaponId } from "./catalog";

export const PICKUP_RADIUS = 18;
export const PICKUP_RESPAWN_MS = 12_000;

/** Open-ground slots. Pickups appear on these points and return here after they are taken. */
export const PICKUP_SLOTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 400, y: 700 },
  { x: 1240, y: 640 },
  { x: 1880, y: 360 },
  { x: 2680, y: 1100 },
  { x: 980, y: 1960 },
];

const PICKUP_POOL: readonly WeaponId[] = weaponsForSource("pickup").map((weapon) => weapon.id);

export function pickupWeaponAt(index: number): WeaponId {
  const poolIndex = ((index % PICKUP_POOL.length) + PICKUP_POOL.length) % PICKUP_POOL.length;
  return PICKUP_POOL[poolIndex]!;
}

export function randomPickupWeapon(random: () => number = Math.random): WeaponId {
  const index = Math.floor(random() * PICKUP_POOL.length);
  return pickupWeaponAt(index);
}

export function overlapsPickup(
  x: number,
  y: number,
  pickupX: number,
  pickupY: number,
  bodyRadius: number = PLAYER_RADIUS,
): boolean {
  const reach = bodyRadius + PICKUP_RADIUS;
  const dx = x - pickupX;
  const dy = y - pickupY;
  return dx * dx + dy * dy <= reach * reach;
}

export function isPickupSlotClear(x: number, y: number): boolean {
  return !isBlocked(x, y, PICKUP_RADIUS + 12);
}
