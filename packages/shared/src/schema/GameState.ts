import { schema, t, type SchemaType } from "@colyseus/schema";
import { BOT_COLOR, BOT_MAX_HP, DEFAULT_PLAYER_NAME, PLAYER_DAMAGE, PLAYER_MAX_HP } from "../constants";
import { STARTER_WEAPON_ID } from "../weapons/catalog";

export const Inventory = schema({
  wood: t.number().default(0),
  stone: t.number().default(0),
  iron: t.number().default(0),
  gold: t.number().default(0),
  frag: t.number().default(0),
  flash: t.number().default(0),
  incendiary: t.number().default(0),
  bandage: t.number().default(0),
  bastion: t.number().default(0),
  gale: t.number().default(0),
  ramspike: t.number().default(0),
  lightArmor: t.number().default(0),
  heavyArmor: t.number().default(0),
}, "Inventory");

export type Inventory = SchemaType<typeof Inventory>;

export const Player = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  angle: t.number().default(0),
  color: t.number().default(0x4fc3f7),
  name: t.string().default(DEFAULT_PLAYER_NAME),
  hp: t.number().default(PLAYER_MAX_HP),
  maxHp: t.number().default(PLAYER_MAX_HP),
  damage: t.number().default(PLAYER_DAMAGE),
  weaponId: t.string().default(STARTER_WEAPON_ID),
  armor: t.number().default(0),
  maxArmor: t.number().default(0),
  slowMs: t.number().default(0),
  wardMs: t.number().default(0),
  hasteMs: t.number().default(0),
  held: t.string().default("gun"),
  craftedLight: t.boolean().default(false),
  craftedHeavy: t.boolean().default(false),
  kills: t.number().default(0),
  alive: t.boolean().default(true),
  placement: t.number().default(0),
  killerName: t.string().default(""),
  inventory: t.ref(Inventory),
}, "Player");

export type Player = SchemaType<typeof Player>;

export const WeaponPickup = schema({
  weaponId: t.string(),
  x: t.number().default(0),
  y: t.number().default(0),
}, "WeaponPickup");

export type WeaponPickup = SchemaType<typeof WeaponPickup>;

export const NodeState = schema({
  remaining: t.number().default(0),
}, "NodeState");

export type NodeState = SchemaType<typeof NodeState>;

export const ThrownGrenade = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  vx: t.number().default(0),
  vy: t.number().default(0),
  kind: t.number().default(0),
  fuseMs: t.number().default(0),
  ownerId: t.string().default(""),
}, "ThrownGrenade");

export type ThrownGrenade = SchemaType<typeof ThrownGrenade>;

export const HazardZone = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  radius: t.number().default(0),
  kind: t.number().default(0),
  ttlMs: t.number().default(0),
}, "HazardZone");

export type HazardZone = SchemaType<typeof HazardZone>;

export const PlacedWall = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  width: t.number().default(0),
  height: t.number().default(0),
  hp: t.number().default(0),
  maxHp: t.number().default(0),
  material: t.string().default("wood"),
  ownerId: t.string().default(""),
}, "PlacedWall");

export type PlacedWall = SchemaType<typeof PlacedWall>;

export const Bot = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  angle: t.number().default(0),
  hp: t.number().default(BOT_MAX_HP),
  maxHp: t.number().default(BOT_MAX_HP),
  armor: t.number().default(0),
  slowMs: t.number().default(0),
  ownerId: t.string().default(""),
  color: t.number().default(BOT_COLOR),
}, "Bot");

export type Bot = SchemaType<typeof Bot>;

export const GameState = schema({
  players: t.map(Player),
  pickups: t.map(WeaponPickup),
  nodes: t.map(NodeState),
  grenades: t.map(ThrownGrenade),
  hazards: t.map(HazardZone),
  walls: t.map(PlacedWall),
  bots: t.map(Bot),
  phase: t.string().default("waiting"),
  countdownSec: t.number().default(0),
  aliveCount: t.number().default(0),
  rosterSize: t.number().default(0),
  winnerId: t.string().default(""),
  winnerName: t.string().default(""),
  winnerKills: t.number().default(0),
  matchTimeSec: t.number().default(0),
  zoneRadius: t.number().default(2000),
  zonePhase: t.number().default(0),
  zoneShrinking: t.boolean().default(false),
  zoneNextSec: t.number().default(0),
}, "GameState");

export type GameState = SchemaType<typeof GameState>;
