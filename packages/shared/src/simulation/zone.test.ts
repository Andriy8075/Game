import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../constants";
import { GAME_MAP } from "../world/map";
import { isBlocked } from "./collision";
import { pickSpawn, pickUniqueSpawns } from "./spawns";
import {
  ZONE_CENTER_X,
  ZONE_CENTER_Y,
  ZONE_PHASES,
  ZONE_START_RADIUS,
  isInSmoke,
  zoneAt,
} from "./zone";

describe("smoke zone", () => {
  it("starts large enough to cover the map corners", () => {
    expect(ZONE_START_RADIUS).toBeCloseTo(Math.hypot(WORLD_WIDTH / 2, WORLD_HEIGHT / 2), 8);
    const start = zoneAt(0);
    expect(start.radius).toBe(ZONE_START_RADIUS);
    expect(start.shrinking).toBe(false);
    expect(start.damage).toBe(ZONE_PHASES[0]!.damage);
    expect(isInSmoke(0, 0, start.radius)).toBe(false);
    expect(isInSmoke(WORLD_WIDTH, WORLD_HEIGHT, start.radius)).toBe(false);
  });

  it("holds, then shrinks linearly toward the next radius", () => {
    const first = ZONE_PHASES[0]!;
    const held = zoneAt(first.holdMs - 1);
    expect(held.radius).toBe(ZONE_START_RADIUS);
    expect(held.shrinking).toBe(false);

    const mid = zoneAt(first.holdMs + first.shrinkMs / 2);
    expect(mid.shrinking).toBe(true);
    expect(mid.radius).toBeCloseTo((ZONE_START_RADIUS + first.targetRadius) / 2, 5);

    const after = zoneAt(first.holdMs + first.shrinkMs);
    expect(after.radius).toBe(first.targetRadius);
    expect(after.shrinking).toBe(false);
    expect(after.phaseIndex).toBe(1);
  });

  it("closes the whole map after the last shrink", () => {
    const total = ZONE_PHASES.reduce((sum, phase) => sum + phase.holdMs + phase.shrinkMs, 0);
    const last = ZONE_PHASES[ZONE_PHASES.length - 1]!;
    const snap = zoneAt(total + 60_000);
    expect(last.targetRadius).toBe(0);
    expect(snap.radius).toBe(0);
    expect(snap.shrinking).toBe(false);
    expect(snap.damage).toBe(last.damage);
    expect(snap.nextChangeMs).toBe(0);
    expect(isInSmoke(ZONE_CENTER_X, ZONE_CENTER_Y, snap.radius)).toBe(true);
  });

  it("treats the map center as safe and the corners as smoked once the circle is small", () => {
    expect(isInSmoke(ZONE_CENTER_X, ZONE_CENTER_Y, 400)).toBe(false);
    expect(isInSmoke(0, 0, 400)).toBe(true);
    expect(isInSmoke(ZONE_CENTER_X, ZONE_CENTER_Y, 0)).toBe(true);
  });
});

describe("spawn ring", () => {
  it("keeps every spawn on the map and unblocked", () => {
    expect(GAME_MAP.spawns.length).toBeGreaterThanOrEqual(16);
    for (const spawn of GAME_MAP.spawns) {
      expect(isBlocked(spawn.x, spawn.y)).toBe(false);
    }
  });

  it("spreads unique spawns around the edge", () => {
    const picks = pickUniqueSpawns(GAME_MAP.spawns.length);
    const keys = new Set(picks.map((spawn) => `${spawn.x},${spawn.y}`));
    expect(keys.size).toBe(GAME_MAP.spawns.length);
    expect(pickSpawn([]).x).toBe(GAME_MAP.spawns[0]!.x);
  });
});
