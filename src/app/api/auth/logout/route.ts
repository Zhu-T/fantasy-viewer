import { clearCookies, getAuthStatus } from "@/lib/espn/auth";
import { invalidateMatchupCache } from "@/lib/espn/aggregate";

export const dynamic = "force-dynamic";

export async function POST() {
  clearCookies();
  invalidateMatchupCache();
  return Response.json(getAuthStatus());
}
