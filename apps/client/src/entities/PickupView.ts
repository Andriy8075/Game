import Phaser from "phaser";
import { getWeapon } from "@io-game/shared";
import { paintWeapon, weaponShape, weaponWidth } from "./weaponShape";

export class PickupView {
  readonly root: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, weaponId: string, x: number, y: number) {
    const weapon = getWeapon(weaponId);
    const shape = weaponShape(weapon.id);
    const width = weaponWidth(shape);

    const glow = scene.add.ellipse(0, 2, width + 22, 46, weapon.color, 0.22);
    const shadow = scene.add.ellipse(0, 12, width * 0.72, 8, 0x10200c, 0.28);
    const graphic = scene.add.graphics();
    paintWeapon(graphic, shape, weapon.color, -width / 2, 2);

    const label = scene.add
      .text(0, -28, weapon.name, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "13px",
        color: "#f7f7f2",
        backgroundColor: "#00000088",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(x, y, [shadow, glow, graphic, label]);
    this.root.setDepth(6);

    scene.tweens.add({
      targets: glow,
      scale: 1.12,
      alpha: 0.1,
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
