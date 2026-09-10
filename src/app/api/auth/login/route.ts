import { getAuthStatus, harvestCookies } from "@/lib/espn/auth";
import { invalidateMatchupCache } from "@/lib/espn/aggregate";

export const dynamic = "force-dynamic";

/**
 * Kicks off the Playwright login window and returns immediately; the client
 * polls /api/auth/status until `harvesting` flips back to false.
 */
export async function POST() {
  const already = getAuthStatus().harvesting;
  const run = harvestCookies();
  run.then(() => invalidateMatchupCache()).catch(() => undefined);
  return Response.json({ started: !already, ...getAuthStatus() });
}
