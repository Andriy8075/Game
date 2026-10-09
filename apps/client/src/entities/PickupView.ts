import Phaser from "phaser";
import { PICKUP_RADIUS, getWeapon } from "@io-game/shared";

export class PickupView {
  readonly root: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, weaponId: string, x: number, y: number) {
    const weapon = getWeapon(weaponId);
    const glow = scene.add.circle(0, 0, PICKUP_RADIUS + 8, weapon.color, 0.28);
    const core = scene.add.circle(0, 0, PICKUP_RADIUS * 0.55, weapon.color);
    core.setStrokeStyle(2, 0x102027, 0.9);
    const label = scene.add
      .text(0, -(PICKUP_RADIUS + 10), weapon.name, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "13px",
        color: "#f7f7f2",
        backgroundColor: "#00000088",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(x, y, [glow, core, label]);
    this.root.setDepth(6);

    scene.tweens.add({
      targets: glow,
      scale: 1.35,
      alpha: 0.08,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
    scene.tweens.add({
      targets: this.root,
      y: y - 8,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
