import Phaser from "phaser";
import { PLAYER_RADIUS } from "@io-game/shared";

export class PlayerView {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private readonly hpWidth = 40;

  constructor(scene: Phaser.Scene, color: number, x: number, y: number, name: string) {
    const torso = scene.add.circle(0, 0, PLAYER_RADIUS, color);
    torso.setStrokeStyle(3, 0x102027, 0.9);

    const visor = scene.add.circle(7, -5, 6, 0x102027);
    const leftHand = scene.add.circle(11, 12, 5, 0xffcc80);
    const rightHand = scene.add.circle(18, 5, 5, 0xffcc80);
    const stock = scene.add.rectangle(20, 2, 10, 7, 0x4e342e);
    const gun = scene.add.rectangle(30, 2, 20, 6, 0x263238);
    const barrel = scene.add.rectangle(42, 2, 10, 3, 0x90a4ae);

    this.body = scene.add.container(0, 0, [torso, visor, leftHand, stock, gun, barrel, rightHand]);

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

    this.root = scene.add.container(x, y, [this.body, hpBg, this.hpFill, this.nameLabel]);
    this.root.setDepth(10);
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
