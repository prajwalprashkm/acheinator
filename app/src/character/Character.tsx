"use client";

import { useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { BASE_PATH } from "@/engine/loadAssets";
import { CLIPS, FADE_MS, LOADING_LOOP, PLAYBACK_RATE, pickClip, type ClipId, type Moment } from "./config";

export interface CharacterHandle {
  /** Maybe plays a clip for this moment, using the chances in config.ts. */
  react(moment: Moment): void;
}

interface Props {
  ref?: Ref<CharacterHandle>;
  /** the model is downloading: loop LOADING_LOOP */
  loading: boolean;
  className?: string;
}

const DIR = `${BASE_PATH}/character`;

const noSubscribe = () => () => {};

/** Safari and every iOS browser show WebM's alpha as an opaque background; they get the HEVC .mov instead. */
function clipExtension() {
  return navigator.vendor.startsWith("Apple") ? "mov" : "webm";
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Character({ ref, loading, className = "" }: Props) {
  // null during the server render; videos are only added in the browser.
  const ext = useSyncExternalStore(noSubscribe, clipExtension, () => null);
  const videos = useRef<Partial<Record<ClipId, HTMLVideoElement>>>({});
  const [playing, setPlaying] = useState<ClipId | null>(null);
  const playingRef = useRef<ClipId | null>(null);

  function play(clip: ClipId) {
    const v = videos.current[clip];
    if (!v || reducedMotion()) return;
    const current = playingRef.current;
    if (current !== null && current !== clip) return;
    v.currentTime = 0;
    v.playbackRate = PLAYBACK_RATE;
    playingRef.current = clip;
    setPlaying(clip);
    v.play().catch(() => stop(clip));
  }

  function stop(clip: ClipId) {
    if (playingRef.current !== clip) return;
    playingRef.current = null;
    setPlaying(null);
  }

  useImperativeHandle(ref, () => ({
    react(moment) {
      if (playingRef.current !== null) return;
      const clip = pickClip(moment);
      if (clip) play(clip);
    },
  }));

  const loopLoading = loading && LOADING_LOOP !== null;
  useEffect(() => {
    if (loopLoading && ext) play(LOADING_LOOP!);
    else if (!loopLoading && playingRef.current === LOADING_LOOP) stop(LOADING_LOOP!);
    // play() / stop() only touch refs and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopLoading, ext]);

  function ended(clip: ClipId) {
    if (clip === LOADING_LOOP && loopLoading) play(clip);
    else stop(clip);
  }

  const fade = { transition: `opacity ${FADE_MS}ms ease-out` };

  return (
    // The art fills only the middle of its square frame, so the frame is drawn larger than the box;
    // the transparent margin overflows. Clips are never cropped (some push in on purpose).
    <div className={`pointer-events-none relative aspect-square select-none ${className}`} aria-hidden>
      <div className="absolute inset-0 scale-[1.35]">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, already 480px */}
      <img
        src={`${DIR}/idle.png`}
        alt=""
        width={480}
        height={480}
        className="absolute inset-0 size-full object-contain"
        style={{ ...fade, opacity: playing ? 0 : 1 }}
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
            // while the model downloads, only fetch the loading loop
            preload={loading && clip !== LOADING_LOOP ? "none" : "auto"}
            onEnded={() => ended(clip)}
            className="absolute inset-0 size-full object-contain"
            style={{ ...fade, opacity: playing === clip ? 1 : 0 }}
          />
        ))}
      </div>
    </div>
  );
}
