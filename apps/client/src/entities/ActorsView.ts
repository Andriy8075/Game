import Phaser from "phaser";
import { GAME_MAP, HARVEST, isHarvestable, type BlastEvent } from "@io-game/shared";

type NodeSync = { remaining: number };
type GrenadeSync = { x: number; y: number; kind: number };
type HazardSync = { x: number; y: number; radius: number; kind: number };

const GRENADE_COLORS = [0x546e7a, 0xfff59d, 0xff7043];

type NodeArt = {
  body: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
};

export class ActorsView {
  private readonly nodes = new Map<string, NodeArt>();
  private readonly grenades = new Map<string, Phaser.GameObjects.Arc>();
  private readonly hazards = new Map<string, Phaser.GameObjects.Arc>();

  constructor(private readonly scene: Phaser.Scene) {
    for (const obstacle of GAME_MAP.obstacles) {
      if (!isHarvestable(obstacle)) {
        continue;
      }
      const spec = HARVEST[obstacle.kind];
      const body = scene.add.circle(obstacle.x, obstacle.y, obstacle.radius, obstacle.fill);
      body.setStrokeStyle(3, obstacle.stroke);
      body.setDepth(obstacle.kind === "tree" ? 1 : 0);

      const coreRadius = obstacle.kind === "tree" ? Math.max(6, obstacle.radius * 0.28) : obstacle.radius * 0.42;
      const coreColor = obstacle.kind === "tree" ? 0x5d4037 : obstacle.kind === "gold" ? 0xfff8e1 : obstacle.kind === "iron" ? 0x8d6e63 : 0xeceff1;
      const core = scene.add.circle(obstacle.x, obstacle.y, coreRadius, coreColor);
      core.setDepth(body.depth + 0.1);

      const label = scene.add
        .text(obstacle.x, obstacle.y - obstacle.radius - 18, spec.label, {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "12px",
          color: "#f7f3ea",
          stroke: "#102027",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(3);

      const count = scene.add
        .text(obstacle.x, obstacle.y - obstacle.radius - 4, "", {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "11px",
          color: "#dce7d4",
          stroke: "#102027",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(3);

      this.nodes.set(obstacle.id, { body, core, label, count });
    }
  }

  syncNodes(nodes: Map<string, NodeSync> | undefined): void {
    for (const [id, art] of this.nodes) {
      const obstacle = GAME_MAP.obstacles.find((entry) => entry.id === id);
      if (!obstacle || !isHarvestable(obstacle)) {
        continue;
      }
      const spec = HARVEST[obstacle.kind];
      const remaining = nodes?.get(id)?.remaining ?? spec.charges;
      const depleted = remaining <= 0;
      const alpha = depleted ? 0.28 : 1;
      art.body.setAlpha(alpha);
      art.core.setAlpha(alpha);
      art.label.setAlpha(alpha);
      art.count.setAlpha(alpha);
      art.count.setText(depleted ? "regrowing" : `${remaining}`);
    }
  }

  syncGrenades(grenades: Map<string, GrenadeSync> | undefined): void {
    const seen = new Set<string>();
    if (grenades) {
      for (const [id, grenade] of grenades) {
        seen.add(id);
        let view = this.grenades.get(id);
        if (!view) {
          view = this.scene.add.circle(grenade.x, grenade.y, 7, GRENADE_COLORS[grenade.kind] ?? 0xffffff);
          view.setStrokeStyle(2, 0x102027);
          view.setDepth(16);
          this.grenades.set(id, view);
        }
        view.setPosition(grenade.x, grenade.y);
        view.setFillStyle(GRENADE_COLORS[grenade.kind] ?? 0xffffff);
      }
    }
    for (const [id, view] of this.grenades) {
      if (!seen.has(id)) {
        view.destroy();
        this.grenades.delete(id);
      }
    }
  }

  syncHazards(hazards: Map<string, HazardSync> | undefined): void {
    const seen = new Set<string>();
    if (hazards) {
      for (const [id, hazard] of hazards) {
        seen.add(id);
        let view = this.hazards.get(id);
        if (!view) {
          view = this.scene.add.circle(hazard.x, hazard.y, hazard.radius, 0xff7043, 0.28);
          view.setStrokeStyle(2, 0xffab91, 0.8);
          view.setDepth(2);
          this.hazards.set(id, view);
        }
        view.setPosition(hazard.x, hazard.y);
        view.setRadius(hazard.radius);
      }
    }
    for (const [id, view] of this.hazards) {
      if (!seen.has(id)) {
        view.destroy();
        this.hazards.delete(id);
      }
    }
  }

  blast(event: BlastEvent): void {
    const color = GRENADE_COLORS[event.kind] ?? 0xfff59d;
    const ring = this.scene.add.circle(event.x, event.y, 8, color, 0.35);
    ring.setStrokeStyle(3, color, 0.9);
    ring.setDepth(18);
    this.scene.tweens.add({
      targets: ring,
      radius: event.radius,
      alpha: 0,
      duration: 280,
      onComplete: () => ring.destroy(),
    });
  }

  popup(x: number, y: number, text: string): void {
    const label = this.scene.add
      .text(x, y - 20, text, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "16px",
        color: "#fff8e1",
        stroke: "#102027",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.scene.tweens.add({
      targets: label,
      y: y - 56,
      alpha: 0,
      duration: 700,
      onComplete: () => label.destroy(),
    });
  }
}
