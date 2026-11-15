"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY, type Theme } from "@/theme";

const listeners = new Set<() => void>();

function read(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private browsing: the choice just won't be remembered
  }
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  {
    value: "system",
    label: "Match device",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>
    ),
  },
  {
    value: "light",
    label: "Light",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  },
];

export function ThemeSwitch() {
  // Server render and first client render both say "system"; the real value follows right after.
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  return (
    <div role="radiogroup" aria-label="Colour theme" className="flex rounded-control border-2 border-outline p-0.5">
      {OPTIONS.map((o) => {
        const on = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => apply(o.value)}
            className={`grid size-8 place-items-center rounded-[0.3rem] transition-colors ${
              on ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {o.icon}
            </svg>
          </button>
        );
      })}
    </div>
  );
}
