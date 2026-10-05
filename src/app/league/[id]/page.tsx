"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import useSWR from "swr";
import { fetcher, type WithCacheFlag } from "@/components/fetcher";
import { Notice, buttonClass, gridClass } from "@/components/ui";
import { MatchupCard } from "@/components/MatchupCard";
import { StatusBar } from "@/components/StatusBar";
import { recordMatchups } from "@/components/useLastScorer";
import { useDocumentTitle } from "@/components/useDocumentTitle";
import { useShowAll } from "@/components/useShowAll";
import { useWeekParam } from "@/components/useWeekParam";
import type { LeagueViewResponse } from "@/lib/espn/types";

const IDLE_MS = 5 * 60_000;

/** Every matchup in one league for the week, refreshing live like the home page. */
// useSearchParams (the week lives in the URL) needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense>
      <LeaguePage />
    </Suspense>
  );
}

function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const [week, setWeek] = useWeekParam();
  const [showAll, setShowAll] = useShowAll();

  const key = `/api/league?id=${encodeURIComponent(id)}${week ? `&week=${week}` : ""}`;
  const league = useSWR<WithCacheFlag<LeagueViewResponse>>(key, fetcher, {
    refreshInterval: (latest) => (latest?.error ? 0 : (latest?.nextRefreshMs ?? IDLE_MS)),
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
    keepPreviousData: true,
  });

  const data = league.data;
  const matchups = data?.matchups ?? [];

  // Diff each refresh against the last to find who just scored.
  useEffect(() => {
    if (data?.matchups && !data.fromCache) recordMatchups(data.matchups);
  }, [data]);

  useDocumentTitle(`${data?.leagueName ?? "League"}${data?.week ? ` – Week ${data.week}` : ""} – Fantasy Viewer`);

  return (
    <>
      <StatusBar
        data={data}
        title={data?.leagueName ?? "League"}
        backHref="/"
        configured
        canRescan={false}
        isValidating={league.isValidating}
        week={week}
        onWeekChange={setWeek}
        showAll={showAll}
        onShowAllChange={setShowAll}
        onRefresh={() => void league.mutate()}
        busy={false}
      />

      <main id="main" className="safe-x safe-bottom mx-auto w-full max-w-[120rem] flex-1 py-6">
        {data?.fromCache && <Notice tone="warn">You&apos;re offline. These are the last scores this device saw.</Notice>}
        {(league.error || data?.error) && (
          <Notice tone="danger">
            {league.error?.message ?? data?.error}{" "}
            {data?.needsCookies && (
              <Link href="/" className="font-medium underline underline-offset-2">
                Connect ESPN from Leagues on the home page.
              </Link>
            )}
          </Notice>
        )}

        {league.isLoading && (
          <div className={gridClass(false)}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-[9.5rem] rounded-xl" />
            ))}
          </div>
        )}

        {data && !data.error && matchups.length === 0 && !league.isLoading && (
          <p className="mx-auto mt-16 max-w-sm text-center text-sm text-muted">
            This league has no matchups in week {data.week ?? "?"}. Try another week.
          </p>
        )}

        {matchups.length > 0 && (
          <div className={gridClass(showAll)}>
            {matchups.map((m, i) => (
              <MatchupCard key={`${m.matchupId ?? i}-${showAll}`} m={m} lineupsOpen={showAll} inLeague />
            ))}
          </div>
        )}

        {data && (
          <div className="mt-10 flex justify-center">
            {/* A link (it leaves the app) styled as a button. */}
            <a href={data.leagueUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md")}>
              Open {data.leagueName} on ESPN
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        )}
      </main>
    </>
  );
}
