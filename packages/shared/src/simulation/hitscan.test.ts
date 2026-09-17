import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, WEAPON_RANGE } from "../constants";
import { castHitscan, muzzleOrigin } from "./hitscan";
import { getObstacle } from "../world/map";

describe("castHitscan", () => {
  it("hits a player on a clear line of sight", () => {
    const origin = { x: 200, y: 200 };
    const target = { id: "enemy", x: 500, y: 200 };
    const result = castHitscan(origin.x, origin.y, 0, [target], undefined, WEAPON_RANGE, "shooter");
    expect(result.kind).toBe("player");
    expect(result.id).toBe("enemy");
    expect(result.x).toBeCloseTo(target.x - PLAYER_RADIUS, 3);
  });

  it("continues through empty space to max range", () => {
    const result = castHitscan(200, 200, 0, []);
    expect(result.kind).toBe("none");
    expect(result.x).toBeCloseTo(200 + WEAPON_RANGE, 5);
  });

  it("is blocked by a building before a player behind it", () => {
    const building = getObstacle("hq");
    if (!building || building.kind !== "building") {
      throw new Error("expected hq building");
    }

    const originX = building.x - 80;
    const originY = building.y + building.height / 2;
    const target = {
      id: "enemy",
      x: building.x + building.width + 80,
      y: originY,
    };
    const result = castHitscan(originX, originY, 0, [target]);
    expect(result.kind).toBe("obstacle");
    expect(result.id).toBe("hq");
  });

  it("selects the nearest player when two are aligned", () => {
    const result = castHitscan(200, 2200, 0, [
      { id: "far", x: 700, y: 2200 },
      { id: "near", x: 400, y: 2200 },
    ]);
    expect(result.kind).toBe("player");
    expect(result.id).toBe("near");
  });

  it("places the muzzle ahead of the body", () => {
    const muzzle = muzzleOrigin(100, 100, 0, 24);
    expect(muzzle.x).toBe(124);
    expect(muzzle.y).toBe(100);
  });
});
