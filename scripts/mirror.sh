#!/usr/bin/env bash
# Re-mirror the current GTA.js production build from gtajs.wtf into ./assets.
# Run from the repo root. Rewrites absolute /assets/ URLs to relative ones and
# updates index.html with the new hashed filenames.
set -euo pipefail

BASE="https://gtajs.wtf"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"

curl -sSL "$BASE/play/" -o "$TMP/play.html"
JS=$(grep -oE 'src="/assets/play-[^"]+\.js"' "$TMP/play.html" | sed -E 's/src="\/assets\/(.*)"/\1/')
CSS=$(grep -oE 'href="/assets/play-[^"]+\.css"' "$TMP/play.html" | sed -E 's/href="\/assets\/(.*)"/\1/')
POLY=$(grep -oE 'href="/assets/modulepreload-polyfill-[^"]+\.js"' "$TMP/play.html" | sed -E 's/href="\/assets\/(.*)"/\1/')

echo "js=$JS css=$CSS polyfill=$POLY"
rm -rf "$ROOT/assets" && mkdir -p "$ROOT/assets"
for f in "$JS" "$CSS" "$POLY"; do
  curl -sSL "$BASE/assets/$f" -o "$ROOT/assets/$f"
done
curl -sSL "$BASE/sw.js" -o "$ROOT/sw.js"

# CSS: url(/assets/x) -> url(x), then fetch the referenced files
for ref in $(grep -oE 'url\(/assets/[^)]+\)' "$ROOT/assets/$CSS" | sed -E 's/url\(\/assets\/(.*)\)/\1/' | sort -u); do
  curl -sSL "$BASE/assets/$ref" -o "$ROOT/assets/$ref"
done
sed -i -E 's#url\(/assets/#url(#g' "$ROOT/assets/$CSS"

# index.html: swap hashed names
sed -i -E "s#assets/play-[A-Za-z0-9_-]+\.js#assets/$JS#; s#assets/play-[A-Za-z0-9_-]+\.css#assets/$CSS#; s#assets/modulepreload-polyfill-[A-Za-z0-9_-]+\.js#assets/$POLY#" "$ROOT/index.html"

echo "Mirrored build from $BASE on $(date -u +%F)"
