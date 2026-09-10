"use client";

import type { PlayerLine, TeamSide } from "@/lib/espn/types";

function fmt(n: number | null | undefined): string {
  if (n == null) return "–";
  return n.toFixed(1);
}

function stateClass(p: PlayerLine): string {
  switch (p.gameState) {
    case "in":
      return "text-accent";
    case "post":
      return "text-muted";
    case "bye":
      return "text-danger";
    default:
      return "text-foreground/80";
  }
}

function PlayerRow({ p, align }: { p: PlayerLine; align: "left" | "right" }) {
  const right = align === "right";
  return (
    <div className={`flex items-center gap-2 py-1 text-sm ${right ? "flex-row-reverse text-right" : ""}`}>
      <span className="w-9 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">{p.slot}</span>
      <div className={`min-w-0 flex-1 ${right ? "text-right" : ""}`}>
        <div className="truncate">
          {p.name}
          {p.injuryStatus && <span className="ml-1 text-[10px] font-semibold text-danger">{p.injuryStatus.slice(0, 3)}</span>}
        </div>
        <div className={`truncate text-[11px] ${stateClass(p)}`}>
          {p.proTeam && <span className="text-muted">{p.proTeam} · </span>}
          {p.gameState === "in" && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent live-dot align-middle" />}
          {p.gameDetail || (p.gameState === "pre" ? "Yet to play" : "")}
        </div>
      </div>
      <div className={`w-14 shrink-0 tabular-nums ${right ? "text-left" : "text-right"}`}>
        <div className={`font-medium ${p.gameState === "pre" ? "text-muted" : ""}`}>{fmt(p.points)}</div>
        {p.gameState !== "post" && p.projected != null && (
          <div className="text-[11px] text-muted">proj {fmt(p.projected)}</div>
        )}
      </div>
    </div>
  );
}

export function RosterTable({ me, opponent }: { me: TeamSide; opponent: TeamSide | null }) {
  const rows = Math.max(me.starters.length, opponent?.starters.length ?? 0);
  return (
    <div className="grid grid-cols-2 gap-6 border-t border-border pt-3">
      <div className="divide-y divide-border/60 border-r border-border pr-3">
        {Array.from({ length: rows }).map((_, i) =>
          me.starters[i] ? <PlayerRow key={me.starters[i].id + "-" + i} p={me.starters[i]} align="left" /> : <div key={i} className="py-1" />,
        )}
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, i) =>
          opponent?.starters[i] ? (
            <PlayerRow key={opponent.starters[i].id + "-" + i} p={opponent.starters[i]} align="right" />
          ) : (
            <div key={i} className="py-1" />
          ),
        )}
      </div>
    </div>
  );
}
