import type { NextRequest } from "next/server";
import { getSession, sanitizeLeagues, saveSession, sessionCookies } from "@/lib/espn/auth";
import { invalidateMatchupCache } from "@/lib/espn/aggregate";
import type { AuthStatus } from "@/lib/espn/types";

export const dynamic = "force-dynamic";

/** Replace the leagues this browser added by ID (each with the team picked as "mine"). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { leagues?: unknown };
  const session = await getSession();
  if (session) invalidateMatchupCache(session);
  const leagues = sanitizeLeagues(body.leagues);
  await saveSession({ ...session, leagues });
  return Response.json({ hasCookies: !!sessionCookies(session), leagues } satisfies AuthStatus);
}
