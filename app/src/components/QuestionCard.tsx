import type { Answer } from "@/engine/types";
import { useKeys } from "@/game/useKeys";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface Props {
  number: number;
  text: string;
  busy: boolean;
  onAnswer: (value: Answer) => void;
  onUndo: () => void;
  onGuess: () => void;
}

/** Buttons stay enabled while busy (the game ignores input then) so keyboard focus isn't lost after each answer. */
export function QuestionCard({ number, text, busy, onAnswer, onUndo, onGuess }: Props) {
  useKeys(
    {
      y: () => onAnswer(true),
      n: () => onAnswer(false),
      "?": () => onAnswer(null),
      "/": () => onAnswer(null),
      u: onUndo,
      g: onGuess,
    },
    !busy,
  );

  return (
    <Card aria-busy={busy}>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">Question {number}</p>
      <h2 className="mt-2 min-h-[3.5em] text-xl leading-snug font-semibold sm:text-2xl" aria-live="polite">
        {text}
      </h2>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button variant="primary" onClick={() => onAnswer(true)} shortcut="Y">
          Yes
        </Button>
        <Button variant="primary" onClick={() => onAnswer(false)} shortcut="N">
          No
        </Button>
        <Button className="col-span-2 sm:col-span-1" onClick={() => onAnswer(null)} shortcut="?">
          Don&apos;t know
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" className="-ml-2" onClick={onUndo} shortcut="U">
          ← Undo
        </Button>
        <Button variant="ghost" className="-mr-2" onClick={onGuess} shortcut="G">
          Guess now
        </Button>
      </div>
    </Card>
  );
}
