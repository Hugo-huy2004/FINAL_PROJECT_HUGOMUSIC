#!/usr/bin/env bash
# MEASUREMENT OF HLS SEGMENT LENGTH TRADE
#
# Short segment -> starts playing faster (fewer bytes loaded before sound),
# ABR changes tiers more smoothly, BUT requires more requests and costs more
# header bytes per segment.
# Long segment -> vice versa.
#
# The script measures all three quantities on the same song, with the same bitrate, only changing the length
# segment: bytes to download before broadcasting, total capacity, number of requests.
#
# Use: bash research/segment_tradeoff.sh <music file> [bitrate_kbps]
set -euo pipefail

SRC="${1:?cần đường dẫn file nhạc}"
KBPS="${2:-64}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$SRC" | head -1)
printf 'Bài: %s\n' "$(basename "$SRC")"
printf 'Thời lượng %.0f giây, tier %s kbps\n\n' "$DUR" "$KBPS"

printf '%-9s %-10s %-14s %-13s %s\n' "segment" "số file" "byte mở đầu" "tổng byte" "phụ trội"
printf '%.0s-' {1..64}; echo

BASE=""
for SEG in 2 4 6 10 15; do
  OUT="$WORK/s$SEG"; mkdir -p "$OUT"
  ffmpeg -y -loglevel error -i "$SRC" -vn \
    -c:a aac -b:a "${KBPS}k" -ac 2 \
    -f hls -hls_time "$SEG" -hls_playlist_type vod \
    -hls_segment_filename "$OUT/s_%04d.ts" "$OUT/p.m3u8"

  N=$(ls "$OUT"/s_*.ts | wc -l | tr -d ' ')
  TOTAL=$(cat "$OUT"/s_*.ts "$OUT/p.m3u8" | wc -c | tr -d ' ')
  # Bytes must load before sound: playlist + first segment.
  FIRST=$(( $(wc -c < "$OUT/p.m3u8") + $(wc -c < "$OUT/s_0000.ts") ))

  [ -z "$BASE" ] && BASE=$TOTAL
  OVER=$(awk -v t="$TOTAL" -v b="$BASE" 'BEGIN{printf "%+.1f%%", (t/b-1)*100}')

  printf '%-9s %-10s %-14s %-13s %s\n' \
    "${SEG}s" "$N" \
    "$(awk -v x="$FIRST" 'BEGIN{printf "%.0f KB", x/1024}')" \
    "$(awk -v x="$TOTAL" 'BEGIN{printf "%.2f MB", x/1048576}')" \
    "$OVER"
done

echo
echo "Thời gian tới tiếng đầu tiên theo tốc độ mạng (chỉ tính byte mở đầu):"
printf '%-9s' "segment"; for BW in 256 512 1024; do printf '%12s' "${BW}kbps"; done; echo
for SEG in 2 4 6 10 15; do
  OUT="$WORK/s$SEG"
  FIRST=$(( $(wc -c < "$OUT/p.m3u8") + $(wc -c < "$OUT/s_0000.ts") ))
  printf '%-9s' "${SEG}s"
  for BW in 256 512 1024; do
    printf '%12s' "$(awk -v b="$FIRST" -v w="$BW" 'BEGIN{printf "%.2f s", b*8/(w*1000)}')"
  done
  echo
done
