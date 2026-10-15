import { Client, ClientState, Room, type AuthContext } from "@colyseus/core";
import { JWT, type JwtPayload } from "colyseus";
import {
  GAME_MAP,
  MAX_CLIENTS,
  MoveInput,
  PICKUP_RESPAWN_MS,
  PICKUP_SLOTS,
  PLAYER_COLORS,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  STARTER_WEAPON_ID,
  TICK_RATE,
  applyMovement,
  castHitscan,
  clampAxis,
  getWeapon,
  muzzleOrigin,
  overlapsPickup,
  pickSpawn,
  randomPickupWeapon,
  sanitizePlayerName,
  wrapAngle,
  type JoinOptions,
  type ShotEvent,
} from "@io-game/shared";
import { findAccountById } from "../accounts/store";
import { GameState, Player, WeaponPickup } from "./schema/GameState";

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
  private pickupSerial = 0;
  private readonly slotByPickupId = new Map<string, number>();
  private readonly occupiedSlots = new Set<number>();
  private pendingRespawns: Array<{ slot: number; at: number }> = [];

  async onAuth(_client: Client, _options: unknown, context: AuthContext) {
    if (!context.token) {
      return true;
    }

    try {
      const payload = await JWT.verify<JwtPayload>(context.token);
      const id = typeof payload === "object" && payload !== null && "id" in payload ? payload.id : undefined;
      if (typeof id !== "string") {
        throw new Error("invalid_token");
      }
      const account = await findAccountById(id);
      if (!account) {
        throw new Error("invalid_token");
      }
      return { id: account.id, email: account.email, level: account.level };
    } catch {
      throw new Error("invalid_token");
    }
  }

  onCreate(): void {
    this.rewind.attachAll(this.state.players, { fields: ["x", "y"] });
    for (let slot = 0; slot < PICKUP_SLOTS.length; slot += 1) {
      this.spawnPickup(slot);
    }
    this.setFixedTimestep((ctx) => this.step(ctx), TICK_RATE);
  }

  onJoin(client: Client, options?: JoinOptions): void {
    const occupied = [...this.state.players.values()].map((player) => ({ x: player.x, y: player.y }));
    const spawn = pickSpawn(occupied);
    const starter = getWeapon(STARTER_WEAPON_ID);
    const player = new Player();
    player.x = spawn.x;
    player.y = spawn.y;
    player.angle = 0;
    player.color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length]!;
    player.name = sanitizePlayerName(options?.name);
    player.hp = PLAYER_MAX_HP;
    player.maxHp = PLAYER_MAX_HP;
    player.weaponId = starter.id;
    player.damage = starter.damage;
    this.colorIndex += 1;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.lastFireAt.delete(client.sessionId);
  }

  private step(ctx: StepContext): void {
    const now = ctx.tick * ctx.dtMs;
    this.spawnDuePickups(now);

    for (const [sessionId, player] of this.state.players) {
      const channel = this.inputs.get(sessionId);
      const command = channel.next();
      if (command) {
        applyMovement(player, command, ctx.dt);
        if (command.fire && !channel.wasIdle) {
          this.tryFire(sessionId, player, now);
        }
      }
      this.collectPickups(player, now);
    }
  }

  private tryFire(sessionId: string, player: Player, now: number): void {
    const weapon = getWeapon(player.weaponId);
    const last = this.lastFireAt.get(sessionId) ?? Number.NEGATIVE_INFINITY;
    if (now - last < weapon.fireCooldownMs) {
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
      weapon.range,
      sessionId,
    );

    if (result.kind === "player" && result.id) {
      const target = this.state.players.get(result.id);
      if (target) {
        target.hp = Math.max(0, target.hp - weapon.damage);
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
      weaponId: weapon.id,
    };
    this.broadcast("shot", event);
  }

  private spawnPickup(slot: number): void {
    const point = PICKUP_SLOTS[slot];
    if (!point || this.occupiedSlots.has(slot)) {
      return;
    }

    const pickup = new WeaponPickup();
    pickup.weaponId = randomPickupWeapon();
    pickup.x = point.x;
    pickup.y = point.y;
    const id = `pickup-${this.pickupSerial}`;
    this.pickupSerial += 1;
    this.state.pickups.set(id, pickup);
    this.slotByPickupId.set(id, slot);
    this.occupiedSlots.add(slot);
  }

  private spawnDuePickups(now: number): void {
    if (this.pendingRespawns.length === 0) {
      return;
    }

    const waiting: Array<{ slot: number; at: number }> = [];
    for (const pending of this.pendingRespawns) {
      if (pending.at > now) {
        waiting.push(pending);
        continue;
      }
      if (this.occupiedSlots.has(pending.slot) || !this.slotIsClear(pending.slot)) {
        waiting.push({ slot: pending.slot, at: now + 1000 });
        continue;
      }
      this.spawnPickup(pending.slot);
    }
    this.pendingRespawns = waiting;
  }

  private slotIsClear(slot: number): boolean {
    const point = PICKUP_SLOTS[slot];
    if (!point) {
      return false;
    }
    for (const player of this.state.players.values()) {
      if (overlapsPickup(player.x, player.y, point.x, point.y, PLAYER_RADIUS)) {
        return false;
      }
    }
    return true;
  }

  private collectPickups(player: Player, now: number): void {
    let closestId: string | undefined;
    let closestDist = Number.POSITIVE_INFINITY;

    for (const [id, pickup] of this.state.pickups) {
      if (!overlapsPickup(player.x, player.y, pickup.x, pickup.y, PLAYER_RADIUS)) {
        continue;
      }
      const dx = player.x - pickup.x;
      const dy = player.y - pickup.y;
      const dist = dx * dx + dy * dy;
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }

    if (!closestId) {
      return;
    }

    const pickup = this.state.pickups.get(closestId);
    const slot = this.slotByPickupId.get(closestId);
    if (!pickup) {
      return;
    }

    const weapon = getWeapon(pickup.weaponId);
    if (weapon.source === "pickup" && weapon.id === pickup.weaponId) {
      player.weaponId = weapon.id;
      player.damage = weapon.damage;
    }

    this.state.pickups.delete(closestId);
    this.slotByPickupId.delete(closestId);
    if (slot !== undefined) {
      this.occupiedSlots.delete(slot);
      this.pendingRespawns.push({ slot, at: now + PICKUP_RESPAWN_MS });
    }
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
