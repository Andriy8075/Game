import { BOT_RADIUS } from "../constants";
import { clamp } from "../math";
import { GAME_MAP, type GameMap } from "../world/map";
import { isBlocked, type Vec2 } from "./collision";

const CELL = 24;
const CLEARANCE = 6;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

type NavGrid = {
  cell: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
};

type HeapEntry = {
  i: number;
  f: number;
};

let cachedKey = Number.NaN;
let cachedGrid: NavGrid | undefined;

function navKey(radius: number, world: GameMap): number {
  let hash = (Math.round(radius) * 17 + world.obstacles.length) | 0;
  for (const obstacle of world.obstacles) {
    hash = (hash * 33 + Math.round(obstacle.x) + Math.round(obstacle.y) * 131) | 0;
    if ("width" in obstacle) {
      hash = (hash * 33 + obstacle.width + obstacle.height * 17) | 0;
    } else {
      hash = (hash * 33 + obstacle.radius) | 0;
    }
  }
  return hash;
}

function buildGrid(radius: number, world: GameMap): NavGrid {
  const cols = Math.ceil(world.width / CELL);
  const rows = Math.ceil(world.height / CELL);
  const blocked = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = (col + 0.5) * CELL;
      const y = (row + 0.5) * CELL;
      if (isBlocked(x, y, radius + CLEARANCE, world)) {
        blocked[row * cols + col] = 1;
      }
    }
  }
  return { cell: CELL, cols, rows, blocked };
}

function gridFor(radius: number, world: GameMap): NavGrid {
  const key = navKey(radius, world);
  if (cachedGrid && cachedKey === key) {
    return cachedGrid;
  }
  cachedGrid = buildGrid(radius, world);
  cachedKey = key;
  return cachedGrid;
}

function cellOf(x: number, y: number, grid: NavGrid): { col: number; row: number } {
  return {
    col: clamp(Math.floor(x / grid.cell), 0, grid.cols - 1),
    row: clamp(Math.floor(y / grid.cell), 0, grid.rows - 1),
  };
}

function center(index: number, grid: NavGrid): Vec2 {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return {
    x: (col + 0.5) * grid.cell,
    y: (row + 0.5) * grid.cell,
  };
}

function nearestFree(col: number, row: number, grid: NavGrid): number {
  const start = row * grid.cols + col;
  if (!grid.blocked[start]) {
    return start;
  }

  const visited = new Uint8Array(grid.blocked.length);
  const queue = [start];
  visited[start] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    const currentCol = current % grid.cols;
    const currentRow = Math.floor(current / grid.cols);
    for (const [dc, dr] of DIRS) {
      const nextCol = currentCol + dc;
      const nextRow = currentRow + dr;
      if (nextCol < 0 || nextRow < 0 || nextCol >= grid.cols || nextRow >= grid.rows) {
        continue;
      }
      const next = nextRow * grid.cols + nextCol;
      if (visited[next]) {
        continue;
      }
      if (!grid.blocked[next]) {
        return next;
      }
      visited[next] = 1;
      queue.push(next);
    }
  }

  return -1;
}

function heapPush(heap: HeapEntry[], entry: HeapEntry): void {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent]!.f <= heap[index]!.f) {
      break;
    }
    const swap = heap[parent]!;
    heap[parent] = heap[index]!;
    heap[index] = swap;
    index = parent;
  }
}

function heapPop(heap: HeapEntry[]): HeapEntry {
  const top = heap[0]!;
  const last = heap.pop()!;
  if (heap.length === 0) {
    return last;
  }
  heap[0] = last;
  let index = 0;
  for (;;) {
    const left = index * 2 + 1;
    const right = left + 1;
    let smallest = index;
    if (left < heap.length && heap[left]!.f < heap[smallest]!.f) {
      smallest = left;
    }
    if (right < heap.length && heap[right]!.f < heap[smallest]!.f) {
      smallest = right;
    }
    if (smallest === index) {
      break;
    }
    const swap = heap[smallest]!;
    heap[smallest] = heap[index]!;
    heap[index] = swap;
    index = smallest;
  }
  return top;
}

