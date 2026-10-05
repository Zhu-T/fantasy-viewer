"use client";

import { useState } from "react";

const GOLDEN_ANGLE = 137.508;

/**
 * Stable hue (0–359) for an ESPN id, so a player or team always gets the same
 * color whatever its name. Ids step around the color wheel by the golden angle,
 * so even neighbouring ids (12345, 12346) land far apart.
 */
function hueFor(seed: string | number): number {
  let n = typeof seed === "number" ? seed : Number.NaN;
  if (!Number.isFinite(n)) {
    // Non-numeric seed (e.g. "leagueId:teamId"): FNV-1a hash to a number first.
    n = 2166136261;
    for (const ch of String(seed)) n = Math.imul(n ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  return Math.round((((n * GOLDEN_ANGLE) % 360) + 360) % 360);
}

/**
 * Team logo or player photo, or a generic profile icon when there's none or it
 * fails to load. `faceTop` anchors the crop to the top, for headshots.
 */
export function TeamLogo({
  src,
  seed,
  className = "h-9 w-9",
  faceTop = false,
}: {
  src?: string;
  /** ESPN player id, or "leagueId:teamId" for a fantasy team: gives the fallback icon its own permanent color. */
  seed?: string | number;
  className?: string;
  faceTop?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const hue = seed == null ? null : hueFor(seed);
    return (
      <span
        className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-full ${hue == null ? "bg-surface-2 text-muted" : ""}`}
        style={hue == null ? undefined : { backgroundColor: `hsl(${hue} 38% 26%)`, color: `hsl(${hue} 55% 72%)` }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-[70%] w-[70%] translate-y-[12%]" fill="currentColor">
          <circle cx="12" cy="8" r="4.5" />
          <path d="M3 22c0-5 4-8.5 9-8.5s9 3.5 9 8.5z" />
        </svg>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={64}
      height={64}
      loading="lazy"
      // Some image hosts refuse hotlinked requests that carry another site's referrer.
      referrerPolicy="no-referrer"
      decoding="async"
      className={`${className} shrink-0 rounded-full bg-surface-2 object-cover ${faceTop ? "object-top" : ""}`}
      onError={() => setFailed(true)}
      // An image that failed before React hydrated never fires onError for us.
      ref={(el) => {
        if (el?.complete && el.naturalWidth === 0) setFailed(true);
      }}
    />
  );
}
