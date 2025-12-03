#!/usr/bin/env bash
set -euo pipefail

# Deploy Nano-Siege to Unraid with:
# - backend + public sync
# - automatic backend/game version bump
# - automatic patch notes from git commits
# - meta.json update in ./data
# - safe users.json migration in the persistent data share
# - local offline zip build
#
# Usage (from repo root):
#   npm run deploy:unraid
# or:
#   UNRAID_ROOT=/some/other/path ./scripts/deploy-unraid.sh

# ----- CONFIG -----

ROOT="${UNRAID_ROOT:-/mnt/user/www}"
BACKEND_DIR="${ROOT%/}/nano-siege-backend"
PUBLIC_DIR="${ROOT%/}/nano-siege"
DATA_DIR="${ROOT%/}/nano-siege-data"

META_SRC="data/meta.json"          # in the repo
PATCH_PREFIX="data/patchnotes-"    # in the repo

# ----- HELPER -----

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $1" >&2
    exit 1
  fi
}

require jq
require git
require rsync

if [ ! -f "$META_SRC" ]; then
  echo "meta.json not found at $META_SRC, creating a default one..."
  cat > "$META_SRC" <<EOF
{
  "channel": "alpha",
  "backendVersion": "0.0.0",
  "gameVersion": "0.0.0",
  "launcherVersion": "0.0.0",
  "launcherMinVersion": "0.0.0",
  "patchNotes": [],
  "message": "Welcome to Nano-Siege."
}
EOF
fi

echo "Deploying Nano-Siege to Unraid"
echo "  Backend target: ${BACKEND_DIR}"
echo "  Public target:  ${PUBLIC_DIR}"
echo "  Data dir:       ${DATA_DIR} (users.json)"
echo

# ----- VERSION & PATCH NOTES -----

# Read current backend version from meta.json (fallback 0.0.0)
current_version=$(jq -r '.backendVersion // "0.0.0"' "$META_SRC")

# Find last deployment tag (deploy-vX.Y.Z) to compute patch notes
# and detect which parts of the app changed.
last_tag=$(git describe --tags --match "deploy-v*" --abbrev=0 2>/dev/null || echo "")
changed_backend=0
changed_game=0
changed_launcher=0

if [ -z "$last_tag" ]; then
  echo "No previous deploy tag found. Treating this as an initial deploy."
  # On the first deploy, treat everything as "changed" so we establish
  # an initial version + patch notes snapshot.
  changed_backend=1
  changed_game=1
  changed_launcher=1
  patch_notes=$(git log --pretty=format:"%s")
else
  echo "Last deploy tag: $last_tag"
  patch_notes=$(git log "$last_tag"..HEAD --pretty=format:"%s")

  changed_files=$(git diff --name-only "$last_tag"..HEAD || true)
  if [ -z "$changed_files" ]; then
    echo "No files changed since ${last_tag}."
  else
    # Classify changed files into backend / game / launcher buckets.
    while IFS= read -r f; do
      # Ignore meta + patch notes files themselves; they are generated
      # by this script and should not trigger version bumps.
      case "$f" in
        data/meta.json|data/patchnotes-*.txt)
          continue
          ;;
      esac

      case "$f" in
        server/*|scripts/migrate-users.js)
          changed_backend=1
          ;;
      esac

      case "$f" in
        src/*|index.html|styles.css|sandbox-config.js|electron-main.js|electron-preload.js|scripts/build-local-zip.sh|data/*)
          changed_game=1
          ;;
      esac

      case "$f" in
        launcher/*|scripts/build-desktop-release.sh|scripts/build-and-deploy-unraid.sh)
          changed_launcher=1
          ;;
      esac
    done <<< "$changed_files"
  fi
fi

if [ -z "${patch_notes:-}" ]; then
  patch_notes="No code changes since last deploy."
fi

bump_needed=0
if [ "$changed_backend" -eq 1 ] || [ "$changed_game" -eq 1 ] || [ "$changed_launcher" -eq 1 ]; then
  bump_needed=1
fi

if [ "$bump_needed" -eq 1 ]; then
  IFS='.' read -r major minor patch <<< "$current_version" || {
    echo "WARNING: could not parse backendVersion '$current_version', defaulting to 0.0.0"
    major=0 minor=0 patch=0
  }

  patch=$((patch + 1))
  new_version="${major}.${minor}.${patch}"

  echo "Current backendVersion: $current_version"
  echo "New backendVersion:     $new_version"
  echo

  # Save patch notes to versioned file in repo data/
  patch_file="${PATCH_PREFIX}${new_version}.txt"
  echo "Writing patch notes to ${patch_file}"
  printf "%s\n" "$patch_notes" > "$patch_file"

  # Update meta.json in repo: backendVersion, gameVersion, patchNotes
  echo "Updating $META_SRC with new version and patch notes..."
  tmpfile=$(mktemp)
  jq \
    --arg v "$new_version" \
    --arg notes "$patch_notes" \
    '.backendVersion = $v
     | .gameVersion = $v
     | .patchNotes = ($notes | split("\n"))' \
    "$META_SRC" > "$tmpfile"
  mv "$tmpfile" "$META_SRC"

  echo
else
  echo "No backend/game/launcher changes since last deploy; keeping backendVersion/gameVersion at ${current_version} and skipping new patch notes."
fi

# ----- SYNC TO UNRAID -----

# Ensure target directories exist.
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

if [ "${bump_needed}" -eq 1 ]; then
  echo
  echo "Tagging git with deploy-v${new_version}..."
  git tag "deploy-v${new_version}" || echo "WARNING: could not create tag (maybe it exists already)"
  git push --tags || echo "WARNING: could not push tags (not fatal)"

  echo
  echo "Deploy complete. Backend/Game version is now ${new_version}"
  echo "Patch notes recorded in ${patch_file}"
else
  echo
  echo "Deploy complete. No backend/game/launcher changes detected; version remains ${current_version}."
fi
