import { DEFAULT_PLAYER_NAME, PLAYER_NAME_MAX_LENGTH } from "./constants";

export function sanitizePlayerName(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_PLAYER_NAME;
  }

  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, PLAYER_NAME_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : DEFAULT_PLAYER_NAME;
}
