import { sessionCookies, sessionKey } from "./auth";
import { getLeagues } from "./fan";
import { currentScoringPeriod, extractLeagueMatchups, extractMyMatchup, fetchLeagueWeek, fetchRawLeague } from "./league";
import { getNflWeekState, type NflWeekState } from "./nfl";
import { currentSeason, globalSingleton } from "./store";
import {
  EspnAuthError,
  EspnHttpError,
  type CookieState,
  type LeagueError,
  type LeagueRef,
  type LeagueViewResponse,
  type MatchupsResponse,
  type MyMatchup,
  type Session,
} from "./types";

const CACHE_TTL_MS = 10_000;
const STALE_MS = 10 * 60_000;
const LIVE_REFRESH_MS = 15_000;
const IDLE_REFRESH_MS = 5 * 60_000;
const PRE_KICKOFF_REFRESH_MS = 60_000;

interface CacheEntry {
  at: number;
  value: unknown;
  inflight: Promise<unknown> | null;
}

const cache = globalSingleton<Map<string, CacheEntry>>("matchupCache", () => new Map());

/**
 * 10s cache with in-flight de-duplication: several tabs polling at once
 * collapse into one upstream round of ESPN requests (per warm instance).
 */
async function cached<T>(key: string, force: boolean, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);
  if (!force && entry) {
    if (entry.inflight) return entry.inflight as Promise<T>;
    if (now - entry.at < CACHE_TTL_MS) return entry.value as T;
  }

  // Many users share an instance: drop entries nobody has polled for a while.
  for (const [k, e] of cache) if (!e.inflight && now - e.at > STALE_MS) cache.delete(k);

  const inflight = fn()
    .then((value) => {
      cache.set(key, { at: Date.now(), value, inflight: null });
      return value;
    })
    .catch((err: unknown) => {
      cache.delete(key);
      throw err;
    });
  cache.set(key, { at: entry?.at ?? 0, value: entry?.value, inflight });
  return inflight;
}

function userPrefix(session: Session): string {
  return `${sessionKey(session)}:`;
}

