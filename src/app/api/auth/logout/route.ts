import type { NextRequest } from "next/server";
import { getSession, saveSession } from "@/lib/espn/auth";
import { invalidateMatchupCache } from "@/lib/espn/aggregate";
import type { AuthStatus } from "@/lib/espn/types";

export const dynamic = "force-dynamic";

/** Forgets the ESPN cookies; `{ all: true }` also forgets the leagues added by ID. */
export async function POST(req: NextRequest) {
  const { all } = (await req.json().catch(() => ({}))) as { all?: boolean };
  const session = await getSession();
  if (session) invalidateMatchupCache(session);
  const leagues = all ? [] : (session?.leagues ?? []);
  await saveSession({ leagues });
  return Response.json({ hasCookies: false, leagues } satisfies AuthStatus);
}
