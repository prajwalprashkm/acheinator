"use client";

import { useEffect, useState, type RefObject } from "react";

const LG = "(min-width: 1024px)";
/** Largest mascot on phones (matches the lg column cap feel). */
export const MASCOT_MAX_PX = 328; // ~20.5rem — slot size; clip inset + scale keep art inside
const GAP_PX = 10;

/**
 * On phones, picks a square mascot size so character + UI fit in the viewport without
 * overlapping. On lg+, returns undefined (column width controls size).
 */
export function usePhoneMascotSize(uiRef: RefObject<HTMLElement | null>, layoutKey?: unknown) {
  const [size, setSize] = useState<number | undefined>(undefined);

  useEffect(() => {
    const mq = window.matchMedia(LG);

    const fit = () => {
      if (mq.matches) {
        setSize(undefined);
        return;
      }

      const vh = window.visualViewport?.height ?? window.innerHeight;
      const header = document.querySelector("header")?.getBoundingClientRect().height ?? 52;
      const main = document.querySelector("main");
      const mainStyles = main ? getComputedStyle(main) : null;
      const padY =
        (mainStyles ? parseFloat(mainStyles.paddingTop) + parseFloat(mainStyles.paddingBottom) : 32) || 32;
      const ui = uiRef.current;
      const uiH = ui?.getBoundingClientRect().height ?? ui?.scrollHeight ?? 0;

      const budget = vh - header - padY;
      const want = Math.min(vh * 0.41, MASCOT_MAX_PX);
      const maxWithoutOverlap = budget - uiH - GAP_PX;

      if (uiH <= 0) {
        setSize(want);
        return;
      }

      if (maxWithoutOverlap >= want * 0.85) {
        setSize(want);
      } else {
        setSize(Math.max(120, Math.min(want, maxWithoutOverlap)));
      }
    };

    fit();
    const afterMount = requestAnimationFrame(fit);
    const ro = new ResizeObserver(fit);
    if (uiRef.current) ro.observe(uiRef.current);
    window.visualViewport?.addEventListener("resize", fit);
    window.addEventListener("resize", fit);
    mq.addEventListener("change", fit);
    return () => {
      cancelAnimationFrame(afterMount);
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", fit);
      window.removeEventListener("resize", fit);
      mq.removeEventListener("change", fit);
    };
  }, [uiRef, layoutKey]);

  return size;
}