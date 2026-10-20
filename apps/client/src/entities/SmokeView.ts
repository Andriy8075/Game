import Phaser from "phaser";
import { ZONE_CENTER_X, ZONE_CENTER_Y, ZONE_START_RADIUS } from "@io-game/shared";

const PUFF_COUNT = 22;

type Puff = {
  sprite: Phaser.GameObjects.Arc;
  angle: number;
  drift: number;
  size: number;
};

export class SmokeView {
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly rim: Phaser.GameObjects.Graphics;
  private readonly puffs: Puff[] = [];
  private lastRadius = -1;

  constructor(scene: Phaser.Scene) {
    this.fill = scene.add.graphics();
    this.fill.setDepth(3);
    this.rim = scene.add.graphics();
    this.rim.setDepth(4);
    for (let index = 0; index < PUFF_COUNT; index += 1) {
      const sprite = scene.add.circle(ZONE_CENTER_X, ZONE_CENTER_Y, 18, 0xcfd8dc, 0.22);
      sprite.setDepth(4.1);
      this.puffs.push({
        sprite,
        angle: (index / PUFF_COUNT) * Math.PI * 2,
        drift: 0.18 + (index % 5) * 0.04,
        size: 14 + (index % 4) * 6,
      });
    }
  }

  sync(radius: number, time: number): void {
    const safe = Math.max(8, radius);
    if (Math.abs(safe - this.lastRadius) > 0.5) {
      this.lastRadius = safe;
      const cover = Math.max(24, ZONE_START_RADIUS - safe + 120);
      const width = cover * 2;
      this.fill.clear();
      this.fill.lineStyle(width, 0x90a4ae, 0.38);
      this.fill.strokeCircle(ZONE_CENTER_X, ZONE_CENTER_Y, safe + cover);
      this.rim.clear();
      this.rim.lineStyle(5, 0xfff59d, 0.9);
      this.rim.strokeCircle(ZONE_CENTER_X, ZONE_CENTER_Y, safe);
    }

    for (const puff of this.puffs) {
      const angle = puff.angle + time * 0.00012 * puff.drift;
      const wobble = Math.sin(time * 0.002 + puff.angle) * 10;
      puff.sprite.setPosition(
        ZONE_CENTER_X + Math.cos(angle) * (safe + wobble),
        ZONE_CENTER_Y + Math.sin(angle) * (safe + wobble),
      );
      puff.sprite.setRadius(puff.size + Math.sin(time * 0.003 + puff.angle) * 3);
      puff.sprite.setAlpha(0.16 + Math.abs(Math.sin(time * 0.0015 + puff.angle)) * 0.14);
    }
  }
}
