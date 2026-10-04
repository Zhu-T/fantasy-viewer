import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { EspnCookies, SavedLeague, Session } from "./types";

/**
 * Each visitor's saved leagues and (optional) ESPN cookies live in an
 * AES-256-GCM encrypted, HttpOnly cookie on this site. Nothing is stored server-side, so the app runs
 * on Vercel's stateless functions and every visitor only ever sees their own data.
 */

const SESSION_COOKIE = "fv_session";
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 365;
const DEV_SECRET = "fantasy-viewer-dev-secret-do-not-use-in-production";

function key(): Buffer {
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is not set. Add it to the deployment's environment variables.");
    }
    secret = DEV_SECRET;
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(session: Session): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function decrypt(token: string): Session | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return normalizeSession(JSON.parse(json) as Session);
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? decrypt(token) : null;
}

/** null when there's nothing worth keeping (no cookies, no leagues). */
function normalizeSession(s: Session | null | undefined): Session | null {
  if (!s) return null;
  const out: Session = {};
  if (s.espn_s2 && s.SWID) {
    out.espn_s2 = s.espn_s2;
    out.SWID = s.SWID;
  }
  const leagues = sanitizeLeagues(s.leagues);
  if (leagues.length) out.leagues = leagues;
  return out.espn_s2 || out.leagues ? out : null;
}

export function sessionCookies(session: Session | null): EspnCookies | null {
  return session?.espn_s2 && session.SWID ? { espn_s2: session.espn_s2, SWID: session.SWID } : null;
}

/** Saves the session, or clears the cookie when nothing is left in it. */
export async function saveSession(session: Session): Promise<void> {
  const clean = normalizeSession(session);
  if (!clean) return clearSession();
  (await cookies()).set(SESSION_COOKIE, encrypt(clean), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Cookie header value for ESPN requests. SWID keeps its braces. */
export function cookieHeader(cookies: EspnCookies): string {
  return `espn_s2=${cookies.espn_s2}; SWID=${cookies.SWID}`;
}

/**
 * Stable per-credential cache key. Never key by SWID alone: SWIDs show up as
 * owner ids in league data, so a guessed SWID must not unlock cached results.
 */
export function cookiesKey(cookies: EspnCookies): string {
  return crypto.createHash("sha256").update(`${cookies.espn_s2}|${normalizeSwid(cookies.SWID)}`).digest("base64url");
}

/** Cache key for everything a session can see: its cookies (if any) plus its saved leagues. */
export function sessionKey(session: Session): string {
  const c = sessionCookies(session);
  const leagues = (session.leagues ?? []).map((l) => `${l.leagueId}:${l.teamId}`).join(",");
  return `${c ? cookiesKey(c) : "anon"}|${leagues}`;
}

/** Normalize a SWID for comparisons against team owner ids: uppercase, braces stripped. */
export function normalizeSwid(swid: string | undefined | null): string {
  return (swid ?? "").replace(/[{}]/g, "").toUpperCase();
}

/**
 * Accepts what people actually paste: the bare values, `name=value`, or a whole
 * `Cookie:` header / document.cookie string containing both.
 */
export function parseCookieInput(espnS2Input: string, swidInput: string): EspnCookies | null {
  const pick = (name: string, ...inputs: string[]): string => {
    const re = new RegExp(`(?:^|[;\\s])${name}=([^;\\s]+)`, "i");
    for (const input of inputs) {
      const m = input.match(re);
      if (m) return m[1];
    }
    return "";
  };
  // espn_s2 is kept URL-encoded, exactly as the browser stores and sends it.
  const combined = [espnS2Input, swidInput];
  let espn_s2 = pick("espn_s2", ...combined);
  let swid = pick("SWID", ...combined);
  // A bare value has no "=" (ESPN URL-encodes them); a cookie line without espn_s2 means "not logged in".
  if (!espn_s2 && !espnS2Input.includes("=")) espn_s2 = espnS2Input.trim();
  if (!swid && swidInput && !swidInput.includes("=")) swid = swidInput.trim();

  swid = normalizeSwid(swid);
  if (!espn_s2 || !/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(swid)) return null;
  return { espn_s2, SWID: `{${swid}}` };
}

const MAX_LEAGUES = 20;

/** A league ID, or an ESPN league URL containing one. */
export function parseLeagueId(input: string | undefined): string | null {
  const v = (input ?? "").trim();
  const id = v.match(/leagueId=(\d+)/)?.[1] ?? v;
  return /^\d{1,12}$/.test(id) ? id : null;
}

/** Validates client-supplied saved leagues before they go into the session. */
export function sanitizeLeagues(input: unknown): SavedLeague[] {
  if (!Array.isArray(input)) return [];
  const out = new Map<string, SavedLeague>();
  for (const raw of input as Partial<SavedLeague>[]) {
    const leagueId = parseLeagueId(String(raw?.leagueId ?? ""));
    const teamId = Number(raw?.teamId);
    if (!leagueId || !Number.isInteger(teamId) || teamId < 0) continue;
    const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : undefined);
    out.set(leagueId, { leagueId, teamId, leagueName: text(raw.leagueName), teamName: text(raw.teamName) });
  }
  return [...out.values()].slice(0, MAX_LEAGUES);
}
