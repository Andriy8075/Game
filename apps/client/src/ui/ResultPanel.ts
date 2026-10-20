import Phaser from "phaser";

const STYLE = {
  fontFamily: "Segoe UI, sans-serif",
  color: "#f5f5f5",
} as const;

const CONFETTI_COLORS = [0xffe082, 0xffd54f, 0xff8a65, 0x81c784, 0x4fc3f7, 0xf48fb1, 0xffffff];

export type EliminatedInfo = {
  killerName: string;
  placement: number;
  rosterSize: number;
  kills: number;
};

export type WinnerInfo = {
  name: string;
  color: number;
  kills: number;
  survivalSec: number;
};

export class ResultPanel {
  private root?: Phaser.GameObjects.Container;
  private mode: "none" | "eliminated" | "winner" = "none";
  private winnerLine?: Phaser.GameObjects.Text;
  private onExit?: () => void;

  constructor(private readonly scene: Phaser.Scene) {}

  setExitHandler(onExit: () => void): void {
    this.onExit = onExit;
  }

  showEliminated(info: EliminatedInfo): void {
    if (this.mode !== "none") {
      return;
    }
    this.mode = "eliminated";
    const { width, height } = this.size();
    const dim = this.scene.add.rectangle(0, 0, width, height, 0x1b0000, 0.62).setOrigin(0, 0);
    const card = this.scene.add.rectangle(width / 2, height / 2, 420, 260, 0x2a1212, 0.98);
    card.setStrokeStyle(3, 0xef9a9a);
    const title = this.scene.add.text(width / 2, height / 2 - 88, "You were eliminated", {
      ...STYLE,
      fontSize: "26px",
      color: "#ffcdd2",
    }).setOrigin(0.5);
    const by = info.killerName.length > 0 ? `Eliminated by ${info.killerName}` : "Eliminated";
    const detail = this.scene.add.text(width / 2, height / 2 - 42, by, {
      ...STYLE,
      fontSize: "16px",
      color: "#ffab91",
    }).setOrigin(0.5);
    const placement = this.scene.add.text(
      width / 2,
      height / 2 - 8,
      `Placement #${info.placement} of ${Math.max(info.rosterSize, info.placement)}`,
      { ...STYLE, fontSize: "18px", color: "#f5f5f5" },
    ).setOrigin(0.5);
    const kills = this.scene.add.text(width / 2, height / 2 + 24, `Kills  ${info.kills}`, {
      ...STYLE,
      fontSize: "16px",
      color: "#ffe082",
    }).setOrigin(0.5);
    this.winnerLine = this.scene.add.text(width / 2, height / 2 + 52, "", {
      ...STYLE,
      fontSize: "15px",
      color: "#ffe082",
    }).setOrigin(0.5);
    this.winnerLine.setVisible(false);
    const { button, label } = this.exitButton(width / 2, height / 2 + 96, 0xef5350, "#1b0000");
    this.mount([dim, card, title, detail, placement, kills, this.winnerLine, button, label]);
  }

  setWinnerName(name: string): void {
    if (this.mode !== "eliminated" || !this.winnerLine || name.length === 0) {
      return;
    }
    this.winnerLine.setText(`Winner: ${name}`);
    this.winnerLine.setVisible(true);
  }

