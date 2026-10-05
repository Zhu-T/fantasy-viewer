import { normalizeSwid } from "./auth";
import { espnGet } from "./http";
import { gameForProTeam, PRO_TEAM_ABBREV, type NflWeekState, type ProGame } from "./nfl";
import type { EspnCookies, GameState, LeagueLookup, LeagueRef, MyMatchup, PlayerLine, TeamSide } from "./types";

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
  seasonId?: number;
  scoringPeriodId?: number;
  statSourceId?: number; // 0 actual, 1 projected
  statSplitTypeId?: number; // 1 = single scoring period
  appliedTotal?: number;
  /** ESPN stat id → value, e.g. "3" passing yards. */
  stats?: Record<string, number>;
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
  /** ESPN's own win probability for this side (comes with mMatchupScore). */
  winProbability?: number;
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

const MATCHUP_VIEWS = ["mTeam", "mSettings", "mMatchupScore", "mScoreboard", "mRoster", "mStatus"];

export function leagueUrl(leagueId: string, season: number, scoringPeriodId?: number, views = MATCHUP_VIEWS): string {
  const params = new URLSearchParams();
  for (const v of views) params.append("view", v);
  if (scoringPeriodId) params.set("scoringPeriodId", String(scoringPeriodId));
  return `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?${params}`;
}

/** Public leagues answer without cookies; private ones throw EspnAuthError. */
export async function fetchRawLeague(
  ref: LeagueRef,
  cookies: EspnCookies | null,
  scoringPeriodId?: number,
): Promise<RawLeague> {
  return espnGet<RawLeague>(leagueUrl(ref.leagueId, ref.season, scoringPeriodId), cookies);
}

const WEEK_VIEWS = ["mTeam", "mSettings", "mStatus", "mMatchupScore", "mScoreboard", "mBoxscore", "mRoster"];

/**
 * One league week with every matchup's lineups, for the league page. Asking
 * for the whole season (as the home page does) makes ESPN skip lineups for
 * other teams' matchups, so this first reads the league's current week and
 * schedule, then requests exactly that week's matchups with box scores, the
 * way ESPN's own scoreboard does (x-fantasy-filter on the matchup period).
 */
export async function fetchLeagueWeek(
  ref: LeagueRef,
  cookies: EspnCookies | null,
  week?: number,
): Promise<{ raw: RawLeague; period: number; currentWeek: number | null }> {
  const settings = await espnGet<RawLeague>(leagueUrl(ref.leagueId, ref.season, undefined, ["mSettings", "mStatus"]), cookies);
  const currentWeek = currentScoringPeriod(settings);
  const period = week ?? settings.scoringPeriodId ?? currentWeek ?? 1;
  const filter = { schedule: { filterMatchupPeriodIds: { value: [matchupPeriodForScoringPeriod(settings, period)] } } };
  const raw = await espnGet<RawLeague>(leagueUrl(ref.leagueId, ref.season, period, WEEK_VIEWS), cookies, {
    headers: { "x-fantasy-filter": JSON.stringify(filter) },
  });
  return { raw, period, currentWeek };
}

