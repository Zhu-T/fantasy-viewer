import fs from "node:fs";
import path from "node:path";

/**
 * Small JSON-on-disk helpers plus a process-wide singleton bag. Module-level
 * state gets reset by Next's dev HMR, so anything that must survive across
 * requests (auth state, in-flight harvest, response cache) hangs off globalThis.
 */

export const DATA_DIR = path.join(process.cwd(), "data");

export function readJson<T>(file: string): T | null {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(value, null, 2), "utf8");
}

export function deleteJson(file: string): void {
  try {
    fs.unlinkSync(path.join(DATA_DIR, file));
  } catch {
    /* ignore */
  }
}

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
