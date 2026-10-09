import Phaser from "phaser";
import { DEFAULT_PLAYER_NAME, PLAYER_NAME_MAX_LENGTH, sanitizePlayerName } from "@io-game/shared";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#1b2416",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  scene: [GameScene],
};

const menu = document.querySelector<HTMLElement>("#menu");
const form = document.querySelector<HTMLFormElement>("#menu-form");
const nameInput = document.querySelector<HTMLInputElement>("#player-name");
const gameRoot = document.querySelector<HTMLElement>("#game");

if (!menu || !form || !nameInput || !gameRoot) {
  throw new Error("Menu markup is missing");
}

nameInput.maxLength = PLAYER_NAME_MAX_LENGTH;
nameInput.placeholder = DEFAULT_PLAYER_NAME;

let started = false;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (started) {
    return;
  }

  started = true;
  const playerName = sanitizePlayerName(nameInput.value);
  menu.hidden = true;
  gameRoot.hidden = false;
  document.body.classList.add("in-game");

  new Phaser.Game({
    ...config,
    callbacks: {
      preBoot: (game) => {
        game.registry.set("playerName", playerName);
      },
    },
  });
});
