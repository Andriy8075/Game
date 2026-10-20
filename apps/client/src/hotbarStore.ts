import { DEFAULT_HOTBAR_ORDER, normalizeHotbarOrder, type HeldSlot } from "@io-game/shared";
import { getGameClient } from "./network/GameClient";

const STORAGE_KEY = "io-shooter.hotbar";

export function loadLocalOrder(): HeldSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [...DEFAULT_HOTBAR_ORDER];
    }
    return normalizeHotbarOrder(JSON.parse(raw));
  } catch {
    return [...DEFAULT_HOTBAR_ORDER];
  }
}

export function saveLocalOrder(order: HeldSlot[]): HeldSlot[] {
  const next = normalizeHotbarOrder(order);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode can refuse storage; the in-memory order still works this session.
  }
  return next;
}

export async function saveAccountOrder(order: HeldSlot[]): Promise<HeldSlot[]> {
  const next = normalizeHotbarOrder(order);
  const response = await getGameClient().http.put("/account/hotbar", { body: { order: next } });
  const body = response.data as { hotbarOrder?: unknown } | undefined;
  return normalizeHotbarOrder(body?.hotbarOrder ?? next);
}
