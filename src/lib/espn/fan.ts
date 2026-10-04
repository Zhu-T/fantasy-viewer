import { cookiesKey, sessionCookies } from "./auth";
import { espnGet } from "./http";
import { currentSeason, globalSingleton } from "./store";
import { EspnAuthError, type EspnCookies, type LeagueRef, type Session } from "./types";

const DISCOVERY_TTL_MS = 6 * 60 * 60 * 1000;
const FFL_GAME_ID = 1;
const FANTASY_PREFERENCE_TYPE = 9;

interface CachedLeagues {
  season: number;
  at: number;
  leagues: LeagueRef[];
}

const discoveryCache = globalSingleton<Map<string, CachedLeagues>>("discovery", () => new Map());

/* Loose shape of the fan API. Everything is optional; we parse defensively. */
interface FanPreference {
  typeId?: number;
  type?: { id?: number; code?: string };
  metaData?: {
    entry?: {
      entryId?: number;
      gameId?: number;
      seasonId?: number;
      name?: string;
      abbrev?: string;
      entryMetadata?: { teamName?: string; teamAbbrev?: string };
      groups?: Array<{ groupId?: number | string; groupName?: string; href?: string }>;
    };
  };
}

interface FanResponse {
  preferences?: FanPreference[];
}

function fanUrl(swid: string): string {
  const id = swid.startsWith("{") ? swid : `{${swid}}`;
  const params = new URLSearchParams({
    displayEvents: "true",
    displayNow: "true",
    displayRecs: "true",
    displayHidden: "true",
    platform: "web",
    source: "ESPN.com - FAM",
  });
  params.append("featureFlags", "challengeEntries");
  params.append("featureFlags", "expandAthlete");
  params.append("featureFlags", "isolateEvents");
  return `https://fan.api.espn.com/apis/v2/fans/${encodeURIComponent(id)}?${params}`;
}

/** Ask ESPN's fan API which fantasy football teams this SWID owns this season. */
export async function discoverLeaguesFromFan(cookies: EspnCookies, season: number): Promise<LeagueRef[]> {
  const data = await espnGet<FanResponse>(fanUrl(cookies.SWID), cookies);
  const out = new Map<string, LeagueRef>();

  for (const pref of data.preferences ?? []) {
    const typeId = pref.typeId ?? pref.type?.id;
    if (typeId !== FANTASY_PREFERENCE_TYPE) continue;
    const entry = pref.metaData?.entry;
    if (!entry || entry.gameId !== FFL_GAME_ID) continue;
    if (entry.seasonId && entry.seasonId !== season) continue;

    for (const group of entry.groups ?? []) {
      let leagueId = group.groupId != null ? String(group.groupId) : "";
      if (!leagueId && group.href) {
        leagueId = new URL(group.href).searchParams.get("leagueId") ?? "";
      }
      if (!leagueId) continue;
      out.set(leagueId, {
        leagueId,
        season,
        teamId: entry.entryId,
        leagueName: group.groupName,
        teamName: entry.entryMetadata?.teamName ?? entry.name,
        source: "fan",
      });
    }
  }
  return [...out.values()];
}

/** League refs for leagues the user added by ID (with the team they picked). */
export function savedLeagueRefs(session: Session, season: number): LeagueRef[] {
  return (session.leagues ?? []).map((l) => ({
    leagueId: l.leagueId,
    season,
    teamId: l.teamId,
    leagueName: l.leagueName,
    teamName: l.teamName,
    source: "manual" as const,
  }));
}

/**
 * Leagues to show: the ones discovered from the user's ESPN account (when they
 * connected cookies; cached in memory per account for a few hours) plus the
 * ones they added by ID. An added league overrides discovery for the same ID,
 * since the user explicitly picked a team there.
 */
export async function getLeagues(session: Session, opts: { force?: boolean } = {}): Promise<{
  leagues: LeagueRef[];
  discoveryError: string | null;
}> {
  const season = currentSeason();
  const cookies = sessionCookies(session);

  let fanLeagues: LeagueRef[] = [];
  let discoveryError: string | null = null;

  if (cookies) {
    const cacheKey = cookiesKey(cookies);
    const cached = discoveryCache.get(cacheKey);
    const fresh = cached && cached.season === season && Date.now() - cached.at < DISCOVERY_TTL_MS;
    if (!opts.force && fresh && cached) {
      fanLeagues = cached.leagues;
    } else {
      try {
        fanLeagues = await discoverLeaguesFromFan(cookies, season);
        discoveryCache.set(cacheKey, { season, at: Date.now(), leagues: fanLeagues });
      } catch (err) {
        if (err instanceof EspnAuthError) throw err;
        discoveryError = err instanceof Error ? err.message : String(err);
        if (cached?.season === season) fanLeagues = cached.leagues;
      }
    }
  }

  const merged = new Map<string, LeagueRef>();
  for (const l of fanLeagues) merged.set(l.leagueId, l);
  for (const l of savedLeagueRefs(session, season)) merged.set(l.leagueId, l);

  return { leagues: [...merged.values()], discoveryError };
}
