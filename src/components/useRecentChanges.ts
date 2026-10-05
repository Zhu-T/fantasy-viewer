"use client";

import { useSyncExternalStore } from "react";
import type { MyMatchup, TeamSide } from "@/lib/espn/types";

/**
 * ESPN has no play-by-play feed for fantasy, so point changes come from
 * comparing each refresh with the last one. Every starter whose points moved
 * (up or down) is shown for one minute; another change within that minute
 * replaces the number and restarts the minute. Snapshots live in this browser
 * (localStorage, per league and week) so a reload keeps them.
 */

export interface PointChange {
  /** Points gained (positive) or lost (negative) in the latest change. */
  delta: number;
  /** When we saw it (ms since epoch). */
  at: number;
}

/** playerId → their latest change, while it's still fresh. */
export type TeamChanges = Record<string, PointChange>;

interface Bucket {
  updatedAt: number;
  /** `${teamId}:${playerId}` → points at the last refresh. */
  points: Record<string, number>;
  /** teamId → fresh changes. */
  recent: Record<string, TeamChanges>;
}

export const CHANGE_VISIBLE_MS = 60_000;
const KEY = "fv-point-changes";
const MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const listeners = new Set<() => void>();
let store: Record<string, Bucket> | null = null;

function notify() {
  listeners.forEach((cb) => cb());
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage blocked or full: changes just won't survive a reload */
  }
}

/** Drop changes older than a minute (new objects, so subscribers see it). Returns true if any were dropped. */
function expire(now = Date.now()): boolean {
  let dropped = false;
  for (const bucket of Object.values(store ?? {})) {
    for (const [teamId, changes] of Object.entries(bucket.recent ?? {})) {
      const kept = Object.fromEntries(Object.entries(changes).filter(([, c]) => now - c.at < CHANGE_VISIBLE_MS));
      if (Object.keys(kept).length !== Object.keys(changes).length) {
        bucket.recent = { ...bucket.recent, [teamId]: kept };
        dropped = true;
      }
    }
  }
  return dropped;
}

/** Wake up when the next change goes stale, so it disappears on time without a refresh. */
let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleExpiry() {
  clearTimeout(timer);
  const ats = Object.values(store ?? {}).flatMap((b) => Object.values(b.recent ?? {}).flatMap((t) => Object.values(t).map((c) => c.at)));
  if (!ats.length) return;
  const wait = Math.max(0, Math.min(...ats) + CHANGE_VISIBLE_MS - Date.now()) + 50;
  timer = setTimeout(() => {
    if (expire()) {
      save();
      notify();
    }
    scheduleExpiry();
  }, wait);
}

function load(): Record<string, Bucket> {
  if (store) return store;
  try {
    store = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Bucket>;
    localStorage.removeItem("fv-last-scorers"); // the earlier one-per-team tracker's data
  } catch {
    store = {};
  }
  for (const b of Object.values(store)) b.recent ??= {};
  expire();
  scheduleExpiry();
  return store;
}

const bucketKey = (leagueId: string, week: number) => `${leagueId}:${week}`;

/** Compare one team's starters with the last refresh; returns true if anything changed. */
function recordSide(bucket: Bucket, side: TeamSide, now: number): boolean {
  const teamId = String(side.teamId);
  let changes: TeamChanges | null = null;
  for (const p of side.starters) {
    const key = `${side.teamId}:${p.id}`;
    const before = bucket.points[key];
    bucket.points[key] = p.points;
    // No baseline yet (first look, or just moved into the lineup): nothing to compare.
    if (before === undefined) continue;
    const delta = Math.round((p.points - before) * 100) / 100;
    if (delta === 0) continue;
    changes ??= { ...bucket.recent[teamId] };
    changes[String(p.id)] = { delta, at: now };
  }
  if (!changes) return false;
  bucket.recent = { ...bucket.recent, [teamId]: changes };
  return true;
}

/** Feed a fresh refresh in; call whenever new matchup data arrives. */
export function recordMatchups(matchups: MyMatchup[]): void {
  const all = load();
  const now = Date.now();
  let changed = expire(now);
  for (const m of matchups) {
    if (m.status === "pre") continue;
    const k = bucketKey(m.leagueId, m.week);
    const bucket = (all[k] ??= { updatedAt: now, points: {}, recent: {} });
    bucket.updatedAt = now;
    for (const side of [m.me, m.opponent]) {
      if (side && recordSide(bucket, side, now)) changed = true;
    }
  }
  for (const [k, b] of Object.entries(all)) if (now - b.updatedAt > MAX_AGE_MS) delete all[k];
  save();
  scheduleExpiry();
  if (changed) notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** This team's point changes from the last minute, keyed by player id. */
export function useRecentChanges(leagueId: string, week: number, teamId: number | undefined): TeamChanges | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (teamId == null ? undefined : load()[bucketKey(leagueId, week)]?.recent[String(teamId)]),
    () => undefined,
  );
}
