"use client";

import { useCallback, useSyncExternalStore } from "react";

/* On/off preferences remembered per browser and shared by every page. */

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function useBooleanPreference(key: string): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* storage blocked: the choice just won't persist */
      }
      listeners.forEach((cb) => cb());
    },
    [key],
  );
  return [value, set];
}

/** Open every matchup's lineups. */
export const useShowAll = () => useBooleanPreference("fv-show-all");

/** Hide matchups that aren't live right now. */
export const useLiveOnly = () => useBooleanPreference("fv-live-only");