function findPath(x: number, y: number, goalX: number, goalY: number, radius: number, world: GameMap): Vec2[] {
  const grid = gridFor(radius, world);
  const startCell = cellOf(x, y, grid);
  const goalCell = cellOf(goalX, goalY, grid);
  const start = nearestFree(startCell.col, startCell.row, grid);
  const goal = nearestFree(goalCell.col, goalCell.row, grid);
  if (start < 0 || goal < 0) {
    return [];
  }
  if (start === goal) {
    return [center(goal, grid)];
  }

  const gScore = new Float64Array(grid.blocked.length);
  gScore.fill(Number.POSITIVE_INFINITY);
  const came = new Int32Array(grid.blocked.length);
  came.fill(-1);
  const closed = new Uint8Array(grid.blocked.length);
  gScore[start] = 0;

  const goalCenter = center(goal, grid);
  const heuristic = (index: number) => {
    const point = center(index, grid);
    return Math.hypot(point.x - goalCenter.x, point.y - goalCenter.y);
  };

  const heap: HeapEntry[] = [];
  heapPush(heap, { i: start, f: heuristic(start) });

  while (heap.length > 0) {
    const current = heapPop(heap).i;
    if (closed[current]) {
      continue;
    }
    if (current === goal) {
      const path: Vec2[] = [];
      let cursor = goal;
      while (cursor !== start && cursor !== -1) {
        path.push(center(cursor, grid));
        cursor = came[cursor]!;
      }
      path.reverse();
      return path;
    }
    closed[current] = 1;

    const col = current % grid.cols;
    const row = Math.floor(current / grid.cols);
    for (const [dc, dr] of DIRS) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (nextCol < 0 || nextRow < 0 || nextCol >= grid.cols || nextRow >= grid.rows) {
        continue;
      }
      const next = nextRow * grid.cols + nextCol;
      if (grid.blocked[next] || closed[next]) {
        continue;
      }
      const tentative = gScore[current]! + grid.cell;
      if (tentative >= gScore[next]!) {
        continue;
      }
      came[next] = current;
      gScore[next] = tentative;
      heapPush(heap, { i: next, f: tentative + heuristic(next) });
    }
  }

  return [];
}

export function hasClearLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number = BOT_RADIUS,
  world: GameMap = GAME_MAP,
): boolean {
  const distance = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(distance / Math.max(4, radius * 0.5)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    if (isBlocked(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius + CLEARANCE, world)) {
      return false;
    }
  }
  return true;
}

/** Next point on a route that walks around buildings, fences, and rocks. */
export function nextWaypoint(
  x: number,
  y: number,
  goalX: number,
  goalY: number,
  radius: number = BOT_RADIUS,
  world: GameMap = GAME_MAP,
): Vec2 {
  if (isBlocked(x, y, radius + CLEARANCE, world)) {
    const grid = gridFor(radius, world);
    const cell = cellOf(x, y, grid);
    const free = nearestFree(cell.col, cell.row, grid);
    if (free >= 0) {
      return center(free, grid);
    }
  }

  if (hasClearLine(x, y, goalX, goalY, radius, world)) {
    return { x: goalX, y: goalY };
  }

  const path = findPath(x, y, goalX, goalY, radius, world);
  const ahead = path.find((point) => Math.hypot(point.x - x, point.y - y) >= 12);
  if (!ahead) {
    return path[0] ?? { x: goalX, y: goalY };
  }

  let chosen = ahead;
  for (const point of path) {
    if (Math.hypot(point.x - x, point.y - y) < 12) {
      continue;
    }
    if (!hasClearLine(x, y, point.x, point.y, radius, world)) {
      break;
    }
    chosen = point;
  }
  return chosen;
}
