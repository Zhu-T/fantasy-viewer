import type { NextRequest } from "next/server";
import { getLeagueView } from "@/lib/espn/aggregate";
import { getSession, parseLeagueId } from "@/lib/espn/auth";

export const dynamic = "force-dynamic";

/** `GET /api/league?id=<leagueId>[&week=N]`: every matchup in the league that week. */
export async function GET(req: NextRequest) {
  const leagueId = parseLeagueId(req.nextUrl.searchParams.get("id") ?? "");
  if (!leagueId) return Response.json({ error: "id must be an ESPN league ID" }, { status: 400 });
  const weekParam = req.nextUrl.searchParams.get("week");
  const week = weekParam ? Number(weekParam) : undefined;
  if (weekParam && (!Number.isInteger(week) || week! < 1 || week! > 18)) {
    return Response.json({ error: "week must be an integer 1-18" }, { status: 400 });
  }

  // No session is fine: public leagues work anonymously.
  const session = (await getSession()) ?? {};
  try {
    const data = await getLeagueView(session, leagueId, week);
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
