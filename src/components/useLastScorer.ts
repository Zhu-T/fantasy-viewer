"use client";

import { useSyncExternalStore } from "react";
import type { MyMatchup, TeamSide } from "@/lib/espn/types";

/**
 * ESPN has no play-by-play feed for fantasy, so "who just scored" comes from
 * comparing each refresh with the last one: the starter whose points went up
 * most recently is that team's last scorer. Snapshots live in this browser
 * (localStorage, per league and week) so a reload keeps the highlight.
 */

export interface LastScorer {
  playerId: number;
  name: string;
  /** Points gained in the refresh where this player last scored. */
  delta: number;
  at: number;
}

interface Bucket {
  updatedAt: number;
  /** `${teamId}:${playerId}` → points at the last refresh. */
  points: Record<string, number>;
  /** teamId → last scorer. */
  last: Record<string, LastScorer>;
}

const KEY = "fv-last-scorers";
const MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const listeners = new Set<() => void>();
let store: Record<string, Bucket> | null = null;

function load(): Record<string, Bucket> {
  if (store) return store;
  try {
    store = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Bucket>;
  } catch {
    store = {};
  }
  return store;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage blocked or full: highlights just won't survive a reload */
  }
}

const bucketKey = (leagueId: string, week: number) => `${leagueId}:${week}`;

function recordSide(bucket: Bucket, side: TeamSide): boolean {
  let best: LastScorer | null = null;
  for (const p of side.starters) {
    const key = `${side.teamId}:${p.id}`;
    const before = bucket.points[key];
    bucket.points[key] = p.points;
    // No baseline yet (first look, or just moved into the lineup): nothing to compare.
    if (before === undefined) continue;
    const delta = Math.round((p.points - before) * 100) / 100;
    if (delta > 0 && (!best || delta > best.delta)) best = { playerId: p.id, name: p.name, delta, at: Date.now() };
  }
  if (!best) return false;
  bucket.last[String(side.teamId)] = best;
  return true;
}

/** Feed a fresh refresh in; call whenever new matchup data arrives. */
export function recordMatchups(matchups: MyMatchup[]): void {
  const all = load();
  const now = Date.now();
  let changed = false;
  for (const m of matchups) {
    if (m.status === "pre") continue;
    const k = bucketKey(m.leagueId, m.week);
    const bucket = (all[k] ??= { updatedAt: now, points: {}, last: {} });
    bucket.updatedAt = now;
    for (const side of [m.me, m.opponent]) {
      if (!side) continue;
      if (recordSide(bucket, side)) {
        // New object so subscribers comparing references see the change.
        all[k] = { ...bucket, last: { ...bucket.last } };
        changed = true;
      }
    }
  }
  for (const [k, b] of Object.entries(all)) if (now - b.updatedAt > MAX_AGE_MS) delete all[k];
  save();
  if (changed) listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The last player on this team whose points went up, if we've seen one. */
export function useLastScorer(leagueId: string, week: number, teamId: number | undefined): LastScorer | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (teamId == null ? undefined : load()[bucketKey(leagueId, week)]?.last[String(teamId)]),
    () => undefined,
  );
}
