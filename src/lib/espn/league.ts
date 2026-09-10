import { normalizeSwid } from "./auth";
import { espnGet } from "./http";
import { gameForProTeam, PRO_TEAM_ABBREV, type NflWeekState } from "./nfl";
import type { EspnCookies, GameState, LeagueRef, MyMatchup, PlayerLine, TeamSide } from "./types";

const POSITION_NAMES: Record<number, string> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 7: "P", 9: "DT", 10: "DE", 11: "LB",
  12: "CB", 13: "S", 14: "HC", 16: "D/ST",
};

const SLOT_NAMES: Record<number, string> = {
  0: "QB", 1: "TQB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE", 7: "OP", 8: "DT",
  9: "DE", 10: "LB", 11: "DL", 12: "CB", 13: "S", 14: "DB", 15: "DP", 16: "D/ST", 17: "K",
  18: "P", 19: "HC", 20: "BE", 21: "IR", 22: "", 23: "FLEX", 24: "EDR", 25: "RB/WR/TE",
};
const NON_STARTER_SLOTS = new Set([20, 21]);

/* ---------- Raw ESPN shapes (partial, defensive) ---------- */

interface RawStat {
  scoringPeriodId?: number;
  statSourceId?: number; // 0 actual, 1 projected
  statSplitTypeId?: number; // 1 = single scoring period
  appliedTotal?: number;
}

interface RawRosterEntry {
  lineupSlotId?: number;
  playerId?: number;
  playerPoolEntry?: {
    appliedStatTotal?: number;
    player?: {
      id?: number;
      fullName?: string;
      defaultPositionId?: number;
      proTeamId?: number;
      injuryStatus?: string;
      stats?: RawStat[];
    };
  };
}

interface RawSide {
  teamId?: number;
  totalPoints?: number;
  totalPointsLive?: number;
  totalProjectedPointsLive?: number;
  pointsByScoringPeriod?: Record<string, number>;
  rosterForCurrentScoringPeriod?: { entries?: RawRosterEntry[] };
  rosterForMatchupPeriod?: { entries?: RawRosterEntry[] };
}

interface RawMatchup {
  id?: number;
  matchupPeriodId?: number;
  playoffTierType?: string;
  winner?: "UNDECIDED" | "HOME" | "AWAY" | "TIE" | string;
  home?: RawSide;
  away?: RawSide;
}

interface RawTeam {
  id?: number;
  abbrev?: string;
  name?: string;
  location?: string;
  nickname?: string;
  logo?: string;
  owners?: string[];
  primaryOwner?: string;
  record?: { overall?: { wins?: number; losses?: number; ties?: number } };
}

interface RawLeague {
  id?: number;
  seasonId?: number;
  scoringPeriodId?: number;
  status?: { currentMatchupPeriod?: number; latestScoringPeriod?: number; finalScoringPeriod?: number };
  settings?: {
    name?: string;
    scheduleSettings?: { matchupPeriods?: Record<string, number[]> };
  };
  teams?: RawTeam[];
  schedule?: RawMatchup[];
}

/* ---------- Fetch ---------- */

export function leagueUrl(leagueId: string, season: number, scoringPeriodId?: number): string {
  const params = new URLSearchParams();
  for (const v of ["mTeam", "mSettings", "mMatchupScore", "mScoreboard", "mRoster", "mStatus"]) params.append("view", v);
  if (scoringPeriodId) params.set("scoringPeriodId", String(scoringPeriodId));
  return `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?${params}`;
}

export async function fetchRawLeague(
  ref: LeagueRef,
  cookies: EspnCookies,
  scoringPeriodId?: number,
): Promise<RawLeague> {
  return espnGet<RawLeague>(leagueUrl(ref.leagueId, ref.season, scoringPeriodId), cookies);
}

/* ---------- Normalization ---------- */

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function teamDisplayName(t: RawTeam): string {
  if (t.name?.trim()) return t.name.trim();
  return `${t.location ?? ""} ${t.nickname ?? ""}`.trim() || `Team ${t.id ?? "?"}`;
}

function recordString(t: RawTeam): string {
  const o = t.record?.overall;
  if (!o) return "";
  const base = `${o.wins ?? 0}-${o.losses ?? 0}`;
  return o.ties ? `${base}-${o.ties}` : base;
}

