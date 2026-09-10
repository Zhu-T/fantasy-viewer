import { espnGet } from "./http";
import { currentSeason, readJson, writeJson } from "./store";
import type { EspnCookies, LeagueRef } from "./types";

const LEAGUES_FILE = "leagues.json";
const DISCOVERY_TTL_MS = 6 * 60 * 60 * 1000;
const FFL_GAME_ID = 1;
const FANTASY_PREFERENCE_TYPE = 9;

interface StoredLeagues {
  season: number;
  fetchedAt: string;
  leagues: LeagueRef[];
}

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

export function leaguesFromEnv(season: number): LeagueRef[] {
  return (process.env.LEAGUE_IDS ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((leagueId) => ({ leagueId, season, source: "env" as const }));
}

/**
 * Discovered leagues, cached on disk for a few hours. Fan-API results are
 * merged with any LEAGUE_IDS from the environment (env wins nothing; it only
 * fills in leagues the fan API missed).
 */
export async function getLeagues(cookies: EspnCookies, opts: { force?: boolean } = {}): Promise<{
  leagues: LeagueRef[];
  discoveryError: string | null;
}> {
  const season = currentSeason();
  const cached = readJson<StoredLeagues>(LEAGUES_FILE);
  const fresh =
    cached && cached.season === season && Date.now() - Date.parse(cached.fetchedAt) < DISCOVERY_TTL_MS;

  let fanLeagues: LeagueRef[] = [];
  let discoveryError: string | null = null;

  if (!opts.force && fresh && cached) {
    fanLeagues = cached.leagues.filter((l) => l.source === "fan");
  } else {
    try {
      fanLeagues = await discoverLeaguesFromFan(cookies, season);
      writeJson(LEAGUES_FILE, { season, fetchedAt: new Date().toISOString(), leagues: fanLeagues } satisfies StoredLeagues);
    } catch (err) {
      discoveryError = err instanceof Error ? err.message : String(err);
      if (cached?.season === season) fanLeagues = cached.leagues.filter((l) => l.source === "fan");
    }
  }

  const merged = new Map<string, LeagueRef>();
  for (const l of fanLeagues) merged.set(l.leagueId, l);
  for (const l of leaguesFromEnv(season)) if (!merged.has(l.leagueId)) merged.set(l.leagueId, l);

  return { leagues: [...merged.values()], discoveryError };
}
