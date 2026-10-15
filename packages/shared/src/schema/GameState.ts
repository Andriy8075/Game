import { schema, t, type SchemaType } from "@colyseus/schema";
import { DEFAULT_PLAYER_NAME, PLAYER_DAMAGE, PLAYER_MAX_HP } from "../constants";
import { STARTER_WEAPON_ID } from "../weapons/catalog";

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
}, "Player");

export type Player = SchemaType<typeof Player>;

export const WeaponPickup = schema({
  weaponId: t.string(),
  x: t.number().default(0),
  y: t.number().default(0),
}, "WeaponPickup");

export type WeaponPickup = SchemaType<typeof WeaponPickup>;

export const GameState = schema({
  players: t.map(Player),
  pickups: t.map(WeaponPickup),
}, "GameState");

export type GameState = SchemaType<typeof GameState>;
