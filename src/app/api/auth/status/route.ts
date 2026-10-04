import { getSession, sessionCookies } from "@/lib/espn/auth";
import type { AuthStatus } from "@/lib/espn/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  return Response.json({ hasCookies: !!sessionCookies(session), leagues: session?.leagues ?? [] } satisfies AuthStatus, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
