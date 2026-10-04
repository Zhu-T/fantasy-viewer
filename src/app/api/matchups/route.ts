import type { NextRequest } from "next/server";
import { emptyResponse, getMatchups } from "@/lib/espn/aggregate";
import { getSession } from "@/lib/espn/auth";
import { currentSeason } from "@/lib/espn/store";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const weekParam = req.nextUrl.searchParams.get("week");
  const week = weekParam ? Number(weekParam) : undefined;
  if (weekParam && (!Number.isInteger(week) || week! < 1 || week! > 18)) {
    return Response.json({ error: "week must be an integer 1-18" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return Response.json(emptyResponse(currentSeason(), "Add a league to get started.", false), {
      headers: NO_STORE,
    });
  }

  try {
    const data = await getMatchups(session, { week });
    return Response.json(data, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
