import os from "node:os";
import path from "node:path";
import type { AuthStatus, EspnCookies } from "./types";
import { deleteJson, globalSingleton, readJson, writeJson } from "./store";

const COOKIE_FILE = "espn-cookies.json";
const LOGIN_URL = "https://www.espn.com/login";
const FANTASY_URL = "https://fantasy.espn.com/football/";

interface StoredCookies extends EspnCookies {
  savedAt: string;
}

interface AuthState {
  /** false once ESPN answers 401/403 with the cookies we have. */
  authOk: boolean;
  harvesting: Promise<EspnCookies> | null;
  lastError: string | null;
  updatedAt: string | null;
}

const state = globalSingleton<AuthState>("auth", () => ({
  authOk: true,
  harvesting: null,
  lastError: null,
  updatedAt: null,
}));

export function getCookies(): EspnCookies | null {
  const stored = readJson<StoredCookies>(COOKIE_FILE);
  if (!stored?.espn_s2 || !stored?.SWID) return null;
  return { espn_s2: stored.espn_s2, SWID: stored.SWID };
}

export function saveCookies(cookies: EspnCookies): void {
  writeJson(COOKIE_FILE, { ...cookies, savedAt: new Date().toISOString() } satisfies StoredCookies);
  state.authOk = true;
  state.lastError = null;
  state.updatedAt = new Date().toISOString();
}

export function clearCookies(): void {
  deleteJson(COOKIE_FILE);
  state.authOk = false;
  state.updatedAt = new Date().toISOString();
}

export function markAuthExpired(reason: string): void {
  state.authOk = false;
  state.lastError = reason;
  state.updatedAt = new Date().toISOString();
}

export function isAuthOk(): boolean {
  return state.authOk && getCookies() !== null;
}

export function getAuthStatus(): AuthStatus {
  return {
    hasCookies: getCookies() !== null,
    authOk: isAuthOk(),
    harvesting: state.harvesting !== null,
    lastError: state.lastError,
    updatedAt: state.updatedAt,
  };
}

/** Cookie header value for ESPN requests. SWID keeps its braces. */
export function cookieHeader(cookies: EspnCookies): string {
  return `espn_s2=${cookies.espn_s2}; SWID=${cookies.SWID}`;
}

/** Normalize a SWID for comparisons against team owner ids: uppercase, braces stripped. */
export function normalizeSwid(swid: string | undefined | null): string {
  return (swid ?? "").replace(/[{}]/g, "").toUpperCase();
}

function profileDir(): string {
  return process.env.ESPN_PROFILE_DIR || path.join(os.tmpdir(), "fantasy-viewer-profile");
}

/**
 * Opens a visible Chromium window on a persistent profile, waits for the user
 * to be logged into ESPN, then lifts espn_s2 + SWID out of the cookie jar.
 * Single-flight: concurrent callers share the same harvest.
 */
export function harvestCookies(timeoutMs = 10 * 60 * 1000): Promise<EspnCookies> {
  if (state.harvesting) return state.harvesting;

  const run = (async (): Promise<EspnCookies> => {
    const { chromium } = await import("playwright");
    const context = await chromium.launchPersistentContext(profileDir(), {
      headless: false,
      viewport: null,
      args: ["--disable-blink-features=AutomationControlled", "--window-size=1100,900"],
    });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(FANTASY_URL, { waitUntil: "domcontentloaded" }).catch(() => undefined);

      const deadline = Date.now() + timeoutMs;
      let sentToLogin = false;
      while (Date.now() < deadline) {
        const jar = await context.cookies(["https://www.espn.com", "https://fantasy.espn.com"]);
        const s2 = jar.find((c) => c.name === "espn_s2")?.value;
        const swid = jar.find((c) => c.name === "SWID")?.value;
        if (s2 && swid) {
          const cookies = { espn_s2: s2, SWID: swid };
          saveCookies(cookies);
          return cookies;
        }
        if (!sentToLogin) {
          // Not logged in on this profile yet: send the window straight to ESPN's login page.
          sentToLogin = true;
          await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" }).catch(() => undefined);
        }
        if (context.pages().length === 0) {
          throw new Error("Browser window was closed before ESPN login completed.");
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error("Timed out waiting for ESPN login.");
    } finally {
      await context.close().catch(() => undefined);
    }
  })();

  state.harvesting = run;
  state.lastError = null;
  run
    .catch((err: unknown) => {
      state.lastError = err instanceof Error ? err.message : String(err);
      state.updatedAt = new Date().toISOString();
    })
    .finally(() => {
      state.harvesting = null;
    });
  return run;
}
