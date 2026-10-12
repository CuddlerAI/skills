#!/usr/bin/env bash
# contact-sheet.sh — a local review pack for one video clip. Uses only ffmpeg and ffprobe; nothing leaves the machine.
#
# usage: contact-sheet.sh <clip> [--out DIR] [--every SEC] [--frames N] [--cols N]
#                         [--expect-seconds N] [--expect-aspect W:H] [--cut-threshold 0.2]
#
# Writes into DIR (default: <clip without extension>.review next to the clip):
#   summary.txt, summary.json   measurements and PASS / WARN / FAIL checks
#   sheet.jpg                   contact sheet, one tile every SEC seconds (timestamps drawn when a font is found)
#   frames/t<seconds>.jpg       N frames spread over the clip, long side at most 768 px
#   cuts.txt                    times of abrupt picture changes (possible hard cuts)
#   audio.txt                   loudness and silence intervals in the voice band
#   meta.json                   raw ffprobe output
#
# Exit codes: 0 analysed · 2 usage error · 3 ffmpeg or ffprobe missing · 4 the clip could not be analysed
set -euo pipefail

die() { echo "contact-sheet: $2" >&2; exit "$1"; }
is_num() { printf '%s' "$1" | grep -Eq '^[0-9]+([.][0-9]+)?$'; }
fmt() { awk -v x="$1" 'BEGIN { printf "%.2f", x }'; }

IN=""; OUT=""; EVERY=""; NFRAMES=12; COLS=""; EXP_S=""; EXP_A=""; CUT_T=0.2
while [ $# -gt 0 ]; do
  case "$1" in
    --out|--every|--frames|--cols|--expect-seconds|--expect-aspect|--cut-threshold)
      [ $# -ge 2 ] || die 2 "$1 needs a value"
      case "$1" in
        --out) OUT="$2" ;;
        --every) EVERY="$2" ;;
        --frames) NFRAMES="$2" ;;
        --cols) COLS="$2" ;;
        --expect-seconds) EXP_S="$2" ;;
        --expect-aspect) EXP_A="$2" ;;
        --cut-threshold) CUT_T="$2" ;;
      esac
      shift 2 ;;
    -h|--help) awk 'NR >= 2 && NR <= 15 { sub(/^# ?/, ""); print }' "$0"; exit 0 ;;
    -*) die 2 "unknown option $1 (see --help)" ;;
    *) [ -z "$IN" ] || die 2 "one clip per run"; IN="$1"; shift ;;
  esac
done

command -v ffmpeg >/dev/null 2>&1 || die 3 "ffmpeg not found (macOS: brew install ffmpeg; Debian/Ubuntu: sudo apt-get install ffmpeg)"
command -v ffprobe >/dev/null 2>&1 || die 3 "ffprobe not found (it ships with ffmpeg)"
[ -n "$IN" ] || die 2 "usage: contact-sheet.sh <clip> [--out DIR] [--expect-seconds N] [--expect-aspect W:H] (see --help)"
case "$IN" in http://*|https://*) die 2 "pass a local file; download it first (for a Cuddler clip: cuddler download <clip_id> --out DIR)" ;; esac
[ -f "$IN" ] || die 2 "no such file: $IN"
[ -z "$EVERY" ] || is_num "$EVERY" || die 2 "--every must be a number of seconds"
is_num "$NFRAMES" || die 2 "--frames must be a whole number"
[ -z "$COLS" ] || is_num "$COLS" || die 2 "--cols must be a whole number"
[ -z "$EXP_S" ] || is_num "$EXP_S" || die 2 "--expect-seconds must be a number"
is_num "$CUT_T" || die 2 "--cut-threshold must be a number between 0 and 1"
if [ -n "$EXP_A" ]; then
  printf '%s' "$EXP_A" | grep -Eq '^[0-9]+:[0-9]+$' || die 2 "--expect-aspect must look like 9:16"
fi

if [ -z "$OUT" ]; then
  b=$(basename "$IN")
  case "$b" in ?*.*) b="${b%.*}" ;; esac
  OUT="$(dirname "$IN")/$b.review"
fi
mkdir -p "$OUT/frames"
rm -f "$OUT"/frames/t*.jpg "$OUT/sheet.jpg" "$OUT/zoom-"*.jpg

