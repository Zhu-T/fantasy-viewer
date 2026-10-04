export type WithCacheFlag<T> = T & { fromCache?: boolean };

/** SWR fetcher: JSON, errors as exceptions, and a flag when the service worker served an offline copy. */
export async function fetcher<T>(url: string): Promise<WithCacheFlag<T>> {
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as WithCacheFlag<T> & { error?: string };
  if (!res.ok && res.status !== 401) throw new Error(body.error ?? `Request failed (${res.status})`);
  // Set by the service worker when it had to fall back to the last good response.
  if (res.headers.get("X-From-Cache") === "1") body.fromCache = true;
  return body;
}
