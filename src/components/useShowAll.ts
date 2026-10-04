"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "fv-show-all";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** "Show all lineups", remembered per browser and shared by every page. */
export function useShowAll(): [boolean, (next: boolean) => void] {
  const showAll = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* storage blocked: the choice just won't persist */
    }
    listeners.forEach((cb) => cb());
  }, []);
  return [showAll, set];
}
