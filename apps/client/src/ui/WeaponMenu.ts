import Phaser from "phaser";
import { HELD_SHORT, HELD_SLOTS, getWeapon, type HeldSlot } from "@io-game/shared";
import { applySlotIcon, blankSlotTexture } from "./slotIcons";

const STYLE = {
  fontFamily: "Segoe UI, sans-serif",
  fontSize: "13px",
  color: "#f5f5f5",
} as const;

const SLOT_W = 92;
const SLOT_H = 66;
const GAP = 6;
const LABEL_SIZE = "11px";

export class WeaponMenu {
  private readonly slots: Phaser.GameObjects.Rectangle[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly numbers: Phaser.GameObjects.Text[] = [];
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private readonly armorChip: Phaser.GameObjects.Rectangle;
  private readonly armorText: Phaser.GameObjects.Text;
  private originX = 0;
  private originY = 0;
  private slotWidth = SLOT_W;
  private gunId: string;

  constructor(private readonly scene: Phaser.Scene, weaponId: string) {
    this.gunId = getWeapon(weaponId).id;
    for (let index = 0; index < HELD_SLOTS.length; index += 1) {
      const slot = HELD_SLOTS[index] ?? "gun";
      const rect = scene.add.rectangle(0, 0, SLOT_W, SLOT_H, 0x263238);
      rect.setStrokeStyle(2, 0xc8e6c9);
      rect.setOrigin(0, 0);
      const icon = scene.add.image(0, 0, blankSlotTexture(scene));
      icon.setOrigin(0.5, 0.5);
      const number = scene.add.text(0, 0, String(index + 1), { ...STYLE, fontSize: "11px", color: "#ffe082" });
      const label = scene.add.text(0, 0, this.slotLabel(slot), {
        ...STYLE,
        fontSize: LABEL_SIZE,
        align: "center",
      });
      label.setOrigin(0.5, 1);
      this.fitLabel(label);
      applySlotIcon(scene, icon, slot === "gun" ? this.gunId : slot);
      this.pin(rect);
      this.pin(icon);
      this.pin(number);
      this.pin(label);
      this.slots.push(rect);
      this.icons.push(icon);
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
    const armorW = 108;
    const gaps = (HELD_SLOTS.length - 1) * GAP;
    const available = Math.max(HELD_SLOTS.length * 58, width - 32 - armorW - GAP);
    this.slotWidth = Math.min(SLOT_W, (available - gaps) / HELD_SLOTS.length);
    const barWidth = HELD_SLOTS.length * this.slotWidth + gaps;
    const total = barWidth + GAP + armorW;
    this.originX = Math.max(16, (width - total) / 2);
    this.originY = Math.max(16, height - SLOT_H - 16);
    for (let index = 0; index < this.slots.length; index += 1) {
      const x = this.originX + index * (this.slotWidth + GAP);
      const rect = this.slots[index];
      const number = this.numbers[index];
      const label = this.labels[index];
      const icon = this.icons[index];
      if (!rect || !number || !label || !icon) {
        continue;
      }
      rect.setSize(this.slotWidth, SLOT_H);
      rect.setPosition(x, this.originY);
      number.setPosition(x + 5, this.originY + 3);
      icon.setPosition(x + this.slotWidth / 2, this.originY + 28);
      label.setPosition(x + this.slotWidth / 2, this.originY + SLOT_H - 4);
      this.fitLabel(label);
    }
    const armorX = this.originX + barWidth + GAP;
    this.armorChip.setPosition(armorX, this.originY);
    this.armorText.setPosition(armorX + 10, this.originY + 16);
  }

  setGun(weaponId: string): void {
    const weapon = getWeapon(weaponId);
    if (weapon.id === this.gunId) {
      return;
    }
    this.gunId = weapon.id;
    const label = this.labels[0];
    const icon = this.icons[0];
    if (label) {
      label.setText(weapon.name);
      this.fitLabel(label);
    }
    if (icon) {
      applySlotIcon(this.scene, icon, weapon.id);
    }
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

  private slotLabel(slot: HeldSlot): string {
    return slot === "gun" ? getWeapon(this.gunId).name : HELD_SHORT[slot];
  }

  private fitLabel(label: Phaser.GameObjects.Text): void {
    label.setScale(1);
    const max = this.slotWidth - 10;
    if (label.width > max) {
      label.setScale(max / label.width);
    }
  }

  private pin<T extends Phaser.GameObjects.GameObject>(object: T): T {
    const pinned = object as T & { setScrollFactor: (factor: number) => T; setDepth: (depth: number) => T };
    pinned.setScrollFactor(0);
    pinned.setDepth(1000);
    return object;
  }
}
