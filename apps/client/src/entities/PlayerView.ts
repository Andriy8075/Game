import Phaser from "phaser";
import { PLAYER_RADIUS, getWeapon } from "@io-game/shared";
import { paintWeapon, weaponShape } from "./weaponShape";

export class PlayerView {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly weaponGfx: Phaser.GameObjects.Graphics;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly hpWidth = 40;
  private equippedId = "";

  constructor(scene: Phaser.Scene, color: number, x: number, y: number, weaponId: string) {
    const torso = scene.add.circle(0, 0, PLAYER_RADIUS, color);
    torso.setStrokeStyle(3, 0x102027, 0.9);

    const visor = scene.add.circle(7, -5, 6, 0x102027);
    const rearHand = scene.add.circle(20, 11, 4, 0xffcc80);
    const foreHand = scene.add.circle(32, 5, 4, 0xffcc80);
    this.weaponGfx = scene.add.graphics();

    this.body = scene.add.container(0, 0, [torso, visor, this.weaponGfx, rearHand, foreHand]);

    const hpBg = scene.add.rectangle(0, -PLAYER_RADIUS - 14, this.hpWidth, 6, 0x111111);
    this.hpFill = scene.add.rectangle(-this.hpWidth / 2, -PLAYER_RADIUS - 14, this.hpWidth, 6, 0x66bb6a);
    this.hpFill.setOrigin(0, 0.5);

    this.root = scene.add.container(x, y, [this.body, hpBg, this.hpFill]);
    this.root.setDepth(10);
    this.setWeapon(weaponId);
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
