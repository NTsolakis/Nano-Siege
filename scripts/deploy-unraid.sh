#!/usr/bin/env bash
set -euo pipefail

# Deploy Nano-Siege to Unraid with:
# - backend + public sync
# - independent backend/game/launcher versioning
# - meta.json aggregation (no embedded patch notes)
# - safe users.json migration in the persistent data share
# - local offline zip build
#
# Game + launcher versions are produced by build scripts:
#   - ./scripts/build-game.sh      -> data/game-version.json + patchnotes-*.txt
#   - ./scripts/build-launcher.sh  -> launcher/launcher-version.json
#
# This deploy script:
#   - Bumps backendVersion (patch) in data/meta.json
#   - Reads gameVersion / launcherVersion from the build artifacts
#   - Strips meta.patchNotes (server reads patchnotes-*.txt directly)
#   - Syncs backend + public files into the Unraid share
#   - Optionally restarts the nano-siege-backend Docker container
#
# Usage (from repo root on Unraid):
#   ./scripts/deploy-unraid.sh
# or:
#   UNRAID_ROOT=/some/other/path ./scripts/deploy-unraid.sh

# ----- CONFIG -----

ROOT="${UNRAID_ROOT:-/mnt/user/www}"
BACKEND_DIR="${ROOT%/}/nano-siege-backend"
PUBLIC_DIR="${ROOT%/}/nano-siege"
DATA_DIR="${ROOT%/}/nano-siege-data"

META_SRC="data/meta.json"          # in the repo

# ----- HELPERS -----

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $1" >&2
    exit 1
  fi
}

require jq
require git
require rsync

if ! command -v node >/dev/null 2>&1; then
  echo "WARNING: node not found; falling back to meta.json only for game/launcher versions."
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

read_json_version_with_node() {
  local file="$1"
  local prop="$2"
  if [ ! -f "$file" ] || ! command -v node >/dev/null 2>&1; then
    return 1
  fi
  node -e "try{const v=require('./${file}').${prop};if(v){console.log(String(v).trim());}}catch(e){}" 2>/dev/null || true
}

ensure_meta_defaults() {
  if [ -f "$META_SRC" ]; then
    return
  fi
  echo "meta.json not found at $META_SRC, creating a default one..."
  cat > "$META_SRC" <<EOF
{
  "channel": "alpha",
  "backendVersion": "0.0.0",
  "gameVersion": "0.0.0",
  "launcherVersion": "0.0.0",
  "launcherMinVersion": "0.0.0",
  "message": "Welcome to Nano-Siege."
}
EOF
}

ensure_meta_defaults

echo "Deploying Nano-Siege to Unraid"
echo "  Backend target: ${BACKEND_DIR}"
echo "  Public target:  ${PUBLIC_DIR}"
echo "  Data dir:       ${DATA_DIR} (users.json)"
echo

# ----- VERSION AGGREGATION -----

# Current meta fields
backend_current_version=$(jq -r '.backendVersion // "0.0.0"' "$META_SRC")
channel=$(jq -r '.channel // "alpha"' "$META_SRC")
launcher_min_version=$(jq -r '.launcherMinVersion // "0.0.0"' "$META_SRC")
message=$(jq -r '.message // "Welcome to Nano-Siege."' "$META_SRC")

# Game version from build artifact (preferred), falling back to meta.json.
game_version=""
game_version=$(read_json_version_with_node "data/game-version.json" "version" || true)
if [ -z "${game_version}" ]; then
  game_version=$(jq -r '.gameVersion // "0.0.0"' "$META_SRC")
fi

# Launcher version from build artifact (preferred), falling back to meta.json.
launcher_version=""
launcher_version=$(read_json_version_with_node "launcher/launcher-version.json" "version" || true)
if [ -z "${launcher_version}" ]; then
  launcher_version=$(jq -r '.launcherVersion // "0.0.0"' "$META_SRC")
fi

read -r b_major b_minor b_patch < <(parse_semver "${backend_current_version}")
b_patch=$((b_patch + 1))
backend_new_version="${b_major}.${b_minor}.${b_patch}"

echo "Backend version:  ${backend_current_version} -> ${backend_new_version}"
echo "Game version:     ${game_version}"
echo "Launcher version: ${launcher_version}"
echo

echo "Updating $META_SRC with aggregated versions..."
tmpfile=$(mktemp)
jq \
  --arg backend "$backend_new_version" \
  --arg game "$game_version" \
  --arg launcher "$launcher_version" \
  --arg launcherMin "$launcher_min_version" \
  --arg channel "$channel" \
  --arg message "$message" \
  '.
   | .backendVersion = $backend
   | .gameVersion = (if $game != "" then $game else .gameVersion end)
   | .launcherVersion = (if $launcher != "" then $launcher else .launcherVersion end)
   | .launcherMinVersion = (if $launcherMin != "" then $launcherMin else .launcherMinVersion end)
   | .channel = $channel
   | .message = $message
   | del(.patchNotes)' \
  "$META_SRC" > "$tmpfile"
mv "$tmpfile" "$META_SRC"

# ----- SYNC TO UNRAID -----

echo
echo "Ensuring target directories exist..."
mkdir -p "${BACKEND_DIR}" "${PUBLIC_DIR}" "${PUBLIC_DIR}/downloads" "${DATA_DIR}"

echo "Running users.json migration (safe, additive)..."
if command -v node >/dev/null 2>&1; then
  NANO_SIEGE_USERS_FILE="${DATA_DIR%/}/users.json" node scripts/migrate-users.js || echo "Migration skipped (error running script)."
else
  echo "Node not found; skipping users.json migration."
fi

echo
echo "Syncing backend code..."
rsync -av --delete \
  server \
  package.json \
  "${BACKEND_DIR}/"

echo
echo "Syncing public game files..."
rsync -av --delete \
  index.html \
  styles.css \
  sandbox-config.js \
  src \
  data \
  "${PUBLIC_DIR}/"

# Optional: sync builds (EXE/AppImage/launcher) from dist/ to /downloads
if [ -d "dist" ]; then
  echo
  echo "Syncing desktop builds/launcher to /downloads..."
  rsync -av \
    dist/ \
    "${PUBLIC_DIR}/downloads/"
else
  echo
  echo "No dist/ directory found, skipping downloads sync."
fi

echo
echo "Building local zip..."
ZIP_TARGET="${PUBLIC_DIR%/}/nano-siege-local.zip"
bash "$(dirname "$0")/build-local-zip.sh" "${ZIP_TARGET}" || echo "Local zip build skipped."

echo
echo "Tagging git with deploy-v${backend_new_version}..."
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git tag "deploy-v${backend_new_version}" || echo "WARNING: could not create tag (maybe it exists already)"
  git push --tags || echo "WARNING: could not push tags (not fatal)"
else
  echo "Not in a git work tree; skipping tag creation."
fi

echo
if command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -q '^nano-siege-backend$'; then
    echo "Restarting nano-siege-backend container..."
    docker restart nano-siege-backend || echo "WARNING: failed to restart nano-siege-backend container."
  else
    echo "Docker is available but nano-siege-backend container not found; skipping restart."
  fi
else
  echo "Docker CLI not found; skipping backend container restart."
fi

echo
echo "Deploy complete."
echo "  Backend version:  ${backend_new_version}"
echo "  Game version:     ${game_version}"
echo "  Launcher version: ${launcher_version}"
