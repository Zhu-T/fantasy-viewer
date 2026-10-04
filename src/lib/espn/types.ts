export type GameState = "pre" | "in" | "post" | "bye" | "unknown";

export interface EspnCookies {
  espn_s2: string;
  SWID: string;
}

/** A league added by ID, plus which team in it is "me". */
export interface SavedLeague {
  leagueId: string;
  teamId: number;
  leagueName?: string;
  teamName?: string;
}

/**
 * What the encrypted session cookie holds. ESPN cookies are optional: public
 * leagues work from league ID + team alone; cookies unlock private leagues and
 * automatic discovery.
 */
export interface Session {
  espn_s2?: string;
  SWID?: string;
  leagues?: SavedLeague[];
}

export interface LeagueRef {
  leagueId: string;
  season: number;
  /** My team id inside this league, when known from discovery. */
  teamId?: number;
  leagueName?: string;
  teamName?: string;
  source: "fan" | "manual";
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
  /** e.g. "Q3 4:12", "Final" (kickoff is sent separately so the browser can localize it). */
  gameDetail: string;
  /** Before the game starts: kickoff time, formatted in the viewer's time zone by the client. */
  kickoffIso?: string;
  injuryStatus?: string;
  /** e.g. "28/53, 312 pass yds, 2 pass TD, 1 INT" once the game has started. */
  statLine?: string;
  /** Live: on the field right now (offense with the ball, or D/ST while the other team has it). */
  onField?: boolean;
  /** Live: their team has the ball inside the 20. */
  redZone?: boolean;
  /** Live down & distance for the tags' tooltip, e.g. "2nd & Goal at DEN 2". */
  situation?: string;
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
  matchupId?: number;
  status: MatchupStatus;
  result: "W" | "L" | "T" | null;
  isBye: boolean;
  isPlayoff: boolean;
  /** My team plays in this matchup (always true on the home page). */
  involvesMe: boolean;
  /** My team when involved; otherwise the home team. */
  me: TeamSide;
  opponent: TeamSide | null;
}

export interface LeagueError {
  leagueId: string;
  leagueName?: string;
  error: string;
  /** ESPN refused anonymous access: the league is private and needs cookies. */
  needsCookies?: boolean;
}

/** none: no ESPN cookies saved; ok: ESPN accepts them; expired: ESPN rejected them. */
export type CookieState = "none" | "ok" | "expired";

export interface MatchupsResponse {
  /** false until the browser has added a league or connected ESPN. */
  configured: boolean;
  cookieState: CookieState;
  message?: string;
  season: number;
  week: number | null;
  currentWeek: number | null;
  anyGamesLive: boolean;
  nextRefreshMs: number;
  fetchedAt: string;
  leagues: MyMatchup[];
  errors: LeagueError[];
}

/** Every matchup in one league for a week. */
export interface LeagueViewResponse {
  leagueId: string;
  leagueName: string;
  leagueUrl: string;
  season: number;
  week: number | null;
  currentWeek: number | null;
  myTeamId?: number;
  anyGamesLive: boolean;
  nextRefreshMs: number;
  fetchedAt: string;
  matchups: MyMatchup[];
  error?: string;
  needsCookies?: boolean;
}

export interface AuthStatus {
  hasCookies: boolean;
  leagues: SavedLeague[];
}

export interface LeagueLookup {
  leagueId: string;
  leagueName: string;
  teams: Array<{ id: number; name: string; abbrev: string; logo?: string }>;
  /** Team owned by the connected ESPN account, when cookies are present. */
  myTeamId?: number;
}

export class EspnAuthError extends Error {
  status: number;
  constructor(status: number, message?: string) {
    super(message ?? `ESPN rejected the request (${status})`);
    this.name = "EspnAuthError";
    this.status = status;
  }
}

export class EspnHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "EspnHttpError";
    this.status = status;
  }
}
