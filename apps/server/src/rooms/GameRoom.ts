import { Client, ClientState, Room } from "@colyseus/core";
import {
  FIRE_COOLDOWN_MS,
  GAME_MAP,
  MAX_CLIENTS,
  MoveInput,
  PLAYER_COLORS,
  PLAYER_MAX_HP,
  TICK_RATE,
  WEAPON_RANGE,
  applyMovement,
  castHitscan,
  clampAxis,
  muzzleOrigin,
  pickSpawn,
  wrapAngle,
  type ShotEvent,
} from "@io-game/shared";
import { GameState, Player } from "./schema/GameState";

type StepContext = {
  dt: number;
  dtMs: number;
  tick: number;
};

export class GameRoom extends Room<{ input: MoveInput }> {
  maxClients = MAX_CLIENTS;
  state = new GameState();

  inputs = this.defineInput(MoveInput, {
    bufferMaxSize: 64,
    sanitize: (frame) => {
      frame.moveX = clampAxis(frame.moveX);
      frame.moveY = clampAxis(frame.moveY);
      frame.aimAngle = wrapAngle(frame.aimAngle);
      frame.fire = Boolean(frame.fire);
    },
    idle: ({ latest, sessionId }) => {
      const client = this.clients.get(sessionId);
      if (!client || client.state !== ClientState.JOINED) {
        return true;
      }
      if (!latest) {
        return true;
      }
      return {
        moveX: latest.moveX,
        moveY: latest.moveY,
        aimAngle: latest.aimAngle,
        fire: false,
      };
    },
  });

  rewind = this.allowRewindState({ maxRewindMs: 500 });

  private lastFireAt = new Map<string, number>();
  private colorIndex = 0;

  onCreate(): void {
    this.rewind.attachAll(this.state.players, { fields: ["x", "y"] });
    this.setFixedTimestep((ctx) => this.step(ctx), TICK_RATE);
  }

  onJoin(client: Client): void {
    const occupied = [...this.state.players.values()].map((player) => ({ x: player.x, y: player.y }));
    const spawn = pickSpawn(occupied);
    const player = new Player();
    player.x = spawn.x;
    player.y = spawn.y;
    player.angle = 0;
    player.color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length]!;
    player.hp = PLAYER_MAX_HP;
    player.maxHp = PLAYER_MAX_HP;
    this.colorIndex += 1;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.lastFireAt.delete(client.sessionId);
  }

  private step(ctx: StepContext): void {
    for (const [sessionId, player] of this.state.players) {
      const channel = this.inputs.get(sessionId);
      const command = channel.next();
      if (!command) {
        continue;
      }

      applyMovement(player, command, ctx.dt);

      if (command.fire && !channel.wasIdle) {
        this.tryFire(sessionId, player, ctx);
      }
    }
  }

  private tryFire(sessionId: string, player: Player, ctx: StepContext): void {
    const now = ctx.tick * ctx.dtMs;
    const last = this.lastFireAt.get(sessionId) ?? Number.NEGATIVE_INFINITY;
    if (now - last < FIRE_COOLDOWN_MS) {
      return;
    }
    this.lastFireAt.set(sessionId, now);

    const origin = muzzleOrigin(player.x, player.y, player.angle);
    const targets = this.targetsSeenBy(sessionId);
    const result = castHitscan(
      origin.x,
      origin.y,
      player.angle,
      targets,
      GAME_MAP,
      WEAPON_RANGE,
      sessionId,
    );

    if (result.kind === "player" && result.id) {
      const target = this.state.players.get(result.id);
      if (target) {
        target.hp = Math.max(0, target.hp - player.damage);
        if (target.hp <= 0) {
          this.respawn(target);
        }
      }
    }

    const event: ShotEvent = {
      shooterId: sessionId,
      fromX: origin.x,
      fromY: origin.y,
      toX: result.x,
      toY: result.y,
      hitId: result.kind === "player" ? result.id : undefined,
    };
    this.broadcast("shot", event);
  }

  private targetsSeenBy(sessionId: string): Array<{ id: string; x: number; y: number }> {
    try {
      const seen = this.rewind.lastSeenBy(sessionId);
      return [...this.state.players.entries()]
        .filter(([id]) => id !== sessionId)
        .map(([id, other]) => {
          const pose = seen.read(other, ["x", "y"]);
          return { id, x: pose.x, y: pose.y };
        });
    } catch {
      return [...this.state.players.entries()]
        .filter(([id]) => id !== sessionId)
        .map(([id, other]) => ({ id, x: other.x, y: other.y }));
    }
  }

  private respawn(player: Player): void {
    const occupied = [...this.state.players.values()]
      .filter((other) => other !== player)
      .map((other) => ({ x: other.x, y: other.y }));
    const spawn = pickSpawn(occupied);
    player.x = spawn.x;
    player.y = spawn.y;
    player.hp = player.maxHp;
  }
}
