import { PLAYER_RADIUS, PLAYER_SPEED } from "../constants";
import { clampAxis, normalize, wrapAngle } from "../math";
import { GAME_MAP, type GameMap } from "../world/map";
import { resolveCollisions } from "./collision";

const PUSH_STEP = 8;

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

/** Slides a body forward along its aim and stops when the next step cannot move. */
export function pushForward(
  body: MovableBody,
  distance: number,
  world: GameMap = GAME_MAP,
  radius: number = PLAYER_RADIUS,
): MovableBody {
  const steps = Math.max(1, Math.ceil(distance / PUSH_STEP));
  const step = distance / steps;
  const dx = Math.cos(body.angle) * step;
  const dy = Math.sin(body.angle) * step;

  for (let i = 0; i < steps; i += 1) {
    const next = resolveCollisions(body.x + dx, body.y + dy, radius, world);
    const moved = Math.hypot(next.x - body.x, next.y - body.y);
    body.x = next.x;
    body.y = next.y;
    if (moved < 0.5) {
      break;
    }
  }

  return body;
}
