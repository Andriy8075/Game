import { MUZZLE_OFFSET, PLAYER_RADIUS, WEAPON_RANGE } from "../constants";
import { GAME_MAP, isCircleObstacle, isRectObstacle, type GameMap } from "../world/map";

export type RayHitKind = "player" | "obstacle" | "none";

export type HitscanTarget = {
  id: string;
  x: number;
  y: number;
  radius?: number;
};

export type HitscanResult = {
  kind: RayHitKind;
  id?: string;
  t: number;
  x: number;
  y: number;
};

function rayCircle(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, radius: number): number | undefined {
  const fx = ox - cx;
  const fy = oy - cy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * c;
  if (discriminant < 0) {
    return undefined;
  }

  const sqrt = Math.sqrt(discriminant);
  const t0 = (-b - sqrt) / 2;
  const t1 = (-b + sqrt) / 2;
  if (t0 >= 0) {
    return t0;
  }
  if (t1 >= 0) {
    return t1;
  }
  return undefined;
}

function rayRect(ox: number, oy: number, dx: number, dy: number, x: number, y: number, width: number, height: number): number | undefined {
  const invDx = dx === 0 ? Number.POSITIVE_INFINITY : 1 / dx;
  const invDy = dy === 0 ? Number.POSITIVE_INFINITY : 1 / dy;

  let tMin = dx === 0
    ? (ox >= x && ox <= x + width ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY)
    : Math.min((x - ox) * invDx, (x + width - ox) * invDx);
  let tMax = dx === 0
    ? (ox >= x && ox <= x + width ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
    : Math.max((x - ox) * invDx, (x + width - ox) * invDx);

  const tyMin = dy === 0
    ? (oy >= y && oy <= y + height ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY)
    : Math.min((y - oy) * invDy, (y + height - oy) * invDy);
  const tyMax = dy === 0
    ? (oy >= y && oy <= y + height ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
    : Math.max((y - oy) * invDy, (y + height - oy) * invDy);

  tMin = Math.max(tMin, tyMin);
  tMax = Math.min(tMax, tyMax);

  if (tMin > tMax) {
    return undefined;
  }
  if (tMax < 0) {
    return undefined;
  }
  return tMin >= 0 ? tMin : 0;
}

export function muzzleOrigin(x: number, y: number, angle: number, offset: number = MUZZLE_OFFSET): { x: number; y: number } {
  return {
    x: x + Math.cos(angle) * offset,
    y: y + Math.sin(angle) * offset,
  };
}

export function castHitscan(
  originX: number,
  originY: number,
  angle: number,
  targets: HitscanTarget[],
  world: GameMap = GAME_MAP,
  range: number = WEAPON_RANGE,
  shooterId?: string,
): HitscanResult {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best: HitscanResult = {
    kind: "none",
    t: range,
    x: originX + dx * range,
    y: originY + dy * range,
  };

  const consider = (kind: RayHitKind, t: number | undefined, id?: string) => {
    if (t === undefined || t < 0 || t > best.t || t > range) {
      return;
    }
    best = {
      kind,
      id,
      t,
      x: originX + dx * t,
      y: originY + dy * t,
    };
  };

  for (const obstacle of world.obstacles) {
    if (isRectObstacle(obstacle)) {
      consider("obstacle", rayRect(originX, originY, dx, dy, obstacle.x, obstacle.y, obstacle.width, obstacle.height), obstacle.id);
    } else if (isCircleObstacle(obstacle)) {
      consider("obstacle", rayCircle(originX, originY, dx, dy, obstacle.x, obstacle.y, obstacle.radius), obstacle.id);
    }
  }

  for (const target of targets) {
    if (target.id === shooterId) {
      continue;
    }
    consider("player", rayCircle(originX, originY, dx, dy, target.x, target.y, target.radius ?? PLAYER_RADIUS), target.id);
  }

  return best;
}