# ── metadata ────────────────────────────────────────────────────────────────
ffprobe -v error -print_format json -show_format -show_streams "$IN" > "$OUT/meta.json" 2>/dev/null \
  || die 4 "ffprobe cannot read $IN"
probe() { ffprobe -v error "$@" -of default=nw=1:nk=1 "$IN" 2>/dev/null | head -n 1 || true; }
DUR=$(probe -show_entries format=duration)
is_num "$DUR" || die 4 "no duration in $IN"
W=$(probe -select_streams v:0 -show_entries stream=width)
H=$(probe -select_streams v:0 -show_entries stream=height)
if ! is_num "$W" || ! is_num "$H"; then die 4 "no video stream in $IN"; fi
ROT=$(probe -select_streams v:0 -show_entries stream_side_data=rotation)
case "${ROT#-}" in 90|270) T="$W"; W="$H"; H="$T" ;; esac
FPS=$(probe -select_streams v:0 -show_entries stream=avg_frame_rate)
VCODEC=$(probe -select_streams v:0 -show_entries stream=codec_name)
ACODEC=$(probe -select_streams a:0 -show_entries stream=codec_name)
HAS_AUDIO=no; [ -n "$ACODEC" ] && HAS_AUDIO=yes
FPS_N=$(awk -v f="$FPS" 'BEGIN { n = split(f, p, "/"); v = (n == 2 && p[2] > 0) ? p[1] / p[2] : f + 0; printf "%.3f", v }')

# ── geometry for the sheet and frames ───────────────────────────────────────
if [ -z "$EVERY" ]; then EVERY=$(awk -v d="$DUR" 'BEGIN { print (d <= 16) ? 0.5 : 1 }'); fi
RATE=$(awk -v e="$EVERY" 'BEGIN { printf "%.6f", 1 / e }')
NTILES=$(awk -v d="$DUR" -v e="$EVERY" 'BEGIN { n = int(d / e); if (n * e < d - 1e-6) n++; if (n < 1) n = 1; print n }')
if [ "$W" -lt "$H" ]; then TILE_W=200; DEF_COLS=6; elif [ "$W" -gt "$H" ]; then TILE_W=320; DEF_COLS=4; else TILE_W=240; DEF_COLS=5; fi
COLS="${COLS:-$DEF_COLS}"
ROWS=$(awk -v n="$NTILES" -v c="$COLS" 'BEGIN { r = int(n / c); if (r * c < n) r++; print r }')
if [ "$W" -ge "$H" ]; then FW=$(( W < 768 ? W : 768 )); FH=-2; else FW=-2; FH=$(( H < 768 ? H : 768 )); fi

FONT=""
for f in /System/Library/Fonts/Supplemental/Arial.ttf /Library/Fonts/Arial.ttf /System/Library/Fonts/Helvetica.ttc \
         /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf /usr/share/fonts/dejavu/DejaVuSans.ttf /usr/share/fonts/TTF/DejaVuSans.ttf; do
  if [ -f "$f" ]; then FONT="$f"; break; fi
done

# ── contact sheet ───────────────────────────────────────────────────────────
BASE_VF="fps=${RATE},scale=${TILE_W}:-2"
TILE_VF="tile=${COLS}x${ROWS}:padding=4:margin=4:color=0x202020"
LABELED=no
if [ -n "$FONT" ]; then
  LABEL="drawtext=fontfile=${FONT}:text='%{pts\\:hms}':x=6:y=6:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6:boxborderw=3"
  if ffmpeg -v error -y -i "$IN" -vf "${BASE_VF},${LABEL},${TILE_VF}" -frames:v 1 -q:v 3 "$OUT/sheet.jpg" 2>/dev/null; then LABELED=yes; fi
fi
if [ "$LABELED" = no ]; then
  ffmpeg -v error -y -i "$IN" -vf "${BASE_VF},${TILE_VF}" -frames:v 1 -q:v 3 "$OUT/sheet.jpg" 2>/dev/null \
    || die 4 "ffmpeg could not build the contact sheet"
fi

