"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { buttonClass } from "./ui";

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

async function clearServiceWorkers() {
  const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
  if (!regs.length) return;
  await Promise.all(regs.map((r) => r.unregister()));
  const keys = await caches.keys().catch(() => []);
  await Promise.all(keys.filter((k) => k.startsWith("fv-")).map((k) => caches.delete(k)));
  // The page that just loaded may itself have come from the stale cache.
  window.location.reload();
}

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
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
      } else {
        // A worker left over from a production run on this origin would keep serving
        // stale cached JS to the dev server and break the page after a reload.
        void clearServiceWorkers();
      }
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
      <div className="safe-x mx-auto flex max-w-[120rem] items-center gap-3 py-2 text-[13px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 rounded-md" />
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
          <button onClick={install} className={buttonClass("primary")}>
            Install
          </button>
        )}
        <button onClick={dismiss} className={`${buttonClass("ghost")} w-8 px-0 pointer-coarse:w-11`} aria-label="Dismiss Install Banner">
          ✕
        </button>
      </div>
    </div>
  );
}
