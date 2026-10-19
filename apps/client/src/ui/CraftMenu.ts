import Phaser from "phaser";
import { MAX_HIRED_BOTS, RECIPES, armorCraftBlock, canAfford, formatCost, isStackedCraft, type ArmorProgress, type StackCounts } from "@io-game/shared";

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
  private hired = 0;
  private scroll = 0;
  private viewHeight = 40 + RECIPES.length * ROW_H;
  private restingY = 48;
  private originX = 16;
  private originY = 48;
  private readonly panelHeight = 40 + RECIPES.length * ROW_H;
  private readonly hint: Phaser.GameObjects.Text;

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
    this.hint = hint;

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

      const hiring = recipe.id === "hire-bot";
      const craft = this.makeButton(scene, 16, rowY + 40, 88, 24, hiring ? "Hire" : "Craft", {
        type: "craft",
        recipe: recipe.id,
      }, (inventory, armor) => {
        if (!canAfford(inventory, recipe.cost)) {
          return false;
        }
        if (hiring && this.hired >= MAX_HIRED_BOTS) {
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
    const available = Math.max(220, height - 16);
    this.viewHeight = Math.min(this.panelHeight, available);
    this.scroll = Math.min(this.scroll, this.maxScroll());
    this.originX = Math.max(16, width - PANEL_W - 16);
    this.restingY = Math.max(8, Math.min(48, height - this.viewHeight - 8));
    this.hint.setText(this.maxScroll() > 0 ? "wheel · C" : "C close");
    this.applyPosition();
  }

  handleWheel(x: number, y: number, deltaY: number): boolean {
    if (!this.open || deltaY === 0 || this.maxScroll() <= 0 || !this.pointerInside(x, y)) {
      return false;
    }
    const direction = deltaY > 0 ? 1 : -1;
    this.scroll = Math.max(0, Math.min(this.maxScroll(), this.scroll + direction * ROW_H));
    this.applyPosition();
    return true;
  }

  toggle(): void {
    this.open = !this.open;
    this.root.setVisible(this.open);
  }

  isOpen(): boolean {
    return this.open;
  }

  refresh(inventory: StackCounts, armor: ArmorProgress, weaponId = "", hired = 0): void {
    this.hired = hired;
    for (const recipe of RECIPES) {
      this.owned.get(recipe.id)?.setText(this.ownedLabel(recipe.id, recipe.weaponId, inventory, armor, weaponId));
    }
    for (const button of this.buttons) {
      const enabled = button.enabled(inventory, armor);
      button.rect.setFillStyle(enabled ? 0x2e7d32 : 0x37474f);
    }
  }

  contains(x: number, y: number): boolean {
    return this.open && this.pointerInside(x, y);
  }

  handlePointer(x: number, y: number): boolean {
    if (!this.contains(x, y)) {
      return false;
    }
    for (const button of this.buttons) {
      const left = this.originX + button.x;
      const top = this.originY + button.y;
      if (x >= left && x <= left + button.w && y >= top && y <= top + button.h && y >= this.restingY && y <= this.restingY + this.viewHeight) {
        this.onAction(button.action);
        break;
      }
    }
    return true;
  }

  private maxScroll(): number {
    return Math.max(0, this.panelHeight - this.viewHeight);
  }

  private applyPosition(): void {
    this.originY = this.restingY - this.scroll;
    this.root.setPosition(this.originX, this.originY);
    this.pinScroll();
  }

  private pointerInside(x: number, y: number): boolean {
    return x >= this.originX && x <= this.originX + PANEL_W && y >= this.restingY && y <= this.restingY + this.viewHeight;
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
    if (id === "hire-bot") {
      return `${this.hired}/${MAX_HIRED_BOTS}`;
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
