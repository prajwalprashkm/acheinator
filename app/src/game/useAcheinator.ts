"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { Akinator, type HistoryEntry } from "@/engine/akinator";
import { loadAssets } from "@/engine/loadAssets";
import { createBrowserNetwork } from "@/engine/network";
import type { Age, Answer, Guess, Meta, Question, Sex, Suspicion } from "@/engine/types";

export type Phase = "loading" | "error" | "intro" | "age" | "sex" | "asking" | "result" | "suspicious";

export interface GameState {
  phase: Phase;
  meta: Meta | null;
  loadProgress: number;
  error: string | null;
  /** true while the engine is working; inputs are ignored */
  busy: boolean;
  age: Age | null;
  sex: Sex | null;
  question: Question | null;
  questionText: string;
  guesses: Guess[];
  history: HistoryEntry[];
  /** why the game stopped; null when the user pressed "guess now" */
  stopReason: string | null;
  /** "keep asking" was used in this game */
  refining: boolean;
  isChild: boolean;
  /** while phase is "suspicious": why the answers look off, and where "keep going" leads */
  suspicion: Suspicion | null;
  resumePhase: "asking" | "result";
}

const initial: GameState = {
  phase: "loading",
  meta: null,
  loadProgress: 0,
  error: null,
  busy: false,
  age: null,
  sex: null,
  question: null,
  questionText: "",
  guesses: [],
  history: [],
  stopReason: null,
  refining: false,
  isChild: false,
  suspicion: null,
  resumePhase: "asking",
};

type Action =
  | { type: "progress"; value: number }
  | { type: "loaded"; meta: Meta }
  | { type: "error"; message: string }
  | { type: "phase"; phase: Phase }
  | { type: "busy" }
  | { type: "age"; age: Age | null }
  | { type: "sex"; sex: Sex | null }
  | { type: "refining" }
  | { type: "update"; patch: Partial<GameState> };

function reducer(state: GameState, a: Action): GameState {
  switch (a.type) {
    case "progress":
      return { ...state, loadProgress: a.value };
    case "loaded":
      return { ...state, phase: "intro", loadProgress: 1, meta: a.meta };
    case "error":
      return { ...state, phase: "error", error: a.message, busy: false };
    case "phase":
      return { ...state, phase: a.phase };
    case "busy":
      return { ...state, busy: true };
    case "age":
      return { ...state, age: a.age, phase: "sex" };
    case "sex":
      return { ...state, sex: a.sex, refining: false };
    case "refining":
      return { ...state, refining: true };
    case "update":
      return { ...state, ...a.patch, busy: false };
  }
}

export function useAcheinator() {
  const [state, dispatch] = useReducer(reducer, initial);
  const engine = useRef<Akinator | null>(null);
  const busy = useRef(false);
  /** the player chose "keep going anyway" this game, so don't ask again */
  const trusted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, modelBytes } = await loadAssets((f) => !cancelled && dispatch({ type: "progress", value: f }));
        const { input, output } = data.meta.network;
        const net = await createBrowserNetwork(modelBytes, input, output);
        if (cancelled) return;
        engine.current = new Akinator(data, net);
        dispatch({ type: "loaded", meta: data.meta });
      } catch (e) {
        if (!cancelled) dispatch({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Runs an engine action, then asks the engine what to do next. Ignores input while busy. */
  const run = useCallback(async (action?: (ak: Akinator) => void | Promise<void>) => {
    const ak = engine.current;
    if (!ak || busy.current) return;
    busy.current = true;
    dispatch({ type: "busy" });
    try {
      await action?.(ak);
      const step = await ak.nextStep();
      const guesses = await ak.top(3);
      const next: GameState["resumePhase"] = step.action === "ask" ? "asking" : "result";
      const suspicion = trusted.current ? null : ak.suspicion(next === "result");
      const common: Partial<GameState> = {
        guesses,
        history: [...ak.answers],
        isChild: ak.isChild(),
        phase: suspicion ? "suspicious" : next,
        suspicion,
        resumePhase: next,
      };
      if (step.action === "ask") {
        dispatch({
          type: "update",
          patch: { ...common, question: step.question, questionText: ak.questionText(step.question) },
        });
      } else {
        dispatch({ type: "update", patch: { ...common, question: null, stopReason: step.reason } });
      }
    } catch (e) {
      dispatch({ type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      busy.current = false;
    }
  }, []);

  const start = useCallback(() => dispatch({ type: "phase", phase: "age" }), []);

  const chooseAge = useCallback((age: Age | null) => dispatch({ type: "age", age }), []);

  const chooseSex = useCallback(
    (sex: Sex | null) => {
      trusted.current = false;
      dispatch({ type: "sex", sex });
      const age = state.age;
      void run((ak) => {
        ak.reset();
        ak.setProfile(sex, age);
      });
    },
    [run, state.age],
  );

  const backToAge = useCallback(() => dispatch({ type: "phase", phase: "age" }), []);

  const answer = useCallback(
    (value: Answer) => {
      const q = state.question;
      if (q) void run((ak) => ak.answer(q, value));
    },
    [run, state.question],
  );

  /** Undo the last answer; with no answers left, go back to the sex question. */
  const undo = useCallback(() => {
    const ak = engine.current;
    if (!ak || busy.current) return;
    if (ak.nAnswered === 0) {
      dispatch({ type: "phase", phase: "sex" });
      return;
    }
    void run((a) => void a.undo());
  }, [run]);

  /** Go back to answer k (0-based) so it can be answered again. */
  const jumpTo = useCallback((k: number) => void run((ak) => ak.restore(k)), [run]);

  const guessNow = useCallback(() => {
    const ak = engine.current;
    if (!ak || busy.current) return;
    void ak.top(3).then((guesses) =>
      dispatch({ type: "update", patch: { phase: "result", guesses, stopReason: null, question: null } }),
    );
  }, []);

  const keepAsking = useCallback(() => {
    dispatch({ type: "refining" });
    void run((ak) => ak.keepAsking(10));
  }, [run]);

  const playAgain = useCallback(() => {
    engine.current?.reset();
    dispatch({
      type: "update",
      patch: {
        phase: "age",
        age: null,
        sex: null,
        question: null,
        guesses: [],
        history: [],
        stopReason: null,
        refining: false,
        suspicion: null,
      },
    });
  }, []);

  /** From the "your answers don't add up" pause: carry on and don't ask again this game. */
  const continueAnyway = useCallback(() => {
    trusted.current = true;
    dispatch({ type: "update", patch: { phase: state.resumePhase, suspicion: null } });
  }, [state.resumePhase]);

  return {
    state,
    start,
    chooseAge,
    chooseSex,
    backToAge,
    answer,
    undo,
    jumpTo,
    guessNow,
    keepAsking,
    playAgain,
    continueAnyway,
  };
}

export type Game = ReturnType<typeof useAcheinator>;
