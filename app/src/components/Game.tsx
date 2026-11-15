"use client";

import { useEffect, useRef } from "react";
import { Character, type CharacterHandle } from "@/character/Character";
import { CONFIDENT } from "@/character/config";
import type { Age, Sex } from "@/engine/types";
import { useAcheinator, type GameState } from "@/game/useAcheinator";
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
  const character = useReactions(s);
  const loading = s.phase === "loading" || s.phase === "error" || !s.meta;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 md:flex-row md:items-start md:justify-center md:gap-4">
      {/* first child in every phase, so the videos stay loaded */}
      <Character ref={character} loading={s.phase === "loading"} className="my-2 w-28 shrink-0 sm:w-36 md:my-0 md:w-48" />
      <Screen g={g} narrow={loading || ["intro", "age", "sex"].includes(s.phase)} />
    </div>
  );
}

/** Tells the character about answers, suspicious answers and results. */
function useReactions(s: GameState) {
  const character = useRef<CharacterHandle>(null);
  const prev = useRef({ phase: s.phase, answered: s.history.length });
  const topP = s.guesses[0]?.p ?? 0;

  useEffect(() => {
    const p = prev.current;
    const answered = s.history.length;
    prev.current = { phase: s.phase, answered };
    if (s.phase === p.phase && answered === p.answered) return;
    const c = character.current;
    if (s.phase === "suspicious") c?.react("suspicious");
    else if (s.phase === "result" && p.phase !== "result") c?.react(topP >= CONFIDENT ? "confidentResult" : "result");
    else if (s.phase === "asking" && answered > p.answered) c?.react("answer");
  }, [s.phase, s.history.length, topP]);

  return character;
}

function Screen({ g, narrow }: { g: ReturnType<typeof useAcheinator>; narrow: boolean }) {
  return (
    <div className={narrow ? "w-full max-w-xl" : "w-full min-w-0 flex-1"}>
      <ScreenContent g={g} />
    </div>
  );
}

function ScreenContent({ g }: { g: ReturnType<typeof useAcheinator> }) {
  const { state: s } = g;

  if (s.phase === "loading" || s.phase === "error" || !s.meta) {
    return <LoadingScreen progress={s.loadProgress} error={s.error} />;
  }
  const meta = s.meta;

  if (s.phase === "intro") return <IntroScreen onStart={g.start} />;

  if (s.phase === "age") {
    const options: Option<Age>[] = (Object.keys(meta.ages) as Age[]).map((a) => ({ value: a, label: capitalize(meta.ages[a]) }));
    return <ProfileStep key="age" step="Before we start · 1 of 2" prompt="Who are the symptoms for? They are…" options={options} onChoose={g.chooseAge} />;
  }

  if (s.phase === "sex") {
    const young = s.age === "baby" || s.age === "child";
    const prompt = s.age === "baby" ? "Is the baby a boy or a girl?" : s.age === "child" ? "Is the child a boy or a girl?" : "What sex were you assigned at birth?";
    const options: Option<Sex>[] = [
      { value: "female", label: young ? "Girl" : "Female" },
      { value: "male", label: young ? "Boy" : "Male" },
    ];
    return <ProfileStep key="sex" step="Before we start · 2 of 2" prompt={prompt} options={options} onChoose={g.chooseSex} onBack={g.backToAge} disabled={s.busy} />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
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
