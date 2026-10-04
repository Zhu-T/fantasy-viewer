"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { MatchupsResponse } from "@/lib/espn/types";
import { buttonClass } from "./ui";
import { WeekPicker } from "./WeekPicker";

interface Props {
  data: Pick<MatchupsResponse, "anyGamesLive" | "week" | "currentWeek" | "fetchedAt"> | undefined;
  /** Replaces the app name, e.g. with the league name. */
  title?: ReactNode;
  /** Shows a back link to this path before the title. */
  backHref?: string;
  configured: boolean;
  canRescan: boolean;
  isValidating: boolean;
  week: number | null;
  onWeekChange: (week: number | null) => void;
  showAll: boolean;
  onShowAllChange: (showAll: boolean) => void;
  onRefresh: () => void;
  onRediscover?: () => void;
  onManage?: () => void;
  busy: boolean;
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

const stepper =
  "flex w-8 items-center justify-center text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-30 pointer-coarse:w-11";

export function StatusBar({
  data,
  title,
  backHref,
  configured,
  canRescan,
  isValidating,
  week,
  onWeekChange,
  showAll,
  onShowAllChange,
  onRefresh,
  onRediscover,
  onManage,
  busy,
}: Props) {
  const live = data?.anyGamesLive ?? false;
  const shownWeek = week ?? data?.week ?? null;
  const currentWeek = data?.currentWeek ?? null;

  // Landing back on the current week drops the explicit week, so it polls live again.
  const goTo = (w: number) => onWeekChange(currentWeek != null && w >= currentWeek ? null : w);

  return (
    <header className="safe-top sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="safe-x mx-auto flex h-14 max-w-[120rem] items-center gap-3">
        {backHref && (
          <Link href={backHref} className={`${buttonClass("ghost")} -ml-2 w-8 px-0 pointer-coarse:w-11`} aria-label="All Leagues">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        )}
        <h1 className="min-w-0 truncate text-base font-semibold tracking-tight">{title ?? "Fantasy Viewer"}</h1>

        {configured && (
          <span className={`inline-flex shrink-0 items-center gap-1.5 text-[13px] ${live ? "font-medium text-live" : "text-muted"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-live-dot live-dot" : "bg-faint"}`} aria-hidden />
            {live ? "Live" : "No Games On"}
          </span>
        )}

        {configured && (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {data?.fetchedAt && (
              <span className="hidden text-[13px] text-muted sm:inline">{isValidating ? "Updating…" : `Updated ${timeAgo(data.fetchedAt)}`}</span>
            )}
            <button onClick={onRefresh} disabled={busy} className={buttonClass()}>
              {isValidating && (
                <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" aria-hidden />
              )}
              Refresh
            </button>
          </div>
        )}
      </div>

      {configured && (
        <div className="safe-x mx-auto flex max-w-[120rem] flex-wrap items-center gap-x-4 gap-y-2 pb-3">
          {shownWeek && (
            <div className="flex h-8 rounded-md bg-surface shadow-control pointer-coarse:h-11">
              {/* No overflow-hidden on this group: the week dropdown panel extends below it. */}
              <button className={`${stepper} rounded-l-md`} onClick={() => goTo(shownWeek - 1)} disabled={shownWeek <= 1} aria-label="Previous Week">
                ‹
              </button>
              <WeekPicker week={shownWeek} currentWeek={currentWeek} onPick={goTo} />
              <button
                className={`${stepper} rounded-r-md`}
                onClick={() => goTo(shownWeek + 1)}
                disabled={currentWeek == null || shownWeek >= currentWeek}
                aria-label="Next Week"
              >
                ›
              </button>
            </div>
          )}

          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium pointer-coarse:min-h-11">
            <input type="checkbox" role="switch" checked={showAll} onChange={(e) => onShowAllChange(e.target.checked)} className="peer sr-only" />
            <span
              className="relative h-5 w-9 rounded-full bg-surface-3 shadow-control transition-colors peer-checked:bg-accent-solid peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-solid"
              aria-hidden
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition-[left] ${showAll ? "left-[1.125rem]" : "left-0.5"}`}
              />
            </span>
            Show All Lineups
          </label>

          <div className="ml-auto flex items-center gap-2">
            {canRescan && onRediscover && (
              <button onClick={onRediscover} disabled={busy} className={buttonClass("ghost")} title="Look for new leagues on your ESPN account">
                Rescan
              </button>
            )}
            {onManage && (
              <button onClick={onManage} disabled={busy} className={buttonClass()}>
                Leagues
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
