"use client";

import { useEffect, useRef } from "react";

/** Calls keys[event.key.toLowerCase()] on key presses, unless typing in a field or using a modifier. */
export function useKeys(keys: Record<string, () => void>, enabled = true) {
  const ref = useRef(keys);
  useEffect(() => {
    ref.current = keys;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const fn = ref.current[e.key.toLowerCase()];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
