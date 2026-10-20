import Phaser from "phaser";
import { MATCH_COUNTDOWN, MATCH_WAITING, MAX_CLIENTS } from "@io-game/shared";

const STYLE = {
  fontFamily: "Segoe UI, sans-serif",
  color: "#f5f5f5",
} as const;

export type LobbyPlayer = {
  name: string;
  color: number;
};

export class LobbyOverlay {
  private readonly root: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly card: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly countdown: Phaser.GameObjects.Text;
  private readonly roster: Phaser.GameObjects.Text;
  private readonly exitHit: Phaser.GameObjects.Rectangle;
  private onExit?: () => void;

  constructor(private readonly scene: Phaser.Scene) {
    const width = scene.scale.width;
    const height = scene.scale.height;
    this.dim = scene.add.rectangle(0, 0, width, height, 0x0b120c, 0.78).setOrigin(0, 0);
    this.card = scene.add.rectangle(width / 2, height / 2, 460, 420, 0x12180f, 0.98);
    this.card.setStrokeStyle(2, 0x3e5230);
    this.title = scene.add.text(width / 2, height / 2 - 168, "Waiting Room", {
      ...STYLE,
      fontSize: "32px",
      color: "#c8e6c9",
    }).setOrigin(0.5);
    this.status = scene.add.text(width / 2, height / 2 - 118, "Waiting for more players (need 2)", {
      ...STYLE,
      fontSize: "16px",
      color: "#dce7d4",
    }).setOrigin(0.5);
    this.countdown = scene.add.text(width / 2, height / 2 - 64, "", {
      ...STYLE,
      fontSize: "48px",
      color: "#ffe082",
    }).setOrigin(0.5);
    this.roster = scene.add.text(width / 2, height / 2 + 36, "", {
      ...STYLE,
      fontSize: "16px",
      color: "#f5f5f5",
      align: "center",
      lineSpacing: 8,
    }).setOrigin(0.5, 0.5);
    this.exitHit = scene.add.rectangle(width / 2, height / 2 + 168, 180, 42, 0x66bb6a);
    this.exitHit.setInteractive({ useHandCursor: true });
    const exitLabel = scene.add.text(width / 2, height / 2 + 168, "Exit", {
      ...STYLE,
      fontSize: "18px",
      color: "#102016",
      fontStyle: "bold",
    }).setOrigin(0.5);
    this.exitHit.on("pointerdown", () => this.onExit?.());

    this.root = scene.add.container(0, 0, [
      this.dim,
      this.card,
      this.title,
      this.status,
      this.countdown,
      this.roster,
      this.exitHit,
      exitLabel,
    ]);
    this.root.setDepth(1800);
    this.root.setScrollFactor(0);
    for (const child of this.root.list) {
      const pinned = child as { setScrollFactor?: (factor: number) => void };
      pinned.setScrollFactor?.(0);
    }
    this.root.setVisible(false);
  }

  layout(width: number, height: number): void {
    this.dim.setSize(width, height);
    this.card.setPosition(width / 2, height / 2);
    this.title.setPosition(width / 2, height / 2 - 168);
    this.status.setPosition(width / 2, height / 2 - 118);
    this.countdown.setPosition(width / 2, height / 2 - 64);
    this.roster.setPosition(width / 2, height / 2 + 36);
    this.exitHit.setPosition(width / 2, height / 2 + 168);
    const exitLabel = this.root.list[this.root.list.length - 1] as Phaser.GameObjects.Text;
    exitLabel.setPosition(width / 2, height / 2 + 168);
  }

  setExitHandler(onExit: () => void): void {
    this.onExit = onExit;
  }

  sync(phase: string, countdownSec: number, players: LobbyPlayer[]): void {
    const waiting = phase === MATCH_WAITING || phase === MATCH_COUNTDOWN;
    this.root.setVisible(waiting);
    if (!waiting) {
      return;
    }
    this.roster.setText(
      [`Players  ${players.length}/${MAX_CLIENTS}`, ...players.map((player) => player.name)].join("\n"),
    );
    if (phase === MATCH_COUNTDOWN) {
      this.status.setText("Battle starts in");
      this.countdown.setText(String(countdownSec));
      this.countdown.setVisible(true);
      return;
    }
    this.status.setText("Waiting for more players (need 2)");
    this.countdown.setVisible(false);
  }

  hitsExit(x: number, y: number): boolean {
    if (!this.root.visible) {
      return false;
    }
    const camera = this.scene.cameras.main;
    const screenX = this.exitHit.x - camera.scrollX * this.exitHit.scrollFactorX;
    const screenY = this.exitHit.y - camera.scrollY * this.exitHit.scrollFactorY;
    return x >= screenX - this.exitHit.width / 2
      && x <= screenX + this.exitHit.width / 2
      && y >= screenY - this.exitHit.height / 2
      && y <= screenY + this.exitHit.height / 2;
  }
}
