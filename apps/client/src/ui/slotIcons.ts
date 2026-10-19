import Phaser from "phaser";
import arm from "../assets/slots/arm.svg?raw";
import bandage from "../assets/slots/bandage.svg?raw";
import buckshot from "../assets/slots/buckshot.svg?raw";
import flash from "../assets/slots/flash.svg?raw";
import forge from "../assets/slots/forge.svg?raw";
import frag from "../assets/slots/frag.svg?raw";
import horizon from "../assets/slots/horizon.svg?raw";
import incendiary from "../assets/slots/incendiary.svg?raw";
import longshot from "../assets/slots/longshot.svg?raw";
import repeater from "../assets/slots/repeater.svg?raw";
import sidearm from "../assets/slots/sidearm.svg?raw";
import splinter from "../assets/slots/splinter.svg?raw";
import vanguard from "../assets/slots/vanguard.svg?raw";
import wall from "../assets/slots/wall.svg?raw";
import whisper from "../assets/slots/whisper.svg?raw";

export const SLOT_ICON_W = 50;
export const SLOT_ICON_H = 28;

const SLOT_SVGS: Record<string, string> = {
  sidearm,
  splinter,
  buckshot,
  longshot,
  repeater,
  vanguard,
  horizon,
  forge,
  whisper,
  frag,
  flash,
  incendiary,
  bandage,
  wall,
  arm,
};

const BLANK_KEY = "slot-icon-blank";
const desired = new WeakMap<Phaser.GameObjects.Image, string>();
const waiters = new Map<string, Set<Phaser.GameObjects.Image>>();

export function blankSlotTexture(scene: Phaser.Scene): string {
  if (!scene.textures.exists(BLANK_KEY)) {
    const canvas = scene.textures.createCanvas(BLANK_KEY, 2, 2);
    canvas?.clear();
    canvas?.refresh();
  }
  return BLANK_KEY;
}

export function applySlotIcon(scene: Phaser.Scene, image: Phaser.GameObjects.Image, id: string): void {
  const resolved = SLOT_SVGS[id] ? id : "sidearm";
  desired.set(image, resolved);
  const key = `slot-icon-${resolved}`;
  if (scene.textures.exists(key)) {
    image.setTexture(key);
    image.setDisplaySize(SLOT_ICON_W, SLOT_ICON_H);
    return;
  }

  let pending = waiters.get(key);
  if (!pending) {
    pending = new Set();
    waiters.set(key, pending);
    const svg = SLOT_SVGS[resolved] ?? sidearm;
    const source = new Image();
    source.onload = () => {
      const waiting = waiters.get(key);
      waiters.delete(key);
      if (!scene.sys.isActive()) {
        return;
      }
      if (!scene.textures.exists(key)) {
        scene.textures.addImage(key, source);
      }
      if (!waiting) {
        return;
      }
      for (const target of waiting) {
        if (desired.get(target) !== resolved || !target.scene) {
          continue;
        }
        target.setTexture(key);
        target.setDisplaySize(SLOT_ICON_W, SLOT_ICON_H);
      }
    };
    source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  pending.add(image);
}
