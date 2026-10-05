import type { ReactNode } from "react";

/*
 * Shared primitives. Radii nest: cards 12px, controls inside them 6px,
 * chips 4px. Touch screens get 44px targets.
 */

const base =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,box-shadow,color] disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11";

const variants = {
  primary: "bg-foreground text-background hover:bg-foreground/85 active:bg-foreground/75",
  secondary: "bg-surface text-foreground shadow-control hover:bg-surface-2 hover:shadow-control-hover active:bg-surface-3",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground active:bg-surface-3",
  danger: "text-muted hover:bg-danger-soft hover:text-danger active:bg-danger-soft",
};

const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm" };

export function buttonClass(variant: keyof typeof variants = "secondary", size: keyof typeof sizes = "sm"): string {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}

/** 16px on phones so iOS doesn't zoom into the field. */
export const inputClass =
  "w-full rounded-md bg-surface px-3 py-2 text-base text-foreground shadow-control placeholder:text-faint hover:shadow-control-hover focus-visible:outline-offset-0 sm:text-sm";

export const cardClass = "rounded-xl bg-surface shadow-card";

/** Panels that sit above the page like a dialog (#272727). */
export const raisedClass = "rounded-xl bg-raised shadow-raised";

const tones = {
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

/** A one-line banner above the matchups (offline, errors, expired cookies). Announced politely. */
export function Notice({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <p role="status" className={`mb-4 rounded-md px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </p>
  );
}

/** Matchup grid: wider columns when lineups are open so both sides fit. */
export function gridClass(lineupsOpen: boolean): string {
  return lineupsOpen
    ? "grid items-start gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,32rem),1fr))]"
    : "grid items-start gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]";
}

const points = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const projection = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Fantasy points exactly as ESPN scores them (ESPN keeps two decimals, e.g.
 * 18.48 from 0.04/passing yard), in the viewer's locale; "–" when unknown.
 */
export function formatPoints(n: number | null | undefined): string {
  return n == null ? "–" : points.format(n);
}

/** Projections are estimates, so one decimal is plenty (as ESPN shows them). */
export function formatProjection(n: number | null | undefined): string {
  return n == null ? "–" : projection.format(n);
}

const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });

/** A 0–1 probability as a whole percent; never rounds an undecided game to 0% or 100%. */
export function formatProbability(p: number): string {
  if (p > 0.99) return `>${percent.format(0.99)}`;
  if (p < 0.01) return `<${percent.format(0.01)}`;
  return percent.format(p);
}

const kickoff = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** Kickoff in the viewer's own time zone and locale (the server runs in UTC). */
export function formatKickoff(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : kickoff.format(d);
}
