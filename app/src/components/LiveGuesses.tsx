import type { Guess } from "@/engine/types";
import { Meter } from "./ui/Meter";

export function LiveGuesses({ guesses }: { guesses: Guess[] }) {
  return (
    <section aria-labelledby="live-guesses">
      <h3 id="live-guesses" className="text-sm font-semibold">
        Current best guesses
      </h3>
      <ol className="mt-3 space-y-3" aria-live="polite">
        {guesses.map((g) => (
          <li key={g.index}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate" title={g.label}>
                {g.label}
              </span>
              <span className="shrink-0 text-muted tabular-nums">{Math.round(g.p * 100)}%</span>
            </div>
            <Meter value={g.p} className="mt-1" />
          </li>
        ))}
      </ol>
    </section>
  );
}
