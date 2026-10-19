import Phaser from "phaser";
import { RECIPES, armorCraftBlock, canAfford, formatCost, isStackedCraft, type ArmorProgress, type StackCounts } from "@io-game/shared";

export type CraftAction =
  | { type: "craft"; recipe: string }
  | { type: "use"; item: "bandage" }
  | { type: "hold"; item: "frag" | "flash" | "incendiary" };

type ButtonArt = {
  x: number;
  y: number;
  w: number;
  h: number;
  rect: Phaser.GameObjects.Rectangle;
  action: CraftAction;
  enabled: (inventory: StackCounts, armor: ArmorProgress) => boolean;
};

const PANEL_W = 340;
const ROW_H = 68;
const EXTRA: Partial<Record<string, { label: string; action: CraftAction }>> = {
  frag: { label: "Hold", action: { type: "hold", item: "frag" } },
  flash: { label: "Hold", action: { type: "hold", item: "flash" } },
  incendiary: { label: "Hold", action: { type: "hold", item: "incendiary" } },
  bandage: { label: "Use", action: { type: "use", item: "bandage" } },
};

export class CraftMenu {
  private readonly root: Phaser.GameObjects.Container;
  private readonly buttons: ButtonArt[] = [];
  private readonly owned = new Map<string, Phaser.GameObjects.Text>();
  private open = false;
  private originX = 16;
  private originY = 48;
  private readonly panelHeight = 40 + RECIPES.length * ROW_H;

  constructor(
    scene: Phaser.Scene,
    private readonly onAction: (action: CraftAction) => void,
  ) {
    const background = scene.add.rectangle(0, 0, PANEL_W, this.panelHeight, 0x12180f, 0.96);
    background.setOrigin(0, 0);
    background.setStrokeStyle(2, 0x3e5230);

    const title = scene.add.text(16, 12, "Craft", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#f5f5f5",
    });
    const hint = scene.add.text(PANEL_W - 16, 16, "C close", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "12px",
      color: "#a5d6a7",
    }).setOrigin(1, 0);

    const children: Phaser.GameObjects.GameObject[] = [background, title, hint];

    RECIPES.forEach((recipe, index) => {
      const rowY = 36 + index * ROW_H;
      const name = scene.add.text(16, rowY, recipe.name, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "15px",
        color: "#f7f3ea",
      });
      const detail = scene.add.text(16, rowY + 18, `${formatCost(recipe.cost)} · ${recipe.blurb}`, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "12px",
        color: "#dce7d4",
        wordWrap: { width: PANEL_W - 32 },
      });
      const owned = scene.add.text(PANEL_W - 16, rowY, "0", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#ffe082",
      }).setOrigin(1, 0);
      this.owned.set(recipe.id, owned);

      const craft = this.makeButton(scene, 16, rowY + 40, 88, 24, "Craft", {
        type: "craft",
        recipe: recipe.id,
      }, (inventory, armor) => {
        if (!canAfford(inventory, recipe.cost)) {
          return false;
        }
        if (recipe.id === "lightArmor" || recipe.id === "heavyArmor") {
          return armorCraftBlock(recipe.id, armor) === undefined;
        }
        return true;
      });
      children.push(name, detail, owned, craft.rect, craft.label);
      this.buttons.push(craft);
      const extra = EXTRA[recipe.id];
      if (extra) {
        const use = this.makeButton(scene, 112, rowY + 40, 88, 24, extra.label, extra.action, (inventory) => {
          return isStackedCraft(recipe.id) && inventory[recipe.id] > 0;
        });
        children.push(use.rect, use.label);
        this.buttons.push(use);
      }
    });

    this.root = scene.add.container(this.originX, this.originY, children);
    this.root.setDepth(1200);
    this.root.setVisible(false);
    this.pinScroll();
    this.layout(scene.scale.width, scene.scale.height);
  }

  layout(width: number, height = this.root.scene.scale.height): void {
    this.originX = Math.max(16, width - PANEL_W - 16);
    this.originY = Math.max(8, Math.min(48, height - this.panelHeight - 8));
    this.root.setPosition(this.originX, this.originY);
    this.pinScroll();
  }

  toggle(): void {
    this.open = !this.open;
    this.root.setVisible(this.open);
  }

  isOpen(): boolean {
    return this.open;
  }

  refresh(inventory: StackCounts, armor: ArmorProgress, weaponId = ""): void {
    for (const recipe of RECIPES) {
      this.owned.get(recipe.id)?.setText(this.ownedLabel(recipe.id, recipe.weaponId, inventory, armor, weaponId));
    }
    for (const button of this.buttons) {
      const enabled = button.enabled(inventory, armor);
      button.rect.setFillStyle(enabled ? 0x2e7d32 : 0x37474f);
    }
  }

  handlePointer(x: number, y: number): boolean {
    if (!this.open) {
      return false;
    }
    const inside = x >= this.originX && x <= this.originX + PANEL_W && y >= this.originY && y <= this.originY + this.panelHeight;
    if (!inside) {
      return false;
    }
    for (const button of this.buttons) {
      const left = this.originX + button.x;
      const top = this.originY + button.y;
      if (x >= left && x <= left + button.w && y >= top && y <= top + button.h) {
        this.onAction(button.action);
        break;
      }
    }
    return true;
  }

  private ownedLabel(
    id: string,
    weaponId: string | undefined,
    inventory: StackCounts,
    armor: ArmorProgress,
    equipped: string,
  ): string {
    if (weaponId) {
      return equipped === weaponId ? "equipped" : "";
    }
    if (id === "lightArmor") {
      return armor.craftedLight ? "worn" : "";
    }
    if (id === "heavyArmor") {
      return armor.craftedHeavy ? "worn" : "";
    }
    if (isStackedCraft(id)) {
      return String(inventory[id]);
    }
    return "";
  }

  private makeButton(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    action: CraftAction,
    enabled: (inventory: StackCounts, armor: ArmorProgress) => boolean,
  ): ButtonArt & { label: Phaser.GameObjects.Text } {
    const rect = scene.add.rectangle(x, y, w, h, 0x37474f);
    rect.setOrigin(0, 0);
    rect.setStrokeStyle(1, 0xc8e6c9);
    const text = scene.add.text(x + w / 2, y + h / 2, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "13px",
      color: "#f1f8e9",
    }).setOrigin(0.5);
    return { x, y, w, h, rect, label: text, action, enabled };
  }

  private pinScroll(): void {
    this.root.setScrollFactor(0);
    for (const child of this.root.list) {
      const pinned = child as { setScrollFactor?: (factor: number) => void };
      pinned.setScrollFactor?.(0);
    }
  }
}
