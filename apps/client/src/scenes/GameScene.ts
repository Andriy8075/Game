import { Callbacks, Predict } from "@colyseus/sdk";
import Phaser from "phaser";
import {
  DEFAULT_PLAYER_NAME,
  GAME_MAP,
  HARVEST,
  HELD_SLOTS,
  INTERP_DELAY_MS,
  MoveInput,
  PLAYER_RADIUS,
  STARTER_WEAPON_ID,
  applyMovement,
  chooseWallPayment,
  playerMoveSpeed,
  cycleHeld,
  formatWeaponStats,
  getWeapon,
  isGrenadeSlot,
  isHeldSlot,
  mapWithWalls,
  nearestHarvestable,
  wallCostLabel,
  wallRectForAim,
  sanitizePlayerName,
  type BlastEvent,
  type GatherEvent,
  type HeldSlot,
  type ShotEvent,
  type StackCounts,
} from "@io-game/shared";
import { ActorsView } from "../entities/ActorsView";
import { PickupView } from "../entities/PickupView";
import { PlayerView } from "../entities/PlayerView";
import { drawWorld } from "../entities/WorldView";
import { connectToGame, type GameRoom } from "../network/GameClient";
import { CraftMenu, type CraftAction } from "../ui/CraftMenu";
import { Hud } from "../ui/Hud";
import { WeaponMenu } from "../ui/WeaponMenu";

type SyncedInventory = StackCounts;

type SyncedPlayer = {
  x: number;
  y: number;
  angle: number;
  color: number;
  name: string;
  hp: number;
  maxHp: number;
  damage: number;
  weaponId: string;
  armor: number;
  maxArmor: number;
  slowMs: number;
  wardMs: number;
  hasteMs: number;
  held: string;
  craftedLight: boolean;
  craftedHeavy: boolean;
  kills: number;
  deaths: number;
  inventory: SyncedInventory;
};

type SyncedPickup = {
  weaponId: string;
  x: number;
  y: number;
};

type SyncedBot = {
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  slowMs: number;
  ownerId: string;
  color: number;
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
  C: Phaser.Input.Keyboard.Key;
  H: Phaser.Input.Keyboard.Key;
};

const EMPTY_INVENTORY: StackCounts = {
  wood: 0,
  stone: 0,
  iron: 0,
  gold: 0,
  frag: 0,
  flash: 0,
  incendiary: 0,
  bandage: 0,
  bastion: 0,
  gale: 0,
  ramspike: 0,
  lightArmor: 0,
  heavyArmor: 0,
};

export class GameScene extends Phaser.Scene {
  private room?: GameRoom;
  private predict?: ReturnType<typeof Predict.get>;
  private inputHandle?: ReturnType<GameRoom["input"]>;
  private keys?: KeyMap;
  private hud!: Hud;
  private weaponMenu!: WeaponMenu;
  private craftMenu!: CraftMenu;
  private slotKeys: Phaser.Input.Keyboard.Key[] = [];
  private actors!: ActorsView;
  private held: HeldSlot = "gun";
  private playerName = DEFAULT_PLAYER_NAME;
  private weaponId: string = STARTER_WEAPON_ID;
  private matchEnded = false;
  private pendingFire = false;
  private holdingFire = false;
  private pendingGather = false;
  private readonly views = new Map<string, PlayerView>();
  private readonly botViews = new Map<string, PlayerView>();
  private readonly pickups = new Map<string, PickupView>();

  constructor() {
    super("game");
  }

