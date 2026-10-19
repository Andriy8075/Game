import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, WALL_HP, WALL_LENGTH, WALL_THICKNESS } from "../constants";
import { GAME_MAP } from "../world/map";
import { castHitscan } from "./hitscan";
import { mapWithWalls, wallPlacementBlock, wallRectForAim } from "./walls";

describe("placeable walls", () => {
  it("drops a vertical slab in front of a player aiming right", () => {
    const rect = wallRectForAim(400, 1200, 0);
    expect(rect.width).toBe(WALL_THICKNESS);
    expect(rect.height).toBe(WALL_LENGTH);
    expect(rect.x).toBeGreaterThan(400 + PLAYER_RADIUS);
    expect(rect.y + rect.height / 2).toBeCloseTo(1200, 5);
  });

  it("drops a horizontal slab in front of a player aiming down", () => {
    const rect = wallRectForAim(400, 1200, Math.PI / 2);
    expect(rect.width).toBe(WALL_LENGTH);
    expect(rect.height).toBe(WALL_THICKNESS);
    expect(rect.y).toBeGreaterThan(1200 + PLAYER_RADIUS);
  });

  it("stops a bullet before a player standing behind the wall", () => {
    const rect = wallRectForAim(400, 1200, 0);
    const world = mapWithWalls([{ id: "w1", ...rect }]);
    const result = castHitscan(400, 1200, 0, [{ id: "enemy", x: 700, y: 1200 }], world);
    expect(result.kind).toBe("obstacle");
    expect(result.id).toBe("w1");
    expect(result.x).toBeLessThan(700 - PLAYER_RADIUS);
  });

  it("refuses a wall that would cover another player", () => {
    const rect = wallRectForAim(220, 2200, 0);
    const blocked = wallPlacementBlock(
      rect,
      GAME_MAP,
      [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }],
      [],
    );
    expect(blocked).toBe("Someone is in the way");
  });

  it("uses the shared low hit point budget", () => {
    expect(WALL_HP).toBeLessThanOrEqual(40);
  });
});
