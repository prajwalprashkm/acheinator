/** WebM VP9 alpha works in Chrome/Firefox; iOS WebKit (all phone browsers) need .mov HEVC alpha. */
export function characterClipExtension(): "mov" | "webm" {
  if (typeof navigator === "undefined") return "webm";
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "mov";
  if (navigator.vendor.startsWith("Apple")) return "mov";
  return "webm";
}