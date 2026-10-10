import Phaser from "phaser";
import { DEFAULT_PLAYER_NAME, PLAYER_NAME_MAX_LENGTH, sanitizePlayerName } from "@io-game/shared";
import { GameScene } from "./scenes/GameScene";
import { getGameClient, getServerUrl } from "./network/GameClient";

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
  level?: number;
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
const gameRoot = requiredElement<HTMLElement>("#game");
const accountStatus = requiredElement<HTMLElement>("#account-status");
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
let started = false;
let authMode: AuthMode = "signup";
let authBusy = false;

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
  accountStatus.hidden = false;
  accountStatus.textContent = `Signed in as ${email} · Level ${level}`;
  showSignup.hidden = true;
  showLogin.hidden = true;
  logoutButton.hidden = false;
  authForm.hidden = true;
  setAuthError("");
}

function showSignedOut(): void {
  accountStatus.hidden = true;
  accountStatus.textContent = "";
  showSignup.hidden = false;
  showLogin.hidden = false;
  logoutButton.hidden = true;
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
