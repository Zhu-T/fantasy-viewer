import type { NextRequest } from "next/server";
import { getMatchups } from "@/lib/espn/aggregate";
import { EspnAuthError } from "@/lib/espn/types";
import { markAuthExpired } from "@/lib/espn/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const weekParam = req.nextUrl.searchParams.get("week");
  const week = weekParam ? Number(weekParam) : undefined;
  if (weekParam && (!Number.isInteger(week) || week! < 1 || week! > 18)) {
    return Response.json({ error: "week must be an integer 1-18" }, { status: 400 });
  }

  try {
    const data = await getMatchups({ week });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof EspnAuthError) {
      markAuthExpired("ESPN rejected the saved cookies.");
      return Response.json({ authOk: false, error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
