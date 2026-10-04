"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * The week being viewed lives in the URL (`?week=4`) so it survives a reload
 * and can be shared. No param means "current week" (and live polling).
 * Callers must sit inside <Suspense> because of useSearchParams.
 */
export function useWeekParam(): [number | null, (week: number | null) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = Number(params.get("week"));
  const week = Number.isInteger(raw) && raw >= 1 && raw <= 18 ? raw : null;

  const setWeek = useCallback(
    (next: number | null) => {
      const q = new URLSearchParams(params.toString());
      if (next == null) q.delete("week");
      else q.set("week", String(next));
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return [week, setWeek];
}