/** League name + teams, for picking "which team is mine" when adding a league by ID. */
export async function lookupLeague(leagueId: string, season: number, cookies: EspnCookies | null): Promise<LeagueLookup> {
  const raw = await espnGet<RawLeague>(leagueUrl(leagueId, season, undefined, ["mTeam", "mSettings"]), cookies);
  const ref: LeagueRef = { leagueId, season, source: "manual" };
  const mine = cookies ? findMyTeam(raw, ref, cookies.SWID) : undefined;
  return {
    leagueId,
    leagueName: raw.settings?.name ?? `League ${leagueId}`,
    teams: (raw.teams ?? [])
      .filter((t) => t.id != null)
      .map((t) => ({ id: t.id!, name: teamDisplayName(t), abbrev: t.abbrev ?? "", logo: secureImageUrl(t.logo) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    myTeamId: mine?.id,
  };
}

/* ---------- Normalization ---------- */

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Team logos are whatever URL the owner picked; older ones can be http:// or
 * protocol-relative, which an HTTPS page won't load. Force https.
 */
function secureImageUrl(url: string | undefined): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  if (u.startsWith("//")) return `https:${u}`;
  return u.replace(/^http:\/\//i, "https://");
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

function findMyTeam(league: RawLeague, ref: LeagueRef, swid: string | undefined): RawTeam | undefined {
  const teams = league.teams ?? [];
  if (ref.teamId != null) {
    const byId = teams.find((t) => t.id === ref.teamId);
    if (byId) return byId;
  }
  const me = normalizeSwid(swid);
  if (!me) return undefined;
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

/*
 * A player's stats include other seasons for the same week number (e.g. week 3
 * of last season), so match the season too, not just the scoring period.
 */
function statFor(stats: RawStat[] | undefined, season: number, scoringPeriodId: number, source: 0 | 1): RawStat | undefined {
  return (stats ?? []).find(
    (s) =>
      s.statSourceId === source &&
      s.scoringPeriodId === scoringPeriodId &&
      (s.seasonId ?? season) === season &&
      (s.statSplitTypeId ?? 1) === 1,
  );
}

function projectedForPeriod(stats: RawStat[] | undefined, season: number, scoringPeriodId: number): number | null {
  const hit = statFor(stats, season, scoringPeriodId, 1);
  return typeof hit?.appliedTotal === "number" ? round(hit.appliedTotal) : null;
}

function actualForPeriod(entry: RawRosterEntry, season: number, scoringPeriodId: number): number {
  const pool = entry.playerPoolEntry;
  const hit = statFor(pool?.player?.stats, season, scoringPeriodId, 0);
  if (typeof hit?.appliedTotal === "number") return round(hit.appliedTotal);
  return round(pool?.appliedStatTotal ?? 0);
}

/*
 * ESPN stat ids, checked against NFL box scores: 0/1/3/4/20 pass att/cmp/yds/TD/INT,
 * 23/24/25 rush car/yds/TD, 53/58/42/43 rec/targets/yds/TD, 83/84 FG made/att,
 * 86/87 XP made/att, 95 D/ST INT, 120 points allowed. From the espn-api project:
 * 72 fumbles lost, 99 sacks, 96 fumble recoveries.
 */
// The space between each number and its unit is a non-breaking space (U+00A0).
function statLine(raw: Record<string, number> | undefined): string | undefined {
  if (!raw) return undefined;
  const v = (id: number) => Math.round(raw[String(id)] ?? 0);
  const parts: string[] = [];
  const td = (n: number, what: string) => n && parts.push(`${n} ${what} TD`);

  if (v(0)) {
    parts.push(`${v(1)}/${v(0)}, ${v(3)} pass yds`);
    td(v(4), "pass");
    if (v(20)) parts.push(`${v(20)} INT`);
  }
  if (v(23)) {
    parts.push(`${v(23)} car, ${v(24)} rush yds`);
    td(v(25), "rush");
  }
  if (v(53) || v(58)) {
    parts.push(`${v(53)}/${v(58)} rec, ${v(42)} rec yds`);
    td(v(43), "rec");
  }
  if (v(72)) parts.push(`${v(72)} fum lost`);
  if (v(84)) parts.push(`FG ${v(83)}/${v(84)}`);
  if (v(87)) parts.push(`XP ${v(86)}/${v(87)}`);
  if (raw["120"] !== undefined) {
    if (v(99)) parts.push(`${v(99)} sack${v(99) === 1 ? "" : "s"}`);
    if (v(95)) parts.push(`${v(95)} INT`);
    if (v(96)) parts.push(`${v(96)} FR`);
    parts.push(`${v(120)} pts allowed`);
  }
  return parts.length ? parts.join(", ") : undefined;
}

/**
 * FantasyCast-style live tags. Offense is on the field when their team has the
 * ball, a D/ST when the other team has it. Kickers only get the red-zone tag,
 * since they're on the field for kicks alone. No possession info, no tags.
 */
function fieldTags(position: string, game: ProGame): Pick<PlayerLine, "onField" | "redZone" | "situation"> {
  if (game.state !== "in" || game.hasBall === undefined) return {};
  const dst = position === "D/ST";
  const kicker = position === "K" || position === "P";
  return {
    onField: dst ? !game.hasBall : !kicker && game.hasBall,
    redZone: !dst && !!game.redZone,
    situation: game.downDistance,
  };
}

function buildPlayers(
  entries: RawRosterEntry[] | undefined,
  season: number,
  scoringPeriodId: number,
  nfl: NflWeekState | null,
): PlayerLine[] {
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
      points: actualForPeriod(e, season, scoringPeriodId),
      projected: projectedForPeriod(p?.stats, season, scoringPeriodId),
      statLine: game.state === "pre" ? undefined : statLine(statFor(p?.stats, season, scoringPeriodId, 0)?.stats),
      ...fieldTags(POSITION_NAMES[p?.defaultPositionId ?? -1] ?? "", game),
      gameState: game.state,
      gameDetail: game.detail,
      kickoffIso: game.state === "pre" ? game.kickoffIso : undefined,
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
  season: number,
  scoringPeriodId: number,
  matchupIsFinal: boolean,
  nfl: NflWeekState | null,
): TeamSide {
  const entries = side.rosterForCurrentScoringPeriod?.entries ?? side.rosterForMatchupPeriod?.entries;
  const starters = buildPlayers(entries, season, scoringPeriodId, nfl);
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
    logo: secureImageUrl(team.logo),
    record: recordString(team),
    points: round(points),
    projected,
    winProbability: matchupIsFinal ? null : parseWinProbability(side.winProbability),
    starters,
    ...countStates(starters),
  };
}

/** ESPN's raw win probability, or null when it's missing or not a sensible number. */
function parseWinProbability(raw: unknown): number | null {
  const n = Number(raw);
  return raw == null || !Number.isFinite(n) || n < 0 || n > 100 ? null : n;
}

/**
 * Puts both sides' win probabilities on a 0–1 scale. ESPN's format isn't
 * documented: the two sides add up to ~1 (fractions) or ~100 (percent), so
 * the sum tells which; with only one side, anything above 1 is a percent.
 */
function normalizeWinProbabilities(a: TeamSide, b: TeamSide | null): void {
  const sides = [a, b].filter((s): s is TeamSide => s != null && s.winProbability != null);
  if (!sides.length) return;
  const total = sides.reduce((sum, s) => sum + s.winProbability!, 0);
  const percent = sides.length === 2 ? total > 2 : total > 1;
  for (const s of sides) s.winProbability = Math.min(1, s.winProbability! / (percent ? 100 : 1));
}

interface LeagueContext {
  ref: LeagueRef;
  period: number;
  matchupPeriod: number;
  leagueName: string;
  leagueUrl: string;
  teamsById: Map<number | undefined, RawTeam>;
  nfl: NflWeekState | null;
}

function leagueContext(league: RawLeague, ref: LeagueRef, nfl: NflWeekState | null, scoringPeriodId?: number): LeagueContext {
  const period = scoringPeriodId ?? league.scoringPeriodId ?? 1;
  return {
    ref,
    period,
    matchupPeriod: matchupPeriodForScoringPeriod(league, period),
    leagueName: league.settings?.name ?? ref.leagueName ?? `League ${ref.leagueId}`,
    leagueUrl: `https://fantasy.espn.com/football/league?leagueId=${ref.leagueId}`,
    teamsById: new Map((league.teams ?? []).map((t) => [t.id, t])),
    nfl,
  };
}

/**
 * One schedule entry → MyMatchup. `focusTeamId` (my team) goes on the `me`
 * side and gets W/L; without it, home is `me` and `result` stays null.
 */
function toMatchup(ctx: LeagueContext, matchup: RawMatchup, focusTeamId: number | undefined): MyMatchup | null {
  const { period, nfl } = ctx;
  const winner = matchup.winner ?? "UNDECIDED";
  const isFinal = winner !== "UNDECIDED";
  const focusIsAway = focusTeamId != null && matchup.away?.teamId === focusTeamId;
  const meRaw = focusIsAway ? matchup.away : matchup.home;
  const oppRaw = focusIsAway ? matchup.home : matchup.away;
  const meTeam = meRaw?.teamId != null ? ctx.teamsById.get(meRaw.teamId) : undefined;
  if (!meRaw || !meTeam) return null;
  const oppTeam = oppRaw?.teamId != null ? ctx.teamsById.get(oppRaw.teamId) : undefined;

  const me = buildSide(meRaw, meTeam, ctx.ref.season, period, isFinal, nfl);
  const opponent = oppRaw && oppTeam ? buildSide(oppRaw, oppTeam, ctx.ref.season, period, isFinal, nfl) : null;
  normalizeWinProbabilities(me, opponent);
  const involvesMe = focusTeamId != null && (me.teamId === focusTeamId || opponent?.teamId === focusTeamId);

  let result: MyMatchup["result"] = null;
  if (involvesMe) {
    if (winner === "TIE") result = "T";
    else if (winner === "HOME") result = focusIsAway ? "L" : "W";
    else if (winner === "AWAY") result = focusIsAway ? "W" : "L";
  }

  // ESPN only declares a winner after the last game of the week (often Monday
  // night), so "undecided" alone doesn't mean anyone is playing right now.
  let status: MyMatchup["status"];
  if (isFinal) status = "final";
  else {
    const all = [...me.starters, ...(opponent?.starters ?? [])];
    const anyPlaying = all.some((p) => p.gameState === "in");
    const anyStarted = all.some((p) => p.gameState === "post") || me.points > 0 || (opponent?.points ?? 0) > 0;
    status = anyPlaying ? "live" : anyStarted ? "between" : "pre";
  }

  return {
    leagueId: ctx.ref.leagueId,
    leagueName: ctx.leagueName,
    leagueUrl: ctx.leagueUrl,
    week: period,
    matchupId: matchup.id,
    status,
    result,
    isBye: !opponent,
    isPlayoff: !!matchup.playoffTierType && matchup.playoffTierType !== "NONE",
    involvesMe,
    me,
    opponent,
  };
}

/**
 * Reduce a raw league payload to "my matchup" for the given scoring period.
 * Returns null when I'm not in the league (or ESPN gave us no teams).
 */
export function extractMyMatchup(
  league: RawLeague,
  ref: LeagueRef,
  swid: string | undefined,
  nfl: NflWeekState | null,
  scoringPeriodId?: number,
): MyMatchup | null {
  const ctx = leagueContext(league, ref, nfl, scoringPeriodId);
  const myTeam = findMyTeam(league, ref, swid);
  if (!myTeam) return null;

  const matchup = (league.schedule ?? []).find(
    (m) => m.matchupPeriodId === ctx.matchupPeriod && (m.home?.teamId === myTeam.id || m.away?.teamId === myTeam.id),
  );
  if (matchup) return toMatchup(ctx, matchup, myTeam.id);

  // No game this week (bye in playoffs / eliminated).
  return {
    leagueId: ref.leagueId,
    leagueName: ctx.leagueName,
    leagueUrl: ctx.leagueUrl,
    week: ctx.period,
    status: "final",
    result: null,
    isBye: true,
    isPlayoff: false,
    involvesMe: true,
    me: buildSide({ teamId: myTeam.id }, myTeam, ref.season, ctx.period, true, nfl),
    opponent: null,
  };
}

/** Every matchup in the league for the scoring period, mine first. */
export function extractLeagueMatchups(
  league: RawLeague,
  ref: LeagueRef,
  swid: string | undefined,
  nfl: NflWeekState | null,
  scoringPeriodId?: number,
): { leagueName: string; leagueUrl: string; week: number; myTeamId?: number; matchups: MyMatchup[] } {
  const ctx = leagueContext(league, ref, nfl, scoringPeriodId);
  const myTeamId = findMyTeam(league, ref, swid)?.id;
  const matchups = (league.schedule ?? [])
    .filter((m) => m.matchupPeriodId === ctx.matchupPeriod)
    .map((m) => toMatchup(ctx, m, myTeamId))
    .filter((m): m is MyMatchup => m != null)
    .sort((a, b) => Number(b.involvesMe) - Number(a.involvesMe) || (a.matchupId ?? 0) - (b.matchupId ?? 0));
  return { leagueName: ctx.leagueName, leagueUrl: ctx.leagueUrl, week: ctx.period, myTeamId, matchups };
}

/**
 * The league's real current week. `scoringPeriodId` echoes whatever week was
 * requested, so for past weeks it can't be trusted for "now".
 */
export function currentScoringPeriod(league: RawLeague): number | null {
  return league.status?.latestScoringPeriod ?? league.scoringPeriodId ?? null;
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
