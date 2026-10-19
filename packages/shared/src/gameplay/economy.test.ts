import { describe, expect, it } from "vitest";
import { GATHER_REACH, PLAYER_RADIUS } from "../constants";
import { getObstacle } from "../world/map";
import {
  armorCraftBlock,
  applyDamage,
  blastDamage,
  canAfford,
  chooseWallPayment,
  cycleHeld,
  formatCost,
  gatherRadius,
  HARVEST,
  HELD_LABELS,
  HELD_SHORT,
  HELD_SLOTS,
  isGrenadeSlot,
  isHeldSlot,
  getRecipe,
  nearestHarvestable,
  payCost,
  RECIPES,
  type HeldSlot,
  type StackCounts,
} from "./economy";

function stacks(partial: Partial<StackCounts> = {}): StackCounts {
  return {
    wood: 0,
    stone: 0,
    iron: 0,
    gold: 0,
    frag: 0,
    flash: 0,
    incendiary: 0,
    bandage: 0,
    lightArmor: 0,
    heavyArmor: 0,
    ...partial,
  };
}

describe("economy", () => {
  it("finds a tree the player can reach", () => {
    const tree = getObstacle("tree-1");
    if (!tree || tree.kind !== "tree") {
      throw new Error("missing tree");
    }

    const found = nearestHarvestable(tree.x, tree.y + tree.radius + PLAYER_RADIUS + 8, () => 1);
    expect(found?.id).toBe("tree-1");
    expect(gatherRadius(tree)).toBeGreaterThan(tree.radius + PLAYER_RADIUS);
  });

  it("ignores depleted nodes and far nodes", () => {
    const tree = getObstacle("tree-1");
    if (!tree || tree.kind !== "tree") {
      throw new Error("missing tree");
    }

    expect(nearestHarvestable(tree.x, tree.y + 60, () => 0)).toBeUndefined();
    expect(nearestHarvestable(1600, 2200, () => 5)).toBeUndefined();
  });

  it("crafts only when the cost is covered", () => {
    const recipe = getRecipe("bandage");
    if (!recipe) {
      throw new Error("missing recipe");
    }

    const poor = stacks({ wood: 1 });
    expect(canAfford(poor, recipe.cost)).toBe(false);

    const rich = stacks({ wood: 2, bandage: 0 });
    expect(canAfford(rich, recipe.cost)).toBe(true);
    payCost(rich, recipe.cost);
    rich.bandage += 1;
    expect(rich.wood).toBe(0);
    expect(rich.bandage).toBe(1);
    expect(formatCost(recipe.cost)).toBe("2 wood");
  });

  it("keeps armor off the held wheel and allows each armor type once", () => {
    expect([...HELD_SLOTS]).toEqual(["gun", "frag", "flash", "incendiary", "bandage", "wall", "arm"]);
    const fresh = { craftedLight: false, craftedHeavy: false };
    expect(armorCraftBlock("lightArmor", fresh)).toBeUndefined();
    expect(armorCraftBlock("heavyArmor", fresh)).toBeUndefined();
    expect(armorCraftBlock("lightArmor", { craftedLight: true, craftedHeavy: false })).toBe("Light armor is already crafted");
    expect(armorCraftBlock("heavyArmor", { craftedLight: true, craftedHeavy: false })).toBeUndefined();
    expect(armorCraftBlock("lightArmor", { craftedLight: false, craftedHeavy: true })).toBe("Heavy armor is already crafted");
    expect(armorCraftBlock("heavyArmor", { craftedLight: true, craftedHeavy: true })).toBe("Heavy armor is already crafted");
  });

  it("lets armor absorb damage before health", () => {
    const target = { hp: 100, armor: 40 };
    applyDamage(target, 20);
    expect(target).toEqual({ hp: 100, armor: 20 });

    applyDamage(target, 25);
    expect(target).toEqual({ hp: 95, armor: 0 });
  });

  it("reduces blast damage toward the edge of the radius", () => {
    expect(blastDamage(0, 120, 45)).toBe(45);
    const mid = blastDamage(60, 120, 45);
    expect(mid).toBe(Math.round(45 * (0.45 + 0.55 * 0.5)));
    expect(mid).toBeLessThan(45);
    expect(blastDamage(120, 120, 45)).toBe(Math.round(45 * 0.45));
    expect(blastDamage(121, 120, 45)).toBe(0);
    expect(blastDamage(10, 0, 45)).toBe(0);
  });

  it("drops health only after armor is gone", () => {
    const bare = { hp: 30, armor: 0 };
    applyDamage(bare, 50);
    expect(bare).toEqual({ hp: 0, armor: 0 });

    const untouched = { hp: 30, armor: 10 };
    applyDamage(untouched, 0);
    expect(untouched).toEqual({ hp: 30, armor: 10 });
  });
});

