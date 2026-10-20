import Phaser from "phaser";
import { WORLD_HEIGHT, WORLD_WIDTH, ZONE_CENTER_X, ZONE_CENTER_Y, ZONE_START_RADIUS } from "@io-game/shared";

const PUFF_COUNT = 22;
const SMOKE_COLOR = 0x90a4ae;
const SMOKE_ALPHA = 0.42;

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
    if (Math.abs(radius - this.lastRadius) > 0.5) {
      this.lastRadius = radius;
      this.redraw(radius);
    }

    if (radius <= 0) {
      for (const puff of this.puffs) {
        puff.sprite.setVisible(false);
      }
      return;
    }

    for (const puff of this.puffs) {
      puff.sprite.setVisible(true);
      const angle = puff.angle + time * 0.00012 * puff.drift;
      const wobble = Math.sin(time * 0.002 + puff.angle) * 10;
      puff.sprite.setPosition(
        ZONE_CENTER_X + Math.cos(angle) * (radius + wobble),
        ZONE_CENTER_Y + Math.sin(angle) * (radius + wobble),
      );
      puff.sprite.setRadius(puff.size + Math.sin(time * 0.003 + puff.angle) * 3);
      puff.sprite.setAlpha(0.16 + Math.abs(Math.sin(time * 0.0015 + puff.angle)) * 0.14);
    }
  }

  private redraw(radius: number): void {
    this.fill.clear();
    this.rim.clear();
    this.fill.fillStyle(SMOKE_COLOR, SMOKE_ALPHA);
    if (radius <= 0) {
      this.fill.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      return;
    }
    if (radius >= ZONE_START_RADIUS) {
      return;
    }

    const top = Math.max(0, ZONE_CENTER_Y - radius);
    const left = Math.max(0, ZONE_CENTER_X - radius);
    const bottom = Math.min(WORLD_HEIGHT, ZONE_CENTER_Y + radius);
    const right = Math.min(WORLD_WIDTH, ZONE_CENTER_X + radius);
    this.fill.fillRect(0, 0, WORLD_WIDTH, top);
    this.fill.fillRect(0, bottom, WORLD_WIDTH, WORLD_HEIGHT - bottom);
    this.fill.fillRect(0, top, left, bottom - top);
    this.fill.fillRect(right, top, WORLD_WIDTH - right, bottom - top);

    const cornerGap = radius * (Math.SQRT2 - 1);
    const width = Math.max(16, cornerGap * 2 + 12);
    this.fill.lineStyle(width, SMOKE_COLOR, SMOKE_ALPHA);
    this.fill.strokeCircle(ZONE_CENTER_X, ZONE_CENTER_Y, radius + width / 2);
    this.rim.lineStyle(5, 0xfff59d, 0.9);
    this.rim.strokeCircle(ZONE_CENTER_X, ZONE_CENTER_Y, radius);
  }
}
