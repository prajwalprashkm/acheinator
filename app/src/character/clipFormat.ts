/** WebM VP9 alpha on Chrome/Firefox; HEVC .mov with alpha on WebKit (Safari / iOS). */
export type CharacterClipExt = "webm" | "mov";

export function characterClipExtension(): CharacterClipExt {
  if (typeof navigator === "undefined") return "webm";
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "mov";
  if (navigator.vendor.startsWith("Apple")) return "mov";
  return "webm";
}