describe("held slots", () => {
  it("scrolls gun, grenades, bandage, and arm, and wraps both ways", () => {
    const forward: HeldSlot[] = [];
    let slot: HeldSlot = "gun";
    for (let step = 0; step < HELD_SLOTS.length; step += 1) {
      slot = cycleHeld(slot, 1);
      forward.push(slot);
    }
    expect(forward).toEqual(["frag", "flash", "incendiary", "bandage", "wall", "arm", "gun"]);

    const backward: HeldSlot[] = [];
    slot = "gun";
    for (let step = 0; step < HELD_SLOTS.length; step += 1) {
      slot = cycleHeld(slot, -1);
      backward.push(slot);
    }
    expect(backward).toEqual(["arm", "wall", "bandage", "incendiary", "flash", "frag", "gun"]);
  });

  it("accepts the weapon menu and rejects armor as something to hold", () => {
    for (const slot of HELD_SLOTS) {
      expect(isHeldSlot(slot)).toBe(true);
      expect(HELD_LABELS[slot].length).toBeGreaterThan(0);
      expect(HELD_SHORT[slot].length).toBeGreaterThan(0);
    }
    expect(isHeldSlot("lightArmor")).toBe(false);
    expect(isHeldSlot("heavyArmor")).toBe(false);
    expect(isHeldSlot("")).toBe(false);
    expect(isGrenadeSlot("frag")).toBe(true);
    expect(isGrenadeSlot("flash")).toBe(true);
    expect(isGrenadeSlot("incendiary")).toBe(true);
    expect(isGrenadeSlot("gun")).toBe(false);
    expect(isGrenadeSlot("bandage")).toBe(false);
    expect(isGrenadeSlot("arm")).toBe(false);
    expect(isGrenadeSlot("wall")).toBe(false);
  });
});

describe("recipes and harvest nodes", () => {
  it("prices every craft and spends only the listed resources", () => {
    expect(getRecipe("missing")).toBeUndefined();
    expect(formatCost(getRecipe("frag")?.cost ?? {})).toBe("2 stone, 1 iron");
    expect(formatCost(getRecipe("flash")?.cost ?? {})).toBe("1 stone, 1 gold");
    expect(formatCost(getRecipe("incendiary")?.cost ?? {})).toBe("2 wood, 1 iron");
    expect(formatCost(getRecipe("bandage")?.cost ?? {})).toBe("2 wood");
    expect(formatCost(getRecipe("lightArmor")?.cost ?? {})).toBe("3 stone, 4 iron");
    expect(formatCost(getRecipe("heavyArmor")?.cost ?? {})).toBe("5 iron, 3 gold");
    expect(getRecipe("forge-cannon")?.weaponId).toBe("forge");
    expect(getRecipe("whisper-kit")?.weaponId).toBe("whisper");
    expect(formatCost(getRecipe("forge-cannon")?.cost ?? {})).toBe("6 iron, 4 gold");
    expect(formatCost(getRecipe("whisper-kit")?.cost ?? {})).toBe("4 iron, 3 gold");

    const short = stacks({ wood: 0, stone: 3, iron: 3, gold: 0 });
    expect(canAfford(short, getRecipe("lightArmor")?.cost ?? {})).toBe(false);

    const inventory = stacks({ wood: 8, stone: 10, iron: 30, gold: 20, frag: 2 });
    for (const recipe of RECIPES) {
      expect(canAfford(inventory, recipe.cost)).toBe(true);
      payCost(inventory, recipe.cost);
    }
    expect(inventory).toMatchObject({
      wood: 8 - 2 - 2,
      stone: 10 - 2 - 1 - 3,
      iron: 30 - 1 - 1 - 4 - 5 - 6 - 4,
      gold: 20 - 1 - 3 - 4 - 3,
      frag: 2,
    });
  });

  it("pays for a wall with wood, then stone, then iron", () => {
    expect(chooseWallPayment(stacks({ wood: 3, stone: 2, iron: 2 }))?.material).toBe("wood");
    expect(chooseWallPayment(stacks({ wood: 2, stone: 2, iron: 2 }))?.material).toBe("stone");
    expect(chooseWallPayment(stacks({ iron: 2 }))?.material).toBe("iron");
    expect(chooseWallPayment(stacks({ wood: 2, stone: 1, iron: 1 }))).toBeUndefined();
    expect(chooseWallPayment(stacks({ wood: 3, stone: 2 }), "stone")?.material).toBe("stone");
    expect(chooseWallPayment(stacks({ wood: 3 }), "stone")).toBeUndefined();
    expect(chooseWallPayment(stacks({ wood: 9 }), "gold")).toBeUndefined();
  });

  it("describes every resource node", () => {
    expect(HARVEST.tree).toMatchObject({ resource: "wood", yield: 1, charges: 5 });
    expect(HARVEST.stone).toMatchObject({ resource: "stone", yield: 1, charges: 4 });
    expect(HARVEST.iron).toMatchObject({ resource: "iron", yield: 1, charges: 3 });
    expect(HARVEST.gold).toMatchObject({ resource: "gold", yield: 1, charges: 2 });
  });

  it("picks the closest node the player can reach", () => {
    const tree = getObstacle("tree-1");
    const stone = getObstacle("stone-1");
    if (!tree || tree.kind !== "tree" || !stone || stone.kind !== "stone") {
      throw new Error("missing nodes");
    }

    expect(nearestHarvestable(tree.x, tree.y, () => 1)?.id).toBe("tree-1");
    expect(nearestHarvestable(stone.x, stone.y, () => 1)?.id).toBe("stone-1");
    expect(gatherRadius(stone)).toBe(stone.radius + PLAYER_RADIUS + GATHER_REACH);
  });
});
