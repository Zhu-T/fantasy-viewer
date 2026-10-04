/**
 * Per-instance, best-effort state (response caches). On Vercel each warm
 * function instance keeps its own copy; module-level state is also reset by
 * Next's dev HMR, hence hanging it off globalThis.
 */

type GlobalBag = Record<string, unknown>;

export function globalSingleton<T>(key: string, init: () => T): T {
  const g = globalThis as unknown as { __fantasyViewer?: GlobalBag };
  g.__fantasyViewer ??= {};
  if (!(key in g.__fantasyViewer)) g.__fantasyViewer[key] = init();
  return g.__fantasyViewer[key] as T;
}

export function currentSeason(): number {
  const fromEnv = Number(process.env.ESPN_SEASON);
  if (Number.isFinite(fromEnv) && fromEnv > 2000) return fromEnv;
  // NFL seasons run Sept–Jan; a January/February date still belongs to the prior season.
  const now = new Date();
  return now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
}
