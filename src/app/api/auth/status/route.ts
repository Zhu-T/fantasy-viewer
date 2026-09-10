import { getAuthStatus } from "@/lib/espn/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getAuthStatus());
}