export function invalidateMatchupCache(session: Session): void {
  const prefix = userPrefix(session);
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export function emptyResponse(season: number, message: string, configured: boolean, cookieState: CookieState = "none"): MatchupsResponse {
  return {
    configured,
    cookieState,
    message,
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

/**
 * NFL game states for the week being shown: the live scoreboard for the
 * current week, that week's (finished) games for a past week.
 */
function nflStateFor(season: number, week: number | undefined): Promise<NflWeekState | null> {
  return getNflWeekState(week ? { week, season } : {}).catch(() => null);
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

const EXPIRED_MESSAGE = "ESPN rejected your saved cookies. They may have expired; connect again.";
const PRIVATE_MESSAGE = "This league is private. Connect your ESPN account to view it.";

async function build(session: Session, week: number | undefined, forceDiscovery: boolean): Promise<MatchupsResponse> {
  const season = currentSeason();
  let cookies = sessionCookies(session);
  let cookieState: CookieState = cookies ? "ok" : "none";
  const nflPromise = nflStateFor(season, week);

  let discovered: Awaited<ReturnType<typeof getLeagues>>;
  try {
    discovered = await getLeagues(session, { force: forceDiscovery });
  } catch (err) {
    if (!(err instanceof EspnAuthError)) throw err;
    // Dead cookies: still show the leagues added by ID, fetched anonymously.
    cookieState = "expired";
    cookies = null;
    discovered = await getLeagues({ leagues: session.leagues });
  }
  const { leagues: refs, discoveryError } = discovered;
  const nflResult = await nflPromise;

  const errors: LeagueError[] = [];
  if (discoveryError) errors.push({ leagueId: "discovery", error: `League discovery failed: ${discoveryError}` });

  const results = await Promise.allSettled(
    refs.map(async (ref) => {
      const raw = await fetchRawLeague(ref, cookies, week);
      const matchup = extractMyMatchup(raw, ref, cookies?.SWID, nflResult, week);
      if (!matchup) throw new Error("Could not find your team in this league. Remove it and add it again.");
      return { matchup, currentWeek: currentScoringPeriod(raw) };
    }),
  );

  const leagues: MyMatchup[] = [];
  let currentWeek: number | null = null;
  let authFailures = 0;
  results.forEach((r, i) => {
    const ref = refs[i];
    if (r.status === "fulfilled") {
      leagues.push(r.value.matchup);
      currentWeek ??= r.value.currentWeek;
      return;
    }
    const err = r.reason;
    const denied = err instanceof EspnAuthError;
    if (denied) authFailures++;
    errors.push({
      leagueId: ref.leagueId,
      leagueName: ref.leagueName,
      error: denied ? (cookies ? "ESPN denied access to this league." : PRIVATE_MESSAGE) : err instanceof Error ? err.message : String(err),
      needsCookies: denied && !cookies,
    });
  });

  // With cookies, every league refusing us means the cookies died, not that the leagues are private.
  if (cookies && refs.length > 0 && authFailures === refs.length) cookieState = "expired";

  leagues.sort((a, b) => a.leagueName.localeCompare(b.leagueName));
  const anyGamesLive = nflResult?.anyLive ?? leagues.some((l) => l.status === "live");

  return {
    configured: true,
    cookieState,
    message: cookieState === "expired" ? EXPIRED_MESSAGE : undefined,
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

/** My matchup in every league, cached per session. */
export function getMatchups(
  session: Session,
  opts: { week?: number; forceDiscovery?: boolean } = {},
): Promise<MatchupsResponse> {
  const key = `${userPrefix(session)}w${opts.week ?? "current"}`;
  return cached(key, !!opts.forceDiscovery, () => build(session, opts.week, !!opts.forceDiscovery));
}

async function buildLeagueView(session: Session, leagueId: string, week: number | undefined): Promise<LeagueViewResponse> {
  const season = currentSeason();
  const cookies = sessionCookies(session);
  const saved = session.leagues?.find((l) => l.leagueId === leagueId);
  const ref: LeagueRef = { leagueId, season, teamId: saved?.teamId, leagueName: saved?.leagueName, source: "manual" };
  const nflPromise = nflStateFor(season, week);

  const base = {
    leagueId,
    leagueName: saved?.leagueName ?? `League ${leagueId}`,
    leagueUrl: `https://fantasy.espn.com/football/league?leagueId=${leagueId}`,
    season,
    week: week ?? null,
    currentWeek: null,
    anyGamesLive: false,
    nextRefreshMs: IDLE_REFRESH_MS,
    fetchedAt: new Date().toISOString(),
    matchups: [],
  };

  let fetched;
  try {
    fetched = await fetchLeagueWeek(ref, cookies, week);
  } catch (err) {
    if (err instanceof EspnAuthError) {
      return {
        ...base,
        error: cookies ? "ESPN denied access to this league. Your cookies may have expired." : PRIVATE_MESSAGE,
        needsCookies: true,
      };
    }
    if (err instanceof EspnHttpError && err.status === 404) {
      return { ...base, error: `ESPN has no football league ${leagueId} for the ${season} season. Check the league ID.` };
    }
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }

  const nfl = await nflPromise;
  const { raw, period, currentWeek } = fetched;
  const view = extractLeagueMatchups(raw, ref, cookies?.SWID, nfl, period);
  return {
    ...base,
    leagueName: view.leagueName,
    leagueUrl: view.leagueUrl,
    week: view.week,
    currentWeek,
    myTeamId: view.myTeamId,
    anyGamesLive: nfl?.anyLive ?? view.matchups.some((m) => m.status === "live"),
    nextRefreshMs: chooseRefresh(nfl, view.matchups),
    matchups: view.matchups,
  };
}

/** Every matchup in one league for a week, cached per session. */
export function getLeagueView(session: Session, leagueId: string, week?: number): Promise<LeagueViewResponse> {
  return cached(`${userPrefix(session)}league:${leagueId}:w${week ?? "current"}`, false, () =>
    buildLeagueView(session, leagueId, week),
  );
}
