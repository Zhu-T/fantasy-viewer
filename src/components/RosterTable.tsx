"use client";

import type { PlayerLine, TeamSide } from "@/lib/espn/types";
import { formatKickoff, formatPoints, formatProbability } from "./ui";
import { TeamLogo } from "./TeamLogo";
import type { LastScorer } from "./useLastScorer";

/**
 * ESPN's CDN, resized to a small thumbnail (~8 KB instead of ~260 KB). Fantasy
 * player ids are ESPN athlete ids; team defenses use their NFL team's logo.
 */
function photoUrl(p: PlayerLine): string | undefined {
  const img =
    p.position === "D/ST"
      ? p.proTeam && `/i/teamlogos/nfl/500/${p.proTeam.toLowerCase()}.png`
      : p.id > 0 && `/i/headshots/nfl/players/full/${p.id}.png`;
  return img ? `https://a.espncdn.com/combiner/i?img=${img}&w=96&h=70` : undefined;
}

/** Hasn't played (game not started, or on bye) and has no points: show a dash, not 0.0. */
function playerPoints(p: PlayerLine): string {
  if ((p.gameState === "pre" || p.gameState === "bye") && p.points === 0) return "–";
  return formatPoints(p.points);
}

function GameStatus({ p }: { p: PlayerLine }) {
  if (p.gameState === "in") {
    return (
      <span className="inline-flex items-center gap-1 text-live">
        <span className="h-1.5 w-1.5 rounded-full bg-live-dot live-dot" aria-hidden />
        {p.gameDetail}
      </span>
    );
  }
  if (p.gameState === "bye") return <span className="text-danger">Bye</span>;
  if (p.gameState === "pre") return <span>{formatKickoff(p.kickoffIso) ?? (p.gameDetail || "Not started")}</span>;
  return <span>{p.gameDetail}</span>;
}

/** FantasyCast-style live tags, with down & distance on hover. */
/** On their own line (wrapping if needed) so they never squeeze the name or game clock out. */
function FieldTags({ p, right }: { p: PlayerLine; right: boolean }) {
  if (p.gameState !== "in" || (!p.onField && !p.redZone)) return null;
  return (
    <div className={`my-0.5 flex flex-wrap gap-1 ${right ? "justify-end" : ""}`} title={p.situation}>
      {p.redZone && <span className="rounded bg-danger-soft px-1 text-[10px] font-medium leading-4 text-danger">Red Zone</span>}
      {p.onField && <span className="rounded bg-accent-soft px-1 text-[10px] font-medium leading-4 text-accent">On Field</span>}
    </div>
  );
}

/** Half a lineup row: name and game on the outside, points next to the slot. */
function Half({ p, side, scorer }: { p: PlayerLine | undefined; side: "left" | "right"; scorer?: LastScorer }) {
  const right = side === "right";
  if (!p) return <div className="col-span-2" />;
  // Last player on this team to score: name and points in green, gain under the points.
  const scored = scorer?.playerId === p.id;
  const points = (
    <div className={`w-10 shrink-0 sm:w-12 ${right ? "text-left" : "text-right"}`}>
      <div
        className={`text-[15px] font-semibold leading-tight ${scored ? "text-win" : p.gameState === "pre" || p.gameState === "bye" ? "text-muted" : ""}`}
      >
        {playerPoints(p)}
      </div>
      {scored ? (
        <div className="text-[11px] font-medium text-win">+{formatPoints(scorer.delta)}</div>
      ) : (
        p.gameState !== "post" && p.projected != null && <div className="text-[11px] text-muted">{formatPoints(p.projected)}</div>
      )}
    </div>
  );
  const photo = photoUrl(p);
  const who = (
    <div className={`flex min-w-0 items-center gap-2 ${right ? "flex-row-reverse" : ""}`}>
      {/* Phones skip the photo: the lineup columns are too narrow there. */}
      <span className="hidden shrink-0 sm:block">
        <TeamLogo key={photo} src={photo} faceTop={p.position !== "D/ST"} className="h-8 w-8" />
      </span>
      <div className={`min-w-0 flex-1 ${right ? "text-right" : ""}`}>
      <div className={`truncate text-[13px] font-medium ${scored ? "text-win" : ""}`}>
        {p.name}
        {p.injuryStatus && (
          <span className="ml-1 text-[11px] font-semibold text-danger" title={p.injuryStatus}>
            {p.injuryStatus === "QUESTIONABLE" ? "Q" : p.injuryStatus === "DOUBTFUL" ? "D" : p.injuryStatus === "OUT" ? "O" : p.injuryStatus.slice(0, 3)}
          </span>
        )}
      </div>
      <FieldTags p={p} right={right} />
      {/* Block + truncate (not flex) so a long line is clipped at its end on both sides. */}
      <div className="truncate text-[11px] text-muted sm:font-mono">
        {p.proTeam && <span className="mr-1.5 text-foreground/80">{p.proTeam}</span>}
        <GameStatus p={p} />
      </div>
      {p.statLine && (
        <div className="mt-0.5 truncate text-[11px] text-foreground/70" title={p.statLine}>
          {p.statLine}
        </div>
      )}
      </div>
    </div>
  );
  return right ? (
    <>
      {points}
      {who}
    </>
  ) : (
    <>
      {who}
      {points}
    </>
  );
}

