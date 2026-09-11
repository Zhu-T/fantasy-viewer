"use client";

import type { AuthStatus, MatchupsResponse } from "@/lib/espn/types";

interface Props {
  data: MatchupsResponse | undefined;
  auth: AuthStatus | undefined;
  isValidating: boolean;
  week: number | null;
  onWeekChange: (week: number | null) => void;
  onRefresh: () => void;
  onSignIn: () => void;
  onRediscover: () => void;
  busy: boolean;
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}

export function StatusBar({ data, auth, isValidating, week, onWeekChange, onRefresh, onSignIn, onRediscover, busy }: Props) {
  const live = data?.anyGamesLive ?? false;
  const shownWeek = week ?? data?.week ?? null;
  const currentWeek = data?.currentWeek ?? null;
  const harvesting = auth?.harvesting ?? false;
  const signedIn = data?.authOk ?? auth?.authOk ?? false;

  return (
    <header className="safe-top sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
      <div className="safe-x mx-auto flex max-w-6xl flex-wrap items-center gap-3 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Fantasy Viewer</h1>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            live ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-accent live-dot" : "bg-muted"}`} />
          {live ? "Games live" : "Idle"}
        </span>

        {shownWeek && (
          <div className="inline-flex items-center overflow-hidden rounded-md border border-border text-sm">
            <button
              className="px-2 py-1 hover:bg-surface-2 disabled:opacity-40"
              onClick={() => onWeekChange(Math.max(1, shownWeek - 1))}
              disabled={shownWeek <= 1}
              aria-label="Previous week"
            >
              ‹
            </button>
            <button
              className="px-2 py-1 font-medium hover:bg-surface-2"
              onClick={() => onWeekChange(null)}
              title="Back to current week"
            >
              Week {shownWeek}
              {currentWeek && shownWeek !== currentWeek ? <span className="ml-1 text-muted">(now {currentWeek})</span> : null}
            </button>
            <button
              className="px-2 py-1 hover:bg-surface-2 disabled:opacity-40"
              onClick={() => onWeekChange(Math.min(18, shownWeek + 1))}
              disabled={currentWeek != null && shownWeek >= currentWeek}
              aria-label="Next week"
            >
              ›
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          {data?.fetchedAt && (
            <span className="tabular-nums">
              {isValidating ? "Updating…" : `Updated ${timeAgo(data.fetchedAt)}`}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={busy || isValidating}
            className="rounded-md border border-border px-2.5 py-1 text-foreground hover:bg-surface-2 disabled:opacity-40"
          >
            Refresh
          </button>
          {signedIn ? (
            <button
              onClick={onRediscover}
              disabled={busy}
              className="rounded-md border border-border px-2.5 py-1 text-foreground hover:bg-surface-2 disabled:opacity-40"
              title="Re-scan your ESPN account for leagues"
            >
              Rescan leagues
            </button>
          ) : (
            <button
              onClick={onSignIn}
              disabled={harvesting}
              className="rounded-md bg-accent px-3 py-1 font-medium text-background hover:brightness-110 disabled:opacity-60"
            >
              {harvesting ? "Waiting for login…" : "Sign in to ESPN"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
