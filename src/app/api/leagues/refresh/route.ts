import { getCookies } from "@/lib/espn/auth";
import { getLeagues } from "@/lib/espn/fan";
import { invalidateMatchupCache } from "@/lib/espn/aggregate";
import { EspnAuthError } from "@/lib/espn/types";

export const dynamic = "force-dynamic";

/** Re-run league discovery against the fan API, ignoring the on-disk cache. */
export async function POST() {
  const cookies = getCookies();
  if (!cookies) return Response.json({ error: "Not signed in to ESPN." }, { status: 401 });
  try {
    const result = await getLeagues(cookies, { force: true });
    invalidateMatchupCache();
    return Response.json(result);
  } catch (err) {
    const status = err instanceof EspnAuthError ? 401 : 502;
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}
