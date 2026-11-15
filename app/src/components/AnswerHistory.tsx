import type { HistoryEntry } from "@/engine/akinator";

const label = (a: HistoryEntry["answer"]) => (a === true ? "Yes" : a === false ? "No" : "Don't know");

interface Props {
  history: HistoryEntry[];
  busy: boolean;
  onJump: (k: number) => void;
}

export function AnswerHistory({ history, busy, onJump }: Props) {
  return (
    <section aria-labelledby="answer-history">
      <h3 id="answer-history" className="text-sm font-semibold">
        Your answers
      </h3>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing yet.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">Click one to go back and change it.</p>
          <ol className="mt-2 max-h-80 space-y-1 overflow-y-auto pr-1 lg:max-h-[50vh]">
            {history.map((h, k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => onJump(k)}
                  disabled={busy}
                  className="flex w-full gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
                  title="Go back to this question"
                >
                  <span className="shrink-0 text-muted tabular-nums">{k + 1}.</span>
                  <span className="min-w-0 flex-1">{h.text}</span>
                  <span className="shrink-0 font-medium">{label(h.answer)}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
