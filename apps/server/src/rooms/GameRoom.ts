import { Client, ClientState, Room, type AuthContext } from "@colyseus/core";
import { JWT, type JwtPayload } from "colyseus";
import {
  BANDAGE_HEAL,
  FIRE_DAMAGE,
  FIRE_RADIUS,
  FIRE_TICK_MS,
  FIRE_TTL_MS,
  FLASH_RADIUS,
  FLASH_SLOW_MS,
  FRAG_DAMAGE,
  FRAG_RADIUS,
  GAME_MAP,
  GATHER_COOLDOWN_MS,
  GRENADE_FUSE_MS,
  GRENADE_KIND,
  GRENADE_RADIUS,
  GRENADE_SPEED,
  HARVEST,
  HEAVY_ARMOR,
  LIGHT_ARMOR,
  MAX_CLIENTS,
  MoveInput,
  PICKUP_RESPAWN_MS,
  PICKUP_SLOTS,
  PLAYER_COLORS,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SLOW_SPEED_FACTOR,
  STARTER_WEAPON_ID,
  THROW_COOLDOWN_MS,
  TICK_RATE,
  armorCraftBlock,
  applyDamage,
  applyMovement,
  blastDamage,
  canAfford,
  castHitscan,
  clampAxis,
  formatCost,
  getRecipe,
  getWeapon,
  isHarvestable,
  isHeldSlot,
  muzzleOrigin,
  nearestHarvestable,
  overlapsPickup,
  payCost,
  pickSpawn,
  randomPickupWeapon,
  sanitizePlayerName,
  wrapAngle,
  type BlastEvent,
  type CraftedId,
  type GatherEvent,
  type JoinOptions,
  type ShotEvent,
} from "@io-game/shared";
import { findAccountById } from "../accounts/store";
import { GameState, HazardZone, Inventory, NodeState, Player, ThrownGrenade, WeaponPickup } from "./schema/GameState";

type StepContext = {
  dt: number;
  dtMs: number;
  tick: number;
};

