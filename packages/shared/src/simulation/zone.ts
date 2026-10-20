import { WORLD_HEIGHT, WORLD_WIDTH } from "../constants";

export const ZONE_CENTER_X = WORLD_WIDTH / 2;
export const ZONE_CENTER_Y = WORLD_HEIGHT / 2;
export const ZONE_START_RADIUS = Math.hypot(ZONE_CENTER_X, ZONE_CENTER_Y);

export type ZonePhaseSpec = {
  holdMs: number;
  shrinkMs: number;
  targetRadius: number;
  damage: number;
};

/** Hold, then shrink toward the next radius. Damage applies while standing in smoke during that phase. */
export const ZONE_PHASES: readonly ZonePhaseSpec[] = [
  { holdMs: 45_000, shrinkMs: 40_000, targetRadius: 1100, damage: 2 },
  { holdMs: 30_000, shrinkMs: 30_000, targetRadius: 700, damage: 4 },
  { holdMs: 20_000, shrinkMs: 25_000, targetRadius: 380, damage: 7 },
  { holdMs: 15_000, shrinkMs: 20_000, targetRadius: 180, damage: 10 },
  { holdMs: 10_000, shrinkMs: 15_000, targetRadius: 60, damage: 15 },
];

export type ZoneSnapshot = {
  radius: number;
  shrinking: boolean;
  nextChangeMs: number;
  damage: number;
  phaseIndex: number;
};

export function zoneAt(elapsedMs: number): ZoneSnapshot {
  let remaining = Math.max(0, elapsedMs);
  let radius = ZONE_START_RADIUS;
  const lastIndex = ZONE_PHASES.length - 1;

  for (let index = 0; index < ZONE_PHASES.length; index += 1) {
    const phase = ZONE_PHASES[index]!;
    if (remaining < phase.holdMs) {
      return {
        radius,
        shrinking: false,
        nextChangeMs: phase.holdMs - remaining,
        damage: phase.damage,
        phaseIndex: index,
      };
    }
    remaining -= phase.holdMs;
    if (remaining < phase.shrinkMs) {
      const progress = phase.shrinkMs <= 0 ? 1 : remaining / phase.shrinkMs;
      return {
        radius: radius + (phase.targetRadius - radius) * progress,
        shrinking: true,
        nextChangeMs: phase.shrinkMs - remaining,
        damage: phase.damage,
        phaseIndex: index,
      };
    }
    remaining -= phase.shrinkMs;
    radius = phase.targetRadius;
  }

  const last = ZONE_PHASES[lastIndex]!;
  return {
    radius: last.targetRadius,
    shrinking: false,
    nextChangeMs: 0,
    damage: last.damage,
    phaseIndex: lastIndex,
  };
}

export function isInSmoke(x: number, y: number, radius: number): boolean {
  return Math.hypot(x - ZONE_CENTER_X, y - ZONE_CENTER_Y) > radius;
}
