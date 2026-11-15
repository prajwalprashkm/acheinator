#!/usr/bin/env bash
# Source of truth: ../animations/symptomator (or pass another folder).
# The site only serves files under app/public/character/ — this script copies them there.
#
#   npm run animations                      # from ../animations/symptomator
#   npm run animations -- path/to/folder    # any folder laid out the same way
#
# The source folder needs clips/<id>.webm (VP9 with alpha) and reference/symptomator-idle.png.
# For each clip this writes <id>.webm (Chrome, Edge, Firefox) and <id>.mov (HEVC with alpha:
# Safari and every iPhone browser ignore alpha in WebM). The .mov needs macOS (VideoToolbox).
# Which clip plays when is set in src/character/config.ts.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="${1:-../animations/symptomator}"
OUT=public/character
mkdir -p "$OUT"

shopt -s nullglob
clips=("$SRC"/clips/*.webm)
if [ ${#clips[@]} -eq 0 ]; then
  echo "no clips/*.webm in $SRC" >&2
  exit 1
fi

for webm in "${clips[@]}"; do
  id=$(basename "$webm" .webm)
  cp "$webm" "$OUT/$id.webm"
  # libvpx-vp9 decoder: ffmpeg's built-in VP9 decoder drops the alpha channel.
  ffmpeg -hide_banner -loglevel error -y -c:v libvpx-vp9 -i "$webm" \
    -pix_fmt bgra -c:v hevc_videotoolbox -allow_sw 1 -alpha_quality 0.75 -tag:v hvc1 -b:v 1500k -an \
    "$OUT/$id.mov"
  echo "  $id"
done

ffmpeg -hide_banner -loglevel error -y -i "$SRC/reference/symptomator-idle.png" -vf scale=480:480 "$OUT/idle.png"
ids=()
for webm in "${clips[@]}"; do ids+=("$(basename "$webm" .webm)"); done
echo "wrote ${#clips[@]} clips and idle.png to app/$OUT"
echo "  ids: ${ids[*]}"
echo ""
echo "config.ts does not read this folder. If you added or removed an id, edit src/character/config.ts:"
echo "  CLIPS, GESTURE_CLIPS, IDLE_LOOP, and REACTIONS (chances / triggers)."
