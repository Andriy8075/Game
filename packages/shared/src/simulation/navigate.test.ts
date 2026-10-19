import { describe, expect, it } from "vitest";
import { BOT_RADIUS, BOT_SPEED, TICK_RATE } from "../constants";
import { isBlocked, resolveCollisions } from "./collision";
import { hasClearLine, nextWaypoint } from "./navigate";

describe("bot navigation", () => {
  it("walks straight when nothing is in the way", () => {
    const point = nextWaypoint(220, 2200, 700, 2200, BOT_RADIUS);
    expect(point).toEqual({ x: 700, y: 2200 });
    expect(hasClearLine(220, 2200, 700, 2200, BOT_RADIUS)).toBe(true);
  });

  it("routes out of the yard fence instead of through it", () => {
    const goal = { x: 1280, y: 500 };
    let x = 1280;
    let y = 1000;
    let leftThroughTheOpening = false;

    for (let tick = 0; tick < 450; tick += 1) {
      if (y > 1130) {
        leftThroughTheOpening = true;
      }
      const steer = nextWaypoint(x, y, goal.x, goal.y, BOT_RADIUS);
      const dx = steer.x - x;
      const dy = steer.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) {
        break;
      }
      const step = Math.min(BOT_SPEED / TICK_RATE, distance);
      const spot = resolveCollisions(x + (dx / distance) * step, y + (dy / distance) * step, BOT_RADIUS);
      expect(isBlocked(spot.x, spot.y, BOT_RADIUS)).toBe(false);
      x = spot.x;
      y = spot.y;
    }

    expect(leftThroughTheOpening).toBe(true);
    expect(y).toBeLessThan(860);
    expect(Math.hypot(goal.x - x, goal.y - y)).toBeLessThan(80);
  });

  it("walks around the headquarters instead of into the wall", () => {
    const goal = { x: 1100, y: 580 };
    let x = 400;
    let y = 580;
    let wentAround = false;

    for (let tick = 0; tick < 400; tick += 1) {
      if (y < 460 || y > 700) {
        wentAround = true;
      }
      const steer = nextWaypoint(x, y, goal.x, goal.y, BOT_RADIUS);
      const dx = steer.x - x;
      const dy = steer.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) {
        break;
      }
      const step = Math.min(BOT_SPEED / TICK_RATE, distance);
      const spot = resolveCollisions(x + (dx / distance) * step, y + (dy / distance) * step, BOT_RADIUS);
      expect(isBlocked(spot.x, spot.y, BOT_RADIUS)).toBe(false);
      x = spot.x;
      y = spot.y;
    }

    expect(wentAround).toBe(true);
    expect(x).toBeGreaterThan(1000);
  });
});
