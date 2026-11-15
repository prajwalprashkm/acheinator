"use client";

import type { Age, Sex } from "@/engine/types";
import { useAcheinator } from "@/game/useAcheinator";
import { AnswerHistory } from "./AnswerHistory";
import { IntroScreen } from "./IntroScreen";
import { LiveGuesses } from "./LiveGuesses";
import { LoadingScreen } from "./LoadingScreen";
import { ProfileStep, type Option } from "./ProfileStep";
import { QuestionCard } from "./QuestionCard";
import { ResultScreen } from "./ResultScreen";
import { SuspicionCard } from "./SuspicionCard";
import { Card } from "./ui/Card";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Game() {
  const g = useAcheinator();
  const { state: s } = g;

  if (s.phase === "loading" || s.phase === "error" || !s.meta) {
    return <Narrow><LoadingScreen progress={s.loadProgress} error={s.error} /></Narrow>;
  }
  const meta = s.meta;

  if (s.phase === "intro") return <Narrow><IntroScreen onStart={g.start} /></Narrow>;

  if (s.phase === "age") {
    const options: Option<Age>[] = (Object.keys(meta.ages) as Age[]).map((a) => ({ value: a, label: capitalize(meta.ages[a]) }));
    return (
      <Narrow>
        <ProfileStep key="age" step="Before we start · 1 of 2" prompt="Who are the symptoms for? They are…" options={options} onChoose={g.chooseAge} />
      </Narrow>
    );
  }

  if (s.phase === "sex") {
    const young = s.age === "baby" || s.age === "child";
    const prompt = s.age === "baby" ? "Is the baby a boy or a girl?" : s.age === "child" ? "Is the child a boy or a girl?" : "What sex were you assigned at birth?";
    const options: Option<Sex>[] = [
      { value: "female", label: young ? "Girl" : "Female" },
      { value: "male", label: young ? "Boy" : "Male" },
    ];
    return (
      <Narrow>
        <ProfileStep key="sex" step="Before we start · 2 of 2" prompt={prompt} options={options} onChoose={g.chooseSex} onBack={g.backToAge} disabled={s.busy} />
      </Narrow>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div>
        {s.phase === "asking" ? (
          <QuestionCard
            number={s.history.length + 1}
            text={s.questionText}
            busy={s.busy}
            onAnswer={g.answer}
            onUndo={g.undo}
            onGuess={g.guessNow}
          />
        ) : s.phase === "suspicious" && s.suspicion ? (
          <SuspicionCard
            suspicion={s.suspicion}
            answered={s.history.length}
            atResult={s.resumePhase === "result"}
            busy={s.busy}
            onFix={g.undo}
            onContinue={g.continueAnyway}
            onStartOver={g.playAgain}
          />
        ) : (
          <ResultScreen
            meta={meta}
            guesses={s.guesses}
            questionsAsked={s.history.length}
            stopReason={s.stopReason}
            busy={s.busy}
            onKeepAsking={g.keepAsking}
            onPlayAgain={g.playAgain}
          />
        )}
      </div>
      <Card className="space-y-6">
        {(s.phase === "asking" || s.phase === "suspicious") && <LiveGuesses guesses={s.guesses} />}
        <AnswerHistory history={s.history} busy={s.busy} onJump={g.jumpTo} />
      </Card>
    </div>
  );
}

function Narrow({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-xl">{children}</div>;
}
