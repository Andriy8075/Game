import Phaser from "phaser";
import { GAME_MAP, isCircleObstacle, isRectObstacle } from "@io-game/shared";

export function drawWorld(scene: Phaser.Scene): void {
  scene.cameras.main.setBackgroundColor(GAME_MAP.backdrop);

  const ground = scene.add.rectangle(
    GAME_MAP.width / 2,
    GAME_MAP.height / 2,
    GAME_MAP.width,
    GAME_MAP.height,
    GAME_MAP.ground,
  );
  ground.setDepth(-20);

  for (const obstacle of GAME_MAP.obstacles) {
    if (isRectObstacle(obstacle)) {
      const rect = scene.add.rectangle(
        obstacle.x + obstacle.width / 2,
        obstacle.y + obstacle.height / 2,
        obstacle.width,
        obstacle.height,
        obstacle.fill,
      );
      rect.setStrokeStyle(obstacle.kind === "fence" ? 2 : 4, obstacle.stroke);
      rect.setDepth(obstacle.kind === "fence" ? -5 : 0);
    } else if (isCircleObstacle(obstacle)) {
      const circle = scene.add.circle(obstacle.x, obstacle.y, obstacle.radius, obstacle.fill);
      circle.setStrokeStyle(3, obstacle.stroke);
      circle.setDepth(obstacle.kind === "tree" ? 1 : 0);
      if (obstacle.kind === "tree") {
        scene.add.circle(obstacle.x, obstacle.y, Math.max(6, obstacle.radius * 0.28), 0x5d4037).setDepth(1);
      }
    }
  }

  const border = scene.add.rectangle(
    GAME_MAP.width / 2,
    GAME_MAP.height / 2,
    GAME_MAP.width,
    GAME_MAP.height,
  );
  border.setStrokeStyle(8, 0x10200c);
  border.isFilled = false;
  border.setDepth(-19);
}
