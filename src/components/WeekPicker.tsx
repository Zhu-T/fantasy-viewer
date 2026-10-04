"use client";

import { useEffect, useId, useRef, useState } from "react";

interface Props {
  week: number;
  currentWeek: number | null;
  onPick: (week: number) => void;
}

/** Every week up to the current one (or the one shown, if later), newest first. */
function weekOptions(shown: number, current: number | null): number[] {
  const last = Math.min(18, Math.max(shown, current ?? shown));
  return Array.from({ length: last }, (_, i) => last - i);
}

/**
 * The week label as a styled dropdown (WAI-ARIA listbox pattern): click or
 * Enter/Space/↓ to open; ↑/↓, Home/End to move; Enter to pick; Escape or a
 * click outside to close. Newest week first, current week labeled.
 */
export function WeekPicker({ week, currentWeek, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(week);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const weeks = weekOptions(week, currentWeek);

  const show = () => {
    setActive(week);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const pick = (w: number) => {
    close();
    if (w !== week) onPick(w);
  };

  // Focus the list when it opens, and keep the active week scrolled into view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    listRef.current?.querySelector(`[data-week="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // A click anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onListKey = (e: React.KeyboardEvent) => {
    const i = weeks.indexOf(active);
    const moveTo = (j: number) => {
      e.preventDefault();
      setActive(weeks[Math.max(0, Math.min(weeks.length - 1, j))]);
    };
    if (e.key === "ArrowDown") moveTo(i + 1);
    else if (e.key === "ArrowUp") moveTo(i - 1);
    else if (e.key === "Home") moveTo(0);
    else if (e.key === "End") moveTo(weeks.length - 1);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      close(e.key === "Escape");
    }
  };

  return (
    <div ref={rootRef} className="relative flex border-x border-border">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`Week ${week}, choose a week`}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
        className={`flex items-center gap-1.5 pl-3 pr-2 text-[13px] font-medium transition-colors hover:bg-surface-2 focus-visible:outline-offset-[-2px] ${open ? "bg-surface-2" : ""}`}
      >
        Week&nbsp;{week}
        <svg
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label="Week"
          aria-activedescendant={`${id}-w${active}`}
          onKeyDown={onListKey}
          className="unfold absolute left-1/2 top-[calc(100%+6px)] z-20 max-h-72 w-44 -translate-x-1/2 overflow-y-auto rounded-lg bg-raised p-1 shadow-raised focus:outline-none"
        >
          {weeks.map((w) => {
            const selected = w === week;
            return (
              <li
                key={w}
                id={`${id}-w${w}`}
                data-week={w}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(w)}
                onClick={() => pick(w)}
                className={`flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 text-[13px] pointer-coarse:h-11 ${
                  w === active ? "bg-surface-3" : ""
                } ${selected ? "font-medium text-foreground" : "text-muted"}`}
              >
                <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-accent" : "invisible"}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="flex-1">Week&nbsp;{w}</span>
                {w === currentWeek && <span className="rounded bg-accent-soft px-1.5 text-[11px] font-medium leading-5 text-accent">Current</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
