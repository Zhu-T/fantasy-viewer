"use client";

import { useState } from "react";
import type { AuthStatus, LeagueLookup, SavedLeague } from "@/lib/espn/types";
import { ConnectForm } from "./ConnectForm";
import { TeamLogo } from "./TeamLogo";
import { buttonClass, inputClass, raisedClass } from "./ui";

interface Props {
  auth: AuthStatus | undefined;
  /** Shown above everything, e.g. "your cookies expired". */
  notice?: string;
  /** Open the ESPN connect form straight away (private league / expired cookies). */
  connectFirst?: boolean;
  onChanged: () => void | Promise<void>;
  onClose?: () => void;
}


async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

function AddLeague({ saved, onAdded, onNeedsCookies }: { saved: SavedLeague[]; onAdded: () => void; onNeedsCookies: () => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<LeagueLookup | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; needsCookies?: boolean } | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      const res = await fetch(`/api/leagues/lookup?league=${encodeURIComponent(query)}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as LeagueLookup & { error?: string; needsCookies?: boolean };
      if (!res.ok) {
        setError({ text: body.error ?? `Request failed (${res.status})`, needsCookies: body.needsCookies });
        return;
      }
      setFound(body);
      setTeamId(body.myTeamId ?? null);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!found) return;
    if (teamId == null) {
      setError({ text: "Pick your team first." });
      return;
    }
    const team = found.teams.find((t) => t.id === teamId);
    setBusy(true);
    setError(null);
    try {
      const next: SavedLeague[] = [
        ...saved.filter((l) => l.leagueId !== found.leagueId),
        { leagueId: found.leagueId, teamId, leagueName: found.leagueName, teamName: team?.name },
      ];
      await post("/api/leagues", { leagues: next });
      setQuery("");
      setFound(null);
      setTeamId(null);
      onAdded();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form onSubmit={lookup} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          required
          name="league"
          spellCheck={false}
          autoComplete="off"
          placeholder="12345678 or the league’s URL…"
          aria-label="League ID or league URL"
          className={inputClass}
        />
        <button type="submit" disabled={busy && !found} className={buttonClass("primary", "md")}>
          {busy && !found ? "Finding…" : "Find"}
        </button>
      </form>
      <p className="mt-2 text-xs text-muted">
        Open your league on ESPN and copy the URL. The ID is the number after <code className="font-mono">leagueId=</code>.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error.text}{" "}
          {error.needsCookies && (
            <button type="button" onClick={onNeedsCookies} className="font-medium text-accent hover:underline">
              Connect ESPN
            </button>
          )}
        </p>
      )}

      {found && (
        <div className="mt-4 rounded-lg bg-surface p-3 shadow-control">
          <div className="text-[15px] font-semibold">{found.leagueName}</div>
          <p className="mt-0.5 text-[13px] text-muted">Which team is yours?</p>
          <div className="mt-3 grid max-h-72 gap-1.5 overflow-y-auto p-px sm:grid-cols-2">
            {found.teams.map((t) => (
              <label
                key={t.id}
                className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-[background-color,box-shadow] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-solid pointer-coarse:min-h-11 ${
                  teamId === t.id ? "bg-accent-soft shadow-[0_0_0_1px_var(--ds-blue-700)]" : "bg-surface shadow-control hover:bg-surface-3"
                }`}
              >
                <input type="radio" name="team" className="sr-only" checked={teamId === t.id} onChange={() => setTeamId(t.id)} />
                <TeamLogo src={t.logo} seed={`${found.leagueId}:${t.id}`} className="h-6 w-6" />
                <span className="min-w-0 truncate">{t.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void add()} disabled={busy} className={buttonClass("primary")}>
              {busy ? "Adding…" : "Add League"}
            </button>
            <button type="button" onClick={() => setFound(null)} className={buttonClass("ghost")}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Onboarding and settings in one: leagues added by ID (public leagues, no
 * login needed) plus the optional ESPN connection for private leagues.
 */
export function SetupPanel({ auth, notice, connectFirst = false, onChanged, onClose }: Props) {
  const [showConnect, setShowConnect] = useState(connectFirst);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = auth?.leagues ?? [];
  const hasCookies = auth?.hasCookies ?? false;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Destructive actions ask first.
  const remove = (l: SavedLeague) => {
    if (!window.confirm(`Remove ${l.leagueName ?? `league ${l.leagueId}`}?`)) return;
    void run(() => post("/api/leagues", { leagues: saved.filter((s) => s.leagueId !== l.leagueId) }));
  };
  const disconnect = () => {
    if (!window.confirm("Disconnect ESPN? Private leagues will stop loading until you connect again.")) return;
    void run(() => post("/api/auth/logout", {}));
  };
  const forgetAll = () => {
    if (!window.confirm("Forget your leagues & ESPN connection on this browser?")) return;
    void run(() => post("/api/auth/logout", { all: true }));
  };

  return (
    <div className={`mx-auto mt-6 max-w-xl p-6 ${raisedClass}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{onClose ? "Your Leagues" : "Add Your ESPN Leagues"}</h2>
          {!onClose && (
            <p className="mt-1 text-sm text-muted">
              Public leagues only need the league ID. Add as many as you like and watch them all at once.
            </p>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className={buttonClass()}>
            Done
          </button>
        )}
      </div>

      {notice && <p role="status" className="mt-4 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{notice}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

      {saved.length > 0 && (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-lg shadow-control">
          {saved.map((l) => (
            <li key={l.leagueId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{l.leagueName ?? `League ${l.leagueId}`}</div>
                <div className="truncate text-xs text-muted">{l.teamName ?? `Team ${l.teamId}`}</div>
              </div>
              <button onClick={() => remove(l)} disabled={busy} className={buttonClass("danger")}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        <AddLeague saved={saved} onAdded={() => void onChanged()} onNeedsCookies={() => setShowConnect(true)} />
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-[15px] font-semibold">ESPN Account</h3>
        {hasCookies ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 text-win">
              <span className="h-1.5 w-1.5 rounded-full bg-win" aria-hidden />
              Connected. Private leagues &amp; auto-discovery are on.
            </span>
            <button onClick={disconnect} disabled={busy} className={buttonClass("danger")}>
              Disconnect
            </button>
          </div>
        ) : showConnect ? (
          <div className="mt-2">
            <ConnectForm
              onConnected={() => {
                setShowConnect(false);
                void onChanged();
              }}
              onCancel={() => setShowConnect(false)}
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Optional. Connect it to see private leagues &amp; find all your leagues automatically.{" "}
            <button onClick={() => setShowConnect(true)} className="font-medium text-accent hover:underline">
              Connect ESPN
            </button>
          </p>
        )}
      </div>

      {(saved.length > 0 || hasCookies) && (
        <div className="mt-6 border-t border-border pt-4 text-right">
          <button onClick={forgetAll} disabled={busy} className={buttonClass("danger")}>
            Forget Everything on This Browser
          </button>
        </div>
      )}
    </div>
  );
}
