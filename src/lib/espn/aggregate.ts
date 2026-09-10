import { getCookies, isAuthOk, markAuthExpired } from "./auth";
import { getLeagues } from "./fan";
import { extractMyMatchup, fetchRawLeague } from "./league";
import { getNflWeekState, type NflWeekState } from "./nfl";
import { currentSeason, globalSingleton } from "./store";
import { EspnAuthError, type LeagueError, type MatchupsResponse, type MyMatchup } from "./types";

const CACHE_TTL_MS = 15_000;
const LIVE_REFRESH_MS = 30_000;
const IDLE_REFRESH_MS = 5 * 60_000;
const PRE_KICKOFF_REFRESH_MS = 60_000;

interface CacheEntry {
  at: number;
  value: MatchupsResponse;
  inflight: Promise<MatchupsResponse> | null;
}

const cache = globalSingleton<Map<string, CacheEntry>>("matchupCache", () => new Map());

export function invalidateMatchupCache(): void {
  cache.clear();
}

function emptyResponse(season: number, message: string, authOk: boolean): MatchupsResponse {
  return {
    authOk,
    authMessage: message,
    season,
    week: null,
    currentWeek: null,
    anyGamesLive: false,
    nextRefreshMs: IDLE_REFRESH_MS,
    fetchedAt: new Date().toISOString(),
    leagues: [],
    errors: [],
  };
}

function chooseRefresh(nfl: NflWeekState | null, leagues: MyMatchup[]): number {
  if (nfl?.anyLive) return LIVE_REFRESH_MS;
  if (leagues.some((l) => l.status === "live")) return LIVE_REFRESH_MS;
  // Kickoff within the next 30 minutes? Poll faster so the page flips to live promptly.
  const now = Date.now();
  const kickoffSoon = Object.values(nfl?.byTeam ?? {}).some((g) => {
    if (g.state !== "pre" || !g.kickoffIso) return false;
    const t = Date.parse(g.kickoffIso);
    return Number.isFinite(t) && t - now < 30 * 60_000;
  });
  return kickoffSoon ? PRE_KICKOFF_REFRESH_MS : IDLE_REFRESH_MS;
}

async function build(week: number | undefined, forceDiscovery: boolean): Promise<MatchupsResponse> {
  const season = currentSeason();
  const cookies = getCookies();
  if (!cookies) return emptyResponse(season, "Sign in to ESPN to load your leagues.", false);
  if (!isAuthOk()) return emptyResponse(season, "Your ESPN session expired. Sign in again.", false);

  const [{ leagues: refs, discoveryError }, nflResult] = await Promise.all([
    getLeagues(cookies, { force: forceDiscovery }).catch((err: unknown) => {
      if (err instanceof EspnAuthError) throw err;
      return { leagues: [], discoveryError: err instanceof Error ? err.message : String(err) };
    }),
    getNflWeekState().catch(() => null),
  ]);

  const errors: LeagueError[] = [];
  if (discoveryError) errors.push({ leagueId: "discovery", error: `League discovery failed: ${discoveryError}` });

  let authFailed = false;
  const results = await Promise.allSettled(
    refs.map(async (ref) => {
      const raw = await fetchRawLeague(ref, cookies, week);
      const matchup = extractMyMatchup(raw, ref, cookies.SWID, nflResult, week);
      if (!matchup) throw new Error("Could not find your team in this league.");
      return { matchup, currentWeek: raw.scoringPeriodId ?? null };
    }),
  );

  const leagues: MyMatchup[] = [];
  let currentWeek: number | null = null;
  results.forEach((r, i) => {
    const ref = refs[i];
    if (r.status === "fulfilled") {
      leagues.push(r.value.matchup);
      currentWeek ??= r.value.currentWeek;
    } else {
      const err = r.reason;
      if (err instanceof EspnAuthError) authFailed = true;
      errors.push({
        leagueId: ref.leagueId,
        leagueName: ref.leagueName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  if (authFailed && leagues.length === 0) {
    markAuthExpired("ESPN rejected the saved cookies.");
    return emptyResponse(season, "Your ESPN session expired. Sign in again.", false);
  }

  leagues.sort((a, b) => a.leagueName.localeCompare(b.leagueName));
  const anyGamesLive = nflResult?.anyLive ?? leagues.some((l) => l.status === "live");

  return {
    authOk: true,
    season,
    week: week ?? currentWeek ?? leagues[0]?.week ?? null,
    currentWeek,
    anyGamesLive,
    nextRefreshMs: chooseRefresh(nflResult, leagues),
    fetchedAt: new Date().toISOString(),
    leagues,
    errors,
  };
}

/**
 * Cached, de-duplicated matchup aggregation. Multiple tabs polling at once
 * collapse into a single upstream round of ESPN requests every ~15s.
 */
export async function getMatchups(opts: { week?: number; forceDiscovery?: boolean } = {}): Promise<MatchupsResponse> {
  const key = `w${opts.week ?? "current"}`;
  const now = Date.now();
  const entry = cache.get(key);

  if (!opts.forceDiscovery && entry) {
    if (now - entry.at < CACHE_TTL_MS) return entry.value;
    if (entry.inflight) return entry.inflight;
  }

  const inflight = build(opts.week, !!opts.forceDiscovery)
    .then((value) => {
      cache.set(key, { at: Date.now(), value, inflight: null });
      return value;
    })
    .catch((err: unknown) => {
      cache.delete(key);
      throw err;
    });

  cache.set(key, { at: entry?.at ?? 0, value: entry?.value ?? emptyResponse(currentSeason(), "", true), inflight });
  return inflight;
}