# ── full-size frames, from the first frame to just before the end ───────────
if [ "$NFRAMES" -lt 2 ]; then NFRAMES=2; fi
i=0
while [ "$i" -lt "$NFRAMES" ]; do
  t=$(awk -v d="$DUR" -v i="$i" -v n="$NFRAMES" 'BEGIN { t = i * d / (n - 1); m = d - 0.15; if (t > m) t = m; if (t < 0) t = 0; printf "%.2f", t }')
  name=$(awk -v t="$t" 'BEGIN { printf "t%06.2f.jpg", t }')
  ffmpeg -v error -y -ss "$t" -i "$IN" -frames:v 1 -vf "scale=${FW}:${FH}" -q:v 3 "$OUT/frames/$name" 2>/dev/null || true
  if [ ! -s "$OUT/frames/$name" ]; then
    t=$(awk -v d="$DUR" 'BEGIN { t = d - 0.6; if (t < 0) t = 0; printf "%.2f", t }')
    name=$(awk -v t="$t" 'BEGIN { printf "t%06.2f.jpg", t }')
    ffmpeg -v error -y -ss "$t" -i "$IN" -frames:v 1 -vf "scale=${FW}:${FH}" -q:v 3 "$OUT/frames/$name" 2>/dev/null || true
  fi
  i=$((i + 1))
done
NFRAMES_OK=$(find "$OUT/frames" -type f -name 't*.jpg' | wc -l | tr -d ' ')

# ── cuts ─────────────────────────────────────────────────────────────────────
ffmpeg -hide_banner -nostats -loglevel info -i "$IN" -an -vf "select='gt(scene,${CUT_T})',showinfo" -f null - 2>&1 \
  | awk '/Parsed_showinfo/ && /pts_time:/ { for (i = 1; i <= NF; i++) if ($i ~ /^pts_time:/) { v = $i; sub(/pts_time:/, "", v); if (v + 0 > 0.1) printf "%.2f\n", v + 0 } }' \
  > "$OUT/cuts.txt" || true
NCUTS=$(awk 'NF { n++ } END { print n + 0 }' "$OUT/cuts.txt")
CUTS_LIST=$(awk 'NF { printf "%s%s", (n++ ? ", " : ""), $1 } END { if (!n) printf "none" }' "$OUT/cuts.txt")

# ── audio ────────────────────────────────────────────────────────────────────
LUFS=""; TP=""; TH=""; ONSET=""; LAST_END=""; HOLD=""; GAP=""
if [ "$HAS_AUDIO" = yes ]; then
  LN=$(ffmpeg -hide_banner -nostats -loglevel info -i "$IN" -vn -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 || true)
  LUFS=$(printf '%s\n' "$LN" | awk -F'"' '/"input_i"/ { print $4; exit }')
  TP=$(printf '%s\n' "$LN" | awk -F'"' '/"input_tp"/ { print $4; exit }')
  # Voice-band threshold: 14 dB under the integrated loudness, clamped to [-50, -25] dB.
  TH=$(awk -v l="$LUFS" 'BEGIN { if (l !~ /^-?[0-9.]+$/) { print -50; exit } t = int(l - 14); if (t < -50) t = -50; if (t > -25) t = -25; print t }')
  ffmpeg -hide_banner -nostats -loglevel info -i "$IN" -vn -af "highpass=f=150,lowpass=f=4000,silencedetect=noise=${TH}dB:d=0.3" -f null - 2>&1 \
    | grep -E 'silence_(start|end)' > "$OUT/.silence.log" || true
  eval "$(awk -v d="$DUR" '
    /silence_start:/ { v = $0; sub(/.*silence_start: */, "", v); s = v + 0; open = 1; next }
    /silence_end:/   { v = $0; sub(/.*silence_end: */, "", v); sub(/[ |].*/, "", v); n++; S[n] = s; E[n] = v + 0; open = 0; next }
    END {
      if (open) { n++; S[n] = s; E[n] = d }
      onset = 0; last = d; gap = 0
      if (n > 0 && S[1] <= 0.05) { onset = (E[1] >= d - 0.05) ? -1 : E[1] }
      if (n > 0 && E[n] >= d - 0.05) { last = S[n] }
      for (i = 1; i <= n; i++) if (S[i] > 0.05 && E[i] < d - 0.05 && E[i] - S[i] > gap) gap = E[i] - S[i]
      printf "ONSET=%.2f LAST_END=%.2f HOLD=%.2f GAP=%.2f\n", onset, last, (onset < 0 ? 0 : d - last), gap
    }' "$OUT/.silence.log")"
  {
    echo "integrated loudness: ${LUFS:-n/a} LUFS · true peak: ${TP:-n/a} dBTP"
    echo "voice-band silence threshold: ${TH} dB (min 0.3 s)"
    echo "silence intervals (voice band):"
    awk '/silence_start:/ { v = $0; sub(/.*silence_start: */, "", v); printf "  %.2f", v + 0 }
         /silence_end:/   { v = $0; sub(/.*silence_end: */, "", v); sub(/[ |].*/, "", v); printf " → %.2f\n", v + 0; o = 0; next }
         /silence_start:/ { o = 1 }
         END { if (o) print " → end" }' "$OUT/.silence.log"
  } > "$OUT/audio.txt"
  rm -f "$OUT/.silence.log"
