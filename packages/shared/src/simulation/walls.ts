import { PLAYER_RADIUS, WALL_GAP, WALL_LENGTH, WALL_THICKNESS } from "../constants";
import { circleOverlapsRect, type RectBounds } from "./collision";
import {
  GAME_MAP,
  isCircleObstacle,
  isRectObstacle,
  type GameMap,
  type Obstacle,
} from "../world/map";

export type WallRect = RectBounds;

export function wallRectForAim(x: number, y: number, angle: number): WallRect {
  const facingHorizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
  const width = facingHorizontal ? WALL_THICKNESS : WALL_LENGTH;
  const height = facingHorizontal ? WALL_LENGTH : WALL_THICKNESS;
  const along = facingHorizontal ? width : height;
  const distance = PLAYER_RADIUS + along / 2 + WALL_GAP;
  const centerX = x + Math.cos(angle) * distance;
  const centerY = y + Math.sin(angle) * distance;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

export function rectsOverlap(a: WallRect, b: WallRect): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function wallPlacementBlock(
  rect: WallRect,
  world: GameMap,
  players: Array<{ x: number; y: number }>,
  walls: WallRect[],
): string | undefined {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > world.width || rect.y + rect.height > world.height) {
    return "Can't place a wall there";
  }

  for (const obstacle of world.obstacles) {
    if (isRectObstacle(obstacle) && rectsOverlap(rect, obstacle)) {
      return "Can't place a wall there";
    }
    if (isCircleObstacle(obstacle) && circleOverlapsRect(obstacle.x, obstacle.y, obstacle.radius, rect)) {
      return "Can't place a wall there";
    }
  }

  for (const wall of walls) {
    if (rectsOverlap(rect, wall)) {
      return "Can't place a wall there";
    }
  }

  for (const player of players) {
    if (circleOverlapsRect(player.x, player.y, PLAYER_RADIUS, rect)) {
      return "Someone is in the way";
    }
  }

  return undefined;
}

export function mapWithWalls(
  walls: Iterable<{ id?: string; x: number; y: number; width: number; height: number }>,
  world: GameMap = GAME_MAP,
): GameMap {
  const obstacles: Obstacle[] = [...world.obstacles];
  let index = 0;
  for (const wall of walls) {
    obstacles.push({
      id: wall.id ?? `wall-${index}`,
      kind: "fence",
      x: wall.x,
      y: wall.y,
      width: wall.width,
      height: wall.height,
      fill: 0xa1887f,
      stroke: 0x5d4037,
    });
    index += 1;
  }
  return { ...world, obstacles };
}
