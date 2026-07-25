#!/usr/bin/env bash
# Renders a 1200x630 cover image for every blog post from tools/og-card.html.
# Titles come straight from each post's <title>, so adding a post and re-running
# this is all it takes. Requires Chrome, which macOS already has.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="og"
mkdir -p "$OUT"

urlencode() {
  python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$1"
}

for f in blogs/*.html; do
  # skip the redirect stubs, which have no article body
  grep -q 'id="content"' "$f" || continue

  slug="$(basename "$f" .html)"
  title="$(python3 -c '
import re,sys
html = open(sys.argv[1]).read()
m = re.search(r"<title>(.*?)</title>", html, re.S)
print(re.sub(r"\s+", " ", m.group(1)).strip() if m else "")
' "$f")"

  [ -n "$title" ] || { echo "  no title, skipping $f"; continue; }

  "$CHROME" \
    --headless \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=2 \
    --window-size=1200,630 \
    --virtual-time-budget=6000 \
    --screenshot="$ROOT/$OUT/$slug.png" \
    "file://$ROOT/tools/og-card.html?title=$(urlencode "$title")" \
    >/dev/null 2>&1

  printf '  %-58s %s\n' "$slug.png" "$(sips -g pixelWidth -g pixelHeight "$OUT/$slug.png" 2>/dev/null | awk '/pixel/{printf "%s ", $2}')"
done