else
  echo "no audio stream" > "$OUT/audio.txt"
fi

# ── checks ───────────────────────────────────────────────────────────────────
CHECKS=""
add() { CHECKS="${CHECKS}$1|$2|$3
"; }
ASPECT=$(awk -v w="$W" -v h="$H" 'BEGIN {
  split("9:16 16:9 1:1 4:3 3:4 21:9 2:3 3:2", c, " "); best = ""; bd = 1e9; r = w / h
  for (i = 1; i <= 8; i++) { split(c[i], p, ":"); x = log(r / (p[1] / p[2])); if (x < 0) x = -x; if (x < bd) { bd = x; best = c[i] } }
  printf "%s", best }')
if [ -n "$EXP_S" ]; then
  if awk -v d="$DUR" -v e="$EXP_S" 'BEGIN { x = d - e; if (x < 0) x = -x; exit !(x <= 0.6) }'; then add duration PASS "$(fmt "$DUR") s (expected $EXP_S s)"
  else add duration FAIL "$(fmt "$DUR") s (expected $EXP_S s)"; fi
else add duration INFO "$(fmt "$DUR") s"; fi
if [ -n "$EXP_A" ]; then
  if awk -v w="$W" -v h="$H" -v a="$EXP_A" 'BEGIN { split(a, p, ":"); x = (w / h) / (p[1] / p[2]) - 1; if (x < 0) x = -x; exit !(x <= 0.02) }'; then
    add aspect PASS "${W}x${H} (${ASPECT})"
  else add aspect FAIL "${W}x${H} (~${ASPECT}, expected ${EXP_A})"; fi
else add aspect INFO "${W}x${H} (~${ASPECT})"; fi
if [ "$HAS_AUDIO" = yes ]; then
  add audio PASS "$ACODEC"
  if awk -v o="$ONSET" 'BEGIN { exit !(o < 0) }'; then add first_sound_onset WARN "no sound above ${TH} dB in the voice band"
  elif awk -v o="$ONSET" 'BEGIN { exit !(o <= 2.0) }'; then add first_sound_onset PASS "$ONSET s (approximate)"
  elif awk -v o="$ONSET" 'BEGIN { exit !(o <= 3.0) }'; then add first_sound_onset WARN "$ONSET s — the first line starts late"
  else add first_sound_onset FAIL "$ONSET s — the first line starts very late"; fi
  if awk -v h="$HOLD" 'BEGIN { exit !(h >= 1.5) }'; then add end_hold PASS "$HOLD s after the last sound"
  else add end_hold WARN "$HOLD s after the last sound (want ≥ 1.5 s; confirm on the last frames)"; fi
  if awk -v g="$GAP" 'BEGIN { exit !(g <= 3.5) }'; then add longest_gap PASS "$GAP s"
  else add longest_gap WARN "$GAP s of silence inside the clip — a line may be missing"; fi
  if [ -n "$TP" ] && awk -v t="$TP" 'BEGIN { exit !(t > -1.0) }'; then add true_peak WARN "${TP} dBTP (> -1)"
  else add true_peak PASS "${TP:-n/a} dBTP"; fi
  add loudness INFO "${LUFS:-n/a} LUFS integrated"
else
  add audio FAIL "no audio stream (Cuddler and Seedance clips normally carry sound)"
fi
if [ "$NCUTS" -eq 0 ]; then add cuts PASS "no abrupt picture changes (threshold $CUT_T)"
else add cuts WARN "$NCUTS at ${CUTS_LIST} s — confirm on the sheet; a FAIL if one take was asked for"; fi
add frames INFO "$NFRAMES_OK frames in frames/"
ROW_STARTS=$(awk -v r="$ROWS" -v c="$COLS" -v e="$EVERY" 'BEGIN { for (i = 0; i < r; i++) printf "%s%.1f", (i ? ", " : ""), i * c * e }')
SHEET_NOTE="sheet.jpg: ${COLS} x ${ROWS} tiles, left to right then top to bottom, one every ${EVERY} s; rows start at ${ROW_STARTS} s; timestamps drawn: ${LABELED}"

# ── outputs ──────────────────────────────────────────────────────────────────
json_str() { printf '%s' "$1" | awk 'BEGIN { ORS = "" } { gsub(/\\/, "\\\\"); gsub(/"/, "\\\""); gsub(/\t/, "\\t"); if (NR > 1) printf "\\n"; print }'; }
num_or_null() { if printf '%s' "$1" | grep -Eq '^-?[0-9]+([.][0-9]+)?$'; then printf '%s' "$1"; else printf 'null'; fi; }
{
  printf '{\n'
  printf '  "clip": "%s",\n' "$(json_str "$IN")"
  printf '  "duration_s": %s,\n' "$(fmt "$DUR")"
  printf '  "width": %s,\n  "height": %s,\n  "aspect": "%s",\n' "$W" "$H" "$ASPECT"
  printf '  "fps": %s,\n  "video_codec": "%s",\n' "$FPS_N" "$(json_str "$VCODEC")"
  printf '  "has_audio": %s,\n' "$([ "$HAS_AUDIO" = yes ] && echo true || echo false)"
  printf '  "loudness_lufs": %s,\n  "true_peak_dbtp": %s,\n' "$(num_or_null "$LUFS")" "$(num_or_null "$TP")"
  printf '  "first_sound_onset_s": %s,\n  "last_sound_end_s": %s,\n' "$(num_or_null "$ONSET")" "$(num_or_null "$LAST_END")"
  printf '  "end_hold_s": %s,\n  "longest_gap_s": %s,\n' "$(num_or_null "$HOLD")" "$(num_or_null "$GAP")"
  printf '  "cuts_s": [%s],\n' "$(awk 'NF { printf "%s%s", (n++ ? ", " : ""), $1 }' "$OUT/cuts.txt")"
  printf '  "sheet": {"cols": %s, "rows": %s, "every_s": %s, "timestamps_drawn": %s, "row_starts_s": [%s]},\n' \
    "$COLS" "$ROWS" "$EVERY" "$([ "$LABELED" = yes ] && echo true || echo false)" "$ROW_STARTS"
  printf '  "checks": [\n'
  printf '%s' "$CHECKS" | awk -F'|' 'NF { gsub(/\\/, "\\\\", $3); gsub(/"/, "\\\"", $3); rows[++n] = sprintf("    {\"id\": \"%s\", \"status\": \"%s\", \"detail\": \"%s\"}", $1, $2, $3) }
    END { for (i = 1; i <= n; i++) printf "%s%s\n", rows[i], (i < n ? "," : "") }'
  printf '  ]\n}\n'
} > "$OUT/summary.json"

{
  echo "clip: $IN"
  echo "$(fmt "$DUR") s · ${W}x${H} (~${ASPECT}) · ${FPS_N} fps · video ${VCODEC} · audio ${ACODEC:-none}"
  echo
  printf '%s' "$CHECKS" | awk -F'|' 'NF { printf "%-5s %-18s %s\n", $2, $1, $3 }'
  echo
  echo "$SHEET_NOTE"
} > "$OUT/summary.txt"

cat "$OUT/summary.txt"
echo
echo "next: read $OUT/summary.txt, then $OUT/sheet.jpg, then every file in $OUT/frames/ in order"
