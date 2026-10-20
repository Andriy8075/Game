import { Client, ClientState, Room, type AuthContext } from "@colyseus/core";
import { JWT, type JwtPayload } from "colyseus";
import {
  BANDAGE_HEAL,
  BASTION_MS,
  BOT_COLOR,
  BOT_DAMAGE,
  BOT_FIRE_COOLDOWN_MS,
  BOT_MAX_HP,
  BOT_RADIUS,
  BOT_RANGE,
  BOT_SPEED,
  FIRE_DAMAGE,
  FIRE_RADIUS,
  FIRE_TICK_MS,
  FIRE_TTL_MS,
  FLASH_RADIUS,
  FLASH_SLOW_MS,
  FRAG_DAMAGE,
  FRAG_RADIUS,
  GAME_MAP,
  GALE_MS,
  GATHER_COOLDOWN_MS,
  GRENADE_FUSE_MS,
  GRENADE_KIND,
  GRENADE_RADIUS,
  GRENADE_SPEED,
  HARVEST,
  HEAVY_ARMOR,
  COUNTDOWN_MS,
  LIGHT_ARMOR,
  MATCH_COUNTDOWN,
  MATCH_ENDED,
  MATCH_PLAYING,
  MATCH_WAITING,
  MIN_PLAYERS_TO_START,
  SMOKE_KILLER_ID,
  SMOKE_KILLER_NAME,
  SMOKE_TICK_MS,
  MAX_CLIENTS,
  MAX_HIRED_BOTS,
  MoveInput,
  PICKUP_RESPAWN_MS,
  PICKUP_SLOTS,
  PLAYER_COLORS,
  PLAYER_RADIUS,
  RAMSPIKE_DISTANCE,
  SLOW_SPEED_FACTOR,
  STARTER_WEAPON_ID,
  THROW_COOLDOWN_MS,
  TICK_RATE,
  WALL_HP,
  WALL_MAX_PER_PLAYER,
  WALL_PLACE_COOLDOWN_MS,
  armorCraftBlock,
  applyDamage,
  applyMovement,
  blastDamage,
  isUseItem,
  canAfford,
  castHitscan,
  chooseWallPayment,
  clamp,
  clampAxis,
  formatCost,
  getRecipe,
  getWeapon,
  isBlocked,
  isHarvestable,
  isHeldSlot,
  isStackedCraft,
  mapWithWalls,
  maxHpForLevel,
  muzzleOrigin,
  nearestHarvestable,
  nextWaypoint,
  overlapsPickup,
  playerMoveSpeed,
  pushForward,
  payCost,
  isInSmoke,
  pickSpawn,
  pickUniqueSpawns,
  randomPickupWeapon,
  resolveCollisions,
  resolveMenuWeapon,
  rollJoinLoadout,
  sanitizePlayerName,
  wallCostLabel,
  wallPlacementBlock,
  wallRectForAim,
  wrapAngle,
  XP_PER_KILL,
  XP_PER_WIN,
  zoneAt,
  type BlastEvent,
  type CraftedId,
  type GatherEvent,
  type JoinOptions,
  type ShotEvent,
} from "@io-game/shared";
import { addAccountXp, findAccountById } from "../accounts/store";
import { Bot, GameState, HazardZone, Inventory, NodeState, PlacedWall, Player, ThrownGrenade, WeaponPickup } from "./schema/GameState";