function findMyTeam(league: RawLeague, ref: LeagueRef, swid: string): RawTeam | undefined {
  const teams = league.teams ?? [];
  if (ref.teamId != null) {
    const byId = teams.find((t) => t.id === ref.teamId);
    if (byId) return byId;
  }
  const me = normalizeSwid(swid);
  return teams.find(
    (t) => (t.owners ?? []).some((o) => normalizeSwid(o) === me) || normalizeSwid(t.primaryOwner) === me,
  );
}

function matchupPeriodForScoringPeriod(league: RawLeague, scoringPeriodId: number): number {
  const map = league.settings?.scheduleSettings?.matchupPeriods ?? {};
  for (const [mp, sps] of Object.entries(map)) {
    if (sps.includes(scoringPeriodId)) return Number(mp);
  }
  return league.status?.currentMatchupPeriod ?? scoringPeriodId;
}

function projectedForPeriod(stats: RawStat[] | undefined, scoringPeriodId: number): number | null {
  const hit = (stats ?? []).find(
    (s) => s.statSourceId === 1 && s.scoringPeriodId === scoringPeriodId && (s.statSplitTypeId ?? 1) === 1,
  );
  return typeof hit?.appliedTotal === "number" ? round(hit.appliedTotal) : null;
}

function actualForPeriod(entry: RawRosterEntry, scoringPeriodId: number): number {
  const pool = entry.playerPoolEntry;
  const hit = (pool?.player?.stats ?? []).find(
    (s) => s.statSourceId === 0 && s.scoringPeriodId === scoringPeriodId && (s.statSplitTypeId ?? 1) === 1,
  );
  if (typeof hit?.appliedTotal === "number") return round(hit.appliedTotal);
  return round(pool?.appliedStatTotal ?? 0);
}

