"use client";

import { useState } from "react";
import type { MyMatchup, TeamSide } from "@/lib/espn/types";
import { RosterTable } from "./RosterTable";

function fmt(n: number | null | undefined): string {
  if (n == null) return "–";
  return n.toFixed(1);
}

function remaining(side: TeamSide): string {
  const parts: string[] = [];
  if (side.inProgress) parts.push(`${side.inProgress} playing`);
  if (side.yetToPlay) parts.push(`${side.yetToPlay} left`);
  if (!parts.length && side.starters.length) return "All done";
  return parts.join(" · ");
}

/* On phones both sides stack as left-aligned rows; from `sm` up they sit side by
 * side with the opponent mirrored so the scores meet in the middle. */
function Side({ side, align, leading, final }: { side: TeamSide; align: "left" | "right"; leading: boolean; final: boolean }) {
  const right = align === "right";
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${right ? "sm:flex-row-reverse sm:text-right" : ""}`}>
      {side.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={side.logo} alt="" className="h-10 w-10 shrink-0 rounded-full bg-surface-2 object-cover" />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-full bg-surface-2" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{side.name}</div>
        <div className="truncate text-xs text-muted">
          {side.record}
          {!final && <span className="ml-2">{remaining(side)}</span>}
        </div>
      </div>
      <div className={`shrink-0 text-right tabular-nums ${right ? "sm:text-left" : ""}`}>
        <div className={`text-2xl font-semibold ${leading ? "text-accent" : ""}`}>{fmt(side.points)}</div>
        {!final && side.projected != null && <div className="text-xs text-muted">proj {fmt(side.projected)}</div>}
      </div>
    </div>
  );
}

export function MatchupCard({ m }: { m: MyMatchup }) {
  const [open, setOpen] = useState(false);
  const opp = m.opponent;
  const final = m.status === "final";
  const meLeads = opp ? m.me.points > opp.points : false;
  const oppLeads = opp ? opp.points > m.me.points : false;

  let badge: { text: string; cls: string };
  if (m.isBye) badge = { text: "Bye", cls: "bg-surface-2 text-muted" };
  else if (final && m.result) {
    badge =
      m.result === "W"
        ? { text: "Win", cls: "bg-accent-soft text-accent" }
        : m.result === "L"
          ? { text: "Loss", cls: "bg-danger/15 text-danger" }
          : { text: "Tie", cls: "bg-warn/15 text-warn" };
  } else if (m.status === "live") badge = { text: "Live", cls: "bg-accent-soft text-accent" };
  else badge = { text: "Upcoming", cls: "bg-surface-2 text-muted" };

  return (
    <article className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <a href={m.leagueUrl} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold hover:underline">
          {m.leagueName}
        </a>
        {m.isPlayoff && <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warn">Playoffs</span>}
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
          {m.status === "live" && !final && <span className="h-1.5 w-1.5 rounded-full bg-accent live-dot" />}
          {badge.text}
        </span>
      </div>

      {opp ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Side side={m.me} align="left" leading={meLeads} final={final} />
          <span className="hidden shrink-0 text-xs text-muted sm:inline">vs</span>
          <Side side={opp} align="right" leading={oppLeads} final={final} />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Side side={m.me} align="left" leading={false} final />
          <span className="text-sm text-muted">No matchup this week</span>
        </div>
      )}

      {opp && m.me.starters.length > 0 && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 w-full rounded-md py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground"
          aria-expanded={open}
        >
          {open ? "Hide lineups ▴" : "Show lineups ▾"}
        </button>
      )}
      {open && opp && <div className="mt-2"><RosterTable me={m.me} opponent={opp} /></div>}
    </article>
  );
}
