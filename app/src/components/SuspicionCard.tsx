import type { Suspicion } from "@/engine/types";
import { useKeys } from "@/game/useKeys";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface Props {
  suspicion: Suspicion;
  answered: number;
  /** "keep going" leads to the result rather than the next question */
  atResult: boolean;
  busy: boolean;
  onFix: () => void;
  onContinue: () => void;
  onStartOver: () => void;
}

const MESSAGES: Record<Suspicion, (n: number) => { title: string; body: string }> = {
  "dont-know": () => ({
    title: "That's a lot of “don't know”s…",
    body: "I can't guess much from those. A best guess is fine: answer yes or no if you can.",
  }),
  "all-no": (n) => ({
    title: "No to everything?",
    body: `That's ${n} questions without a single yes. If something is bothering you, at least one of them should have been a yes.`,
  }),
  "all-yes": (n) => ({
    title: "Yes to everything?",
    body: `All ${n} answers were yes. Illnesses don't usually work like that. Are you testing me?`,
  }),
  alternating: () => ({
    title: "Yes, no, yes, no…",
    body: "Your answers are taking turns. Are you testing me?",
  }),
  mismatch: () => ({
    title: "Hmm, these answers don't add up.",
    body: "None of the conditions I know fit all of these answers together. Maybe one of them was a slip?",
  }),
};

export function SuspicionCard({ suspicion, answered, atResult, busy, onFix, onContinue, onStartOver }: Props) {
  useKeys({ f: onFix, u: onFix, k: onContinue, r: onStartOver }, !busy);
  const { title, body } = MESSAGES[suspicion](answered);

  return (
    <Card aria-busy={busy}>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">Wait a moment</p>
      <h2 className="mt-2 text-xl leading-snug font-semibold sm:text-2xl" aria-live="polite">
        {title}
      </h2>
      <p className="mt-3 text-muted">{body}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onFix} shortcut="F">
          Fix my last answer
        </Button>
        <Button onClick={onContinue} shortcut="K">
          {atResult ? "Show the guess anyway" : "Keep going anyway"}
        </Button>
        <Button variant="ghost" onClick={onStartOver} shortcut="R">
          Start over
        </Button>
      </div>
      <p className="mt-4 text-sm text-muted">You can also click any earlier answer to change it.</p>
    </Card>
  );
}
