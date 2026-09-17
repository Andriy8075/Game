import { schema, t, type SchemaType } from "@colyseus/schema";
import { PLAYER_DAMAGE, PLAYER_MAX_HP } from "../constants";

export const Player = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  angle: t.number().default(0),
  color: t.number().default(0x4fc3f7),
  hp: t.number().default(PLAYER_MAX_HP),
  maxHp: t.number().default(PLAYER_MAX_HP),
  damage: t.number().default(PLAYER_DAMAGE),
}, "Player");

export type Player = SchemaType<typeof Player>;

export const GameState = schema({
  players: t.map(Player),
}, "GameState");

export type GameState = SchemaType<typeof GameState>;
