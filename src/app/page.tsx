"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { MatchupCard } from "@/components/MatchupCard";
import { StatusBar } from "@/components/StatusBar";
import type { AuthStatus, MatchupsResponse } from "@/lib/espn/types";

type WithCacheFlag<T> = T & { fromCache?: boolean };

async function fetcher<T>(url: string): Promise<WithCacheFlag<T>> {
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as WithCacheFlag<T> & { error?: string };
  if (!res.ok && res.status !== 401) throw new Error(body.error ?? `Request failed (${res.status})`);
  // Set by the service worker when it had to fall back to the last good response.
  if (res.headers.get("X-From-Cache") === "1") body.fromCache = true;
  return body;
}

const IDLE_MS = 5 * 60_000;

export default function Home() {
  const [week, setWeek] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const matchupsKey = week ? `/api/matchups?week=${week}` : "/api/matchups";
  const matchups = useSWR<WithCacheFlag<MatchupsResponse>>(matchupsKey, fetcher, {
    refreshInterval: (latest) => latest?.nextRefreshMs ?? IDLE_MS,
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
    keepPreviousData: true,
  });

  const needsAuth = matchups.data ? !matchups.data.authOk : false;
  const auth = useSWR<AuthStatus>("/api/auth/status", fetcher, {
    // Poll quickly while the login window is open or we're logged out; otherwise rarely.
    refreshInterval: (latest) => (latest?.harvesting || needsAuth ? 2_000 : 60_000),
  });

  // Once a harvest completes (harvesting flips true -> false), pull fresh matchups.
  const harvesting = auth.data?.harvesting ?? false;
  const wasHarvesting = useRef(false);
  const refetchMatchups = matchups.mutate;
  useEffect(() => {
    if (wasHarvesting.current && !harvesting) void refetchMatchups();
    wasHarvesting.current = harvesting;
  }, [harvesting, refetchMatchups]);

  const runAction = useCallback(
    async (url: string) => {
      setBusy(true);
      setActionError(null);
      try {
        const res = await fetch(url, { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        await Promise.all([auth.mutate(), matchups.mutate()]);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [auth, matchups],
  );

  const data = matchups.data;
  const leagues = data?.leagues ?? [];
  const errors = data?.errors ?? [];

  return (
    <main className="flex flex-1 flex-col">
      <StatusBar
        data={data}
        auth={auth.data}
        isValidating={matchups.isValidating}
        week={week}
        onWeekChange={setWeek}
        onRefresh={() => void matchups.mutate()}
        onSignIn={() => void runAction("/api/auth/login")}
        onRediscover={() => void runAction("/api/leagues/refresh")}
        busy={busy}
      />

      <section className="safe-x safe-bottom mx-auto w-full max-w-6xl flex-1 py-6">
        {data?.fromCache && (
          <p className="mb-4 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            You appear to be offline. Showing the last scores this device saw.
          </p>
        )}
        {actionError && (
          <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{actionError}</p>
        )}
        {matchups.error && (
          <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {matchups.error.message}
          </p>
        )}

        {needsAuth && (
          <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-surface p-6 text-center">
            <h2 className="text-lg font-semibold">Connect your ESPN account</h2>
            <p className="mt-2 text-sm text-muted">
              {data?.authMessage ?? "Sign in to ESPN to load your leagues."} A browser window will open on this
              machine; log in there and it will close automatically.
            </p>
            {auth.data?.lastError && <p className="mt-2 text-xs text-danger">{auth.data.lastError}</p>}
            <button
              onClick={() => void runAction("/api/auth/login")}
              disabled={auth.data?.harvesting || busy}
              className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:brightness-110 disabled:opacity-60"
            >
              {auth.data?.harvesting ? "Waiting for you to log in…" : "Sign in to ESPN"}
            </button>
          </div>
        )}

        {!needsAuth && matchups.isLoading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-surface" />
            ))}
          </div>
        )}

        {!needsAuth && data && leagues.length === 0 && !matchups.isLoading && (
          <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
            No leagues found for the {data.season} season. Try <b>Rescan leagues</b>, or add league IDs to{" "}
            <code>LEAGUE_IDS</code> in <code>.env.local</code>.
          </div>
        )}

        {leagues.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {leagues.map((m) => (
              <MatchupCard key={m.leagueId} m={m} />
            ))}
          </div>
        )}

        {errors.length > 0 && (
          <ul className="mt-6 space-y-1 text-xs text-danger/90">
            {errors.map((e) => (
              <li key={e.leagueId}>
                <span className="font-medium">{e.leagueName ?? e.leagueId}:</span> {e.error}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