/**
 * ESPN's win probability, FantasyCast style: a full-width bar under the team
 * names, each team's percentage at its own end (left team blue, right team red).
 * Hidden when ESPN sends none or the matchup is final.
 */
function WinProbability({ me, opponent }: { me: TeamSide; opponent: TeamSide }) {
  const p = me.winProbability ?? (opponent.winProbability != null ? 1 - opponent.winProbability : null);
  if (p == null) return null;
  const left = formatProbability(p);
  const right = formatProbability(1 - p);
  return (
    <div className="flex items-center gap-2.5 pb-2.5 pt-0.5" role="img" aria-label={`ESPN win probability: ${me.name} ${left}, ${opponent.name} ${right}`}>
      <span className="shrink-0 text-[13px] font-semibold text-accent" aria-hidden>
        {left}
      </span>
      <div className="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        <div className="h-full bg-accent-solid transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${p * 100}%` }} />
        <div className="h-full flex-1 bg-versus-solid" />
      </div>
      <span className="shrink-0 text-[13px] font-semibold text-versus" aria-hidden>
        {right}
      </span>
    </div>
  );
}

/**
 * FantasyCast-style lineups: both teams mirrored around the lineup slot, so
 * the QBs face each other, then the RBs, and so on. Projections sit under points.
 */
export function RosterTable({
  me,
  opponent,
  meScorer,
  oppScorer,
}: {
  me: TeamSide;
  opponent: TeamSide;
  meScorer?: LastScorer;
  oppScorer?: LastScorer;
}) {
  const rows = Math.max(me.starters.length, opponent.starters.length);
  return (
    <div className="px-2.5 pb-1.5 pt-2 sm:px-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_2.25rem_auto_minmax(0,1fr)] items-center gap-x-1.5 pb-1.5 text-[11px] text-muted sm:grid-cols-[minmax(0,1fr)_auto_2.75rem_auto_minmax(0,1fr)] sm:gap-x-2">
        <span className="truncate text-[13px] font-semibold text-foreground sm:text-sm">{me.name}</span>
        <span className="col-span-3 text-center">Pts&nbsp;/&nbsp;Proj</span>
        <span className="truncate text-right text-[13px] font-semibold text-foreground sm:text-sm">{opponent.name}</span>
      </div>
      <WinProbability me={me} opponent={opponent} />
      {Array.from({ length: rows }).map((_, i) => {
        const a = me.starters[i];
        const b = opponent.starters[i];
        return (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_auto_2.25rem_auto_minmax(0,1fr)] items-center gap-x-1.5 border-t border-border py-2 sm:grid-cols-[minmax(0,1fr)_auto_2.75rem_auto_minmax(0,1fr)] sm:gap-x-2"
          >
            <Half p={a} side="left" scorer={meScorer} />
            <span className="rounded bg-surface-2 py-0.5 text-center font-mono text-[11px] text-muted">
              {a?.slot ?? b?.slot}
            </span>
            <Half p={b} side="right" scorer={oppScorer} />
          </div>
        );
      })}
    </div>
  );
}
