import { schema, t, type SchemaType } from "@colyseus/schema";

export const MoveInput = schema({
  moveX: t.int8<-1 | 0 | 1>().default(0),
  moveY: t.int8<-1 | 0 | 1>().default(0),
  aimAngle: t.float32().default(0),
  fire: t.boolean().default(false),
}, "MoveInput");

export type MoveInput = SchemaType<typeof MoveInput>;
