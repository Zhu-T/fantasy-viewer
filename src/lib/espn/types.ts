export type GameState = "pre" | "in" | "post" | "bye" | "unknown";

export interface EspnCookies {
  espn_s2: string;
  SWID: string;
}

export interface LeagueRef {
  leagueId: string;
  season: number;
  /** My team id inside this league, when known from discovery. */
  teamId?: number;
  leagueName?: string;
  teamName?: string;
  source: "fan" | "env";
}

export interface PlayerLine {
  id: number;
  name: string;
  position: string;
  slot: string;
  proTeam: string;
  points: number;
  projected: number | null;
  gameState: GameState;
  /** e.g. "Q3 4:12", "Final", "Sun 1:00 PM" */
  gameDetail: string;
  injuryStatus?: string;
}

export interface TeamSide {
  teamId: number;
  name: string;
  abbrev: string;
  logo?: string;
  record: string;
  points: number;
  projected: number | null;
  starters: PlayerLine[];
  yetToPlay: number;
  inProgress: number;
  finished: number;
}

export type MatchupStatus = "pre" | "live" | "final";

export interface MyMatchup {
  leagueId: string;
  leagueName: string;
  leagueUrl: string;
  week: number;
  status: MatchupStatus;
  result: "W" | "L" | "T" | null;
  isBye: boolean;
  isPlayoff: boolean;
  me: TeamSide;
  opponent: TeamSide | null;
}

export interface LeagueError {
  leagueId: string;
  leagueName?: string;
  error: string;
}

export interface MatchupsResponse {
  authOk: boolean;
  authMessage?: string;
  season: number;
  week: number | null;
  currentWeek: number | null;
  anyGamesLive: boolean;
  nextRefreshMs: number;
  fetchedAt: string;
  leagues: MyMatchup[];
  errors: LeagueError[];
}

export interface AuthStatus {
  hasCookies: boolean;
  authOk: boolean;
  harvesting: boolean;
  lastError: string | null;
  updatedAt: string | null;
}

export class EspnAuthError extends Error {
  status: number;
  constructor(status: number, message?: string) {
    super(message ?? `ESPN rejected the request (${status})`);
    this.name = "EspnAuthError";
    this.status = status;
  }
}
