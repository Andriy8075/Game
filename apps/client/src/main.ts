import Phaser from "phaser";
import {
  DEFAULT_HOTBAR_ORDER,
  DEFAULT_PLAYER_NAME,
  HELD_SHORT,
  PLAYER_NAME_MAX_LENGTH,
  STARTER_WEAPON_ID,
  formatAccountLevel,
  formatWeaponStats,
  getWeapon,
  hotbarKeyLabel,
  normalizeHotbarOrder,
  sanitizePlayerName,
  suggestedPlayerName,
  weaponsOfferedAtLevel,
  type HeldSlot,
} from "@io-game/shared";
import { loadLocalOrder, saveAccountOrder, saveLocalOrder } from "./hotbarStore";
import { GameScene } from "./scenes/GameScene";
import { getGameClient, getServerUrl } from "./network/GameClient";
import { slotIconDataUrl } from "./ui/slotIcons";

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

type AccountUser = {
  email?: string;
  displayName?: string;
  level?: number;
  xp?: number;
  hotbarOrder?: string[] | null;
};

type AuthMode = "signup" | "login";

const AUTH_ERRORS: Record<string, string> = {
  email_already_in_use: "An account with that email already exists.",
  invalid_credentials: "Email or password is incorrect.",
  password_too_short: "Password must be at least 6 characters.",
  email_malformed: "Enter a valid email address.",
  google_not_configured: "Google sign-in is not configured.",
};

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error("Menu markup is missing");
  }
  return element;
}

const menu = requiredElement<HTMLElement>("#menu");
const form = requiredElement<HTMLFormElement>("#menu-form");
const nameInput = requiredElement<HTMLInputElement>("#player-name");
const weaponOptions = requiredElement<HTMLElement>("#weapon-options");
const hotbarList = requiredElement<HTMLOListElement>("#hotbar-slots");
const hotbarReset = requiredElement<HTMLButtonElement>("#hotbar-reset");
const gameRoot = requiredElement<HTMLElement>("#game");
const accountStatus = requiredElement<HTMLElement>("#account-status");
const accountBenefits = requiredElement<HTMLElement>("#account-benefits");
const showSignup = requiredElement<HTMLButtonElement>("#show-signup");
const showLogin = requiredElement<HTMLButtonElement>("#show-login");
const logoutButton = requiredElement<HTMLButtonElement>("#logout-button");
const authForm = requiredElement<HTMLFormElement>("#auth-form");
const authTitle = requiredElement<HTMLElement>("#auth-title");
const authEmail = requiredElement<HTMLInputElement>("#auth-email");
const authPassword = requiredElement<HTMLInputElement>("#auth-password");
const authSubmit = requiredElement<HTMLButtonElement>("#auth-submit");
const googleButton = requiredElement<HTMLButtonElement>("#google-button");
const authBack = requiredElement<HTMLButtonElement>("#auth-back");
const authError = requiredElement<HTMLElement>("#auth-error");

nameInput.maxLength = PLAYER_NAME_MAX_LENGTH;
nameInput.placeholder = DEFAULT_PLAYER_NAME;

const client = getGameClient();
let game: Phaser.Game | undefined;
let started = false;
let authMode: AuthMode = "signup";
let authBusy = false;
let signedIn = false;
let accountLevel = 0;
let hotbarOrder = loadLocalOrder();
let dragFrom: number | undefined;
let saveTimer: number | undefined;

function selectedWeaponId(): string {
  const selected = weaponOptions.querySelector<HTMLInputElement>("input:checked");
  return selected?.value ?? STARTER_WEAPON_ID;
}

