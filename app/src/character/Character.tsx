"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type Ref,
} from "react";
import { BASE_PATH } from "@/engine/loadAssets";
import {
  CLIPS,
  IDLE_DURATION_SEC,
  IDLE_LOOP,
  IDLE_REST_TIMES,
  IDLE_REST_TOLERANCE_SEC,
  IDLE_STILL_AFTER_GESTURE,
  IDLE_STILL_MAX_MS,
  LOADING_LOOP,
  MASCOT_ART_SCALE,
  MASCOT_CLIP_INSET_PERCENT,
  PLAYBACK_RATE,
  pickClip,
  type ClipId,
  type GestureClipId,
  type Moment,
} from "./config";
import { characterClipExtension } from "./clipFormat";

export interface CharacterHandle {
  /** For `answer`, pass clip from pickAnswerReaction; other moments pick from REACTIONS. */
  react(moment: Moment, clip?: GestureClipId | null): void;
}

interface Props {
  ref?: Ref<CharacterHandle>;
  loading: boolean;
  className?: string;
  style?: CSSProperties;
}

const DIR = `${BASE_PATH}/character`;

/** `still` = idle.png; otherwise a visible video (idle loop or a gesture). */
type Surface = "still" | ClipId;

const noSubscribe = () => () => {};

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function ensureIdleReady(img: HTMLImageElement | null) {
  if (!img) return;
  if (!img.complete) {
    await new Promise<void>((resolve, reject) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => reject(), { once: true });
    });
  }
  await img.decode();
}

function revealAfterFirstFrame(v: HTMLVideoElement, onReveal: () => void) {
  const show = () => onReveal();
  if (typeof v.requestVideoFrameCallback === "function") {
    v.requestVideoFrameCallback(() => show());
  } else {
    requestAnimationFrame(() => requestAnimationFrame(show));
  }
}

function nearIdleRest(time: number) {
  return IDLE_REST_TIMES.some(
    (r) =>
      Math.abs(time - r) < IDLE_REST_TOLERANCE_SEC ||
      (r === 0 && time > IDLE_DURATION_SEC - IDLE_REST_TOLERANCE_SEC),
  );
}

