import type { NextRequest } from "next/server";
import { getSession, parseCookieInput, saveSession } from "@/lib/espn/auth";
import { invalidateMatchupCache } from "@/lib/espn/aggregate";
import { discoverLeaguesFromFan } from "@/lib/espn/fan";
import { currentSeason } from "@/lib/espn/store";
import { EspnAuthError, EspnHttpError } from "@/lib/espn/types";

export const dynamic = "force-dynamic";

/**
 * Validates pasted ESPN cookies against the fan API, then adds them to this
 * browser's encrypted session (keeping any leagues already added by ID).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { espn_s2?: string; SWID?: string };
  const cookies = parseCookieInput(String(body.espn_s2 ?? ""), String(body.SWID ?? ""));
  if (!cookies) {
    return Response.json(
      {
        error:
          "Couldn't find both espn_s2 and SWID in what you pasted. If you copied the cookie line, make sure you're logged in to ESPN in that tab and try again.",
      },
      { status: 400 },
    );
  }

  let leaguesFound: number | null = null;
  try {
    leaguesFound = (await discoverLeaguesFromFan(cookies, currentSeason())).length;
  } catch (err) {
    // The fan API answers 404 for a SWID it doesn't know.
    if (err instanceof EspnAuthError || (err instanceof EspnHttpError && err.status === 404)) {
      return Response.json({ error: "ESPN rejected those cookies. Copy them again from a logged-in ESPN tab." }, { status: 401 });
    }
    // ESPN hiccup: keep the cookies; the matchups call will report problems.
  }

  const session = await getSession();
  if (session) invalidateMatchupCache(session);
  const leagues = session?.leagues ?? [];
  await saveSession({ ...cookies, leagues });
  return Response.json({ hasCookies: true, leagues, leaguesFound });
}
