"use client";

import Link from "next/link";
import { useState } from "react";
import type { MyMatchup, TeamSide } from "@/lib/espn/types";
import { RosterTable } from "./RosterTable";
import { TeamLogo } from "./TeamLogo";
import { cardClass, formatKickoff, formatPoints, formatProjection } from "./ui";
import { useLastScorer, type LastScorer } from "./useLastScorer";

/** Progress line: players on the field now in red, players still to play in yellow. */
function remaining(side: TeamSide): { text: string; className?: string }[] {
  const parts: { text: string; className?: string }[] = [];
  if (side.inProgress) parts.push({ text: `${side.inProgress} playing`, className: "font-medium text-live" });
  if (side.yetToPlay) parts.push({ text: `${side.yetToPlay} to go`, className: "font-medium text-flag" });
  if (!parts.length && side.starters.length) parts.push({ text: "All done" });
  return parts;
}

function redZoneCount(side: TeamSide): number {
  return side.starters.filter((p) => p.gameState === "in" && p.redZone).length;
}

/** One team: logo, name, record and progress on the left, score and projection on the right. */
function TeamRow({ side, ahead, final, scorer }: { side: TeamSide; ahead: boolean; final: boolean; scorer?: LastScorer }) {
  return (
    <div className="relative flex items-center gap-3 px-4 py-2.5">
      {/* The team that's ahead gets an amber bar on the card's edge (and a text label for screen readers). */}
      <span className={`absolute inset-y-2 left-0 w-[3px] rounded-r-full ${ahead ? "bg-flag" : ""}`} aria-hidden />
      {ahead && <span className="sr-only">Leading:</span>}
      <TeamLogo src={side.logo} className="h-8 w-8" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-tight">{side.name}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-xs text-muted">
          {side.record && <span>{side.record}</span>}
          {!final &&
            remaining(side).map((p) => (
              <span key={p.text} className={p.className}>
                {p.text}
              </span>
            ))}
          {!final && redZoneCount(side) > 0 && <span className="font-medium text-danger">{redZoneCount(side)}&nbsp;in red zone</span>}
        </div>
        {!final && scorer && (
          <div className="mt-0.5 truncate text-xs font-medium text-win" title="Last player on this team to score">
            {scorer.name} +{formatPoints(scorer.delta)}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-[28px] font-semibold leading-none tracking-tight ${ahead ? "" : "text-muted"}`}>{formatPoints(side.points)}</div>
        {!final && side.projected != null && <div className="mt-1 text-xs text-muted">Proj&nbsp;{formatProjection(side.projected)}</div>}
      </div>
    </div>
  );
}

function StatusTag({ m }: { m: MyMatchup }) {
  if (m.isBye) return <span className="text-muted">Bye Week</span>;
  if (m.status === "final") {
    if (m.result === "W") return <span className="font-medium text-win">Won</span>;
    if (m.result === "L") return <span className="font-medium text-danger">Lost</span>;
    if (m.result === "T") return <span className="font-medium text-warn">Tied</span>;
    return <span className="text-muted">Final</span>;
  }
  if (m.status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-live">
        <span className="h-1.5 w-1.5 rounded-full bg-live-dot live-dot" aria-hidden />
        Live
      </span>
    );
  }
  if (m.status === "between") {
    const next = nextKickoff(m);
    return <span className="text-muted">{next ? `Next: ${next}` : "Awaiting Final"}</span>;
  }
  return <span className="text-muted">Not Started</span>;
}

/** Earliest kickoff among both teams' starters who haven't played yet, in the viewer's time zone. */
function nextKickoff(m: MyMatchup): string | null {
  const times = [...m.me.starters, ...(m.opponent?.starters ?? [])]
    .filter((p) => p.gameState === "pre" && p.kickoffIso)
    .map((p) => Date.parse(p.kickoffIso!))
    .filter(Number.isFinite);
  return times.length ? formatKickoff(new Date(Math.min(...times)).toISOString()) : null;
}

/**
 * One matchup: two stacked team rows, lineups below. `lineupsOpen` is the
 * starting state (from "Show All Lineups"); each card can still be toggled.
 * `inLeague`: on a league's page, so the header names the matchup instead of
 * the league.
 */
export function MatchupCard({
  m,
  lineupsOpen = false,
  inLeague = false,
  leagueHref,
}: {
  m: MyMatchup;
  lineupsOpen?: boolean;
  inLeague?: boolean;
  /** Home page: link to this league's page (keeps the week being viewed). */
  leagueHref?: string;
}) {
  const [open, setOpen] = useState(lineupsOpen);
  const opp = m.opponent;
  const final = m.status === "final";
  const hasLineups = !!opp && m.me.starters.length > 0;
  const started = m.status !== "pre";
  const meAhead = !!opp && started && m.me.points > opp.points;
  const oppAhead = !!opp && started && opp.points > m.me.points;
  const highlight = inLeague && m.involvesMe;
  const meScorer = useLastScorer(m.leagueId, m.week, m.me.teamId);
  const oppScorer = useLastScorer(m.leagueId, m.week, opp?.teamId);

  return (
    <article className={`min-w-0 overflow-hidden ${cardClass} ${highlight ? "outline outline-1 outline-accent-solid" : ""}`}>
      <div className="flex h-10 items-center gap-3 border-b border-border px-4 text-[13px]">
        {inLeague ? (
          <span className={`font-medium ${highlight ? "text-accent" : "text-muted"}`}>{highlight ? "Your Matchup" : "Matchup"}</span>
        ) : (
          <Link href={leagueHref ?? `/league/${m.leagueId}`} className="min-w-0 truncate font-medium hover:underline">
            {m.leagueName}
          </Link>
        )}
        {m.isPlayoff && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs text-warn">Playoffs</span>}
        <span className="ml-auto shrink-0">
          <StatusTag m={m} />
        </span>
      </div>

      <div className="py-1.5">
        <TeamRow side={m.me} ahead={meAhead} final={final} scorer={meScorer} />
        {opp ? (
          <TeamRow side={opp} ahead={oppAhead} final={final} scorer={oppScorer} />
        ) : (
          <p className="px-4 pb-2 text-sm text-muted">No opponent this week.</p>
        )}
      </div>

      {!hasLineups && opp && started && (
        <p className="border-t border-border px-4 py-2.5 text-center text-xs text-muted">ESPN didn&apos;t send lineups for this matchup.</p>
      )}
      {hasLineups && (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex h-10 w-full items-center justify-center gap-1.5 border-t border-border text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground pointer-coarse:h-11"
        >
          {open ? "Hide Lineups" : "Show Lineups"}
          <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {open && hasLineups && opp && (
        <div className="unfold border-t border-border">
          <RosterTable me={m.me} opponent={opp} meScorer={meScorer} oppScorer={oppScorer} />
        </div>
      )}
      {!inLeague && (
        <Link
          href={leagueHref ?? `/league/${m.leagueId}`}
          className="flex h-10 items-center justify-center gap-1.5 border-t border-border text-[13px] font-medium text-accent transition-colors hover:bg-surface-2 pointer-coarse:h-11"
        >
          See All Matchups
        </Link>
      )}
    </article>
  );
}
