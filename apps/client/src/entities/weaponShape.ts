import type Phaser from "phaser";

export type MuzzleShape = "flat" | "round" | "point" | "can";

export type SidePiece = "grip" | "fins" | "tube" | "scope" | "mag" | "rail" | "drum";

export type WeaponShape = {
  length: number;
  thickness: number;
  muzzle: MuzzleShape;
  side: SidePiece;
};

const STOCK = 8;
const OUTLINE = 0x102027;
const STOCK_COLOR = 0x4e342e;
const METAL = 0xeceff1;

const SHAPES: Record<string, WeaponShape> = {
  sidearm: { length: 22, thickness: 8, muzzle: "flat", side: "grip" },
  splinter: { length: 26, thickness: 5, muzzle: "point", side: "fins" },
  buckshot: { length: 28, thickness: 12, muzzle: "flat", side: "tube" },
  longshot: { length: 52, thickness: 6, muzzle: "point", side: "scope" },
  repeater: { length: 36, thickness: 7, muzzle: "round", side: "mag" },
  vanguard: { length: 32, thickness: 8, muzzle: "flat", side: "rail" },
  horizon: { length: 46, thickness: 6, muzzle: "round", side: "scope" },
  forge: { length: 26, thickness: 14, muzzle: "point", side: "drum" },
  whisper: { length: 44, thickness: 5, muzzle: "can", side: "grip" },
};

export function weaponShape(id: string): WeaponShape {
  return SHAPES[id] ?? SHAPES.sidearm!;
}

export function weaponWidth(shape: WeaponShape): number {
  return STOCK + shape.length + muzzleReach(shape);
}

function muzzleReach(shape: WeaponShape): number {
  if (shape.muzzle === "point") {
    return Math.max(10, shape.thickness + 5);
  }
  if (shape.muzzle === "can") {
    return 9 + Math.ceil((shape.thickness + 2) / 2);
  }
  if (shape.muzzle === "round") {
    return Math.ceil(shape.thickness / 2 + 1);
  }
  return 4;
}

export function paintWeapon(
  graphics: Phaser.GameObjects.Graphics,
  shape: WeaponShape,
  color: number,
  originX: number,
  originY: number,
): void {
  graphics.clear();
  const top = originY - shape.thickness / 2;
  const bodyX = originX + STOCK;

  graphics.fillStyle(OUTLINE, 1);
  graphics.fillRect(originX - 1, originY - 4, STOCK + 2, 9);
  graphics.fillStyle(STOCK_COLOR, 1);
  graphics.fillRect(originX, originY - 3, STOCK, 7);

  graphics.fillStyle(OUTLINE, 1);
  graphics.fillRect(bodyX - 1, top - 1, shape.length + 2, shape.thickness + 2);
  graphics.fillStyle(color, 1);
  graphics.fillRect(bodyX, top, shape.length, shape.thickness);
  graphics.fillStyle(0xffffff, 0.28);
  graphics.fillRect(bodyX, top, shape.length, 1);

  paintMuzzle(graphics, shape, bodyX + shape.length, originY, top);
  paintSide(graphics, shape, bodyX, top, color);
}

function paintMuzzle(
  graphics: Phaser.GameObjects.Graphics,
  shape: WeaponShape,
  muzzleX: number,
  originY: number,
  top: number,
): void {
  if (shape.muzzle === "point") {
    const reach = Math.max(10, shape.thickness + 5);
    graphics.fillStyle(OUTLINE, 1);
    graphics.fillTriangle(muzzleX - 1, top - 1, muzzleX - 1, top + shape.thickness + 1, muzzleX + reach + 1, originY);
    graphics.fillStyle(METAL, 1);
    graphics.fillTriangle(muzzleX, top, muzzleX, top + shape.thickness, muzzleX + reach, originY);
    return;
  }

  if (shape.muzzle === "can") {
    graphics.fillStyle(OUTLINE, 1);
    graphics.fillRect(muzzleX - 1, top - 2, 11, shape.thickness + 4);
    graphics.fillStyle(0x90a4ae, 1);
    graphics.fillRect(muzzleX, top - 1, 9, shape.thickness + 2);
    graphics.fillStyle(METAL, 1);
    graphics.fillCircle(muzzleX + 9, originY, (shape.thickness + 2) / 2);
    return;
  }

  if (shape.muzzle === "round") {
    const radius = shape.thickness / 2 + 1;
    graphics.fillStyle(OUTLINE, 1);
    graphics.fillCircle(muzzleX, originY, radius + 1);
    graphics.fillStyle(METAL, 1);
    graphics.fillCircle(muzzleX, originY, radius);
    return;
  }

  const flare = shape.thickness >= 8 ? 3 : 1;
  graphics.fillStyle(OUTLINE, 1);
  graphics.fillRect(muzzleX - 1, top - flare - 1, 6, shape.thickness + flare * 2 + 2);
  graphics.fillStyle(METAL, 1);
  graphics.fillRect(muzzleX, top - flare, 4, shape.thickness + flare * 2);
}

