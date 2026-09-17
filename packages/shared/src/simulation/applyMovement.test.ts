import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, PLAYER_SPEED } from "../constants";
import { applyMovement } from "./applyMovement";
import { isBlocked, resolveCollisions } from "./collision";
import { getObstacle } from "../world/map";

describe("applyMovement", () => {
  it("normalizes diagonal movement so it is not faster than axis movement", () => {
    const axis = applyMovement({ x: 200, y: 200, angle: 0 }, { moveX: 1, moveY: 0, aimAngle: 0 }, 1 / 30);
    const diagonal = applyMovement({ x: 200, y: 200, angle: 0 }, { moveX: 1, moveY: 1, aimAngle: 0 }, 1 / 30);
    const axisDistance = Math.hypot(axis.x - 200, axis.y - 200);
    const diagonalDistance = Math.hypot(diagonal.x - 200, diagonal.y - 200);

    expect(axisDistance).toBeCloseTo(PLAYER_SPEED / 30, 5);
    expect(diagonalDistance).toBeCloseTo(axisDistance, 5);
  });

  it("clamps huge axis values to normal speed", () => {
    const honest = applyMovement({ x: 200, y: 200, angle: 0 }, { moveX: 1, moveY: 0, aimAngle: 0 }, 1 / 30);
    const cheated = applyMovement({ x: 200, y: 200, angle: 0 }, { moveX: 127, moveY: 0, aimAngle: 0 }, 1 / 30);
    expect(cheated.x).toBeCloseTo(honest.x, 8);
  });

  it("keeps the player inside the map", () => {
    const body = applyMovement({ x: 10, y: 10, angle: 0 }, { moveX: -1, moveY: -1, aimAngle: 0 }, 1);
    expect(body.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(body.y).toBeGreaterThanOrEqual(PLAYER_RADIUS);
  });

  it("is deterministic across repeated steps", () => {
    const first = { x: 300, y: 300, angle: 0 };
    const second = { x: 300, y: 300, angle: 0 };
    for (let i = 0; i < 12; i += 1) {
      applyMovement(first, { moveX: 1, moveY: 0, aimAngle: 0.25 }, 1 / 30);
      applyMovement(second, { moveX: 1, moveY: 0, aimAngle: 0.25 }, 1 / 30);
    }
    expect(first).toEqual(second);
  });

  it("cannot walk through buildings", () => {
    const building = getObstacle("hq");
    if (!building || building.kind !== "building") {
      throw new Error("expected hq building");
    }

    const startX = building.x - PLAYER_RADIUS - 2;
    const startY = building.y + building.height / 2;
    const body = { x: startX, y: startY, angle: 0 };
    for (let i = 0; i < 20; i += 1) {
      applyMovement(body, { moveX: 1, moveY: 0, aimAngle: 0 }, 1 / 30);
    }

    expect(body.x).toBeLessThan(building.x);
    expect(isBlocked(body.x, body.y)).toBe(false);
  });
});

describe("resolveCollisions", () => {
  it("pushes a circle out of a stone", () => {
    const stone = getObstacle("stone-1");
    if (!stone || stone.kind !== "stone") {
      throw new Error("expected stone");
    }
    const resolved = resolveCollisions(stone.x, stone.y);
    expect(Math.hypot(resolved.x - stone.x, resolved.y - stone.y)).toBeGreaterThanOrEqual(stone.radius + PLAYER_RADIUS - 0.001);
  });
});
