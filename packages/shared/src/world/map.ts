import { WORLD_HEIGHT, WORLD_WIDTH } from "../constants";

export type RectObstacle = {
  id: string;
  kind: "building" | "fence";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: number;
  stroke: number;
};

export type CircleObstacle = {
  id: string;
  kind: "tree" | "stone";
  x: number;
  y: number;
  radius: number;
  fill: number;
  stroke: number;
};

export type Obstacle = RectObstacle | CircleObstacle;

export type SpawnPoint = {
  x: number;
  y: number;
};

export type GameMap = {
  width: number;
  height: number;
  ground: number;
  backdrop: number;
  obstacles: Obstacle[];
  spawns: SpawnPoint[];
};

const BUILDINGS: RectObstacle[] = [
  { id: "hq", kind: "building", x: 620, y: 480, width: 280, height: 200, fill: 0x6d7380, stroke: 0x3e4450 },
  { id: "barn", kind: "building", x: 2140, y: 420, width: 320, height: 180, fill: 0x8d6e63, stroke: 0x5d4037 },
  { id: "warehouse", kind: "building", x: 1680, y: 1480, width: 360, height: 240, fill: 0x78909c, stroke: 0x455a64 },
  { id: "shed", kind: "building", x: 420, y: 1680, width: 180, height: 140, fill: 0x90a4ae, stroke: 0x546e7a },
];

const FENCES: RectObstacle[] = [
  { id: "yard-north", kind: "fence", x: 1080, y: 860, width: 420, height: 18, fill: 0xa1887f, stroke: 0x5d4037 },
  { id: "yard-west", kind: "fence", x: 1080, y: 860, width: 18, height: 260, fill: 0xa1887f, stroke: 0x5d4037 },
  { id: "yard-east", kind: "fence", x: 1482, y: 860, width: 18, height: 260, fill: 0xa1887f, stroke: 0x5d4037 },
  { id: "lane-south", kind: "fence", x: 2360, y: 1180, width: 380, height: 16, fill: 0x8d6e63, stroke: 0x4e342e },
];

const TREES: CircleObstacle[] = [
  { id: "tree-1", kind: "tree", x: 380, y: 360, radius: 36, fill: 0x2e7d32, stroke: 0x1b5e20 },
  { id: "tree-2", kind: "tree", x: 980, y: 300, radius: 42, fill: 0x388e3c, stroke: 0x1b5e20 },
  { id: "tree-3", kind: "tree", x: 1500, y: 520, radius: 32, fill: 0x2e7d32, stroke: 0x1b5e20 },
  { id: "tree-4", kind: "tree", x: 2680, y: 340, radius: 40, fill: 0x338a3e, stroke: 0x1b5e20 },
  { id: "tree-5", kind: "tree", x: 2920, y: 760, radius: 34, fill: 0x2e7d32, stroke: 0x1b5e20 },
  { id: "tree-6", kind: "tree", x: 780, y: 1280, radius: 38, fill: 0x388e3c, stroke: 0x1b5e20 },
  { id: "tree-7", kind: "tree", x: 1280, y: 1760, radius: 44, fill: 0x2e7d32, stroke: 0x1b5e20 },
  { id: "tree-8", kind: "tree", x: 2480, y: 1880, radius: 36, fill: 0x338a3e, stroke: 0x1b5e20 },
  { id: "tree-9", kind: "tree", x: 1860, y: 980, radius: 30, fill: 0x2e7d32, stroke: 0x1b5e20 },
];

const STONES: CircleObstacle[] = [
  { id: "stone-1", kind: "stone", x: 540, y: 920, radius: 22, fill: 0x9e9e9e, stroke: 0x616161 },
  { id: "stone-2", kind: "stone", x: 1620, y: 280, radius: 18, fill: 0xbdbdbd, stroke: 0x757575 },
  { id: "stone-3", kind: "stone", x: 1980, y: 760, radius: 26, fill: 0x9e9e9e, stroke: 0x616161 },
  { id: "stone-4", kind: "stone", x: 1120, y: 1420, radius: 20, fill: 0xb0bec5, stroke: 0x78909c },
  { id: "stone-5", kind: "stone", x: 2860, y: 1540, radius: 24, fill: 0x9e9e9e, stroke: 0x616161 },
  { id: "stone-6", kind: "stone", x: 720, y: 2040, radius: 21, fill: 0xbdbdbd, stroke: 0x757575 },
];

export const GAME_MAP: GameMap = {
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  ground: 0x4c7a3e,
  backdrop: 0x1b2416,
  obstacles: [...BUILDINGS, ...FENCES, ...TREES, ...STONES],
  spawns: [
    { x: 240, y: 240 },
    { x: 2960, y: 240 },
    { x: 240, y: 2160 },
    { x: 2960, y: 2160 },
    { x: 1600, y: 200 },
    { x: 1600, y: 2200 },
    { x: 280, y: 1200 },
    { x: 2920, y: 1200 },
  ],
};

export function isRectObstacle(obstacle: Obstacle): obstacle is RectObstacle {
  return obstacle.kind === "building" || obstacle.kind === "fence";
}

export function isCircleObstacle(obstacle: Obstacle): obstacle is CircleObstacle {
  return obstacle.kind === "tree" || obstacle.kind === "stone";
}

export function getObstacle(id: string): Obstacle | undefined {
  return GAME_MAP.obstacles.find((obstacle) => obstacle.id === id);
}
