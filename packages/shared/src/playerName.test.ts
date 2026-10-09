import { describe, expect, it } from "vitest";
import { DEFAULT_PLAYER_NAME, PLAYER_NAME_MAX_LENGTH } from "./constants";
import { sanitizePlayerName } from "./playerName";

describe("sanitizePlayerName", () => {
  it("trims a name from the menu", () => {
    expect(sanitizePlayerName("  Nova  ")).toBe("Nova");
  });

  it("falls back when the name is blank or missing", () => {
    expect(sanitizePlayerName("   ")).toBe(DEFAULT_PLAYER_NAME);
    expect(sanitizePlayerName(undefined)).toBe(DEFAULT_PLAYER_NAME);
    expect(sanitizePlayerName(12)).toBe(DEFAULT_PLAYER_NAME);
  });

  it("drops control characters and keeps the nametag short", () => {
    expect(sanitizePlayerName("A\nB\tC")).toBe("ABC");
    expect(sanitizePlayerName("ABCDEFGHIJKLMNOPQRSTUVWXYZ")).toHaveLength(PLAYER_NAME_MAX_LENGTH);
    expect(sanitizePlayerName("ABCDEFGHIJKLMNOPQRSTUVWXYZ")).toBe("ABCDEFGHIJKLMNOP");
  });
});
