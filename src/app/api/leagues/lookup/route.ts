import type { NextRequest } from "next/server";
import { getSession, parseLeagueId, sessionCookies } from "@/lib/espn/auth";
import { lookupLeague } from "@/lib/espn/league";
import { currentSeason } from "@/lib/espn/store";
import { EspnAuthError, EspnHttpError } from "@/lib/espn/types";

export const dynamic = "force-dynamic";

/** `?league=<id or ESPN league URL>` → league name and its teams, for the team picker. */
export async function GET(req: NextRequest) {
  const leagueId = parseLeagueId(req.nextUrl.searchParams.get("league") ?? "");
  if (!leagueId) return Response.json({ error: "Enter a league ID or paste the league's ESPN URL." }, { status: 400 });

  const cookies = sessionCookies(await getSession());
  const season = currentSeason();
  try {
    return Response.json(await lookupLeague(leagueId, season, cookies), { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    if (err instanceof EspnAuthError) {
      return Response.json(
        {
          error: cookies
            ? "ESPN denied access to this league with your account. Check the ID, or reconnect ESPN if your cookies expired."
            : "This league is private. Ask the commissioner to make it viewable to the public, or connect your ESPN account.",
          needsCookies: !cookies,
        },
        { status: 403 },
      );
    }
    if (err instanceof EspnHttpError && err.status === 404) {
      return Response.json({ error: `No ESPN football league ${leagueId} found for the ${season} season.` }, { status: 404 });
    }
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
