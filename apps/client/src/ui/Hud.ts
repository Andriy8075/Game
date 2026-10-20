import Phaser from "phaser";
import { HELD_LABELS, type HeldSlot, type StackCounts } from "@io-game/shared";

const STYLE = {
  fontFamily: "Segoe UI, sans-serif",
  fontSize: "14px",
  color: "#f5f5f5",
} as const;

export class Hud {
  private readonly status: Phaser.GameObjects.Text;
  private readonly alive: Phaser.GameObjects.Text;
  private readonly zone: Phaser.GameObjects.Text;
  private readonly vitals: Phaser.GameObjects.Text;
  private readonly resources: Phaser.GameObjects.Text;
  private readonly items: Phaser.GameObjects.Text;
  private readonly held: Phaser.GameObjects.Text;
  private readonly help: Phaser.GameObjects.Text;
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly notice: Phaser.GameObjects.Text;
  private readonly craftButton: Phaser.GameObjects.Rectangle;
  private readonly craftLabel: Phaser.GameObjects.Text;
  private readonly scoreboard: Phaser.GameObjects.Text;
  private readonly playObjects: Phaser.GameObjects.GameObject[];

  constructor(private readonly scene: Phaser.Scene) {
    this.status = this.pin(scene.add.text(16, 16, "Connecting...", { ...STYLE, fontSize: "16px", backgroundColor: "#00000088", padding: { x: 8, y: 6 } }));
    this.alive = this.pin(scene.add.text(16, 52, "Alive 0", { ...STYLE, color: "#ffe082", backgroundColor: "#00000088", padding: { x: 8, y: 6 } }));
    this.zone = this.pin(scene.add.text(0, 16, "", { ...STYLE, color: "#eceff1", backgroundColor: "#00000088", padding: { x: 8, y: 6 } }));
    this.zone.setOrigin(0.5, 0);
    this.vitals = this.pin(scene.add.text(16, 88, "", { ...STYLE, color: "#c8e6c9", backgroundColor: "#00000066", padding: { x: 8, y: 6 } }));
    this.resources = this.pin(scene.add.text(16, 124, "", { ...STYLE, color: "#fff8e1", backgroundColor: "#00000066", padding: { x: 8, y: 6 } }));
    this.items = this.pin(scene.add.text(16, 160, "", { ...STYLE, color: "#dce7d4", backgroundColor: "#00000066", padding: { x: 8, y: 6 } }));
    this.held = this.pin(scene.add.text(16, 196, "Holding Gun", { ...STYLE, color: "#ffe082", backgroundColor: "#00000088", padding: { x: 8, y: 6 } }));
    this.help = this.pin(scene.add.text(16, 232, "WASD move · walk over a weapon to equip it · 1-9 or wheel selects a slot · click uses · C craft", {
      ...STYLE,
      fontSize: "13px",
      color: "#dce7d4",
      backgroundColor: "#00000066",
      padding: { x: 8, y: 6 },
    }));
    this.prompt = this.pin(scene.add.text(16, 270, "", { ...STYLE, color: "#ffe082", backgroundColor: "#00000088", padding: { x: 8, y: 6 } }));
    this.prompt.setVisible(false);
    this.notice = this.pin(scene.add.text(16, 308, "", { ...STYLE, color: "#ffffff", backgroundColor: "#1b5e2088", padding: { x: 8, y: 6 } }));
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
    this.playObjects = [
      this.alive,
      this.zone,
      this.vitals,
      this.resources,
      this.items,
      this.held,
      this.help,
      this.prompt,
      this.notice,
      this.craftButton,
      this.craftLabel,
      this.scoreboard,
    ];
    this.layout(scene.scale.width);
    this.setPlayVisible(false);
  }

  layout(width: number): void {
    const x = Math.max(16, width - 124);
    this.craftButton.setPosition(x, 16);
    this.craftLabel.setPosition(x + 16, 20);
    this.scoreboard.setPosition(width - 16, 56);
    this.zone.setPosition(width / 2, 16);
  }

  setPlayVisible(visible: boolean): void {
    for (const object of this.playObjects) {
      const node = object as Phaser.GameObjects.GameObject & { setVisible: (value: boolean) => void };
      node.setVisible(visible);
    }
    if (!visible) {
      this.prompt.setVisible(false);
    }
  }

  setScoreboard(rows: Array<{ name: string; kills: number; alive: boolean }>): void {
    const lines = [...rows]
      .sort((a, b) => Number(b.alive) - Number(a.alive) || b.kills - a.kills || a.name.localeCompare(b.name))
      .map((row) => `${row.alive ? row.name : row.name}  ${row.kills}K${row.alive ? "" : "  out"}`);
    this.scoreboard.setText(lines.join("\n"));
    this.scoreboard.setColor(rows.some((row) => !row.alive) ? "#eceff1" : "#fff8e1");
  }

  setAlive(count: number): void {
    this.alive.setText(`Alive ${count}`);
  }

  setZone(shrinking: boolean, nextSec: number, radius = Number.POSITIVE_INFINITY): void {
    if (radius <= 0) {
      this.zone.setText("Smoke has closed");
      return;
    }
    if (shrinking) {
      this.zone.setText("Smoke is closing");
      return;
    }
    const minutes = Math.floor(Math.max(0, nextSec) / 60);
    const seconds = Math.max(0, nextSec) % 60;
    this.zone.setText(nextSec > 0
      ? `Smoke closes in ${minutes}:${seconds.toString().padStart(2, "0")}`
      : "Stay in the circle");
  }

  setStatus(text: string): void {
    this.status.setText(text);
  }

  setVitals(hp: number, maxHp: number, armor: number, maxArmor: number, damage: number, wardMs = 0, hasteMs = 0): void {
    const armorText = maxArmor > 0 ? `   ARM ${Math.ceil(armor)}/${maxArmor}` : "";
    const wardText = wardMs > 0 ? `   Ward ${Math.ceil(wardMs / 1000)}s` : "";
    const hasteText = hasteMs > 0 ? `   Haste ${Math.ceil(hasteMs / 1000)}s` : "";
    this.vitals.setText(`HP ${Math.ceil(hp)}/${maxHp}${armorText}   DMG ${damage}${wardText}${hasteText}`);
  }

  setHeld(slot: HeldSlot, detail = ""): void {
    const label = `Holding ${HELD_LABELS[slot]}`;
    this.held.setText(detail ? `${label} · ${detail}` : label);
  }

  setInventory(inventory: StackCounts): void {
    this.resources.setText(`Wood ${inventory.wood}   Stone ${inventory.stone}   Iron ${inventory.iron}   Gold ${inventory.gold}`);
    this.items.setText(`Frag ${inventory.frag}   Flash ${inventory.flash}   Fire ${inventory.incendiary}   Bandage ${inventory.bandage}   Bastion ${inventory.bastion}   Gale ${inventory.gale}   Ramspike ${inventory.ramspike}`);
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
    if (!this.craftButton.visible) {
      return false;
    }
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