const USE_IDS = new Set(["bandage"]);
const THROW_IDS = new Set<CraftedId>(["frag", "flash", "incendiary"]);

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
      frame.gather = Boolean(frame.gather);
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
        gather: false,
      };
    },
  });

  rewind = this.allowRewindState({ maxRewindMs: 500 });

  private lastFireAt = new Map<string, number>();
  private lastGatherAt = new Map<string, number>();
  private lastThrowAt = new Map<string, number>();
  private nodeRespawnAt = new Map<string, number>();
  private hazardTickAt = new Map<string, number>();
  private grenadeSeq = 1;
  private hazardSeq = 1;
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
    for (const obstacle of GAME_MAP.obstacles) {
      if (!isHarvestable(obstacle)) {
        continue;
      }
      const node = new NodeState();
      node.remaining = HARVEST[obstacle.kind].charges;
      this.state.nodes.set(obstacle.id, node);
    }

    this.onMessage("craft", (client, payload: unknown) => {
      if (typeof payload !== "string") {
        return;
      }
      this.tryCraft(client.sessionId, payload);
    });
    this.onMessage("use", (client, payload: unknown) => {
      if (typeof payload !== "string") {
        return;
      }
      this.tryUse(client.sessionId, payload);
    });
    this.onMessage("hold", (client, payload: unknown) => {
      if (typeof payload !== "string" || !isHeldSlot(payload)) {
        return;
      }
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.held = payload;
      }
    });
    this.onMessage("throw", (client, payload: unknown) => {
      if (typeof payload !== "string") {
        return;
      }
      this.tryThrow(client.sessionId, payload, Date.now());
    });

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
    player.inventory = new Inventory();
    this.colorIndex += 1;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.lastFireAt.delete(client.sessionId);
    this.lastGatherAt.delete(client.sessionId);
    this.lastThrowAt.delete(client.sessionId);
  }

  private step(ctx: StepContext): void {
    const now = ctx.tick * ctx.dtMs;
    this.spawnDuePickups(now);
    this.respawnNodes(now);
    this.stepGrenades(ctx.dt, ctx.dtMs);
    this.stepHazards(now, ctx.dtMs);

    for (const [sessionId, player] of this.state.players) {
      if (player.slowMs > 0) {
        player.slowMs = Math.max(0, player.slowMs - ctx.dtMs);
      }

      const channel = this.inputs.get(sessionId);
      const command = channel.next();
      if (command) {
        const speed = player.slowMs > 0 ? PLAYER_SPEED * SLOW_SPEED_FACTOR : PLAYER_SPEED;
        applyMovement(player, command, ctx.dt, GAME_MAP, PLAYER_RADIUS, speed);

        if (command.gather && !channel.wasIdle && player.held === "arm") {
          this.tryGather(sessionId, player, now);
        }

        if (command.fire && !channel.wasIdle && player.held === "gun") {
          this.tryFire(sessionId, player, now);
        }
      }
      this.collectPickups(player, now);
    }
  }

  private respawnNodes(now: number): void {
    for (const [id, at] of this.nodeRespawnAt) {
      if (now < at) {
        continue;
      }
      const obstacle = GAME_MAP.obstacles.find((entry) => entry.id === id);
      const node = this.state.nodes.get(id);
      if (obstacle && isHarvestable(obstacle) && node) {
        node.remaining = HARVEST[obstacle.kind].charges;
      }
      this.nodeRespawnAt.delete(id);
    }
  }

  private tryGather(sessionId: string, player: Player, now: number): void {
    const last = this.lastGatherAt.get(sessionId) ?? Number.NEGATIVE_INFINITY;
    if (now - last < GATHER_COOLDOWN_MS) {
      return;
    }

    const obstacle = nearestHarvestable(player.x, player.y, (id) => this.state.nodes.get(id)?.remaining ?? 0);
    if (!obstacle) {
      return;
    }

    const node = this.state.nodes.get(obstacle.id);
    const spec = HARVEST[obstacle.kind];
    if (!node || node.remaining <= 0) {
      return;
    }

    node.remaining -= 1;
    player.inventory[spec.resource] += spec.yield;
    this.lastGatherAt.set(sessionId, now);
    if (node.remaining <= 0) {
      this.nodeRespawnAt.set(obstacle.id, now + spec.respawnMs);
    }

    const event: GatherEvent = {
      playerId: sessionId,
      x: obstacle.x,
      y: obstacle.y,
      resource: spec.label,
      amount: spec.yield,
    };
    this.broadcast("gathered", event);
  }

  private tryCraft(sessionId: string, recipeId: string): void {
    const player = this.state.players.get(sessionId);
    const recipe = getRecipe(recipeId);
    if (!player || !recipe) {
      return;
    }
    if (recipe.id === "lightArmor" || recipe.id === "heavyArmor") {
      const blocked = armorCraftBlock(recipe.id, player);
      if (blocked) {
        this.clients.get(sessionId)?.send("notice", blocked);
        return;
      }
    }
    if (!canAfford(player.inventory, recipe.cost)) {
      this.clients.get(sessionId)?.send("notice", `Need ${formatCost(recipe.cost)}`);
      return;
    }

    payCost(player.inventory, recipe.cost);
    if (recipe.id === "lightArmor" || recipe.id === "heavyArmor") {
      const points = recipe.id === "lightArmor" ? LIGHT_ARMOR : HEAVY_ARMOR;
      player.armor = points;
      player.maxArmor = points;
      if (recipe.id === "lightArmor") {
        player.craftedLight = true;
      } else {
        player.craftedHeavy = true;
      }
      this.clients.get(sessionId)?.send("notice", `${recipe.name} equipped`);
      return;
    }

    player.inventory[recipe.id] += 1;
    this.clients.get(sessionId)?.send("notice", `Crafted ${recipe.name}`);
  }

  private tryUse(sessionId: string, itemId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player || !USE_IDS.has(itemId)) {
      return;
    }

    if (itemId === "bandage") {
      if (player.inventory.bandage <= 0) {
        this.clients.get(sessionId)?.send("notice", "No bandages");
        return;
      }
      if (player.hp >= player.maxHp) {
        this.clients.get(sessionId)?.send("notice", "Already at full health");
        return;
      }
      player.inventory.bandage -= 1;
      player.hp = Math.min(player.maxHp, player.hp + BANDAGE_HEAL);
      this.clients.get(sessionId)?.send("notice", `Healed ${BANDAGE_HEAL} HP`);
    }
  }

  private tryThrow(sessionId: string, itemId: string, now: number): void {
    const player = this.state.players.get(sessionId);
    if (!player || !THROW_IDS.has(itemId as CraftedId)) {
      return;
    }
    const kind = itemId as "frag" | "flash" | "incendiary";
    if (player.held !== kind) {
      return;
    }
    const last = this.lastThrowAt.get(sessionId) ?? Number.NEGATIVE_INFINITY;
    if (now - last < THROW_COOLDOWN_MS) {
      return;
    }
    if (player.inventory[kind] <= 0) {
      this.clients.get(sessionId)?.send("notice", "None left");
      return;
    }

    player.inventory[kind] -= 1;
    this.lastThrowAt.set(sessionId, now);

    const grenade = new ThrownGrenade();
    grenade.x = player.x + Math.cos(player.angle) * (PLAYER_RADIUS + 10);
    grenade.y = player.y + Math.sin(player.angle) * (PLAYER_RADIUS + 10);
    grenade.vx = Math.cos(player.angle) * GRENADE_SPEED;
    grenade.vy = Math.sin(player.angle) * GRENADE_SPEED;
    grenade.kind = GRENADE_KIND[kind];
    grenade.fuseMs = GRENADE_FUSE_MS;
    grenade.ownerId = sessionId;
    this.state.grenades.set(`g${this.grenadeSeq}`, grenade);
    this.grenadeSeq += 1;
  }

  private stepGrenades(dt: number, dtMs: number): void {
    for (const id of [...this.state.grenades.keys()]) {
      const grenade = this.state.grenades.get(id);
      if (!grenade) {
        continue;
      }

      const nextX = grenade.x + grenade.vx * dt;
      const nextY = grenade.y + grenade.vy * dt;
      if (this.blocked(nextX, nextY)) {
        grenade.vx = 0;
        grenade.vy = 0;
      } else {
        grenade.x = nextX;
        grenade.y = nextY;
      }

      grenade.fuseMs -= dtMs;
      if (grenade.fuseMs <= 0) {
        this.explode(grenade);
        this.state.grenades.delete(id);
      }
    }
  }

  private blocked(x: number, y: number): boolean {
    if (x < GRENADE_RADIUS || y < GRENADE_RADIUS || x > GAME_MAP.width - GRENADE_RADIUS || y > GAME_MAP.height - GRENADE_RADIUS) {
      return true;
    }
    for (const obstacle of GAME_MAP.obstacles) {
      if (obstacle.kind === "building" || obstacle.kind === "fence") {
        const nearestX = Math.max(obstacle.x, Math.min(x, obstacle.x + obstacle.width));
        const nearestY = Math.max(obstacle.y, Math.min(y, obstacle.y + obstacle.height));
        const dx = x - nearestX;
        const dy = y - nearestY;
        if (dx * dx + dy * dy < GRENADE_RADIUS * GRENADE_RADIUS) {
          return true;
        }
      } else if (isHarvestable(obstacle)) {
        const dx = x - obstacle.x;
        const dy = y - obstacle.y;
        const reach = GRENADE_RADIUS + obstacle.radius;
        if (dx * dx + dy * dy < reach * reach) {
          return true;
        }
      }
    }
    return false;
  }

  private explode(grenade: ThrownGrenade): void {
    if (grenade.kind === GRENADE_KIND.frag) {
      this.damageRadius(grenade.x, grenade.y, FRAG_RADIUS, FRAG_DAMAGE, true);
      this.emitBlast(grenade.x, grenade.y, FRAG_RADIUS, grenade.kind);
      return;
    }

    if (grenade.kind === GRENADE_KIND.flash) {
      for (const player of this.state.players.values()) {
        if (Math.hypot(player.x - grenade.x, player.y - grenade.y) <= FLASH_RADIUS) {
          player.slowMs = Math.max(player.slowMs, FLASH_SLOW_MS);
        }
      }
      this.emitBlast(grenade.x, grenade.y, FLASH_RADIUS, grenade.kind);
      return;
    }

    const hazard = new HazardZone();
    hazard.x = grenade.x;
    hazard.y = grenade.y;
    hazard.radius = FIRE_RADIUS;
    hazard.kind = grenade.kind;
    hazard.ttlMs = FIRE_TTL_MS;
    const id = `h${this.hazardSeq}`;
    this.hazardSeq += 1;
    this.state.hazards.set(id, hazard);
    this.emitBlast(grenade.x, grenade.y, FIRE_RADIUS, grenade.kind);
  }

  private stepHazards(now: number, dtMs: number): void {
    for (const id of [...this.state.hazards.keys()]) {
      const hazard = this.state.hazards.get(id);
      if (!hazard) {
        continue;
      }

      hazard.ttlMs -= dtMs;
      const due = this.hazardTickAt.get(id) ?? 0;
      if (now >= due) {
        this.damageRadius(hazard.x, hazard.y, hazard.radius, FIRE_DAMAGE, false);
        this.hazardTickAt.set(id, now + FIRE_TICK_MS);
      }
      if (hazard.ttlMs <= 0) {
        this.state.hazards.delete(id);
        this.hazardTickAt.delete(id);
      }
    }
  }

  private damageRadius(x: number, y: number, radius: number, damage: number, falloff: boolean): void {
    for (const player of this.state.players.values()) {
      const distance = Math.hypot(player.x - x, player.y - y);
      const amount = falloff ? blastDamage(distance, radius, damage) : distance <= radius ? damage : 0;
      if (amount <= 0) {
        continue;
      }
      applyDamage(player, amount);
      if (player.hp <= 0) {
        this.respawn(player);
      }
    }
  }

  private emitBlast(x: number, y: number, radius: number, kind: number): void {
    const event: BlastEvent = { x, y, radius, kind };
    this.broadcast("blast", event);
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
        applyDamage(target, weapon.damage);
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
    player.slowMs = 0;
    if (player.craftedHeavy) {
      player.maxArmor = HEAVY_ARMOR;
      player.armor = HEAVY_ARMOR;
    } else if (player.craftedLight) {
      player.maxArmor = LIGHT_ARMOR;
      player.armor = LIGHT_ARMOR;
    } else {
      player.armor = 0;
      player.maxArmor = 0;
    }
  }
}
