"use client";

import { useEffect } from "react";

/**
 * Keeps the tab title in step with what's on screen (league, week). Next
 * re-applies the layout's metadata title after client navigations (e.g. a
 * week change in the URL), so re-assert ours whenever <head> changes.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}
