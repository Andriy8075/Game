import { Callbacks, Predict } from "@colyseus/sdk";
import Phaser from "phaser";
import {
  INTERP_DELAY_MS,
  MoveInput,
  applyMovement,
  type ShotEvent,
} from "@io-game/shared";
import { PlayerView } from "../entities/PlayerView";
import { drawWorld } from "../entities/WorldView";
import { connectToGame, type GameRoom } from "../network/GameClient";

type SyncedPlayer = {
  x: number;
  y: number;
  angle: number;
  color: number;
  hp: number;
  maxHp: number;
  damage: number;
};

type KeyMap = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
  UP: Phaser.Input.Keyboard.Key;
  LEFT: Phaser.Input.Keyboard.Key;
  DOWN: Phaser.Input.Keyboard.Key;
  RIGHT: Phaser.Input.Keyboard.Key;
};

export class GameScene extends Phaser.Scene {
  private room?: GameRoom;
  private predict?: ReturnType<typeof Predict.get>;
  private inputHandle?: ReturnType<GameRoom["input"]>;
  private keys?: KeyMap;
  private statusText?: Phaser.GameObjects.Text;
  private hpText?: Phaser.GameObjects.Text;
  private pendingFire = false;
  private readonly views = new Map<string, PlayerView>();

  constructor() {
    super("game");
  }

  create(): void {
    drawWorld(this);
    this.keys = this.input.keyboard!.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
      UP: Phaser.Input.Keyboard.KeyCodes.UP,
      LEFT: Phaser.Input.Keyboard.KeyCodes.LEFT,
      DOWN: Phaser.Input.Keyboard.KeyCodes.DOWN,
      RIGHT: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    }) as KeyMap;

    this.statusText = this.add
      .text(16, 16, "Connecting...", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "16px",
        color: "#f5f5f5",
        backgroundColor: "#00000088",
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.add
      .text(16, 52, "WASD / arrows to move. Mouse aims. Left click shoots.", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#dce7d4",
        backgroundColor: "#00000066",
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.hpText = this.add
      .text(16, 88, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#c8e6c9",
        backgroundColor: "#00000066",
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.pendingFire = true;
      }
    });

    void this.connect();
  }

  update(time: number): void {
    if (!this.room || !this.predict || !this.inputHandle || !this.keys) {
      return;
    }

    const aim = this.readAim();
    const move = this.readMove();
    const steps = this.predict.tick(time);

    for (let i = 0; i < steps; i += 1) {
      const data = this.inputHandle.data as {
        moveX: number;
        moveY: number;
        aimAngle: number;
        fire: boolean;
      };
      data.moveX = move.x;
      data.moveY = move.y;
      data.aimAngle = aim;
      data.fire = this.pendingFire;
      this.inputHandle.send();
      this.pendingFire = false;
    }

    const players = this.room.state.players as Map<string, SyncedPlayer>;
    for (const [sessionId, player] of players) {
      const view = this.views.get(sessionId);
      if (!view) {
        continue;
      }

      const x = this.readField(player, "x");
      const y = this.readField(player, "y");
      const angle = sessionId === this.room.sessionId ? aim : player.angle;
      view.setPose(x, y, angle);
      view.setHealth(player.hp, player.maxHp);

      if (sessionId === this.room.sessionId) {
        this.cameras.main.centerOn(x, y);
        this.hpText?.setText(`HP ${Math.ceil(player.hp)} / ${player.maxHp}   DMG ${player.damage}`);
      }
    }
  }

  private async connect(): Promise<void> {
    try {
      this.room = await connectToGame();
      this.setStatus("Connected");
      this.bindRoom(this.room);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect";
      this.setStatus(message);
    }
  }

  private bindRoom(room: GameRoom): void {
    this.predict = Predict.get(room, { mode: "lerp", delay: INTERP_DELAY_MS });
    this.predict.attachAll("players", { mode: "lerp", fields: ["x", "y"] });

    this.inputHandle = room.input({ type: MoveInput });
    const self = (room.state.players as Map<string, SyncedPlayer>).get(room.sessionId);
    if (self) {
      this.bindReconciler(self);
    }

    const callbacks = Callbacks.get(room);
    callbacks.onAdd("players", (player, sessionId) => {
      const synced = player as SyncedPlayer;
      this.spawnView(String(sessionId), synced);
      if (String(sessionId) === room.sessionId) {
        this.bindReconciler(synced);
      }
    });
    callbacks.onRemove("players", (_player, sessionId) => {
      const id = String(sessionId);
      this.views.get(id)?.destroy();
      this.views.delete(id);
    });

    room.onMessage("shot", (event: ShotEvent) => {
      this.drawTracer(event);
      if (event.hitId) {
        this.views.get(event.hitId)?.flashHit();
      }
    });

    room.onLeave((code) => {
      this.setStatus(`Disconnected (${code})`);
    });
    room.onDrop(() => this.setStatus("Reconnecting..."));
    room.onReconnect(() => this.setStatus("Connected"));
  }

  private bindReconciler(player: SyncedPlayer): void {
    if (!this.predict || !this.inputHandle) {
      return;
    }

    this.predict.reconciler(player, {
      input: this.inputHandle,
      fields: ["x", "y", "angle"],
      smoothMs: 65,
      step: (ctx, state, command) => {
        applyMovement(state, command as { moveX: number; moveY: number; aimAngle: number }, ctx.dt);
      },
    });
  }

  private spawnView(sessionId: string, player: SyncedPlayer): void {
    if (this.views.has(sessionId)) {
      return;
    }
    const view = new PlayerView(this, player.color, player.x, player.y);
    view.setHealth(player.hp, player.maxHp);
    this.views.set(sessionId, view);
  }

  private readMove(): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
    const keys = this.keys!;
    const left = keys.A.isDown || keys.LEFT.isDown;
    const right = keys.D.isDown || keys.RIGHT.isDown;
    const up = keys.W.isDown || keys.UP.isDown;
    const down = keys.S.isDown || keys.DOWN.isDown;
    const x = (right ? 1 : 0) - (left ? 1 : 0);
    const y = (down ? 1 : 0) - (up ? 1 : 0);
    return { x: x as -1 | 0 | 1, y: y as -1 | 0 | 1 };
  }

  private readAim(): number {
    const view = this.room ? this.views.get(this.room.sessionId) : undefined;
    const originX = view?.root.x ?? this.cameras.main.worldView.centerX;
    const originY = view?.root.y ?? this.cameras.main.worldView.centerY;
    const pointer = this.cameras.main.getWorldPoint(this.input.activePointer.x, this.input.activePointer.y);
    return Math.atan2(pointer.y - originY, pointer.x - originX);
  }

  private readField(player: SyncedPlayer, field: "x" | "y"): number {
    if (!this.predict) {
      return player[field];
    }
    return this.predict.value(player, field);
  }

  private drawTracer(event: ShotEvent): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(2, event.hitId ? 0xff8a65 : 0xfff59d, 1);
    graphics.lineBetween(event.fromX, event.fromY, event.toX, event.toY);
    graphics.setDepth(20);
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 180,
      onComplete: () => graphics.destroy(),
    });
  }

  private setStatus(text: string): void {
    this.statusText?.setText(text);
  }
}
