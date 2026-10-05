"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { MatchupCard } from "@/components/MatchupCard";
import { Notice, buttonClass, gridClass } from "@/components/ui";
import { SetupPanel } from "@/components/SetupPanel";
import { SortableCards, applyOrder, useCardOrder } from "@/components/SortableCards";
import { StatusBar } from "@/components/StatusBar";
import { fetcher, type WithCacheFlag } from "@/components/fetcher";
import { recordMatchups } from "@/components/useRecentChanges";
import { useDocumentTitle } from "@/components/useDocumentTitle";
import { useLiveOnly, useShowAll } from "@/components/usePreferences";
import { useWeekParam } from "@/components/useWeekParam";
import type { AuthStatus, MatchupsResponse } from "@/lib/espn/types";

const IDLE_MS = 5 * 60_000;

/** Drop the service worker's saved scores so the next person on this device can't see them. */
async function clearOfflineScores() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("fv-data-")).map((k) => caches.delete(k)));
  } catch {
    /* Cache API unavailable */
  }
}

// useSearchParams (the week lives in the URL) needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

function Home() {
  const [week, setWeek] = useWeekParam();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [setup, setSetup] = useState<null | "leagues" | "connect">(null);
  const [showAll, setShowAll] = useShowAll();
  const [liveOnly, setLiveOnly] = useLiveOnly();
  const [cardOrder, setCardOrder] = useCardOrder("fv-order-home");

  const matchupsKey = week ? `/api/matchups?week=${week}` : "/api/matchups";
  const matchups = useSWR<WithCacheFlag<MatchupsResponse>>(matchupsKey, fetcher, {
    refreshInterval: (latest) => (latest && !latest.configured ? 0 : (latest?.nextRefreshMs ?? IDLE_MS)),
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
    keepPreviousData: true,
  });
  const auth = useSWR<AuthStatus>("/api/auth/status", fetcher, { revalidateOnFocus: false });

  const data = matchups.data;
  const configured = data?.configured ?? false;
  const expired = data?.cookieState === "expired";

  const rescan = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/leagues/refresh", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      await matchups.mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [matchups]);

  /** After any change to leagues or the ESPN connection. */
  const onSetupChanged = useCallback(async () => {
    setActionError(null);
    // Offline copies may belong to a previous setup on this device.
    await clearOfflineScores();
    await Promise.all([auth.mutate(), matchups.mutate()]);
  }, [auth, matchups]);

  const allLeagues = applyOrder(data?.leagues ?? [], (m) => m.leagueId, cardOrder);
  const leagues = liveOnly ? allLeagues.filter((m) => m.status === "live") : allLeagues;
  const errors = data?.errors ?? [];
  const showSetup = (data != null && !configured) || setup != null;

  // Diff each refresh against the last to find point changes.
  useEffect(() => {
    if (data?.leagues && !data.fromCache) recordMatchups(data.leagues);
  }, [data]);

  useDocumentTitle(week ? `Week ${week} – Fantasy Viewer` : "Fantasy Viewer");

  return (
    <>
      <StatusBar
        data={data}
        configured={configured}
        canRescan={!!auth.data?.hasCookies}
        isValidating={matchups.isValidating}
        week={week}
        onWeekChange={setWeek}
        showAll={showAll}
        onShowAllChange={setShowAll}
        liveOnly={liveOnly}
        onLiveOnlyChange={setLiveOnly}
        onRefresh={() => void matchups.mutate()}
        onRediscover={() => void rescan()}
        onManage={() => setSetup("leagues")}
        busy={busy}
      />

      <main id="main" className="safe-x safe-bottom mx-auto w-full max-w-[120rem] flex-1 py-6">
        {data?.fromCache && <Notice tone="warn">You&apos;re offline. These are the last scores this device saw.</Notice>}
        {actionError && <Notice tone="danger">{actionError}</Notice>}
        {matchups.error && <Notice tone="danger">{matchups.error.message}</Notice>}
        {expired && !showSetup && (
          <Notice tone="warn">
            {data?.message}{" "}
            <button onClick={() => setSetup("connect")} className="font-medium underline underline-offset-2">
              Reconnect ESPN
            </button>
          </Notice>
        )}

        {showSetup && (
          <SetupPanel
            // Remount when switching straight to the connect form.
            key={setup ?? "onboarding"}
            auth={auth.data}
            notice={expired ? data?.message : undefined}
            connectFirst={setup === "connect"}
            onChanged={onSetupChanged}
            onClose={configured ? () => setSetup(null) : undefined}
          />
        )}

        {!showSetup && matchups.isLoading && (
          <div className={gridClass(false)}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-[9.5rem] rounded-xl" />
            ))}
          </div>
        )}

        {!showSetup && liveOnly && allLeagues.length > 0 && leagues.length === 0 && (
          <div className="mx-auto mt-20 max-w-sm text-center">
            <h2 className="text-lg font-semibold">No Live Matchups</h2>
            <p className="mt-1 text-balance text-sm text-muted">{allLeagues.length}&nbsp;{allLeagues.length === 1 ? "matchup" : "matchups"} hidden because nobody in them is playing right now.</p>
            <button onClick={() => setLiveOnly(false)} className={`mt-5 ${buttonClass("secondary", "md")}`}>
              Show All Matchups
            </button>
          </div>
        )}

        {!showSetup && data && configured && allLeagues.length === 0 && !matchups.isLoading && (
          <div className="mx-auto mt-20 max-w-sm text-center">
            <h2 className="text-lg font-semibold">No Matchups to Show</h2>
            <p className="mt-1 text-sm text-muted">Add a league to see this week&apos;s matchup here.</p>
            <button onClick={() => setSetup("leagues")} className={`mt-5 ${buttonClass("primary", "md")}`}>
              Add League
            </button>
          </div>
        )}

        {!showSetup && leagues.length > 0 && (
          <SortableCards
            all={allLeagues}
            visible={leagues}
            idOf={(m) => m.leagueId}
            labelOf={(m) => m.leagueName}
            onReorder={setCardOrder}
            className={gridClass(showAll)}
            render={(m, handle) => (
              // Re-key on "Show all" so every card picks up the new default.
              <MatchupCard
                key={`${m.leagueId}-${showAll}`}
                m={m}
                lineupsOpen={showAll}
                leagueHref={`/league/${m.leagueId}${week ? `?week=${week}` : ""}`}
                dragHandle={handle}
              />
            )}
          />
        )}

        {!showSetup && errors.length > 0 && (
          <ul className="mt-6 space-y-1 text-sm text-danger">
            {errors.map((e) => (
              <li key={e.leagueId}>
                <span className="font-medium">{e.leagueName ?? `League ${e.leagueId}`}:</span> {e.error}
                {e.needsCookies && (
                  <button onClick={() => setSetup("connect")} className="ml-1 font-medium text-accent hover:underline">
                    Connect ESPN
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