type StepContext = {
  dt: number;
  dtMs: number;
  tick: number;
};

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
  private lastPlaceAt = new Map<string, number>();
  private nodeRespawnAt = new Map<string, number>();
  private hazardTickAt = new Map<string, number>();
  private grenadeSeq = 1;
  private hazardSeq = 1;
  private wallSeq = 1;
  private botSeq = 1;
  private colorIndex = 0;
  private pickupSerial = 0;
  private readonly slotByPickupId = new Map<string, number>();
  private readonly occupiedSlots = new Set<number>();
  private pendingRespawns: Array<{ slot: number; at: number }> = [];
  private simTick = 0;
  private simNow = 0;
  private manualTime = false;
  private countdownEndsAt = 0;
  private matchStartedAt = 0;
  private nextSmokeTick = 0;
  private startedPlayerCount = 0;
  private readonly spawnWeaponId = new Map<string, string>();
  private readonly accountIds = new Map<string, string>();
  private readonly hazardOwners = new Map<string, string>();
  /** Test seam. Guests pass level 0, so this never grants them a join bonus. */
  random: () => number = Math.random;

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
      return { id: account.id, email: account.email, level: account.level, xp: account.xp };
    } catch {
      throw new Error("invalid_token");
    }
  }

  onCreate(options?: { manualTime?: boolean }): void {
    for (const obstacle of GAME_MAP.obstacles) {
      if (!isHarvestable(obstacle)) {
        continue;
      }
      const node = new NodeState();
      node.remaining = HARVEST[obstacle.kind].charges;
      this.state.nodes.set(obstacle.id, node);
    }

    this.onMessage("craft", (client, payload: unknown) => {
      if (!this.canAct(client.sessionId) || typeof payload !== "string") {
        return;
      }
      this.tryCraft(client.sessionId, payload);
    });
    this.onMessage("use", (client, payload: unknown) => {
      if (!this.canAct(client.sessionId) || typeof payload !== "string") {
        return;
      }
      this.tryUse(client.sessionId, payload);
    });
    this.onMessage("hold", (client, payload: unknown) => {
      if (!this.canAct(client.sessionId) || typeof payload !== "string" || !isHeldSlot(payload)) {
        return;
      }
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.held = payload;
      }
    });
    this.onMessage("throw", (client, payload: unknown) => {
      if (!this.canAct(client.sessionId) || typeof payload !== "string") {
        return;
      }
      this.tryThrow(client.sessionId, payload, this.simNow);
    });
    this.onMessage("place-wall", (client, payload: unknown) => {
      if (!this.canAct(client.sessionId)) {
        return;
      }
      this.tryPlaceWall(client.sessionId, typeof payload === "string" ? payload : "auto");
    });

    this.rewind.attachAll(this.state.players, { fields: ["x", "y"] });
    for (let slot = 0; slot < PICKUP_SLOTS.length; slot += 1) {
      this.spawnPickup(slot);
    }
    this.setFixedTimestep((ctx) => this.step(ctx), TICK_RATE);
    if (options?.manualTime) {
      this.manualTime = true;
      this.setTimestep();
      (this as unknown as { _simulationInterval?: ReturnType<typeof setInterval> })._simulationInterval = undefined;
    }
  }

  /** Run fixed 30 Hz steps immediately. Only rooms created with `{ manualTime: true }` accept this. */
  advance(ticks: number): void {
    if (!this.manualTime) {
      throw new Error("advance() requires a room created with { manualTime: true }");
    }
    const dt = 1 / TICK_RATE;
    const dtMs = 1000 / TICK_RATE;
    for (let i = 0; i < ticks; i += 1) {
      this.simTick += 1;
      this.step({ dt, dtMs, tick: this.simTick });
    }
  }

  onJoin(client: Client, options?: JoinOptions): void {
    if (this.state.phase === MATCH_PLAYING || this.state.phase === MATCH_ENDED) {
      throw new Error("match_in_progress");
    }
    const occupied = [...this.state.players.values()].map((player) => ({ x: player.x, y: player.y }));
    const spawn = pickSpawn(occupied);
    const account = this.readAccount(client);
    const level = account?.level ?? 0;
    if (account) {
      this.accountIds.set(client.sessionId, account.id);
    }
    const menuWeapon = resolveMenuWeapon(options?.weaponId, level);
    const bonus = rollJoinLoadout(level, this.random, menuWeapon.id);
    const weapon = getWeapon(bonus.weaponId ?? menuWeapon.id);
    const player = new Player();
    player.x = spawn.x;
    player.y = spawn.y;
    player.angle = 0;
    player.color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length]!;
    player.name = sanitizePlayerName(options?.name);
    const maxHp = maxHpForLevel(level);
    player.hp = maxHp;
    player.maxHp = maxHp;
    player.inventory = new Inventory();
    this.equipWeapon(player, weapon.id);
    this.spawnWeaponId.set(client.sessionId, weapon.id);
    if (bonus.frag > 0) {
      player.inventory.frag = bonus.frag;
    }
    if (bonus.bandage > 0) {
      player.inventory.bandage = bonus.bandage;
    }
    if (bonus.lightArmor) {
      player.armor = LIGHT_ARMOR;
      player.maxArmor = LIGHT_ARMOR;
      player.craftedLight = true;
    }
    player.alive = true;
    this.colorIndex += 1;
    this.state.players.set(client.sessionId, player);
    this.refreshLobby();
  }

  onLeave(client: Client): void {
    if (this.state.phase === MATCH_PLAYING) {
      this.eliminate(client.sessionId);
    }
    this.state.players.delete(client.sessionId);
    for (const id of [...this.state.bots.keys()]) {
      if (this.state.bots.get(id)?.ownerId === client.sessionId) {
        this.removeBot(id);
      }
    }
    this.lastFireAt.delete(client.sessionId);
    this.lastGatherAt.delete(client.sessionId);
    this.lastThrowAt.delete(client.sessionId);
    this.lastPlaceAt.delete(client.sessionId);
    this.spawnWeaponId.delete(client.sessionId);
    this.accountIds.delete(client.sessionId);
    if (this.state.phase === MATCH_WAITING || this.state.phase === MATCH_COUNTDOWN) {
      this.refreshLobby();
    } else if (this.state.phase === MATCH_PLAYING) {
      this.checkWinner();
    }
  }

  /** Skip the lobby timer. Tests call this after every player has already joined. */
  forceStart(): void {
    if (this.state.phase === MATCH_PLAYING || this.state.phase === MATCH_ENDED) {
      return;
    }
    this.startMatch();
  }

  private step(ctx: StepContext): void {
    const now = ctx.tick * ctx.dtMs;
    this.simNow = now;
    if (this.state.phase === MATCH_ENDED) {
      return;
    }
    if (this.state.phase === MATCH_WAITING || this.state.phase === MATCH_COUNTDOWN) {
      this.drainInputs();
      this.tickLobby(now);
      return;
    }

    this.spawnDuePickups(now);
    this.respawnNodes(now);
    this.stepGrenades(ctx.dt, ctx.dtMs);
    this.stepHazards(now, ctx.dtMs);
    this.stepZone(now, ctx.dtMs);

    for (const [sessionId, player] of this.state.players) {
      if (this.state.phase !== MATCH_PLAYING) {
        break;
      }
      if (player.slowMs > 0) {
        player.slowMs = Math.max(0, player.slowMs - ctx.dtMs);
      }
      if (player.wardMs > 0) {
        player.wardMs = Math.max(0, player.wardMs - ctx.dtMs);
      }
      if (player.hasteMs > 0) {
        player.hasteMs = Math.max(0, player.hasteMs - ctx.dtMs);
      }

      const channel = this.inputs.get(sessionId);
      const command = channel.next();
      if (!player.alive) {
        continue;
      }
      if (command) {
        applyMovement(player, command, ctx.dt, this.liveMap(), PLAYER_RADIUS, playerMoveSpeed(player));

        if (command.gather && !channel.wasIdle && player.held === "arm") {
          this.tryGather(sessionId, player, now);
        }

        if (command.fire && !channel.wasIdle && player.held === "gun") {
          this.tryFire(sessionId, player, now);
        }
      }
      this.collectPickups(player, now);
    }
    this.stepBots(ctx.dt, ctx.dtMs, now);
  }

  private canAct(sessionId: string): boolean {
    if (this.state.phase !== MATCH_PLAYING) {
      return false;
    }
    const player = this.state.players.get(sessionId);
    return Boolean(player?.alive);
  }

  private drainInputs(): void {
    for (const [sessionId] of this.state.players) {
      this.inputs.get(sessionId)?.next();
    }
  }

  private refreshLobby(): void {
    if (this.state.phase === MATCH_PLAYING || this.state.phase === MATCH_ENDED) {
      return;
    }
    const count = this.state.players.size;
    this.state.aliveCount = count;
    if (count >= MIN_PLAYERS_TO_START) {
      if (this.state.phase !== MATCH_COUNTDOWN) {
        this.state.phase = MATCH_COUNTDOWN;
        this.countdownEndsAt = this.simNow + COUNTDOWN_MS;
      }
      this.state.countdownSec = Math.max(0, Math.ceil((this.countdownEndsAt - this.simNow) / 1000));
      return;
    }
    this.state.phase = MATCH_WAITING;
    this.state.countdownSec = 0;
    this.countdownEndsAt = 0;
  }

  private tickLobby(now: number): void {
    if (this.state.phase !== MATCH_COUNTDOWN) {
      return;
    }
    const remainingMs = this.countdownEndsAt - now;
    const sec = Math.max(0, Math.ceil(remainingMs / 1000));
    if (this.state.countdownSec !== sec) {
      this.state.countdownSec = sec;
    }
    if (remainingMs <= 0) {
      this.startMatch();
    }
  }

  private startMatch(): void {
    if (this.state.phase === MATCH_PLAYING || this.state.phase === MATCH_ENDED) {
      return;
    }
    void this.lock();
    this.state.phase = MATCH_PLAYING;
    this.state.countdownSec = 0;
    this.matchStartedAt = this.simNow;
    this.nextSmokeTick = this.simNow;
    this.startedPlayerCount = this.state.players.size;
    this.state.rosterSize = this.startedPlayerCount;
    this.state.aliveCount = this.startedPlayerCount;
    this.state.winnerId = "";
    this.state.winnerName = "";
    this.state.winnerKills = 0;
    this.state.matchTimeSec = 0;
    const spawns = pickUniqueSpawns(this.state.players.size);
    let index = 0;
    for (const player of this.state.players.values()) {
      const spawn = spawns[index] ?? pickSpawn(spawns);
      player.x = spawn.x;
      player.y = spawn.y;
      player.alive = true;
      player.hp = player.maxHp;
      player.placement = 0;
      player.killerName = "";
      index += 1;
    }
    this.syncZone(0);
  }

  private syncZone(elapsedMs: number): void {
    const snap = zoneAt(elapsedMs);
    this.state.zoneRadius = snap.radius;
    this.state.zonePhase = snap.phaseIndex;
    this.state.zoneShrinking = snap.shrinking;
    this.state.zoneNextSec = Math.ceil(snap.nextChangeMs / 1000);
  }

  private stepZone(now: number, _dtMs: number): void {
    const elapsed = now - this.matchStartedAt;
    this.syncZone(elapsed);
    const matchSec = Math.floor(elapsed / 1000);
    if (this.state.matchTimeSec !== matchSec) {
      this.state.matchTimeSec = matchSec;
    }
    if (now < this.nextSmokeTick) {
      return;
    }
    this.nextSmokeTick = now + SMOKE_TICK_MS;
    const snap = zoneAt(elapsed);
    if (snap.damage <= 0) {
      return;
    }
    for (const [sessionId, player] of this.state.players) {
      if (this.state.phase !== MATCH_PLAYING) {
        return;
      }
      if (!player.alive || !isInSmoke(player.x, player.y, snap.radius)) {
        continue;
      }
      player.hp = Math.max(0, player.hp - snap.damage);
      if (player.hp <= 0) {
        this.eliminate(sessionId, SMOKE_KILLER_ID);
      }
    }
    for (const [id, bot] of [...this.state.bots.entries()]) {
      if (!isInSmoke(bot.x, bot.y, snap.radius)) {
        continue;
      }
      bot.hp = Math.max(0, bot.hp - snap.damage);
      if (bot.hp <= 0) {
        this.removeBot(id);
      }
    }
  }

  private countAlive(): number {
    let count = 0;
    for (const player of this.state.players.values()) {
      if (player.alive) {
        count += 1;
      }
    }
    return count;
  }

  private checkWinner(): void {
    if (this.state.phase !== MATCH_PLAYING || this.startedPlayerCount < MIN_PLAYERS_TO_START) {
      return;
    }
    const alive: Array<{ id: string; player: Player }> = [];
    for (const [id, player] of this.state.players) {
      if (player.alive) {
        alive.push({ id, player });
      }
    }
    this.state.aliveCount = alive.length;
    if (alive.length > 1) {
      return;
    }
    this.state.phase = MATCH_ENDED;
    this.state.matchTimeSec = Math.max(0, Math.floor((this.simNow - this.matchStartedAt) / 1000));
    if (alive.length === 1) {
      const winner = alive[0]!;
      winner.player.placement = 1;
      this.state.winnerId = winner.id;
      this.state.winnerName = winner.player.name;
      this.state.winnerKills = winner.player.kills;
      this.broadcast("notice", `${winner.player.name} wins the match`);
      this.awardXp(winner.id, XP_PER_WIN);
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
    if (!player.alive) {
      return;
    }
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
    if (recipe.id === "hire-bot") {
      this.hireBot(sessionId, player);
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

    if (recipe.weaponId) {
      const weapon = getWeapon(recipe.weaponId);
      if (weapon.source !== "craft" || weapon.id !== recipe.weaponId) {
        return;
      }
      payCost(player.inventory, recipe.cost);
      this.equipWeapon(player, weapon.id);
      this.clients.get(sessionId)?.send("notice", `Crafted ${recipe.name}`);
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

    if (!isStackedCraft(recipe.id)) {
      return;
    }
    player.inventory[recipe.id] += 1;
    this.clients.get(sessionId)?.send("notice", `Crafted ${recipe.name}`);
  }

  private tryUse(sessionId: string, itemId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player || !isUseItem(itemId)) {
      return;
    }

    if (player.inventory[itemId] <= 0) {
      const empty = itemId === "bandage" ? "No bandages" : `No ${getRecipe(itemId)?.name ?? "item"}`;
      this.clients.get(sessionId)?.send("notice", empty);
      return;
    }
    if (itemId === "bandage" && player.hp >= player.maxHp) {
      this.clients.get(sessionId)?.send("notice", "Already at full health");
      return;
    }

    player.inventory[itemId] -= 1;
    if (itemId === "bandage") {
      player.hp = Math.min(player.maxHp, player.hp + BANDAGE_HEAL);
      this.clients.get(sessionId)?.send("notice", `Healed ${BANDAGE_HEAL} HP`);
      return;
    }
    if (itemId === "bastion") {
      player.wardMs = BASTION_MS;
      this.clients.get(sessionId)?.send("notice", "Bastion Potion is protecting you");
      return;
    }
    if (itemId === "gale") {
      player.hasteMs = GALE_MS;
      this.clients.get(sessionId)?.send("notice", "Gale Potion is speeding you up");
      return;
    }
    pushForward(player, RAMSPIKE_DISTANCE);
    this.clients.get(sessionId)?.send("notice", "Ramspike launched you");
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
      if (isBlocked(nextX, nextY, GRENADE_RADIUS, this.liveMap())) {
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

  private explode(grenade: ThrownGrenade): void {
    if (grenade.kind === GRENADE_KIND.frag) {
      this.damageRadius(grenade.x, grenade.y, FRAG_RADIUS, FRAG_DAMAGE, true, grenade.ownerId);
      this.emitBlast(grenade.x, grenade.y, FRAG_RADIUS, grenade.kind);
      return;
    }

    if (grenade.kind === GRENADE_KIND.flash) {
      for (const player of this.state.players.values()) {
        if (!player.alive) {
          continue;
        }
        if (Math.hypot(player.x - grenade.x, player.y - grenade.y) <= FLASH_RADIUS) {
          player.slowMs = Math.max(player.slowMs, FLASH_SLOW_MS);
        }
      }
      for (const bot of this.state.bots.values()) {
        if (Math.hypot(bot.x - grenade.x, bot.y - grenade.y) <= FLASH_RADIUS) {
          bot.slowMs = Math.max(bot.slowMs, FLASH_SLOW_MS);
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
    if (grenade.ownerId) {
      this.hazardOwners.set(id, grenade.ownerId);
    }
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
        this.damageRadius(hazard.x, hazard.y, hazard.radius, FIRE_DAMAGE, false, this.hazardOwners.get(id));
        this.hazardTickAt.set(id, now + FIRE_TICK_MS);
      }
      if (hazard.ttlMs <= 0) {
        this.state.hazards.delete(id);
        this.hazardTickAt.delete(id);
        this.hazardOwners.delete(id);
      }
    }
  }

  private damageRadius(x: number, y: number, radius: number, damage: number, falloff: boolean, ownerId?: string): void {
    for (const [sessionId, player] of this.state.players) {
      if (this.state.phase !== MATCH_PLAYING) {
        return;
      }
      if (!player.alive) {
        continue;
      }
      const distance = Math.hypot(player.x - x, player.y - y);
      const amount = falloff ? blastDamage(distance, radius, damage) : distance <= radius ? damage : 0;
      if (amount <= 0) {
        continue;
      }
      applyDamage(player, amount);
      if (player.hp <= 0) {
        this.eliminate(sessionId, ownerId);
      }
    }
    this.damageWalls(x, y, radius, damage, falloff);
    for (const [id, bot] of [...this.state.bots.entries()]) {
      if (this.state.phase !== MATCH_PLAYING) {
        return;
      }
      const distance = Math.hypot(bot.x - x, bot.y - y);
      const amount = falloff ? blastDamage(distance, radius, damage) : distance <= radius ? damage : 0;
      this.damageBot(id, amount);
    }
  }

  private emitBlast(x: number, y: number, radius: number, kind: number): void {
    const event: BlastEvent = { x, y, radius, kind };
    this.broadcast("blast", event);
  }

  private tryFire(sessionId: string, player: Player, now: number): void {
    if (this.state.phase !== MATCH_PLAYING || !player.alive) {
      return;
    }
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
      this.liveMap(),
      weapon.range,
      sessionId,
    );

    if (result.kind === "obstacle" && result.id) {
      this.hurtWall(result.id, weapon.damage);
    }

    if (result.kind === "player" && result.id) {
      const target = this.state.players.get(result.id);
      if (target) {
        applyDamage(target, weapon.damage);
        if (target.hp <= 0 && result.id) {
          this.eliminate(result.id, sessionId);
        }
      } else {
        this.damageBot(result.id, weapon.damage);
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
      this.equipWeapon(player, weapon.id);
    }

    this.state.pickups.delete(closestId);
    this.slotByPickupId.delete(closestId);
    if (slot !== undefined) {
      this.occupiedSlots.delete(slot);
      this.pendingRespawns.push({ slot, at: now + PICKUP_RESPAWN_MS });
    }
  }

  private tryPlaceWall(sessionId: string, requested: string): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive || player.held !== "wall") {
      return;
    }

    const last = this.lastPlaceAt.get(sessionId) ?? Number.NEGATIVE_INFINITY;
    if (this.simNow - last < WALL_PLACE_COOLDOWN_MS) {
      return;
    }

    const owned = [...this.state.walls.values()].filter((wall) => wall.ownerId === sessionId).length;
    if (owned >= WALL_MAX_PER_PLAYER) {
      this.clients.get(sessionId)?.send("notice", "Break a wall before placing another");
      return;
    }

    const payment = chooseWallPayment(player.inventory, requested);
    if (!payment) {
      this.clients.get(sessionId)?.send("notice", `Need ${wallCostLabel()}`);
      return;
    }

    const rect = wallRectForAim(player.x, player.y, player.angle);
    const bodies = [
      ...[...this.state.players.values()].filter((other) => other.alive),
      ...this.state.bots.values(),
    ].map((body) => ({ x: body.x, y: body.y }));
    const blocked = wallPlacementBlock(
      rect,
      GAME_MAP,
      bodies,
      [...this.state.walls.values()],
    );
    if (blocked) {
      this.clients.get(sessionId)?.send("notice", blocked);
      return;
    }

    payCost(player.inventory, payment.cost);
    this.lastPlaceAt.set(sessionId, this.simNow);

    const wall = new PlacedWall();
    wall.x = rect.x;
    wall.y = rect.y;
    wall.width = rect.width;
    wall.height = rect.height;
    wall.hp = WALL_HP;
    wall.maxHp = WALL_HP;
    wall.material = payment.material;
    wall.ownerId = sessionId;
    this.state.walls.set(`w${this.wallSeq}`, wall);
    this.wallSeq += 1;
    this.clients.get(sessionId)?.send("notice", "Wall placed");
  }

  private liveMap() {
    const walls = [];
    for (const [id, wall] of this.state.walls) {
      walls.push({ id, x: wall.x, y: wall.y, width: wall.width, height: wall.height });
    }
    return mapWithWalls(walls);
  }

  private hurtWall(id: string, amount: number): void {
    const wall = this.state.walls.get(id);
    if (!wall || amount <= 0) {
      return;
    }
    wall.hp = Math.max(0, wall.hp - amount);
    if (wall.hp <= 0) {
      this.state.walls.delete(id);
    }
  }

  private damageWalls(x: number, y: number, radius: number, damage: number, falloff: boolean): void {
    for (const [id, wall] of [...this.state.walls.entries()]) {
      const closestX = clamp(x, wall.x, wall.x + wall.width);
      const closestY = clamp(y, wall.y, wall.y + wall.height);
      const distance = Math.hypot(x - closestX, y - closestY);
      const amount = falloff ? blastDamage(distance, radius, damage) : distance <= radius ? damage : 0;
      this.hurtWall(id, amount);
    }
  }

  private hireBot(sessionId: string, player: Player): void {
    const recipe = getRecipe("hire-bot");
    if (!recipe) {
      return;
    }
    if (this.countBots(sessionId) >= MAX_HIRED_BOTS) {
      this.clients.get(sessionId)?.send("notice", `You can only hire ${MAX_HIRED_BOTS} bots`);
      return;
    }
    if (!canAfford(player.inventory, recipe.cost)) {
      this.clients.get(sessionId)?.send("notice", `Need ${formatCost(recipe.cost)}`);
      return;
    }

    payCost(player.inventory, recipe.cost);
    const bot = new Bot();
    const slot = this.countBots(sessionId);
    const angle = slot * 1.2 + Math.PI / 2;
    const dist = PLAYER_RADIUS + BOT_RADIUS + 10;
    const spot = resolveCollisions(player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist, BOT_RADIUS, this.liveMap());
    bot.x = spot.x;
    bot.y = spot.y;
    bot.hp = BOT_MAX_HP;
    bot.maxHp = BOT_MAX_HP;
    bot.ownerId = sessionId;
    bot.color = BOT_COLOR;
    this.state.bots.set(`bot-${this.botSeq}`, bot);
    this.botSeq += 1;
    this.clients.get(sessionId)?.send("notice", "Hired a bot");
  }

  private countBots(ownerId: string): number {
    let count = 0;
    for (const bot of this.state.bots.values()) {
      if (bot.ownerId === ownerId) {
        count += 1;
      }
    }
    return count;
  }

  private removeBot(id: string): void {
    this.state.bots.delete(id);
    this.lastFireAt.delete(id);
  }

  private damageBot(id: string, amount: number): void {
    const bot = this.state.bots.get(id);
    if (!bot || amount <= 0) {
      return;
    }
    applyDamage(bot, amount);
    if (bot.hp <= 0) {
      this.removeBot(id);
    }
  }

  private stepBots(dt: number, dtMs: number, now: number): void {
    for (const [id, bot] of this.state.bots) {
      if (this.state.phase !== MATCH_PLAYING) {
        return;
      }
      if (bot.slowMs > 0) {
        bot.slowMs = Math.max(0, bot.slowMs - dtMs);
      }
      const target = this.nearestEnemy(bot);
      if (!target) {
        continue;
      }
      const distance = Math.hypot(target.x - bot.x, target.y - bot.y);
      const aim = Math.atan2(target.y - bot.y, target.x - bot.x);
      const keep = PLAYER_RADIUS + BOT_RADIUS + 16;
      const speed = bot.slowMs > 0 ? BOT_SPEED * SLOW_SPEED_FACTOR : BOT_SPEED;
      const world = this.liveMap();
      const steer = distance > keep
        ? nextWaypoint(bot.x, bot.y, target.x, target.y, BOT_RADIUS, world)
        : { x: target.x, y: target.y };
      const dx = steer.x - bot.x;
      const dy = steer.y - bot.y;
      const steerDistance = Math.hypot(dx, dy);
      if (distance > keep && steerDistance > 1) {
        const step = Math.min(speed * dt, steerDistance);
        const spot = resolveCollisions(bot.x + (dx / steerDistance) * step, bot.y + (dy / steerDistance) * step, BOT_RADIUS, world);
        bot.x = spot.x;
        bot.y = spot.y;
      }
      bot.angle = wrapAngle(aim);
      if (distance <= BOT_RANGE) {
        this.botFire(id, bot, now);
      }
    }
  }

  private nearestEnemy(bot: Bot): Player | undefined {
    let best: Player | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [sessionId, player] of this.state.players) {
      if (sessionId === bot.ownerId || !player.alive) {
        continue;
      }
      const distance = Math.hypot(player.x - bot.x, player.y - bot.y);
      if (distance < bestDistance) {
        best = player;
        bestDistance = distance;
      }
    }
    return best;
  }

  private botFire(id: string, bot: Bot, now: number): void {
    if (this.state.phase !== MATCH_PLAYING) {
      return;
    }
    const last = this.lastFireAt.get(id) ?? Number.NEGATIVE_INFINITY;
    if (now - last < BOT_FIRE_COOLDOWN_MS) {
      return;
    }
    this.lastFireAt.set(id, now);

    const world = this.liveMap();
    const origin = muzzleOrigin(bot.x, bot.y, bot.angle, BOT_RADIUS + 6);
    const targets = [...this.state.players.entries()]
      .filter(([sessionId, player]) => sessionId !== bot.ownerId && player.alive)
      .map(([sessionId, player]) => ({ id: sessionId, x: player.x, y: player.y }));
    const result = castHitscan(origin.x, origin.y, bot.angle, targets, world, BOT_RANGE, id);
    if (result.kind === "obstacle" && result.id) {
      this.hurtWall(result.id, BOT_DAMAGE);
    }
    if (result.kind === "player" && result.id) {
      const target = this.state.players.get(result.id);
      if (target) {
        applyDamage(target, BOT_DAMAGE);
        if (target.hp <= 0) {
          this.eliminate(result.id, bot.ownerId);
        }
      }
    }

    const event: ShotEvent = {
      shooterId: id,
      fromX: origin.x,
      fromY: origin.y,
      toX: result.x,
      toY: result.y,
      hitId: result.kind === "player" ? result.id : undefined,
      weaponId: STARTER_WEAPON_ID,
    };
    this.broadcast("shot", event);
  }

  private botTargets(): Array<{ id: string; x: number; y: number; radius: number }> {
    return [...this.state.bots.entries()].map(([id, bot]) => ({
      id,
      x: bot.x,
      y: bot.y,
      radius: BOT_RADIUS,
    }));
  }

  private targetsSeenBy(sessionId: string): Array<{ id: string; x: number; y: number; radius?: number }> {
    const players = [...this.state.players.entries()].filter(([id, player]) => id !== sessionId && player.alive);
    const bodies = players.map(([id, other]) => ({ id, other }));
    // Test steps skip the wall clock, so the lag-comp history still has old positions.
    let seenPlayers: Array<{ id: string; x: number; y: number }>;
    if (this.manualTime) {
      seenPlayers = bodies.map(({ id, other }) => ({ id, x: other.x, y: other.y }));
    } else {
      try {
        const seen = this.rewind.lastSeenBy(sessionId);
        seenPlayers = bodies.map(({ id, other }) => {
          const pose = seen.read(other, ["x", "y"]);
          return { id, x: pose.x, y: pose.y };
        });
      } catch {
        seenPlayers = bodies.map(({ id, other }) => ({ id, x: other.x, y: other.y }));
      }
    }
    return [...seenPlayers, ...this.botTargets()];
  }

  private eliminate(victimId: string, killerId?: string): void {
    if (this.state.phase !== MATCH_PLAYING) {
      return;
    }
    const victim = this.state.players.get(victimId);
    if (!victim || !victim.alive) {
      return;
    }
    victim.alive = false;
    victim.hp = 0;
    victim.placement = this.countAlive() + 1;
    victim.slowMs = 0;
    victim.wardMs = 0;
    victim.hasteMs = 0;
    for (const id of [...this.state.bots.keys()]) {
      if (this.state.bots.get(id)?.ownerId === victimId) {
        this.removeBot(id);
      }
    }

    if (killerId === SMOKE_KILLER_ID) {
      victim.killerName = SMOKE_KILLER_NAME;
      this.broadcast("notice", `${victim.name} was claimed by the smoke`);
    } else {
      const creditedKiller = killerId && killerId !== victimId ? killerId : undefined;
      const killer = creditedKiller ? this.state.players.get(creditedKiller) : undefined;
      if (killer && creditedKiller) {
        killer.kills += 1;
        victim.killerName = killer.name;
        this.broadcast("notice", `${killer.name} downed ${victim.name}`);
        this.awardXp(creditedKiller, XP_PER_KILL);
      } else {
        victim.killerName = "";
      }
    }

    this.state.aliveCount = this.countAlive();
    this.checkWinner();
  }

  private equipWeapon(player: Player, weaponId: string): void {
    const weapon = getWeapon(weaponId);
    player.weaponId = weapon.id;
    player.damage = weapon.damage;
  }

  private awardXp(sessionId: string, amount: number): void {
    const accountId = this.accountIds.get(sessionId);
    if (!accountId) {
      return;
    }
    void addAccountXp(accountId, amount).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Could not save account XP: ${message}`);
    });
  }

  private readAccount(client: Client): { id: string; level: number } | undefined {
    const auth = client.auth;
    if (typeof auth !== "object" || auth === null || !("id" in auth) || typeof auth.id !== "string") {
      return undefined;
    }
    const level = "level" in auth && typeof auth.level === "number" ? auth.level : 0;
    return { id: auth.id, level };
  }
}
