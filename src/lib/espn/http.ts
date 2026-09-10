import { cookieHeader } from "./auth";
import { EspnAuthError, type EspnCookies } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

/** GET JSON from ESPN with the user's cookies; throws EspnAuthError on 401/403. */
export async function espnGet<T>(url: string, cookies: EspnCookies | null, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": UA,
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (cookies) headers.Cookie = cookieHeader(cookies);

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  if (res.status === 401 || res.status === 403) {
    throw new EspnAuthError(res.status);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { messages?: string[] };
      detail = body.messages?.[0] ?? "";
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`ESPN returned ${res.status}${detail ? ` (${detail})` : ""}`);
  }
  return (await res.json()) as T;
}
