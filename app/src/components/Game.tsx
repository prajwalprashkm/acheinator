"use client";

import { useEffect, useRef } from "react";
import { Character, type CharacterHandle } from "@/character/Character";
import { MASCOT_MAX_PX, usePhoneMascotSize } from "@/character/usePhoneMascotSize";
import { pickAnswerReaction } from "@/character/answerReactions";
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
  const uiRef = useRef<HTMLDivElement>(null);
  const phoneSize = usePhoneMascotSize();

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-col lg:block">
      <div className="flex min-h-0 flex-col items-center gap-2.5 lg:grid lg:grid-cols-[minmax(11rem,22rem)_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <Character
          ref={character}
          loading={s.phase === "loading"}
          className="mx-auto w-full shrink-0 overflow-hidden lg:sticky lg:top-6 lg:max-h-[min(64dvh,26rem)]"
          style={
            phoneSize !== undefined
              ? { width: phoneSize, height: phoneSize, maxWidth: `min(92vw, ${MASCOT_MAX_PX}px)` }
              : undefined
          }
        />
        <div ref={uiRef} className="relative z-10 w-full min-w-0 min-h-0 lg:overflow-visible">
          <Screen g={g} narrow={loading || ["intro", "age", "sex"].includes(s.phase)} scrollOnPhone />
        </div>
      </div>
    </div>
  );
}

/** Tells the character about answers, suspicious answers and results. */
function useReactions(s: GameState) {
  const character = useRef<CharacterHandle>(null);
  const prev = useRef({ phase: s.phase, answered: s.history.length });
  const prevTopP = useRef<number | null>(null);
  const topP = s.guesses[0]?.p ?? 0;

  useEffect(() => {
    const p = prev.current;
    const answered = s.history.length;
    prev.current = { phase: s.phase, answered };
    if (answered === 0) prevTopP.current = null;
    if (s.phase === p.phase && answered === p.answered) return;
    const c = character.current;
    if (s.phase === "suspicious") c?.react("suspicious");
    else if (s.phase === "result" && p.phase !== "result") c?.react(topP >= CONFIDENT ? "confidentResult" : "result");
    else if (s.phase === "asking" && answered > p.answered) {
      const last = s.history[answered - 1];
      const clip = pickAnswerReaction({
        lastAnswer: last?.answer ?? null,
        history: s.history,
        guesses: s.guesses,
        prevTopP: prevTopP.current,
      });
      prevTopP.current = topP;
      c?.react("answer", clip);
    }
  }, [s.phase, s.history.length, topP, s.guesses, s.history]);

  return character;
}

function Screen({
  g,
  narrow,
  scrollOnPhone,
}: {
  g: ReturnType<typeof useAcheinator>;
  narrow: boolean;
  scrollOnPhone: boolean;
}) {
  return (
    <div
      className={
        narrow
          ? "mx-auto w-full max-w-xl lg:mx-0"
          : `w-full min-w-0${scrollOnPhone ? " max-lg:max-h-[min(58dvh,40rem)] max-lg:overflow-y-auto max-lg:overscroll-y-contain" : ""}`
      }
    >
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
            diseaseSymptoms={g.diseaseSymptoms}
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