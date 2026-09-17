import { PLAYER_RADIUS } from "../constants";
import { clamp } from "../math";
import {
  GAME_MAP,
  isCircleObstacle,
  isRectObstacle,
  type CircleObstacle,
  type GameMap,
  type RectObstacle,
} from "../world/map";

export type Vec2 = {
  x: number;
  y: number;
};

export function clampToWorld(
  x: number,
  y: number,
  radius: number = PLAYER_RADIUS,
  world: GameMap = GAME_MAP,
): Vec2 {
  return {
    x: clamp(x, radius, world.width - radius),
    y: clamp(y, radius, world.height - radius),
  };
}

export function circleOverlapsRect(
  x: number,
  y: number,
  radius: number,
  rect: RectObstacle,
): boolean {
  const closestX = clamp(x, rect.x, rect.x + rect.width);
  const closestY = clamp(y, rect.y, rect.y + rect.height);
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy < radius * radius;
}

export function circleOverlapsCircle(
  x: number,
  y: number,
  radius: number,
  other: CircleObstacle,
): boolean {
  const dx = x - other.x;
  const dy = y - other.y;
  const minDistance = radius + other.radius;
  return dx * dx + dy * dy < minDistance * minDistance;
}

export function isBlocked(
  x: number,
  y: number,
  radius: number = PLAYER_RADIUS,
  world: GameMap = GAME_MAP,
): boolean {
  if (x < radius || y < radius || x > world.width - radius || y > world.height - radius) {
    return true;
  }

  for (const obstacle of world.obstacles) {
    if (isRectObstacle(obstacle) && circleOverlapsRect(x, y, radius, obstacle)) {
      return true;
    }
    if (isCircleObstacle(obstacle) && circleOverlapsCircle(x, y, radius, obstacle)) {
      return true;
    }
  }

  return false;
}

function pushOutOfRect(x: number, y: number, radius: number, rect: RectObstacle): Vec2 {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const insideX = x >= left && x <= right;
  const insideY = y >= top && y <= bottom;

  if (insideX && insideY) {
    const toLeft = x - left;
    const toRight = right - x;
    const toTop = y - top;
    const toBottom = bottom - y;
    const smallest = Math.min(toLeft, toRight, toTop, toBottom);

    if (smallest === toLeft) {
      return { x: left - radius, y };
    }
    if (smallest === toRight) {
      return { x: right + radius, y };
    }
    if (smallest === toTop) {
      return { x, y: top - radius };
    }
    return { x, y: bottom + radius };
  }

  const closestX = clamp(x, left, right);
  const closestY = clamp(y, top, bottom);
  const dx = x - closestX;
  const dy = y - closestY;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance >= radius) {
    return { x, y };
  }

  const overlap = radius - distance;
  return {
    x: x + (dx / distance) * overlap,
    y: y + (dy / distance) * overlap,
  };
}

function pushOutOfCircle(x: number, y: number, radius: number, other: CircleObstacle): Vec2 {
  const dx = x - other.x;
  const dy = y - other.y;
  const minDistance = radius + other.radius;
  const distance = Math.hypot(dx, dy);

  if (distance >= minDistance) {
    return { x, y };
  }

  if (distance === 0) {
    return { x: other.x + minDistance, y: other.y };
  }

  const scale = minDistance / distance;
  return {
    x: other.x + dx * scale,
    y: other.y + dy * scale,
  };
}

export function resolveCollisions(
  x: number,
  y: number,
  radius: number = PLAYER_RADIUS,
  world: GameMap = GAME_MAP,
): Vec2 {
  let next = clampToWorld(x, y, radius, world);

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const before = next;
    for (const obstacle of world.obstacles) {
      if (isRectObstacle(obstacle) && circleOverlapsRect(next.x, next.y, radius, obstacle)) {
        next = pushOutOfRect(next.x, next.y, radius, obstacle);
      } else if (isCircleObstacle(obstacle) && circleOverlapsCircle(next.x, next.y, radius, obstacle)) {
        next = pushOutOfCircle(next.x, next.y, radius, obstacle);
      }
    }
    next = clampToWorld(next.x, next.y, radius, world);
    if (before.x === next.x && before.y === next.y) {
      break;
    }
  }

  return next;
}
