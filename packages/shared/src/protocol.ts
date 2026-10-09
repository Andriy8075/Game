export type JoinOptions = {
  name?: string;
};

export type ShotEvent = {
  shooterId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hitId?: string;
};
