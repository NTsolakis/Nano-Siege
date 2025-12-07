#!/usr/bin/env bash
set -euo pipefail

# Build Nano‑Siege desktop launchers with an independent launcher
# semantic version. This script:
#   - Bumps launcher/launcher-version.json (patch version)
#   - Builds Electron launchers for Linux + Windows into ./dist
#
# Usage (from repo root):
#   ./scripts/build-launcher.sh
#
# Assumes:
#   - Node/npm dependencies are already installed (run npm install first
#     or use ./scripts/build-desktop-release.sh which does it for you).

echo "== Nano-Siege launcher build =="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required to build the launcher." >&2
  exit 1
fi

VERSION_FILE="launcher/launcher-version.json"

current_version=""
if [ -f "${VERSION_FILE}" ]; then
  current_version="$(node -e "console.log((require('./launcher/launcher-version.json').version || '').trim())" 2>/dev/null || true)"
fi

if [ -z "${current_version}" ] && [ -f "data/meta.json" ]; then
  current_version="$(node -e "try{const m=require('./data/meta.json');console.log((m.launcherVersion||'').trim());}catch(e){console.log('');}" 2>/dev/null || true)"
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

echo "Launcher version: ${current_version} -> ${new_version}"

cat > "${VERSION_FILE}" <<EOF
{
  "version": "${new_version}"
}
EOF

# Keep data/meta.json's launcherVersion in sync on the dev side so the
# value you see in that file matches the latest launcher build. The
# Unraid deploy script will still aggregate versions server-side, but
# this makes the local meta.json less confusing.
if [ -f "data/meta.json" ]; then
  tmpfile="$(mktemp)"
  jq --arg ver "${new_version}" '.launcherVersion = $ver' "data/meta.json" > "${tmpfile}" && mv "${tmpfile}" "data/meta.json"
fi

echo
echo "Building Electron launcher (Linux AppImage)..."
npm run build:launcher:electron:linux

echo
echo "Building Electron launcher (Windows portable)..."
npm run build:launcher:electron:win

echo
echo "Launcher build complete. Artifacts in dist/:"
ls -1 dist/NanoSiegeLauncher* 2>/dev/null || echo "  (no launcher artifacts found yet)"