  create(): void {
    this.playerName = sanitizePlayerName(this.registry.get("playerName"));
    const chosenWeapon = this.registry.get("weaponId");
    this.weaponId = typeof chosenWeapon === "string" ? chosenWeapon : STARTER_WEAPON_ID;
    drawWorld(this);
    this.actors = new ActorsView(this);
    this.hud = new Hud(this);
    this.weaponMenu = new WeaponMenu(this, this.weaponId);
    this.craftMenu = new CraftMenu(this, (action) => this.sendAction(action));
    const keyboard = this.input.keyboard!;
    this.keys = keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
      UP: Phaser.Input.Keyboard.KeyCodes.UP,
      LEFT: Phaser.Input.Keyboard.KeyCodes.LEFT,
      DOWN: Phaser.Input.Keyboard.KeyCodes.DOWN,
      RIGHT: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      C: Phaser.Input.Keyboard.KeyCodes.C,
      H: Phaser.Input.Keyboard.KeyCodes.H,
    }) as KeyMap;
    const digitCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
      Phaser.Input.Keyboard.KeyCodes.SEVEN,
      Phaser.Input.Keyboard.KeyCodes.EIGHT,
      Phaser.Input.Keyboard.KeyCodes.NINE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_FIVE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_SIX,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_SEVEN,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_EIGHT,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_NINE,
    ];
    this.slotKeys = digitCodes.map((code) => keyboard.addKey(code));

    this.scale.on("resize", (size: Phaser.Structs.Size) => {
      this.hud.layout(size.width);
      this.weaponMenu.layout(size.width, size.height);
      this.craftMenu.layout(size.width, size.height);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.holdingFire = false;
      if (this.matchEnded) {
        return;
      }
      if (this.hud.hitsCraftButton(pointer.x, pointer.y)) {
        this.craftMenu.toggle();
        return;
      }
      const slot = this.weaponMenu.hitSlot(pointer.x, pointer.y);
      if (slot) {
        this.selectHeld(slot);
        return;
      }
      if (this.craftMenu.handlePointer(pointer.x, pointer.y)) {
        return;
      }
      if (pointer.leftButtonDown()) {
        this.holdingFire = true;
        this.useHeld();
      }
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) {
        this.holdingFire = false;
      }
    });
    this.input.on("pointerupoutside", () => {
      this.holdingFire = false;
    });

    this.input.on("wheel", (pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      if (this.matchEnded || deltaY === 0) {
        return;
      }
      if (this.craftMenu.handleWheel(pointer.x, pointer.y, deltaY)) {
        return;
      }
      this.selectHeld(cycleHeld(this.held, deltaY > 0 ? 1 : -1));
    });

    void this.connect();
  }

  update(time: number): void {
    if (!this.room || !this.predict || !this.inputHandle || !this.keys) {
      this.actors.syncNodes(undefined);
      return;
    }

    const match = this.room.state as { matchOver?: boolean; winnerName?: string };
    if (match.matchOver) {
      this.matchEnded = true;
      const winner = match.winnerName && match.winnerName.length > 0 ? match.winnerName : "Someone";
      this.hud.showResult(`${winner} wins`, () => this.leaveMatch());
    }

    if (!this.matchEnded) {
      this.readHotkeys();
    }

    const aim = this.readAim();
    const move = this.readMove();
    const pointer = this.input.activePointer;
    if (!pointer.leftButtonDown()) {
      this.holdingFire = false;
    }
    const overCraftUi = this.craftMenu.contains(pointer.x, pointer.y) || this.hud.hitsCraftButton(pointer.x, pointer.y);
    const gather = !this.matchEnded && this.held === "arm" && (this.pendingGather || (pointer.leftButtonDown() && !overCraftUi));
    const steps = this.predict.tick(time);

    for (let i = 0; i < steps; i += 1) {
      const data = this.inputHandle.data as {
        moveX: number;
        moveY: number;
        aimAngle: number;
        fire: boolean;
        gather: boolean;
      };
      data.moveX = this.matchEnded ? 0 : move.x;
      data.moveY = this.matchEnded ? 0 : move.y;
      data.aimAngle = aim;
      data.fire = !this.matchEnded && this.held === "gun" && (this.holdingFire || this.pendingFire);
      data.gather = this.matchEnded ? false : gather;
      this.inputHandle.send();
      this.pendingFire = false;
      this.pendingGather = false;
    }

    const state = this.room.state as {
      players: Map<string, SyncedPlayer>;
      nodes: Map<string, { remaining: number }>;
      grenades: Map<string, { x: number; y: number; kind: number }>;
      hazards: Map<string, { x: number; y: number; radius: number; kind: number }>;
      walls: Map<string, { x: number; y: number; width: number; height: number; hp: number; maxHp: number; material: string }>;
      bots: Map<string, SyncedBot>;
    };
    this.hud.setScoreboard([...state.players.values()].map((player) => ({
      name: sanitizePlayerName(player.name),
      kills: player.kills ?? 0,
      deaths: player.deaths ?? 0,
    })));
    this.actors.syncNodes(state.nodes);
    this.actors.syncGrenades(state.grenades);
    this.actors.syncHazards(state.hazards);
    this.actors.syncWalls(state.walls);
    this.syncBots(state.bots);

    for (const [sessionId, player] of state.players) {
      const view = this.views.get(sessionId);
      if (!view) {
        continue;
      }

      const x = this.readField(player, "x");
      const y = this.readField(player, "y");
      const angle = sessionId === this.room.sessionId ? aim : player.angle;
      view.setPose(x, y, angle);
      view.setHealth(player.hp, player.maxHp);
      view.setName(sanitizePlayerName(player.name));
      view.setWeapon(player.weaponId);
      view.setArmor(player.armor, player.maxArmor);
      view.setBuffs(player.slowMs > 0, (player.wardMs ?? 0) > 0, (player.hasteMs ?? 0) > 0);
      const syncedHeld = isHeldSlot(player.held) ? player.held : "gun";
      view.setHeld(sessionId === this.room.sessionId ? this.held : syncedHeld);

      if (sessionId === this.room.sessionId) {
        this.cameras.main.centerOn(x, y);
        const inventory = player.inventory ?? EMPTY_INVENTORY;
        const weapon = getWeapon(player.weaponId);
        this.hud.setHeld(this.held, this.held === "gun" ? formatWeaponStats(weapon) : "");
        this.weaponMenu.setGun(weapon.id);
        this.weaponMenu.setSelected(this.held);
        this.weaponMenu.setArmor(
          player.craftedHeavy ? "Heavy" : player.craftedLight ? "Light" : "None",
          player.armor,
          player.maxArmor,
        );
        this.hud.setVitals(player.hp, player.maxHp, player.armor, player.maxArmor, player.damage, player.wardMs ?? 0, player.hasteMs ?? 0);
        this.hud.setInventory(inventory);
        const hired = [...state.bots.values()].filter((bot) => bot.ownerId === sessionId).length;
        this.craftMenu.refresh(inventory, {
          craftedLight: player.craftedLight,
          craftedHeavy: player.craftedHeavy,
        }, player.weaponId, hired);
        const near = nearestHarvestable(x, y, (id) => state.nodes.get(id)?.remaining ?? 0);
        const armKey = HELD_SLOTS.indexOf("arm") + 1;
        const payment = chooseWallPayment(inventory);
        if (this.held === "wall") {
          this.actors.showWallPreview(wallRectForAim(x, y, aim), payment?.material ?? "wood", payment !== undefined);
          this.hud.setPrompt(payment
            ? `Click to place a ${payment.material} barricade`
            : `Need ${wallCostLabel()}`);
        } else {
          this.actors.showWallPreview(undefined);
          this.hud.setPrompt(near
            ? this.held === "arm"
              ? `Click to gather ${HARVEST[near.kind].label}`
              : `Select Arm (${armKey}) to gather ${HARVEST[near.kind].label}`
            : "");
        }
      }
    }
  }

  private readHotkeys(): void {
    const keys = this.keys;
    if (!keys || !this.room) {
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(keys.C)) {
      this.craftMenu.toggle();
    }
    for (let index = 0; index < this.slotKeys.length; index += 1) {
      const key = this.slotKeys[index];
      const slot = HELD_SLOTS[index % HELD_SLOTS.length];
      if (key && slot && Phaser.Input.Keyboard.JustDown(key)) {
        this.selectHeld(slot);
      }
    }
    if (Phaser.Input.Keyboard.JustDown(keys.H)) {
      this.room.send("use", "bandage");
    }
  }

  private sendAction(action: CraftAction): void {
    if (!this.room) {
      return;
    }
    if (action.type === "craft") {
      this.room.send("craft", action.recipe);
      return;
    }
    if (action.type === "use") {
      this.room.send("use", action.item);
      return;
    }
    this.selectHeld(action.item);
  }

  private selectHeld(slot: HeldSlot): void {
    this.held = slot;
    this.hud.setHeld(slot);
    this.weaponMenu.setSelected(slot);
    if (this.room) {
      this.views.get(this.room.sessionId)?.setHeld(slot);
      this.room.send("hold", slot);
    }
  }

  private useHeld(): void {
    if (!this.room) {
      return;
    }
    if (this.held === "gun") {
      this.pendingFire = true;
      return;
    }
    if (this.held === "arm") {
      this.pendingGather = true;
      return;
    }
    if (isGrenadeSlot(this.held)) {
      this.room.send("throw", this.held);
      return;
    }
    if (this.held === "wall") {
      this.room.send("place-wall", "auto");
      return;
    }
    this.room.send("use", this.held);
  }

  private async connect(): Promise<void> {
    try {
      this.room = await connectToGame(this.playerName, this.weaponId);
      this.hud.setStatus("Connected");
      this.bindRoom(this.room);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect";
      this.hud.setStatus(message);
    }
  }

  private leaveMatch(): void {
    const leave = this.registry.get("onLeaveMatch");
    if (typeof leave === "function") {
      leave();
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

    const pickups = room.state.pickups as Map<string, SyncedPickup>;
    callbacks.onAdd("pickups", (pickup, id) => {
      const synced = pickup as SyncedPickup;
      this.spawnPickup(String(id), synced.weaponId, synced.x, synced.y);
    });
    callbacks.onRemove("pickups", (_pickup, id) => {
      const key = String(id);
      this.pickups.get(key)?.destroy();
      this.pickups.delete(key);
    });
    for (const [id, pickup] of pickups) {
      this.spawnPickup(String(id), pickup.weaponId, pickup.x, pickup.y);
    }

    room.onMessage("shot", (event: ShotEvent) => {
      this.drawTracer(event);
      if (event.hitId) {
        this.views.get(event.hitId)?.flashHit();
        this.botViews.get(event.hitId)?.flashHit();
      }
    });
    room.onMessage("gathered", (event: GatherEvent) => {
      this.views.get(event.playerId)?.swingMine();
      if (event.playerId === room.sessionId) {
        this.actors.popup(event.x, event.y, `+${event.amount} ${event.resource}`);
      }
    });
    room.onMessage("blast", (event: BlastEvent) => {
      this.actors.blast(event);
    });
    room.onMessage("notice", (text: string) => {
      if (typeof text === "string") {
        this.hud.showNotice(text);
      }
    });

    room.onLeave((code) => {
      this.hud.setStatus(`Disconnected (${code})`);
    });
    room.onDrop(() => this.hud.setStatus("Reconnecting..."));
    room.onReconnect(() => this.hud.setStatus("Connected"));
  }

  private worldForMovement() {
    const walls = (this.room?.state as {
      walls?: Map<string, { x: number; y: number; width: number; height: number }>;
    } | undefined)?.walls;
    if (!walls) {
      return GAME_MAP;
    }
    const placed = [];
    for (const [id, wall] of walls) {
      placed.push({ id, x: wall.x, y: wall.y, width: wall.width, height: wall.height });
    }
    return mapWithWalls(placed);
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
        applyMovement(state, command as { moveX: number; moveY: number; aimAngle: number }, ctx.dt, this.worldForMovement(), PLAYER_RADIUS, playerMoveSpeed(player));
      },
    });
  }

  private spawnPickup(id: string, weaponId: string, x: number, y: number): void {
    if (this.pickups.has(id)) {
      return;
    }
    this.pickups.set(id, new PickupView(this, weaponId, x, y));
  }

  private syncBots(bots: Map<string, SyncedBot> | undefined): void {
    const seen = new Set<string>();
    if (bots) {
      for (const [id, bot] of bots) {
        seen.add(id);
        let view = this.botViews.get(id);
        if (!view) {
          view = new PlayerView(this, bot.color, bot.x, bot.y, "Bot", STARTER_WEAPON_ID);
          view.root.setScale(0.7);
          this.botViews.set(id, view);
        }
        view.setPose(bot.x, bot.y, bot.angle);
        view.setHealth(bot.hp, bot.maxHp);
        view.setBuffs(bot.slowMs > 0, false, false);
      }
    }
    for (const [id, view] of this.botViews) {
      if (!seen.has(id)) {
        view.destroy();
        this.botViews.delete(id);
      }
    }
  }

  private spawnView(sessionId: string, player: SyncedPlayer): void {
    if (this.views.has(sessionId)) {
      return;
    }
    const view = new PlayerView(
      this,
      player.color,
      player.x,
      player.y,
      sanitizePlayerName(player.name),
      player.weaponId,
    );
    view.setHealth(player.hp, player.maxHp);
    view.setArmor(player.armor, player.maxArmor);
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
    graphics.lineStyle(2, getWeapon(event.weaponId).color, 1);
    graphics.lineBetween(event.fromX, event.fromY, event.toX, event.toY);
    graphics.setDepth(20);
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 180,
      onComplete: () => graphics.destroy(),
    });
  }
}
