"use client";

import { useState } from "react";

/** Team logo, or a generic profile icon when there's none or it fails to load. */
export function TeamLogo({ src, className = "h-9 w-9" }: { src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-muted`} aria-hidden>
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
      className={`${className} shrink-0 rounded-full bg-surface-2 object-cover`}
      onError={() => setFailed(true)}
      // An image that failed before React hydrated never fires onError for us.
      ref={(el) => {
        if (el?.complete && el.naturalWidth === 0) setFailed(true);
      }}
    />
  );
}
