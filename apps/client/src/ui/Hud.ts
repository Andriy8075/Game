import Phaser from "phaser";
import { HELD_LABELS, type HeldSlot, type StackCounts } from "@io-game/shared";

const STYLE = {
  fontFamily: "Segoe UI, sans-serif",
  fontSize: "14px",
  color: "#f5f5f5",
} as const;

export class Hud {
  private readonly status: Phaser.GameObjects.Text;
  private readonly vitals: Phaser.GameObjects.Text;
  private readonly resources: Phaser.GameObjects.Text;
  private readonly items: Phaser.GameObjects.Text;
  private readonly held: Phaser.GameObjects.Text;
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly notice: Phaser.GameObjects.Text;
  private readonly craftButton: Phaser.GameObjects.Rectangle;
  private readonly craftLabel: Phaser.GameObjects.Text;
  private readonly scoreboard: Phaser.GameObjects.Text;
  private resultRoot?: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene) {
    this.status = this.pin(scene.add.text(16, 16, "Connecting...", { ...STYLE, fontSize: "16px", backgroundColor: "#00000088", padding: { x: 8, y: 6 } }));
    this.vitals = this.pin(scene.add.text(16, 52, "", { ...STYLE, color: "#c8e6c9", backgroundColor: "#00000066", padding: { x: 8, y: 6 } }));
    this.resources = this.pin(scene.add.text(16, 88, "", { ...STYLE, color: "#fff8e1", backgroundColor: "#00000066", padding: { x: 8, y: 6 } }));
    this.items = this.pin(scene.add.text(16, 124, "", { ...STYLE, color: "#dce7d4", backgroundColor: "#00000066", padding: { x: 8, y: 6 } }));
    this.held = this.pin(scene.add.text(16, 160, "Holding Gun", { ...STYLE, color: "#ffe082", backgroundColor: "#00000088", padding: { x: 8, y: 6 } }));
    this.pin(scene.add.text(16, 196, "WASD move · walk over a weapon to equip it · 1-6 or wheel selects gun, grenades, bandage, arm · click uses · C craft", {
      ...STYLE,
      fontSize: "13px",
      color: "#dce7d4",
      backgroundColor: "#00000066",
      padding: { x: 8, y: 6 },
    }));
    this.prompt = this.pin(scene.add.text(16, 234, "", { ...STYLE, color: "#ffe082", backgroundColor: "#00000088", padding: { x: 8, y: 6 } }));
    this.prompt.setVisible(false);
    this.notice = this.pin(scene.add.text(16, 272, "", { ...STYLE, color: "#ffffff", backgroundColor: "#1b5e2088", padding: { x: 8, y: 6 } }));
    this.notice.setAlpha(0);

    this.craftButton = scene.add.rectangle(0, 0, 108, 28, 0x2e7d32);
    this.craftButton.setStrokeStyle(2, 0xc8e6c9);
    this.craftButton.setOrigin(0, 0);
    this.pin(this.craftButton);
    this.craftLabel = this.pin(scene.add.text(0, 0, "Craft  C", { ...STYLE, color: "#f1f8e9", fontSize: "14px" }));
    this.scoreboard = this.pin(scene.add.text(0, 56, "", {
      ...STYLE,
      fontSize: "13px",
      color: "#fff8e1",
      backgroundColor: "#00000088",
      padding: { x: 8, y: 6 },
      align: "right",
    }));
    this.scoreboard.setOrigin(1, 0);
    this.layout(scene.scale.width);
  }

  layout(width: number): void {
    const x = Math.max(16, width - 124);
    this.craftButton.setPosition(x, 16);
    this.craftLabel.setPosition(x + 16, 20);
    this.scoreboard.setPosition(width - 16, 56);
  }

  setScoreboard(rows: Array<{ name: string; kills: number; deaths: number }>): void {
    const lines = [...rows]
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name))
      .map((row) => `${row.name}  ${row.kills}K ${row.deaths}D`);
    this.scoreboard.setText(lines.join("\n"));
  }

  showResult(title: string, onBack: () => void): void {
    if (this.resultRoot) {
      return;
    }
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const dim = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0, 0);
    const card = this.scene.add.rectangle(width / 2, height / 2, 360, 180, 0x12180f, 0.98);
    card.setStrokeStyle(2, 0x3e5230);
    const label = this.scene.add.text(width / 2, height / 2 - 36, title, {
      ...STYLE,
      fontSize: "22px",
      color: "#f5f5f5",
    }).setOrigin(0.5);
    const button = this.scene.add.rectangle(width / 2, height / 2 + 36, 180, 40, 0x66bb6a);
    button.setInteractive({ useHandCursor: true });
    const buttonLabel = this.scene.add.text(width / 2, height / 2 + 36, "Back to menu", {
      ...STYLE,
      fontSize: "16px",
      color: "#102016",
    }).setOrigin(0.5);
    button.on("pointerdown", () => onBack());
    this.resultRoot = this.scene.add.container(0, 0, [dim, card, label, button, buttonLabel]);
    this.resultRoot.setDepth(2000);
    this.resultRoot.setScrollFactor(0);
    for (const child of this.resultRoot.list) {
      const pinned = child as { setScrollFactor?: (factor: number) => void };
      pinned.setScrollFactor?.(0);
    }
  }

  setStatus(text: string): void {
    this.status.setText(text);
  }

  setVitals(hp: number, maxHp: number, armor: number, maxArmor: number, damage: number): void {
    const armorText = maxArmor > 0 ? `   ARM ${Math.ceil(armor)}/${maxArmor}` : "";
    this.vitals.setText(`HP ${Math.ceil(hp)}/${maxHp}${armorText}   DMG ${damage}`);
  }

  setHeld(slot: HeldSlot, detail = ""): void {
    const label = `Holding ${HELD_LABELS[slot]}`;
    this.held.setText(detail ? `${label} · ${detail}` : label);
  }

  setInventory(inventory: StackCounts): void {
    this.resources.setText(`Wood ${inventory.wood}   Stone ${inventory.stone}   Iron ${inventory.iron}   Gold ${inventory.gold}`);
    this.items.setText(`Frag ${inventory.frag}   Flash ${inventory.flash}   Fire ${inventory.incendiary}   Bandage ${inventory.bandage}`);
  }

  setPrompt(text: string): void {
    this.prompt.setText(text);
    this.prompt.setVisible(text.length > 0);
  }

  showNotice(text: string): void {
    this.notice.setText(text);
    this.notice.setAlpha(1);
    this.scene.tweens.killTweensOf(this.notice);
    this.scene.tweens.add({
      targets: this.notice,
      alpha: 0,
      delay: 1400,
      duration: 350,
    });
  }

  hitsCraftButton(x: number, y: number): boolean {
    const camera = this.scene.cameras.main;
    const screenX = this.craftButton.x - camera.scrollX * this.craftButton.scrollFactorX;
    const screenY = this.craftButton.y - camera.scrollY * this.craftButton.scrollFactorY;
    return x >= screenX && x <= screenX + this.craftButton.width && y >= screenY && y <= screenY + this.craftButton.height;
  }

  private pin<T extends Phaser.GameObjects.GameObject>(object: T): T {
    const pinned = object as T & { setScrollFactor: (factor: number) => T; setDepth: (depth: number) => T };
    pinned.setScrollFactor(0);
    pinned.setDepth(1000);
    return object;
  }
}
