import { PLAYER_RADIUS, PLAYER_SPEED } from "../constants";
import { clampAxis, normalize, wrapAngle } from "../math";
import { GAME_MAP, type GameMap } from "../world/map";
import { resolveCollisions } from "./collision";

export type MovableBody = {
  x: number;
  y: number;
  angle: number;
};

export type MovementCommand = {
  moveX: number;
  moveY: number;
  aimAngle: number;
};

export function applyMovement(
  body: MovableBody,
  command: MovementCommand,
  dt: number,
  world: GameMap = GAME_MAP,
  radius: number = PLAYER_RADIUS,
  speed: number = PLAYER_SPEED,
): MovableBody {
  const moveX = clampAxis(command.moveX);
  const moveY = clampAxis(command.moveY);
  const direction = normalize(moveX, moveY);

  const nextX = body.x + direction.x * speed * dt;
  const nextY = body.y + direction.y * speed * dt;
  const resolved = resolveCollisions(nextX, nextY, radius, world);

  body.x = resolved.x;
  body.y = resolved.y;
  body.angle = wrapAngle(command.aimAngle);
  return body;
}
