export type JoinOptions = {
  name?: string;
  weaponId?: string;
};

export type ShotEvent = {
  shooterId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hitId?: string;
  weaponId: string;
};

export type GatherEvent = {
  playerId: string;
  x: number;
  y: number;
  resource: string;
  amount: number;
};

export type BlastEvent = {
  x: number;
  y: number;
  radius: number;
  kind: number;
};
