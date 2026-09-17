import { PLAYER_RADIUS } from "../constants";
import { GAME_MAP, type SpawnPoint } from "../world/map";
import { isBlocked } from "./collision";

export function pickSpawn(occupied: SpawnPoint[] = [], radius: number = PLAYER_RADIUS * 4): SpawnPoint {
  let best = GAME_MAP.spawns[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const spawn of GAME_MAP.spawns) {
    if (isBlocked(spawn.x, spawn.y)) {
      continue;
    }

    let nearest = Number.POSITIVE_INFINITY;
    for (const other of occupied) {
      nearest = Math.min(nearest, Math.hypot(spawn.x - other.x, spawn.y - other.y));
    }

    const score = occupied.length === 0 ? 0 : nearest;
    if (score > bestScore && (occupied.length === 0 || nearest >= radius || score > bestScore)) {
      best = spawn;
      bestScore = score;
    }
  }

  return best;
}
