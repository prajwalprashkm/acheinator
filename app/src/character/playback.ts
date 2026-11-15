/** Mobile WebKit often refuses to play videos that are fully transparent in the stack. */
export function mustRevealVideoBeforePlay(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function revealAfterFirstFrame(v: HTMLVideoElement, onReveal: () => void) {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    onReveal();
  };
  const fallback = window.setTimeout(finish, 220);
  if (typeof v.requestVideoFrameCallback === "function") {
    v.requestVideoFrameCallback(() => {
      window.clearTimeout(fallback);
      finish();
    });
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.clearTimeout(fallback);
      finish();
    });
  });
}

/**
 * iOS: call sync inside touchstart/click — play+pause each element so later programmatic play works.
 */
export function unlockInlinePlayback(pool: Iterable<HTMLVideoElement | null | undefined>) {
  for (const v of pool) {
    if (!v) continue;
    v.muted = true;
    const attempt = v.play();
    if (attempt) void attempt.then(() => v.pause()).catch(() => undefined);
  }
}