function buildPlayers(entries: RawRosterEntry[] | undefined, scoringPeriodId: number, nfl: NflWeekState | null): PlayerLine[] {
  const lines: PlayerLine[] = [];
  for (const e of entries ?? []) {
    const slotId = e.lineupSlotId ?? 20;
    if (NON_STARTER_SLOTS.has(slotId)) continue;
    const p = e.playerPoolEntry?.player;
    const proTeamId = p?.proTeamId ?? 0;
    const game = gameForProTeam(nfl, proTeamId);
    lines.push({
      id: p?.id ?? e.playerId ?? 0,
      name: p?.fullName ?? `Player ${e.playerId ?? "?"}`,
      position: POSITION_NAMES[p?.defaultPositionId ?? -1] ?? "",
      slot: SLOT_NAMES[slotId] ?? String(slotId),
      proTeam: PRO_TEAM_ABBREV[proTeamId] ?? "",
      points: actualForPeriod(e, scoringPeriodId),
      projected: projectedForPeriod(p?.stats, scoringPeriodId),
      gameState: game.state,
      gameDetail: game.detail,
      injuryStatus: p?.injuryStatus && p.injuryStatus !== "ACTIVE" ? p.injuryStatus : undefined,
    });
  }
  // Keep ESPN's lineup order: QB, RB, WR, TE, FLEX, D/ST, K.
  const order = ["QB", "TQB", "RB", "RB/WR", "WR", "WR/TE", "TE", "FLEX", "RB/WR/TE", "OP", "D/ST", "K", "P", "HC"];
  lines.sort((a, b) => {
    const ai = order.indexOf(a.slot);
    const bi = order.indexOf(b.slot);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return lines;
}

function countStates(players: PlayerLine[]): Pick<TeamSide, "yetToPlay" | "inProgress" | "finished"> {
  let yetToPlay = 0;
  let inProgress = 0;
  let finished = 0;
  for (const p of players) {
    if (p.gameState === "pre") yetToPlay++;
    else if (p.gameState === "in") inProgress++;
    else if (p.gameState === "post" || p.gameState === "bye") finished++;
  }
  return { yetToPlay, inProgress, finished };
}

function buildSide(
  side: RawSide,
  team: RawTeam,
  scoringPeriodId: number,
  matchupIsFinal: boolean,
  nfl: NflWeekState | null,
): TeamSide {
  const entries = side.rosterForCurrentScoringPeriod?.entries ?? side.rosterForMatchupPeriod?.entries;
  const starters = buildPlayers(entries, scoringPeriodId, nfl);
  const starterSum = round(starters.reduce((s, p) => s + p.points, 0));

  const periodPoints = side.pointsByScoringPeriod?.[String(scoringPeriodId)];
  let points: number;
  if (typeof side.totalPointsLive === "number" && !matchupIsFinal) points = side.totalPointsLive;
  else if (typeof periodPoints === "number") points = periodPoints;
  else if (typeof side.totalPoints === "number") points = side.totalPoints;
  else points = starterSum;
  // If ESPN reports a stale 0 while players have produced, prefer the roster sum.
  if (points === 0 && starterSum > 0) points = starterSum;

  let projected: number | null = null;
  if (matchupIsFinal) {
    projected = null;
  } else if (typeof side.totalProjectedPointsLive === "number") {
    projected = round(side.totalProjectedPointsLive);
  } else if (starters.length) {
    projected = round(
      starters.reduce((s, p) => {
        if (p.gameState === "post" || p.gameState === "bye") return s + p.points;
        if (p.gameState === "in") return s + Math.max(p.points, p.projected ?? 0);
        return s + (p.projected ?? 0);
      }, 0),
    );
  }

  return {
    teamId: team.id ?? side.teamId ?? 0,
    name: teamDisplayName(team),
    abbrev: team.abbrev ?? "",
    logo: team.logo,
    record: recordString(team),
    points: round(points),
    projected,
    starters,
    ...countStates(starters),
  };
}

/**
 * Reduce a raw league payload to "my matchup" for the given scoring period.
 * Returns null when I'm not in the league (or ESPN gave us no teams).
 */
export function extractMyMatchup(
  league: RawLeague,
  ref: LeagueRef,
  swid: string,
  nfl: NflWeekState | null,
  scoringPeriodId?: number,
): MyMatchup | null {
  const period = scoringPeriodId ?? league.scoringPeriodId ?? 1;
  const matchupPeriod = matchupPeriodForScoringPeriod(league, period);
  const leagueName = league.settings?.name ?? ref.leagueName ?? `League ${ref.leagueId}`;
  const leagueUrl = `https://fantasy.espn.com/football/league?leagueId=${ref.leagueId}`;

  const myTeam = findMyTeam(league, ref, swid);
  if (!myTeam) return null;

  const teamsById = new Map((league.teams ?? []).map((t) => [t.id, t]));
  const matchup = (league.schedule ?? []).find(
    (m) => m.matchupPeriodId === matchupPeriod && (m.home?.teamId === myTeam.id || m.away?.teamId === myTeam.id),
  );

  const winner = matchup?.winner ?? "UNDECIDED";
  const isFinal = winner !== "UNDECIDED";

  if (!matchup) {
    // No game this week (bye in playoffs / eliminated).
    const me = buildSide({ teamId: myTeam.id }, myTeam, period, true, nfl);
    return {
      leagueId: ref.leagueId,
      leagueName,
      leagueUrl,
      week: period,
      status: "final",
      result: null,
      isBye: true,
      isPlayoff: false,
      me,
      opponent: null,
    };
  }

  const iAmHome = matchup.home?.teamId === myTeam.id;
  const mySide = (iAmHome ? matchup.home : matchup.away) ?? { teamId: myTeam.id };
  const oppSide = iAmHome ? matchup.away : matchup.home;
  const oppTeam = oppSide?.teamId != null ? teamsById.get(oppSide.teamId) : undefined;

  const me = buildSide(mySide, myTeam, period, isFinal, nfl);
  const opponent = oppSide && oppTeam ? buildSide(oppSide, oppTeam, period, isFinal, nfl) : null;

  let result: MyMatchup["result"] = null;
  if (winner === "TIE") result = "T";
  else if (winner === "HOME") result = iAmHome ? "W" : "L";
  else if (winner === "AWAY") result = iAmHome ? "L" : "W";

  let status: MyMatchup["status"];
  if (isFinal) status = "final";
  else {
    const all = [...me.starters, ...(opponent?.starters ?? [])];
    const anyStarted = all.some((p) => p.gameState === "in" || p.gameState === "post");
    const anyPoints = me.points > 0 || (opponent?.points ?? 0) > 0;
    status = anyStarted || anyPoints ? "live" : "pre";
  }

  return {
    leagueId: ref.leagueId,
    leagueName,
    leagueUrl,
    week: period,
    status,
    result,
    isBye: !opponent,
    isPlayoff: !!matchup.playoffTierType && matchup.playoffTierType !== "NONE",
    me,
    opponent,
  };
}

export function stateLabel(state: GameState): string {
  switch (state) {
    case "pre": return "Yet to play";
    case "in": return "In progress";
    case "post": return "Final";
    case "bye": return "Bye";
    default: return "";
  }
}