export function Character({ ref, loading, className = "", style }: Props) {
  const ext = useSyncExternalStore(noSubscribe, characterClipExtension, () => null);
  const idleRef = useRef<HTMLImageElement>(null);
  const videos = useRef<Partial<Record<ClipId, HTMLVideoElement>>>({});
  const [surface, setSurface] = useState<Surface>("still");
  /** Gesture playing or handing off; idle-float does not set this. */
  const busyRef = useRef<GestureClipId | null>(null);
  const waitingGestureRef = useRef(false);
  const floatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleBootedRef = useRef(false);
  const pendingUnlockRef = useRef(false);

  function clearFloatTimer() {
    if (floatTimerRef.current) {
      clearTimeout(floatTimerRef.current);
      floatTimerRef.current = null;
    }
  }

  function queueFloatLater(ms = IDLE_STILL_MAX_MS) {
    clearFloatTimer();
    if (reducedMotion()) return;
    floatTimerRef.current = setTimeout(() => void startIdleFloat(), ms);
  }

  function abortGesture(clip: GestureClipId) {
    if (busyRef.current !== clip) return;
    busyRef.current = null;
    waitingGestureRef.current = false;
    videos.current[clip]?.pause();
    void enterRestState();
  }

  function playGesture(clip: GestureClipId) {
    const v = videos.current[clip];
    if (!v || reducedMotion()) return;
    if (busyRef.current !== null) return;

    const begin = () => {
      v.currentTime = 0;
      v.playbackRate = PLAYBACK_RATE;
      v.loop = false;
      busyRef.current = clip;
      v.play().catch(() => {
        pendingUnlockRef.current = true;
        abortGesture(clip);
      });
    };

    if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) begin();
    else v.addEventListener("loadeddata", () => begin(), { once: true });
  }

  function onGesturePlaying(clip: GestureClipId) {
    if (busyRef.current !== clip) return;
    const v = videos.current[clip];
    if (!v) return;
    revealAfterFirstFrame(v, () => {
      if (busyRef.current === clip) setSurface(clip);
    });
  }

  async function pauseAtStill(then: () => void) {
    videos.current[IDLE_LOOP]?.pause();
    try {
      await ensureIdleReady(idleRef.current);
    } catch {
      /* swap anyway */
    }
    setSurface("still");
    then();
  }

  function startIdleFloat() {
    clearFloatTimer();
    if (reducedMotion() || busyRef.current !== null) return;
    const v = videos.current[IDLE_LOOP];
    if (!v) return;

    const begin = () => {
      v.loop = true;
      v.currentTime = 0;
      v.playbackRate = PLAYBACK_RATE;
      v.play().catch(() => {
        pendingUnlockRef.current = true;
        setSurface("still");
      });
    };

    if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) begin();
    else v.addEventListener("loadeddata", () => begin(), { once: true });
  }

  function onIdleFloatPlaying() {
    if (busyRef.current !== null) return;
    const v = videos.current[IDLE_LOOP];
    if (!v || v.paused) return;
    revealAfterFirstFrame(v, () => {
      if (busyRef.current === null && !v.paused) setSurface(IDLE_LOOP);
    });
  }

  function gestureFromIdle(clip: GestureClipId) {
    if (waitingGestureRef.current || busyRef.current !== null) return;
    waitingGestureRef.current = true;
    clearFloatTimer();

    const v = videos.current[IDLE_LOOP];
    const go = () => {
      waitingGestureRef.current = false;
      void pauseAtStill(() => playGesture(clip));
    };

    if (surface !== IDLE_LOOP || !v || v.paused) {
      go();
      return;
    }

    if (nearIdleRest(v.currentTime)) {
      go();
      return;
    }

    const onTime = () => {
      if (nearIdleRest(v.currentTime)) {
        v.removeEventListener("timeupdate", onTime);
        clearTimeout(forced);
        go();
      }
    };
    const forced = setTimeout(() => {
      v.removeEventListener("timeupdate", onTime);
      go();
    }, IDLE_DURATION_SEC * 1000 + 200);
    v.addEventListener("timeupdate", onTime);
  }

  async function returnFromGesture(clip: GestureClipId) {
    if (busyRef.current !== clip) return;
    videos.current[clip]?.pause();
    busyRef.current = null;
    waitingGestureRef.current = false;
    if (clip === LOADING_LOOP) {
      if (reducedMotion()) setSurface("still");
      else await enterRestState();
      return;
    }
    try {
      await ensureIdleReady(idleRef.current);
    } catch {
      /* ok */
    }
    if (busyRef.current !== null) return;
    await enterRestState();
  }

  async function enterRestState() {
    setSurface("still");
    if (reducedMotion()) return;
    if (Math.random() < IDLE_STILL_AFTER_GESTURE) queueFloatLater();
    else startIdleFloat();
  }

  useImperativeHandle(ref, () => ({
    react(moment, clipOverride) {
      if (busyRef.current !== null || waitingGestureRef.current) return;
      const clip =
        moment === "answer" && clipOverride !== undefined ? clipOverride : pickClip(moment);
      if (!clip) return;
      clearFloatTimer();
      gestureFromIdle(clip);
    },
  }));

  const loopLoading = loading && LOADING_LOOP !== null;
  useEffect(() => {
    if (loopLoading && ext && LOADING_LOOP) {
      clearFloatTimer();
      videos.current[IDLE_LOOP]?.pause();
      playGesture(LOADING_LOOP);
    }
    // When loading finishes, let the current thinking clip play out; onGestureEnded hands off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopLoading, ext]);

  useEffect(() => {
    if (!ext) return;
    let cancelled = false;
    const boot = () => {
      if (cancelled || idleBootedRef.current) return;
      if (reducedMotion() || busyRef.current !== null) {
        idleBootedRef.current = true;
        return;
      }
      if (!videos.current[IDLE_LOOP]) {
        requestAnimationFrame(boot);
        return;
      }
      idleBootedRef.current = true;
      startIdleFloat();
    };
    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext]);

  /** iOS often blocks muted autoplay until the first tap anywhere on the page. */
  useEffect(() => {
    if (!ext) return;
    const unlock = () => {
      if (reducedMotion() || busyRef.current !== null) return;
      const v = videos.current[IDLE_LOOP];
      if (!pendingUnlockRef.current && v && !v.paused) return;
      pendingUnlockRef.current = false;
      startIdleFloat();
    };
    document.addEventListener("touchstart", unlock, { passive: true });
    document.addEventListener("click", unlock);
    return () => {
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
    // surface omitted intentionally — unlock only needs latest stuck/autoplay state via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext]);

  function onGestureEnded(clip: GestureClipId) {
    if (LOADING_LOOP && clip === LOADING_LOOP) {
      if (loopLoading) playGesture(LOADING_LOOP);
      else void returnFromGesture(clip);
      return;
    }
    void returnFromGesture(clip);
  }

  function isGesture(clip: ClipId): clip is GestureClipId {
    return clip !== IDLE_LOOP;
  }

  return (
    <div
      className={`pointer-events-none relative isolate z-0 box-border aspect-square select-none overflow-hidden contain-paint ${className}`}
      style={{
        ...style,
        padding: `${MASCOT_CLIP_INSET_PERCENT}%`,
      }}
      aria-hidden
    >
      <div className="relative h-full w-full overflow-hidden">
        <div
          className="absolute inset-0 origin-center"
          style={{ transform: `scale(${MASCOT_ART_SCALE})` }}
        >
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, already 480px */}
        <img
          ref={idleRef}
          src={`${DIR}/idle.png`}
          alt=""
          width={480}
          height={480}
          className="absolute inset-0 size-full object-contain"
          style={{ opacity: surface === "still" ? 1 : 0, transition: "none" }}
          draggable={false}
        />
        {ext &&
          CLIPS.map((clip) => (
            <video
              key={clip}
              ref={(el) => {
                if (el) videos.current[clip] = el;
                else delete videos.current[clip];
              }}
              src={`${DIR}/${clip}.${ext}`}
              muted
              playsInline
              disablePictureInPicture
              loop={clip === IDLE_LOOP}
              preload={clip === IDLE_LOOP || clip === LOADING_LOOP ? "auto" : loading ? "none" : "auto"}
              onPlaying={() => {
                if (clip === IDLE_LOOP) onIdleFloatPlaying();
                else if (isGesture(clip)) onGesturePlaying(clip);
              }}
              onEnded={() => {
                if (isGesture(clip)) onGestureEnded(clip);
              }}
              className="absolute inset-0 size-full object-contain"
              style={{ opacity: surface === clip ? 1 : 0, transition: "none" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}