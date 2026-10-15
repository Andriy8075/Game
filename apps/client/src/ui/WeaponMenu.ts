import Phaser from "phaser";
import { HELD_SHORT, HELD_SLOTS, type HeldSlot } from "@io-game/shared";

const STYLE = {
  fontFamily: "Segoe UI, sans-serif",
  fontSize: "13px",
  color: "#f5f5f5",
} as const;

const SLOT_W = 76;
const SLOT_H = 48;
const GAP = 6;

export class WeaponMenu {
  private readonly slots: Phaser.GameObjects.Rectangle[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly numbers: Phaser.GameObjects.Text[] = [];
  private readonly armorChip: Phaser.GameObjects.Rectangle;
  private readonly armorText: Phaser.GameObjects.Text;
  private originX = 0;
  private originY = 0;

  constructor(private readonly scene: Phaser.Scene) {
    for (let index = 0; index < HELD_SLOTS.length; index += 1) {
      const slot = HELD_SLOTS[index] ?? "gun";
      const rect = scene.add.rectangle(0, 0, SLOT_W, SLOT_H, 0x263238);
      rect.setStrokeStyle(2, 0xc8e6c9);
      rect.setOrigin(0, 0);
      const number = scene.add.text(0, 0, String(index + 1), { ...STYLE, fontSize: "12px", color: "#ffe082" });
      const label = scene.add.text(0, 0, HELD_SHORT[slot], { ...STYLE, fontSize: "14px" });
      this.pin(rect);
      this.pin(number);
      this.pin(label);
      this.slots.push(rect);
      this.numbers.push(number);
      this.labels.push(label);
    }

    this.armorChip = scene.add.rectangle(0, 0, 108, SLOT_H, 0x37474f);
    this.armorChip.setStrokeStyle(2, 0x90a4ae);
    this.armorChip.setOrigin(0, 0);
    this.armorText = scene.add.text(0, 0, "Armor\nNone", { ...STYLE, fontSize: "13px", color: "#eceff1" });
    this.pin(this.armorChip);
    this.pin(this.armorText);
    this.layout(scene.scale.width, scene.scale.height);
    this.setSelected("gun");
  }

  layout(width: number, height: number): void {
    const barWidth = HELD_SLOTS.length * SLOT_W + (HELD_SLOTS.length - 1) * GAP;
    const total = barWidth + GAP + 108;
    this.originX = Math.max(16, (width - total) / 2);
    this.originY = Math.max(16, height - SLOT_H - 16);
    for (let index = 0; index < this.slots.length; index += 1) {
      const x = this.originX + index * (SLOT_W + GAP);
      const rect = this.slots[index];
      const number = this.numbers[index];
      const label = this.labels[index];
      if (!rect || !number || !label) {
        continue;
      }
      rect.setPosition(x, this.originY);
      number.setPosition(x + 6, this.originY + 4);
      label.setPosition(x + 8, this.originY + 22);
    }
    const armorX = this.originX + barWidth + GAP;
    this.armorChip.setPosition(armorX, this.originY);
    this.armorText.setPosition(armorX + 10, this.originY + 6);
  }

  setSelected(slot: HeldSlot): void {
    for (let index = 0; index < this.slots.length; index += 1) {
      const rect = this.slots[index];
      if (!rect) {
        continue;
      }
      const active = HELD_SLOTS[index] === slot;
      rect.setFillStyle(active ? 0x2e7d32 : 0x263238);
      rect.setStrokeStyle(2, active ? 0xffe082 : 0x90a4ae);
    }
  }

  setArmor(name: string, points: number, maxPoints: number): void {
    const amount = maxPoints > 0 ? `\n${Math.ceil(points)}/${maxPoints}` : "\nNone";
    this.armorText.setText(name === "None" ? "Armor\nNone" : `${name}${amount}`);
  }

  hitSlot(x: number, y: number): HeldSlot | undefined {
    const camera = this.scene.cameras.main;
    for (let index = 0; index < this.slots.length; index += 1) {
      const rect = this.slots[index];
      const slot = HELD_SLOTS[index];
      if (!rect || !slot) {
        continue;
      }
      const screenX = rect.x - camera.scrollX * rect.scrollFactorX;
      const screenY = rect.y - camera.scrollY * rect.scrollFactorY;
      if (x >= screenX && x <= screenX + rect.width && y >= screenY && y <= screenY + rect.height) {
        return slot;
      }
    }
    return undefined;
  }

  private pin<T extends Phaser.GameObjects.GameObject>(object: T): T {
    const pinned = object as T & { setScrollFactor: (factor: number) => T; setDepth: (depth: number) => T };
    pinned.setScrollFactor(0);
    pinned.setDepth(1000);
    return object;
  }
}
