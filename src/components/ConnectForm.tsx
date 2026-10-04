"use client";

import { useState } from "react";
import { buttonClass, inputClass } from "./ui";

interface Props {
  message?: string;
  onConnected: () => void;
  onCancel?: () => void;
}

/**
 * ESPN has no public OAuth, so we ask for the two session cookies every ESPN
 * fantasy tool uses. They're validated server-side, then kept only in this
 * browser's encrypted, HttpOnly session cookie.
 */
export function ConnectForm({ message, onConnected, onCancel }: Props) {
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ espn_s2: espnS2, SWID: swid }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setEspnS2("");
      setSwid("");
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const input = `${inputClass} mt-1.5 font-mono`;

  return (
    <form onSubmit={submit}>
      <p className="text-sm text-muted">
        {message ?? "Needed for private leagues, and finds every league you're in automatically. Copy your ESPN cookies on a computer:"}
      </p>

      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-muted marker:text-faint">
        <li>
          Open{" "}
          <a href="https://www.espn.com/fantasy/" target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            espn.com/fantasy
          </a>{" "}
          and make sure you&apos;re logged in.
        </li>
        <li>
          Open DevTools (<kbd className="font-mono text-[13px] text-foreground">F12</kbd>, or <kbd className="font-mono text-[13px] text-foreground">Cmd+Option+I</kbd> on a
          Mac), go to the <b className="text-foreground">Network</b> tab and reload the page.
        </li>
        <li>
          Type <code className="font-mono text-[13px] text-foreground">lm-api</code> in the filter box and click any request in the list.
        </li>
        <li>
          Under <b className="text-foreground">Request Headers</b>, right-click <code className="font-mono text-[13px] text-foreground">cookie</code> →{" "}
          <b className="text-foreground">Copy value</b>, and paste the whole thing below.
        </li>
      </ol>
      <details className="mt-2 text-sm text-muted">
        <summary className="cursor-pointer text-[13px] hover:text-foreground pointer-coarse:py-2">Or copy the two cookies individually</summary>
        <p className="mt-2 text-xs">
          DevTools → <b className="text-foreground">Application</b> tab (Chrome/Edge; <b className="text-foreground">Storage</b> in
          Firefox) → <b className="text-foreground">Cookies</b> → <code className="font-mono text-[13px] text-foreground">https://fantasy.espn.com</code>.
          Type the name in the <b className="text-foreground">Filter</b> box and copy the <b className="text-foreground">Value</b> of{" "}
          <code className="font-mono text-[13px] text-foreground">espn_s2</code> into the first box and <code className="font-mono text-[13px] text-foreground">SWID</code> into
          the second.
        </p>
      </details>

      <label className="mt-5 block text-[13px] font-medium">
        Cookie line, or just espn_s2
        <textarea
          value={espnS2}
          onChange={(e) => setEspnS2(e.target.value)}
          required
          rows={3}
          spellCheck={false}
          autoComplete="off"
          placeholder="SWID={…}; espn_s2=AEB…; …"
          className={input}
        />
      </label>
      <label className="mt-3 block text-[13px] font-medium">
        SWID <span className="font-normal text-muted">(only if you pasted espn_s2 on its own)</span>
        <input
          value={swid}
          onChange={(e) => setSwid(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
          className={input}
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className={buttonClass("primary", "md")}
        >
          {busy ? "Checking with ESPN…" : "Connect"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonClass("ghost", "md")}>
            Cancel
          </button>
        )}
      </div>
      <p className="mt-4 text-xs text-muted">
        Your cookies are encrypted into a cookie on this browser only; nothing is saved on the server. They work like a password
        for your ESPN account, so only use a deployment you trust. Disconnect any time to remove them.
      </p>
    </form>
  );
}
