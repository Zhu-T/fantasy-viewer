"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "fv-install-dismissed";

/* Browser-only environment facts, read via useSyncExternalStore so the server
 * render (no window) and the first client render agree. */
const envListeners = new Set<() => void>();
function subscribeEnv(cb: () => void) {
  envListeners.add(cb);
  return () => envListeners.delete(cb);
}
function notifyEnv() {
  envListeners.forEach((cb) => cb());
}
function readEnv(): string {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const dismissed = localStorage.getItem(DISMISS_KEY) === "1";
  return `${standalone ? 1 : 0}${ios ? 1 : 0}${dismissed ? 1 : 0}`;
}
// Server snapshot: pretend we're installed + dismissed so nothing renders until hydrated.
const serverEnv = () => "101";

/**
 * Registers the service worker (production only; it fights HMR in dev) and
 * shows a small install banner when the browser says the app is installable,
 * or an "Add to Home Screen" hint on iOS Safari.
 */
export function PwaSetup() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const env = useSyncExternalStore(subscribeEnv, readEnv, serverEnv);
  const standalone = env[0] === "1";
  const isIOS = env[1] === "1";
  const dismissed = env[2] === "1";

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || dismissed) return null;
  if (!installEvent && !isIOS) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    notifyEnv();
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setInstallEvent(null);
    else dismiss();
  };

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-7 w-7 rounded-md" />
        <span className="min-w-0 flex-1 text-muted">
          {installEvent ? (
            "Install Fantasy Viewer for a full-screen, app-like experience."
          ) : (
            <>
              Tap <span className="text-foreground">Share</span> then <span className="text-foreground">Add to Home Screen</span> to
              install.
            </>
          )}
        </span>
        {installEvent && (
          <button onClick={install} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-background hover:brightness-110">
            Install
          </button>
        )}
        <button onClick={dismiss} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