  showWinner(info: WinnerInfo): void {
    if (this.mode === "winner") {
      return;
    }
    this.destroy();
    this.mode = "winner";
    const { width, height } = this.size();
    const vignette = this.scene.add.rectangle(0, 0, width, height, 0x140c00, 0.72).setOrigin(0, 0);

    const glow = this.scene.add.rectangle(width / 2, height / 2, 470, 340, 0xffe082, 0.12);
    const card = this.scene.add.rectangle(width / 2, height / 2, 440, 310, 0x1a1408, 0.98);
    card.setStrokeStyle(3, 0xffd54f);
    this.scene.tweens.add({
      targets: glow,
      alpha: 0.28,
      duration: 900,
      yoyo: true,
      repeat: -1,
    });

    const crown = this.drawCrown(width / 2, height / 2 - 118);
    const kicker = this.scene.add.text(width / 2, height / 2 - 78, "WINNER WINNER", {
      ...STYLE,
      fontSize: "14px",
      color: "#ffe082",
    }).setOrigin(0.5);
    const title = this.scene.add.text(width / 2, height / 2 - 42, "WINNER", {
      ...STYLE,
      fontSize: "48px",
      color: "#ffd54f",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const name = this.scene.add.text(width / 2, height / 2 + 8, info.name, {
      ...STYLE,
      fontSize: "26px",
      color: `#${info.color.toString(16).padStart(6, "0")}`,
    }).setOrigin(0.5);

    const chips = this.statChips(width / 2, height / 2 + 64, [
      `Kills  ${info.kills}`,
      `Survived  ${this.formatTime(info.survivalSec)}`,
      "Placement  #1",
    ]);
    const { button, label } = this.exitButton(width / 2, height / 2 + 124, 0xffd54f, "#1a1408");
    const confetti = this.spawnConfetti(width, height);
    this.mount([vignette, glow, card, crown, kicker, title, name, ...chips, button, label, ...confetti]);
  }

  isOpen(): boolean {
    return this.mode !== "none";
  }

  hitsExit(x: number, y: number): boolean {
    if (!this.root) {
      return false;
    }
    const button = this.root.list.find((child) => child instanceof Phaser.GameObjects.Rectangle && child.input) as Phaser.GameObjects.Rectangle | undefined;
    if (!button) {
      return false;
    }
    const camera = this.scene.cameras.main;
    const screenX = button.x - camera.scrollX * button.scrollFactorX;
    const screenY = button.y - camera.scrollY * button.scrollFactorY;
    return x >= screenX - button.width / 2
      && x <= screenX + button.width / 2
      && y >= screenY - button.height / 2
      && y <= screenY + button.height / 2;
  }

  private exitButton(x: number, y: number, fill: number, labelColor: string): {
    button: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
  } {
    const button = this.scene.add.rectangle(x, y, 180, 42, fill);
    button.setInteractive({ useHandCursor: true });
    button.on("pointerdown", () => this.onExit?.());
    const label = this.scene.add.text(x, y, "Exit", {
      ...STYLE,
      fontSize: "18px",
      color: labelColor,
      fontStyle: "bold",
    }).setOrigin(0.5);
    return { button, label };
  }

  private statChips(cx: number, y: number, labels: string[]): Phaser.GameObjects.GameObject[] {
    const gap = 12;
    const width = 124;
    const total = labels.length * width + (labels.length - 1) * gap;
    const start = cx - total / 2 + width / 2;
    const objects: Phaser.GameObjects.GameObject[] = [];
    labels.forEach((text, index) => {
      const x = start + index * (width + gap);
      const chip = this.scene.add.rectangle(x, y, width, 36, 0x3e2723, 0.9);
      chip.setStrokeStyle(1, 0xffe082, 0.6);
      const label = this.scene.add.text(x, y, text, {
        ...STYLE,
        fontSize: "13px",
        color: "#fff8e1",
      }).setOrigin(0.5);
      objects.push(chip, label);
    });
    return objects;
  }

  private drawCrown(x: number, y: number): Phaser.GameObjects.Graphics {
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(0xffd54f, 1);
    gfx.beginPath();
    gfx.moveTo(x - 28, y + 14);
    gfx.lineTo(x - 28, y - 6);
    gfx.lineTo(x - 14, y + 4);
    gfx.lineTo(x, y - 16);
    gfx.lineTo(x + 14, y + 4);
    gfx.lineTo(x + 28, y - 6);
    gfx.lineTo(x + 28, y + 14);
    gfx.closePath();
    gfx.fillPath();
    gfx.lineStyle(2, 0xfff8e1, 0.9);
    gfx.strokePath();
    gfx.fillStyle(0xff8a65, 1);
    gfx.fillCircle(x, y - 16, 4);
    return gfx;
  }

  private spawnConfetti(width: number, height: number): Phaser.GameObjects.Rectangle[] {
    const bits: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < 36; i += 1) {
      const x = 24 + Math.random() * (width - 48);
      const bit = this.scene.add.rectangle(x, -20 - Math.random() * 120, 8, 12, CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
      bit.setAngle(Math.random() * 360);
      this.scene.tweens.add({
        targets: bit,
        y: height + 40,
        x: x + (Math.random() * 80 - 40),
        angle: bit.angle + 220,
        duration: 2200 + Math.random() * 1800,
        repeat: -1,
        delay: Math.random() * 900,
      });
      bits.push(bit);
    }
    return bits;
  }

  private formatTime(sec: number): string {
    const safe = Math.max(0, Math.floor(sec));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  private size(): { width: number; height: number } {
    return { width: this.scene.scale.width, height: this.scene.scale.height };
  }

  private mount(children: Phaser.GameObjects.GameObject[]): void {
    this.root = this.scene.add.container(0, 0, children);
    this.root.setDepth(2000);
    this.root.setScrollFactor(0);
    for (const child of this.root.list) {
      const pinned = child as { setScrollFactor?: (factor: number) => void };
      pinned.setScrollFactor?.(0);
    }
  }

  private destroy(): void {
    this.root?.destroy(true);
    this.root = undefined;
    this.winnerLine = undefined;
    this.mode = "none";
  }
}
