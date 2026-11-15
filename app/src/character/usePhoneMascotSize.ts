"use client";

import { useEffect, useState } from "react";

const LG = "(min-width: 1024px)";
/** Fixed mascot square on phones — does not shrink when the question UI grows (UI scrolls instead). */
export const MASCOT_MAX_PX = 328;

/**
 * On phones, returns a stable square size (~41% of viewport height, capped).
 * On lg+, returns undefined (grid column controls width).
 */
export function usePhoneMascotSize() {
  const [size, setSize] = useState<number | undefined>(undefined);

  useEffect(() => {
    const mq = window.matchMedia(LG);

    const fit = () => {
      if (mq.matches) {
        setSize(undefined);
        return;
      }
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const want = Math.min(vh * 0.41, MASCOT_MAX_PX);
      setSize((prev) => (prev !== undefined && Math.abs(prev - want) < 3 ? prev : want));
    };

    fit();
    window.visualViewport?.addEventListener("resize", fit);
    window.addEventListener("resize", fit);
    mq.addEventListener("change", fit);
    return () => {
      window.visualViewport?.removeEventListener("resize", fit);
      window.removeEventListener("resize", fit);
      mq.removeEventListener("change", fit);
    };
  }, []);

  return size;
}