function paintSide(
  graphics: Phaser.GameObjects.Graphics,
  shape: WeaponShape,
  bodyX: number,
  top: number,
  color: number,
): void {
  const bottom = top + shape.thickness;

  if (shape.side === "grip") {
    graphics.fillStyle(OUTLINE, 1);
    graphics.fillRect(bodyX - 2, bottom - 1, 7, 10);
    graphics.fillStyle(0x5d4037, 1);
    graphics.fillRect(bodyX - 1, bottom, 5, 8);
    return;
  }

  if (shape.side === "fins") {
    const mid = bodyX + shape.length * 0.45;
    graphics.fillStyle(OUTLINE, 1);
    graphics.fillTriangle(mid - 3, top, mid + 3, top, mid, top - 7);
    graphics.fillTriangle(mid - 3, bottom, mid + 3, bottom, mid, bottom + 7);
    graphics.fillStyle(METAL, 1);
    graphics.fillTriangle(mid - 2, top, mid + 2, top, mid, top - 6);
    graphics.fillTriangle(mid - 2, bottom, mid + 2, bottom, mid, bottom + 6);
    return;
  }

  if (shape.side === "tube") {
    graphics.fillStyle(OUTLINE, 1);
    graphics.fillRect(bodyX + shape.length * 0.32, bottom, shape.length * 0.58, 5);
    graphics.fillStyle(0x546e7a, 1);
    graphics.fillRect(bodyX + shape.length * 0.32 + 1, bottom + 1, shape.length * 0.58 - 2, 3);
    return;
  }

  if (shape.side === "scope") {
    const scopeX = bodyX + shape.length * 0.28;
    const scopeW = Math.max(12, shape.length * 0.4);
    graphics.fillStyle(OUTLINE, 1);
    graphics.fillRect(scopeX - 1, top - 7, scopeW + 2, 7);
    graphics.fillStyle(0x263238, 1);
    graphics.fillRect(scopeX, top - 6, scopeW, 5);
    graphics.fillStyle(color, 1);
    graphics.fillCircle(scopeX + scopeW - 2, top - 3.5, 2.2);
    return;
  }

  if (shape.side === "mag") {
    const magX = bodyX + shape.length * 0.38;
    graphics.fillStyle(OUTLINE, 1);
    graphics.fillRect(magX - 1, bottom - 1, 7, 11);
    graphics.fillStyle(0x37474f, 1);
    graphics.fillRect(magX, bottom, 5, 9);
    return;
  }

  if (shape.side === "rail") {
    const railX = bodyX + shape.length * 0.1;
    const railW = shape.length * 0.74;
    graphics.fillStyle(OUTLINE, 1);
    graphics.fillRect(railX - 1, top - 4, railW + 2, 4);
    graphics.fillStyle(0xb0bec5, 1);
    graphics.fillRect(railX, top - 3, railW, 2);
    return;
  }

  const drumX = bodyX + shape.length * 0.48;
  const drumY = bottom + 6;
  graphics.fillStyle(OUTLINE, 1);
  graphics.fillCircle(drumX, drumY, 7);
  graphics.fillStyle(0x3e2723, 1);
  graphics.fillCircle(drumX, drumY, 6);
  graphics.fillStyle(color, 1);
  graphics.fillCircle(drumX, drumY, 2);
}
