"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";

/* ---------- Saved order (per browser) ---------- */

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** A saved list of card ids for `key`, and a setter. */
export function useCardOrder(key: string): [string[], (ids: string[]) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  const order = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }, [raw]);
  const save = useCallback(
    (ids: string[]) => {
      try {
        localStorage.setItem(key, JSON.stringify(ids));
      } catch {
        /* storage blocked: the order just won't persist */
      }
      listeners.forEach((cb) => cb());
    },
    [key],
  );
  return [order, save];
}

/** Items in saved order; anything not in the saved order (e.g. a new league) keeps its place after them. */
export function applyOrder<T>(items: T[], idOf: (item: T) => string, order: string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, i, r: rank.get(idOf(item)) }))
    .sort((a, b) => (a.r ?? Infinity) - (b.r ?? Infinity) || a.i - b.i)
    .map((x) => x.item);
}

/* ---------- Sortable grid ---------- */

interface Props<T> {
  /** Every item, already in saved order (some may be hidden by a filter). */
  all: T[];
  /** The items actually shown (a subset of `all`, same order). */
  visible: T[];
  idOf: (item: T) => string;
  /** Name for the grip's accessible label, e.g. the league name. */
  labelOf: (item: T) => string;
  onReorder: (ids: string[]) => void;
  className: string;
  /** Renders a card; `handle` is the drag grip to place in its header. */
  render: (item: T, handle: ReactNode) => ReactNode;
}

/**
 * Drag-to-reorder grid. Cards move by a grip handle (mouse, touch, or
 * keyboard: focus the grip, Space to pick up, arrows to move, Space to drop),
 * so links and buttons inside cards keep working and phones still scroll.
 */
export function SortableCards<T>({ all, visible, idOf, labelOf, onReorder, className, render }: Props<T>) {
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a tap on the grip isn't a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = visible.map(idOf);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    // Move within the full list, so hidden cards (e.g. under "Live Only") keep their places.
    const allIds = all.map(idOf);
    onReorder(arrayMove(allIds, allIds.indexOf(String(active.id)), allIds.indexOf(String(over.id))));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className}>
          {visible.map((item) => (
            <SortableItem key={idOf(item)} id={idOf(item)} label={labelOf(item)}>
              {(handle) => render(item, handle)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({ id, label, children }: { id: string; label: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Move ${label}`}
      className="-ml-1.5 flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint transition-colors hover:bg-surface-2 hover:text-foreground active:cursor-grabbing pointer-coarse:h-11 pointer-coarse:w-8"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
        {[4, 8, 12].flatMap((y) => [6, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" />))}
      </svg>
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`min-w-0 ${isDragging ? "relative z-10 opacity-90 [&>article]:shadow-raised" : ""}`}
    >
      {children(handle)}
    </div>
  );
}
