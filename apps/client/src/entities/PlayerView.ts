import Phaser from "phaser";
import { PLAYER_RADIUS, getWeapon, type HeldSlot } from "@io-game/shared";
import { paintWeapon, weaponShape } from "./weaponShape";

export class PlayerView {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly weaponGfx: Phaser.GameObjects.Graphics;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private readonly armorFill: Phaser.GameObjects.Rectangle;
  private readonly armorBg: Phaser.GameObjects.Rectangle;
  private readonly slowRing: Phaser.GameObjects.Arc;
  private readonly carried: Phaser.GameObjects.Arc;
  private readonly carriedBox: Phaser.GameObjects.Rectangle;
  private readonly leftHand: Phaser.GameObjects.Arc;
  private readonly rightHand: Phaser.GameObjects.Arc;
  private handPose: HeldSlot = "gun";
  private swingToken = 0;
  private swingLeftNext = true;
  private readonly hpWidth = 40;
  private equippedId = "";

  constructor(scene: Phaser.Scene, color: number, x: number, y: number, name: string, weaponId: string) {
    const torso = scene.add.circle(0, 0, PLAYER_RADIUS, color);
    torso.setStrokeStyle(3, 0x102027, 0.9);

    const visor = scene.add.circle(0, 0, 6, 0x102027);
    this.leftHand = scene.add.circle(11, 12, 5, 0xffcc80);
    this.rightHand = scene.add.circle(18, 5, 5, 0xffcc80);
    this.weaponGfx = scene.add.graphics();
    this.carried = scene.add.circle(30, 2, 7, 0x546e7a);
    this.carried.setStrokeStyle(2, 0x102027);
    this.carried.setVisible(false);
    this.carriedBox = scene.add.rectangle(30, 2, 14, 10, 0xf5f5f5);
    this.carriedBox.setStrokeStyle(2, 0x102027);
    this.carriedBox.setVisible(false);

    this.body = scene.add.container(0, 0, [
      torso,
      visor,
      this.weaponGfx,
      this.leftHand,
      this.carried,
      this.carriedBox,
      this.rightHand,
    ]);

    const hpBg = scene.add.rectangle(0, -PLAYER_RADIUS - 14, this.hpWidth, 6, 0x111111);
    this.hpFill = scene.add.rectangle(-this.hpWidth / 2, -PLAYER_RADIUS - 14, this.hpWidth, 6, 0x66bb6a);
    this.hpFill.setOrigin(0, 0.5);

    this.nameLabel = scene.add
      .text(0, -PLAYER_RADIUS - 22, name, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#f7f3ea",
        stroke: "#102027",
        strokeThickness: 4,
        align: "center",
      })
      .setOrigin(0.5, 1);

    const armorBg = scene.add.rectangle(0, -PLAYER_RADIUS - 8, this.hpWidth, 4, 0x111111);
    this.armorFill = scene.add.rectangle(-this.hpWidth / 2, -PLAYER_RADIUS - 8, 0, 4, 0x4fc3f7);
    this.armorFill.setOrigin(0, 0.5);
    armorBg.setVisible(false);
    this.armorFill.setVisible(false);

    this.slowRing = scene.add.circle(0, 0, PLAYER_RADIUS + 6);
    this.slowRing.setStrokeStyle(2, 0x81d4fa, 0.9);
    this.slowRing.isFilled = false;
    this.slowRing.setVisible(false);

    this.root = scene.add.container(x, y, [this.slowRing, this.body, hpBg, this.hpFill, armorBg, this.armorFill, this.nameLabel]);
    this.armorBg = armorBg;
    this.root.setDepth(10);
    this.setWeapon(weaponId);
  }

  setName(name: string): void {
    if (this.nameLabel.text !== name) {
      this.nameLabel.setText(name);
    }
  }

  setPose(x: number, y: number, angle: number): void {
    this.root.setPosition(x, y);
    this.body.setRotation(angle);
  }

  setWeapon(weaponId: string): void {
    if (this.equippedId === weaponId) {
      return;
    }
    this.equippedId = weaponId;
    const weapon = getWeapon(weaponId);
    paintWeapon(this.weaponGfx, weaponShape(weapon.id), weapon.color, 14, 2);
  }

  setHealth(hp: number, maxHp: number): void {
    const ratio = Math.max(0, Math.min(1, maxHp <= 0 ? 0 : hp / maxHp));
    this.hpFill.width = this.hpWidth * ratio;
    this.hpFill.fillColor = ratio > 0.5 ? 0x66bb6a : ratio > 0.25 ? 0xffa726 : 0xef5350;
  }

  setArmor(armor: number, maxArmor: number): void {
    const visible = maxArmor > 0;
    this.armorBg.setVisible(visible);
    this.armorFill.setVisible(visible);
    const ratio = Math.max(0, Math.min(1, maxArmor <= 0 ? 0 : armor / maxArmor));
    this.armorFill.width = this.hpWidth * ratio;
  }

  setSlowed(slowed: boolean): void {
    this.slowRing.setVisible(slowed);
  }

  setHeld(slot: HeldSlot): void {
    const gunOut = slot === "gun";
    this.weaponGfx.setVisible(gunOut);
    this.carried.setVisible(slot === "frag" || slot === "flash" || slot === "incendiary");
    this.carriedBox.setVisible(slot === "bandage");
    const changed = slot !== this.handPose;
    this.handPose = slot;
    this.leftHand.setRadius(slot === "arm" ? 6 : 5);
    this.rightHand.setRadius(slot === "arm" ? 6 : 5);
    if (changed) {
      this.swingToken += 1;
      this.root.scene.tweens.killTweensOf([this.leftHand, this.rightHand]);
      this.placeHands(slot);
    }
    if (slot === "frag") {
      this.carried.setFillStyle(0x546e7a);
    } else if (slot === "flash") {
      this.carried.setFillStyle(0xfff59d);
    } else if (slot === "incendiary") {
      this.carried.setFillStyle(0xff7043);
    } else if (slot === "bandage") {
      this.carriedBox.setFillStyle(0xfafafa);
    }
  }

  swingMine(): void {
    if (this.handPose !== "arm") {
      return;
    }
    const swingLeft = this.swingLeftNext;
    this.swingLeftNext = !this.swingLeftNext;
    const hand = swingLeft ? this.leftHand : this.rightHand;
    const rest = swingLeft ? { x: 6, y: 15 } : { x: 6, y: -13 };
    const token = this.swingToken + 1;
    this.swingToken = token;
    const scene = this.root.scene;
    scene.tweens.killTweensOf(hand);
    scene.tweens.chain({
      targets: hand,
      tweens: swingLeft
        ? [
            { x: 2, y: 18, duration: 70 },
            { x: 18, y: 7, duration: 80 },
            { x: rest.x, y: rest.y, duration: 120 },
          ]
        : [
            { x: 2, y: -16, duration: 70 },
            { x: 18, y: -5, duration: 80 },
            { x: rest.x, y: rest.y, duration: 120 },
          ],
      onComplete: () => {
        if (this.swingToken !== token || this.handPose !== "arm") {
          return;
        }
        hand.setPosition(rest.x, rest.y);
      },
    });
  }

  private placeHands(slot: HeldSlot): void {
    const emptyHands = slot === "arm";
    this.leftHand.setPosition(emptyHands ? 6 : 11, emptyHands ? 15 : 12);
    this.rightHand.setPosition(emptyHands ? 6 : 18, emptyHands ? -13 : 5);
  }

  flashHit(): void {
    this.root.scene.tweens.add({
      targets: this.root,
      alpha: 0.4,
      duration: 80,
      yoyo: true,
    });
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
