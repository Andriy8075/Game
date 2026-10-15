import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS } from "../constants";
import { getObstacle } from "../world/map";
import {
  armorCraftBlock,
  applyDamage,
  blastDamage,
  canAfford,
  formatCost,
  gatherRadius,
  HELD_SLOTS,
  getRecipe,
  nearestHarvestable,
  payCost,
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
    expect([...HELD_SLOTS]).toEqual(["gun", "frag", "flash", "incendiary", "bandage", "arm"]);
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
    expect(blastDamage(120, 120, 45)).toBe(Math.round(45 * 0.45));
    expect(blastDamage(121, 120, 45)).toBe(0);
  });
});