function renderWeapons(level: number): void {
  const previous = selectedWeaponId();
  const weapons = weaponsOfferedAtLevel(level);
  weaponOptions.replaceChildren();
  for (const weapon of weapons) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "weapon";
    input.value = weapon.id;
    input.checked = weapon.id === previous;
    label.append(input, document.createTextNode(formatWeaponStats(weapon)));
    weaponOptions.append(label);
  }
  if (!weaponOptions.querySelector("input:checked")) {
    const first = weaponOptions.querySelector<HTMLInputElement>("input");
    if (first) {
      first.checked = true;
    }
  }
  renderHotbar();
}

function slotLabel(slot: HeldSlot): string {
  return slot === "gun" ? getWeapon(selectedWeaponId()).name : HELD_SHORT[slot];
}

function slotIcon(slot: HeldSlot): string {
  return slot === "gun" ? selectedWeaponId() : slot;
}

function renderHotbar(): void {
  hotbarList.replaceChildren();
  for (let index = 0; index < hotbarOrder.length; index += 1) {
    const slot = hotbarOrder[index];
    if (!slot) {
      continue;
    }
    const item = document.createElement("li");
    item.draggable = true;
    item.dataset.index = String(index);

    const key = document.createElement("span");
    key.className = "key";
    key.textContent = hotbarKeyLabel(index);

    const icon = document.createElement("img");
    icon.src = slotIconDataUrl(slotIcon(slot));
    icon.alt = "";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = slotLabel(slot);

    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.setAttribute("aria-label", `Move ${slotLabel(slot)} up`);
    up.disabled = index === 0;
    up.addEventListener("click", () => moveSlot(index, index - 1));

    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.setAttribute("aria-label", `Move ${slotLabel(slot)} down`);
    down.disabled = index === hotbarOrder.length - 1;
    down.addEventListener("click", () => moveSlot(index, index + 1));

    item.addEventListener("dragstart", (event) => {
      dragFrom = index;
      item.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", String(index));
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
    });
    item.addEventListener("dragend", () => {
      dragFrom = undefined;
      item.classList.remove("dragging");
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      const from = dragFrom ?? Number(event.dataTransfer?.getData("text/plain"));
      moveSlot(from, index);
      dragFrom = undefined;
    });

    item.append(key, icon, name, up, down);
    hotbarList.append(item);
  }
}

function commitHotbar(order: HeldSlot[], persistAccount: boolean): void {
  hotbarOrder = saveLocalOrder(order);
  renderHotbar();
  if (persistAccount && signedIn) {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void saveAccountOrder(hotbarOrder).catch(() => undefined);
    }, 400);
  }
}

function moveSlot(from: number, to: number): void {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || to < 0 || from >= hotbarOrder.length || to >= hotbarOrder.length) {
    return;
  }
  const next = [...hotbarOrder];
  const [moved] = next.splice(from, 1);
  if (!moved) {
    return;
  }
  next.splice(to, 0, moved);
  commitHotbar(next, true);
}

function applyAccountHotbar(user: AccountUser): void {
  if (user.hotbarOrder != null) {
    commitHotbar(normalizeHotbarOrder(user.hotbarOrder), false);
    return;
  }
  void saveAccountOrder(hotbarOrder).catch(() => undefined);
}

function leaveMatch(): void {
  game?.destroy(true);
  game = undefined;
  started = false;
  menu.hidden = false;
  gameRoot.hidden = true;
  document.body.classList.remove("in-game");
  void client.auth
    .getUserData<AccountUser>()
    .then((response) => {
      showSignedIn(response.user);
    })
    .catch(() => {
      showSignedOut();
    });
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return AUTH_ERRORS[message] ?? message;
}

function setAuthError(message: string): void {
  authError.hidden = message.length === 0;
  authError.textContent = message;
}

