import type { GameState } from "./types";

/** ESPN fantasy `proTeamId` → NFL abbreviation used by the public scoreboard API. */
export const PRO_TEAM_ABBREV: Record<number, string> = {
  0: "FA",
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
  9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
  17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

export interface ProGame {
  state: GameState;
  detail: string;
  opponent: string;
  kickoff: string;
  kickoffIso?: string;
}

export interface NflWeekState {
  week: number | null;
  seasonType: number | null;
  anyLive: boolean;
  byTeam: Record<string, ProGame>;
  fetchedAt: string;
}

interface ScoreboardResponse {
  week?: { number?: number };
  season?: { type?: number; year?: number };
  events?: Array<{
    date?: string;
    status?: { type?: { state?: string; shortDetail?: string; detail?: string; completed?: boolean } };
    competitions?: Array<{
      date?: string;
      status?: { type?: { state?: string; shortDetail?: string } };
      competitors?: Array<{ team?: { abbreviation?: string } }>;
    }>;
  }>;
}

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

let cache: { at: number; value: NflWeekState } | null = null;
const CACHE_MS = 10_000;

function normalizeState(raw: string | undefined): GameState {
  if (raw === "pre" || raw === "in" || raw === "post") return raw;
  return "unknown";
}

function kickoffLabel(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * Current NFL week game states keyed by team abbreviation. Public endpoint, no
 * auth. Teams absent from the map are on bye (or the API changed on us).
 */
export async function getNflWeekState(opts: { week?: number; season?: number } = {}): Promise<NflWeekState> {
  const keyed = !opts.week;
  if (keyed && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const url = new URL(SCOREBOARD_URL);
  if (opts.week) {
    url.searchParams.set("week", String(opts.week));
    url.searchParams.set("seasontype", "2");
    if (opts.season) url.searchParams.set("dates", String(opts.season));
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`NFL scoreboard ${res.status}`);
  const data = (await res.json()) as ScoreboardResponse;

  const byTeam: Record<string, ProGame> = {};
  let anyLive = false;
  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    const state = normalizeState(comp?.status?.type?.state ?? ev.status?.type?.state);
    const detail = comp?.status?.type?.shortDetail ?? ev.status?.type?.shortDetail ?? "";
    const teams = (comp?.competitors ?? []).map((c) => c.team?.abbreviation).filter(Boolean) as string[];
    if (state === "in") anyLive = true;
    const kickoffIso = comp?.date ?? ev.date;
    const kickoff = kickoffLabel(kickoffIso);
    for (const t of teams) {
      byTeam[t] = {
        state,
        detail: state === "pre" ? kickoff || detail : detail,
        opponent: teams.find((o) => o !== t) ?? "",
        kickoff,
        kickoffIso,
      };
    }
  }

  const value: NflWeekState = {
    week: data.week?.number ?? null,
    seasonType: data.season?.type ?? null,
    anyLive,
    byTeam,
    fetchedAt: new Date().toISOString(),
  };
  if (keyed) cache = { at: Date.now(), value };
  return value;
}

export function gameForProTeam(nfl: NflWeekState | null, proTeamId: number): ProGame {
  const abbrev = PRO_TEAM_ABBREV[proTeamId];
  if (!nfl || !abbrev || abbrev === "FA") return { state: "unknown", detail: "", opponent: "", kickoff: "" };
  return nfl.byTeam[abbrev] ?? { state: "bye", detail: "BYE", opponent: "", kickoff: "" };
}
