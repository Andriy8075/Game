import { BANDAGE_HEAL, GATHER_REACH, HEAVY_ARMOR, LIGHT_ARMOR, PLAYER_RADIUS } from "../constants";
import { type WeaponId } from "../weapons/catalog";
import { GAME_MAP, isHarvestable, type CircleObstacle, type GameMap, type HarvestKind } from "../world/map";

export const RESOURCE_IDS = ["wood", "stone", "iron", "gold"] as const;
export const CRAFTED_IDS = ["frag", "flash", "incendiary", "bandage", "lightArmor", "heavyArmor"] as const;

export type ResourceId = (typeof RESOURCE_IDS)[number];
export type CraftedId = (typeof CRAFTED_IDS)[number];
export type StackId = ResourceId | CraftedId;

export type StackCounts = Record<StackId, number>;

export type HarvestSpec = {
  resource: ResourceId;
  label: string;
  yield: number;
  charges: number;
  respawnMs: number;
};

export const HARVEST: Record<HarvestKind, HarvestSpec> = {
  tree: { resource: "wood", label: "wood", yield: 1, charges: 5, respawnMs: 12000 },
  stone: { resource: "stone", label: "stone", yield: 1, charges: 4, respawnMs: 14000 },
  iron: { resource: "iron", label: "iron", yield: 1, charges: 3, respawnMs: 18000 },
  gold: { resource: "gold", label: "gold", yield: 1, charges: 2, respawnMs: 22000 },
};

export type Recipe = {
  id: string;
  name: string;
  blurb: string;
  cost: Partial<Record<ResourceId, number>>;
  weaponId?: WeaponId;
};

export const RECIPES: readonly Recipe[] = [
  { id: "frag", name: "Frag Grenade", blurb: "Blasts nearby players.", cost: { stone: 2, iron: 1 } },
  { id: "flash", name: "Flash Grenade", blurb: "Slows nearby players.", cost: { stone: 1, gold: 1 } },
  { id: "incendiary", name: "Fire Grenade", blurb: "Leaves a burning patch.", cost: { wood: 2, iron: 1 } },
  { id: "bandage", name: "Bandage", blurb: `Heals ${BANDAGE_HEAL} HP.`, cost: { wood: 2 } },
  { id: "lightArmor", name: "Light Armor", blurb: `Absorbs ${LIGHT_ARMOR} damage. Equips immediately, once per life.`, cost: { iron: 4, stone: 3 } },
  { id: "heavyArmor", name: "Heavy Armor", blurb: `Absorbs ${HEAVY_ARMOR} damage. Equips immediately and replaces light armor.`, cost: { iron: 5, gold: 3 } },
  { id: "forge-cannon", name: "Forge Cannon", blurb: "A heavy crafted gun for this life.", cost: { iron: 6, gold: 4 }, weaponId: "forge" },
  { id: "whisper-kit", name: "Whisper", blurb: "A fast crafted gun for this life.", cost: { iron: 4, gold: 3 }, weaponId: "whisper" },
];

export const GRENADE_KIND = {
  frag: 0,
  flash: 1,
  incendiary: 2,
} as const;

export const HELD_SLOTS = ["gun", "frag", "flash", "incendiary", "bandage", "arm"] as const;
export type HeldSlot = (typeof HELD_SLOTS)[number];

export const HELD_LABELS: Record<HeldSlot, string> = {
  gun: "Gun",
  frag: "Frag Grenade",
  flash: "Flash Grenade",
  incendiary: "Fire Grenade",
  bandage: "Bandage",
  arm: "Arm",
};

export const HELD_SHORT: Record<HeldSlot, string> = {
  gun: "Gun",
  frag: "Frag",
  flash: "Flash",
  incendiary: "Fire",
  bandage: "Bandage",
  arm: "Arm",
};

export type ArmorProgress = {
  craftedLight: boolean;
  craftedHeavy: boolean;
};

export function armorCraftBlock(id: "lightArmor" | "heavyArmor", progress: ArmorProgress): string | undefined {
  if (progress.craftedHeavy) {
    return "Heavy armor is already crafted";
  }
  if (id === "lightArmor" && progress.craftedLight) {
    return "Light armor is already crafted";
  }
  return undefined;
}

export function isHeldSlot(id: string): id is HeldSlot {
  return (HELD_SLOTS as readonly string[]).includes(id);
}

export function cycleHeld(current: HeldSlot, direction: 1 | -1): HeldSlot {
  const index = HELD_SLOTS.indexOf(current);
  const next = (index + direction + HELD_SLOTS.length) % HELD_SLOTS.length;
  return HELD_SLOTS[next] ?? "gun";
}

export function isGrenadeSlot(id: HeldSlot): id is "frag" | "flash" | "incendiary" {
  return id === "frag" || id === "flash" || id === "incendiary";
}

export function isStackedCraft(id: string): id is "frag" | "flash" | "incendiary" | "bandage" {
  return id === "frag" || id === "flash" || id === "incendiary" || id === "bandage";
}

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.id === id);
}

export function formatCost(cost: Partial<Record<ResourceId, number>>): string {
  return RESOURCE_IDS.filter((id) => (cost[id] ?? 0) > 0)
    .map((id) => `${cost[id]} ${id}`)
    .join(", ");
}

export function canAfford(stacks: StackCounts, cost: Partial<Record<ResourceId, number>>): boolean {
  return RESOURCE_IDS.every((id) => stacks[id] >= (cost[id] ?? 0));
}

export function payCost(stacks: StackCounts, cost: Partial<Record<ResourceId, number>>): void {
  for (const id of RESOURCE_IDS) {
    stacks[id] -= cost[id] ?? 0;
  }
}

export function gatherRadius(obstacle: CircleObstacle): number {
  return obstacle.radius + PLAYER_RADIUS + GATHER_REACH;
}

export function nearestHarvestable(
  x: number,
  y: number,
  remainingOf: (id: string) => number,
  world: GameMap = GAME_MAP,
): CircleObstacle | undefined {
  let best: CircleObstacle | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const obstacle of world.obstacles) {
    if (!isHarvestable(obstacle) || remainingOf(obstacle.id) <= 0) {
      continue;
    }
    const distance = Math.hypot(obstacle.x - x, obstacle.y - y);
    if (distance <= gatherRadius(obstacle) && distance < bestDistance) {
      best = obstacle;
      bestDistance = distance;
    }
  }

  return best;
}

export function applyDamage(target: { hp: number; armor: number }, amount: number): void {
  const absorbed = Math.min(Math.max(0, target.armor), Math.max(0, amount));
  target.armor -= absorbed;
  target.hp = Math.max(0, target.hp - (amount - absorbed));
}

export function blastDamage(distance: number, radius: number, damage: number): number {
  if (distance > radius || radius <= 0) {
    return 0;
  }
  const ratio = 1 - distance / radius;
  return Math.max(1, Math.round(damage * (0.45 + 0.55 * ratio)));
}