function showSignedIn(user: AccountUser): void {
  const email = user.email ?? "your account";
  const level = typeof user.level === "number" ? user.level : 1;
  const xp = typeof user.xp === "number" ? user.xp : 0;
  signedIn = true;
  accountLevel = level;
  accountStatus.hidden = false;
  accountStatus.textContent = `Signed in as ${email} · ${formatAccountLevel(level, xp)}`;
  accountBenefits.hidden = true;
  showSignup.hidden = true;
  showLogin.hidden = true;
  logoutButton.hidden = false;
  authForm.hidden = true;
  setAuthError("");
  if (nameInput.value.trim().length === 0) {
    nameInput.value = suggestedPlayerName(user.displayName);
  }
  renderWeapons(level);
  applyAccountHotbar(user);
}

function showSignedOut(): void {
  signedIn = false;
  accountLevel = 0;
  accountStatus.hidden = true;
  accountStatus.textContent = "";
  accountBenefits.hidden = false;
  showSignup.hidden = false;
  showLogin.hidden = false;
  logoutButton.hidden = true;
  renderWeapons(0);
}

function openAuth(mode: AuthMode): void {
  authMode = mode;
  authTitle.textContent = mode === "signup" ? "Sign up" : "Log in";
  authSubmit.textContent = mode === "signup" ? "Create account" : "Log in";
  authPassword.autocomplete = mode === "signup" ? "new-password" : "current-password";
  authForm.hidden = false;
  setAuthError("");
  authEmail.focus();
}

showSignup.addEventListener("click", () => openAuth("signup"));
showLogin.addEventListener("click", () => openAuth("login"));
authBack.addEventListener("click", () => {
  authForm.hidden = true;
  setAuthError("");
});

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (authBusy) {
    return;
  }
  authBusy = true;
  setAuthError("");
  const email = authEmail.value;
  const password = authPassword.value;
  const request =
    authMode === "signup"
      ? client.auth.registerWithEmailAndPassword(email, password)
      : client.auth.signInWithEmailAndPassword(email, password);

  void request
    .then((response) => {
      authPassword.value = "";
      showSignedIn(response.user as AccountUser);
    })
    .catch((error: unknown) => {
      setAuthError(errorText(error));
    })
    .finally(() => {
      authBusy = false;
    });
});

googleButton.addEventListener("click", () => {
  if (authBusy) {
    return;
  }
  authBusy = true;
  setAuthError("");
  void fetch(`${getServerUrl()}/auth/config`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Could not reach the account server.");
      }
      const body = (await response.json()) as { google?: boolean };
      if (!body.google) {
        throw new Error("google_not_configured");
      }
      return client.auth.signInWithProvider("google");
    })
    .then((response) => {
      if (!response) {
        return;
      }
      showSignedIn(response.user as AccountUser);
    })
    .catch((error: unknown) => {
      if (String(error) === "cancelled") {
        return;
      }
      setAuthError(errorText(error));
    })
    .finally(() => {
      authBusy = false;
    });
});

logoutButton.addEventListener("click", () => {
  void client.auth.signOut().then(() => {
    showSignedOut();
  });
});

weaponOptions.addEventListener("change", () => {
  renderHotbar();
});

hotbarReset.addEventListener("click", () => {
  commitHotbar([...DEFAULT_HOTBAR_ORDER], true);
});

void client.auth
  .getUserData<AccountUser>()
  .then((response) => {
    showSignedIn(response.user);
  })
  .catch(() => {
    void client.auth.signOut().then(() => {
      showSignedOut();
    });
  });

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (started) {
    return;
  }

  started = true;
  const playerName = sanitizePlayerName(nameInput.value);
  const weaponId = selectedWeaponId();
  menu.hidden = true;
  gameRoot.hidden = false;
  document.body.classList.add("in-game");

  game = new Phaser.Game({
    ...config,
    callbacks: {
      preBoot: (instance) => {
        instance.registry.set("playerName", playerName);
        instance.registry.set("weaponId", weaponId);
        instance.registry.set("hotbarOrder", hotbarOrder);
        instance.registry.set("onLeaveMatch", leaveMatch);
      },
    },
  });
});

renderWeapons(signedIn ? accountLevel : 0);
renderHotbar();
