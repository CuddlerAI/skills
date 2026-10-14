#!/usr/bin/env bash
# watermark.sh — stamp the Cuddler.ai corner mark onto a local video. Uses only ffmpeg and ffprobe; nothing leaves the machine.
#
# usage: watermark.sh <video> [--out FILE] [--ink auto|light|dark] [--force]
#
# The mark matches a watermarked download from the Cuddler app: top-right corner, 14% of the
# frame width (at most 24% of the short side), a margin of 3% of the short side, 85% opacity,
# white ink on dark corners and dark ink on bright ones (auto reads the corner in 3 frames).
# Picture size, frame rate and audio are kept; the picture is re-encoded as H.264 (CRF 18).
#
# Writes FILE (default: <video without extension>-cuddler.mp4 next to the video) and prints its path.
#
# Exit codes: 0 stamped · 2 usage error · 3 ffmpeg or ffprobe missing · 4 the video could not be stamped
set -euo pipefail

die() { echo "watermark: $2" >&2; exit "$1"; }
is_int() { printf '%s' "$1" | grep -Eq '^[0-9]+$'; }
is_num() { printf '%s' "$1" | grep -Eq '^[0-9]+([.][0-9]+)?$'; }

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IN=""; OUT=""; INK="auto"; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out|--ink)
      [ $# -ge 2 ] || die 2 "$1 needs a value"
      case "$1" in
        --out) OUT="$2" ;;
        --ink) INK="$2" ;;
      esac
      shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) awk 'NR >= 2 && NR <= 12 { sub(/^# ?/, ""); print }' "$0"; exit 0 ;;
    -*) die 2 "unknown option $1 (see --help)" ;;
    *) [ -z "$IN" ] || die 2 "one video per run"; IN="$1"; shift ;;
  esac
done

command -v ffmpeg >/dev/null 2>&1 || die 3 "ffmpeg not found (macOS: brew install ffmpeg; Debian/Ubuntu: sudo apt-get install ffmpeg)"
command -v ffprobe >/dev/null 2>&1 || die 3 "ffprobe not found (it ships with ffmpeg)"
[ -n "$IN" ] || die 2 "usage: watermark.sh <video> [--out FILE] [--ink auto|light|dark] [--force] (see --help)"
case "$IN" in http://*|https://*) die 2 "pass a local file; download it first" ;; esac
[ -f "$IN" ] || die 2 "no such file: $IN"
case "$INK" in auto|light|dark) ;; *) die 2 "--ink must be auto, light or dark" ;; esac
for art in light dark; do
  [ -f "$SKILL_DIR/assets/watermark-$art.png" ] || die 4 "missing assets/watermark-$art.png next to this script's skill"
done

if [ -z "$OUT" ]; then
  b=$(basename "$IN")
  case "$b" in ?*.*) b="${b%.*}" ;; esac
  OUT="$(dirname "$IN")/$b-cuddler.mp4"
fi
case "$OUT" in *.mp4|*.MP4|*.mov|*.MOV|*.m4v) ;; *) die 2 "--out must end in .mp4, .mov or .m4v" ;; esac
[ "$(cd "$(dirname "$IN")" && pwd)/$(basename "$IN")" != "$(mkdir -p "$(dirname "$OUT")" && cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")" ] \
  || die 2 "--out must not be the input file"
if [ -e "$OUT" ] && [ "$FORCE" -ne 1 ]; then die 2 "$OUT already exists (pass --force to replace it)"; fi

# ── the picture as players show it (rotation applied), rounded down to even sizes for H.264 ──
probe() { ffprobe -v error "$@" -of default=nw=1:nk=1 "$IN" 2>/dev/null | head -n 1 || true; }
W=$(probe -select_streams v:0 -show_entries stream=width)
H=$(probe -select_streams v:0 -show_entries stream=height)
is_int "$W" && is_int "$H" && [ "$W" -gt 0 ] && [ "$H" -gt 0 ] || die 4 "no video stream in $IN"
ROT=$(probe -select_streams v:0 -show_entries stream_side_data=rotation)
[ -n "$ROT" ] || ROT=$(probe -select_streams v:0 -show_entries stream_tags=rotate)
case "${ROT#-}" in 90|270) T=$W; W=$H; H=$T ;; esac
W=$((W - W % 2)); H=$((H - H % 2))
[ "$W" -ge 64 ] && [ "$H" -ge 64 ] || die 4 "the picture is too small to carry the mark (${W}x${H})"
DUR=$(probe -show_entries format=duration)
is_num "$DUR" || DUR=0

# ── geometry: the same formulas as the app's downloads ──
read -r BW M BH X Y < <(awk -v w="$W" -v h="$H" 'BEGIN {
  s = (w < h) ? w : h
  bw = w * 0.14; if (s * 0.24 < bw) bw = s * 0.24; bw = int(bw + 0.5)
  m = int(s * 0.03 + 0.5)
  bh = int(bw * 182 / 800 + 0.5)
  printf "%d %d %d %d %d\n", bw, m, bh, w - m - bw, m
}')

# ── ink: dark on a bright corner (median luma >= 180 of 3 frames), white otherwise ──
if [ "$INK" = "auto" ]; then
  samples=""
  for ratio in 0.1 0.5 0.9; do
    at=$(awk -v d="$DUR" -v r="$ratio" 'BEGIN { printf "%.3f", d * r }')
    y=$(ffmpeg -v error -ss "$at" -i "$IN" -frames:v 1 \
      -vf "scale=$W:$H,crop=$BW:$BH:$X:$Y,scale=out_range=full,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" \
      -f null - 2>/dev/null | sed -n 's/.*YAVG=\([0-9.]*\).*/\1/p' | head -n 1 || true)
    is_num "$y" && samples="$samples $y"
  done
  median=$(printf '%s\n' $samples | sort -n | awk '{ v[NR] = $1 } END { if (NR) print v[int((NR + 1) / 2)]; else print 0 }')
  INK=$(awk -v l="$median" 'BEGIN { print (l >= 180) ? "dark" : "light" }')
fi
MARK="$SKILL_DIR/assets/watermark-$INK.png"

# ── stamp ──
ACODEC=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "$IN" 2>/dev/null | head -n 1 || true)
if [ "$ACODEC" = "aac" ]; then AUDIO=(-c:a copy); else AUDIO=(-c:a aac -b:a 192k); fi
TMP="$OUT.part.mp4"
trap 'rm -f "$TMP"' EXIT
ffmpeg -v error -y -i "$IN" -i "$MARK" -filter_complex \
  "[0:v]scale=$W:$H,setsar=1[base];[1:v]format=rgba,scale=$BW:-1:flags=lanczos[mark];[base][mark]overlay=$X:$Y:format=auto,format=yuv420p[v]" \
  -map "[v]" -map "0:a?" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p "${AUDIO[@]}" \
  -movflags +faststart "$TMP" \
  || die 4 "ffmpeg could not stamp $IN"
mv -f "$TMP" "$OUT"
trap - EXIT

echo "stamped: $OUT (${W}x${H}, $INK mark ${BW}px wide in the top-right corner)"
echo "next: read one frame of it to check the mark, e.g. ffmpeg -v error -ss 1 -i \"$OUT\" -frames:v 1 \"${OUT%.*}-check.jpg\""
