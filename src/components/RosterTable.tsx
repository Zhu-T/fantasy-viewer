"use client";

import type { PlayerLine, TeamSide } from "@/lib/espn/types";
import { formatKickoff, formatPoints } from "./ui";
import type { LastScorer } from "./useLastScorer";

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
  const who = (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
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
        <span className="truncate">{me.name}</span>
        <span className="col-span-3 text-center">Pts&nbsp;/&nbsp;Proj</span>
        <span className="truncate text-right">{opponent.name}</span>
      </div>
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
