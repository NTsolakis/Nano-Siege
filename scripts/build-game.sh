#!/usr/bin/env bash
set -euo pipefail

# Build the Nano‑Siege desktop game with an independent game semantic
# version. This script:
#   - Bumps data/game-version.json (patch version)
#   - Generates data/patchnotes-X.Y.Z.txt from git history
#   - Builds Electron desktop binaries (Linux AppImage + Windows exe)
#
# Usage (from repo root):
#   ./scripts/build-game.sh
#
# Assumes:
#   - Node/npm dependencies are already installed (run npm install first
#     or use ./scripts/build-desktop-release.sh which does it for you).

echo "== Nano-Siege game build =="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required to build the game." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is required to derive patch notes." >&2
  exit 1
fi

VERSION_FILE="data/game-version.json"

current_version=""
if [ -f "${VERSION_FILE}" ]; then
  current_version="$(node -e "console.log((require('./data/game-version.json').version || '').trim())" 2>/dev/null || true)"
fi

if [ -z "${current_version}" ] && [ -f "data/meta.json" ]; then
  current_version="$(node -e "try{const m=require('./data/meta.json');console.log(((m.gameVersion||m.version||'').trim()));}catch(e){console.log('');}" 2>/dev/null || true)"
fi

if [ -z "${current_version}" ]; then
  current_version="0.0.0"
fi

parse_semver() {
  local v="$1"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$v"
  major=${major:-0}
  minor=${minor:-0}
  patch=${patch:-0}
  printf '%s %s %s\n' "$major" "$minor" "$patch"
}

read -r major minor patch < <(parse_semver "${current_version}")
patch=$((patch + 1))
new_version="${major}.${minor}.${patch}"

echo "Game version: ${current_version} -> ${new_version}"

mkdir -p "$(dirname "${VERSION_FILE}")"
cat > "${VERSION_FILE}" <<EOF
{
  "version": "${new_version}"
}
EOF

# Keep data/meta.json's gameVersion in sync on the dev side so the
# value you see in that file matches the latest desktop build. The
# Unraid deploy script will still aggregate versions server-side, but
# this makes the local meta.json less confusing.
if [ -f "data/meta.json" ]; then
  tmpfile="$(mktemp)"
  jq --arg ver "${new_version}" '.gameVersion = $ver' "data/meta.json" > "${tmpfile}" && mv "${tmpfile}" "data/meta.json"
fi

echo
echo "Generating patch notes for game version ${new_version}..."

last_tag="$(git describe --tags --match 'game-v*' --abbrev=0 2>/dev/null || echo "")"
range_args=()
if [ -n "${last_tag}" ]; then
  echo "Using last game tag: ${last_tag}"
  range_args=("${last_tag}..HEAD")
else
  echo "No previous game tag found; using full game commit history."
fi

patch_notes="$(git log "${range_args[@]}" --pretty=format:'%s' -- \
  src \
  index.html \
  styles.css \
  sandbox-config.js \
  electron-main.js \
  electron-preload.js \
  scripts/build-local-zip.sh \
  2>/dev/null || true
)"

patch_notes="$(printf '%s\n' "${patch_notes}" | sed '/^[[:space:]]*$/d' | sed '/^Incremental desktop\/launcher update$/d' | sed '/^Describe the change$/d')"

if [ -z "${patch_notes//[$'\t\r\n ']}" ]; then
  patch_notes="No gameplay changes in this update."
fi

patch_file="data/patchnotes-${new_version}.txt"
mkdir -p "$(dirname "${patch_file}")"
printf '%s\n' "${patch_notes}" > "${patch_file}"

echo "Wrote patch notes to ${patch_file}"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git tag "game-v${new_version}" >/dev/null 2>&1; then
    echo "Tagged game-v${new_version}"
  else
    echo "NOTE: could not create git tag game-v${new_version} (it may already exist)."
  fi
fi

echo
echo "Building Linux AppImage..."
npm run build:linux

echo
echo "Building Windows portable exe (requires Wine)..."
npm run build:win

echo
echo "Game build complete. Desktop artifacts in dist/:"
ls -1 dist/Nano-Siege.* 2>/dev/null || echo "  (no game artifacts found yet)"
