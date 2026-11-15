#!/usr/bin/env bash
# Frames the raw captures from scripts/landing-shots.mjs into the window look the site uses:
# rounded corners, a hairline, one soft shadow, transparent around. GNOME's own window screenshot
# is not available over ssh (the shell refuses ScreenshotWindow to non-shell callers), so the
# frame is drawn here with the same recipe.
#
#   bash scripts/landing-frames.sh shots-out
set -eu

IN=${1:-shots-out}
OUT=${2:-shots-framed}
R=28      # corner radius at 2x (= 14 css px)
PAD=110   # room for the shadow

mkdir -p "$OUT"

for f in "$IN"/*.png; do
  name=$(basename "$f" .png)
  w=$(magick identify -format '%w' "$f")
  h=$(magick identify -format '%h' "$f")
  cw=$((w + PAD * 2))
  ch=$((h + PAD * 2))

  magick "$f" -alpha set \
    \( -size "${w}x${h}" xc:none -fill white -draw "roundrectangle 0,0,$((w-1)),$((h-1)),$R,$R" \) \
    -compose CopyOpacity -composite "/tmp/f-$name.png"

  magick -size "${cw}x${ch}" xc:none \
    \( "/tmp/f-$name.png" -background black -shadow 60x26+0+20 \) -geometry +${PAD}+${PAD} -composite \
    "/tmp/f-$name.png" -geometry +${PAD}+${PAD} -composite \
    -fill none -stroke "rgba(255,255,255,0.09)" -strokewidth 2 \
    -draw "roundrectangle ${PAD},${PAD},$((PAD + w - 1)),$((PAD + h - 1)),$R,$R" \
    "$OUT/$name.png"

  if [ "$name" = "phone" ]; then W=820; else W=1760; fi
  magick "$OUT/$name.png" -resize ${W}x\> -quality 92 -define webp:method=6 "$OUT/$name.webp"
  echo "$name -> $OUT/$name.webp ($(du -h "$OUT/$name.webp" | cut -f1))"
done
