#!/usr/bin/env bash
set -euo pipefail

# One-shot helper to:
#  1) Build desktop game + launchers
#  2) Commit + push local changes to GitHub
#  3) Rsync desktop artifacts to Unraid downloads
#  4) Regenerate SHA files on Unraid
#  5) Pull + deploy on Unraid
#
# Usage (from repo root on your dev machine):
#   ./scripts/build-and-deploy-unraid.sh
#
# You can override defaults with environment variables:
#   UNRAID_HOST, UNRAID_USER, UNRAID_REPO_DIR, UNRAID_DOWNLOADS_DIR

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

UNRAID_HOST="${UNRAID_HOST:-tower.nicksminecraft.net}"
UNRAID_USER="${UNRAID_USER:-root}"
UNRAID_REPO_DIR="${UNRAID_REPO_DIR:-/mnt/user/www/nano-siege-repo}"
UNRAID_DOWNLOADS_DIR="${UNRAID_DOWNLOADS_DIR:-/mnt/user/www/nano-siege/downloads}"

echo "== Nano-Siege full build + Unraid deploy =="
echo "Repo root:          ${ROOT_DIR}"
echo "Unraid host:        ${UNRAID_USER}@${UNRAID_HOST}"
echo "Unraid repo dir:    ${UNRAID_REPO_DIR}"
echo "Unraid downloads:   ${UNRAID_DOWNLOADS_DIR}"

echo
echo "Step 1/5: Building desktop game + launchers..."
npm run build:desktop:release

echo
echo "Step 2/5: Committing and pushing to Git..."
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
status_output="$(git status --porcelain)"
if [ -n "$status_output" ]; then
  echo "Changes to commit:"
  git status --short

  # Build a simple, human-readable summary based on which parts of the
  # project changed. This summary becomes both the commit message and
  # the primary in-game patch note line.
  gameplay_changed=0
  ui_changed=0
  backend_changed=0
  launcher_changed=0
  docs_changed=0

  while IFS= read -r line; do
    # status format: "XY path"
    path=$(printf "%s\n" "$line" | awk '{print $2}')
    case "$path" in
      src/game.js|src/tower.js|src/enemy.js|src/waves.js|src/maps.js)
        gameplay_changed=1
        ;;
      src/ui.js|styles.css|index.html)
        ui_changed=1
        ;;
      server/*)
        backend_changed=1
        ;;
      launcher/*|scripts/build-desktop-release.sh)
        launcher_changed=1
        ;;
      docs/*|PROJECT_CONTEXT.md)
        docs_changed=1
        ;;
    esac
  done <<< "$status_output"

  parts=()
  if [ "$gameplay_changed" -eq 1 ]; then parts+=("gameplay"); fi
  if [ "$ui_changed" -eq 1 ]; then parts+=("UI"); fi
  if [ "$backend_changed" -eq 1 ]; then parts+=("backend"); fi
  if [ "$launcher_changed" -eq 1 ]; then parts+=("desktop/launcher"); fi
  if [ "$docs_changed" -eq 1 ]; then parts+=("docs"); fi

  auto_msg="Update Nano-Siege build"
  if [ "${#parts[@]}" -gt 0 ]; then
    # Join parts with comma + space (e.g. "gameplay, UI, backend").
    joined="${parts[*]}"
    auto_msg="Update ${joined} changes"
  fi

  echo
  echo "Suggested commit message:"
  echo "  ${auto_msg}"
  printf "Commit message [press Enter to accept]: "
  read -r COMMIT_MSG || COMMIT_MSG=""
  if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="$auto_msg"
  fi

  git add -A
  if git commit -m "$COMMIT_MSG"; then
    echo "Created commit: $COMMIT_MSG"
  else
    echo "Nothing to commit (commit command failed)."
  fi
else
  echo "No local changes to commit."
fi
git push origin "${BRANCH}" || echo "Git push failed or already up to date."

echo
echo "Step 3/5: Syncing desktop artifacts to Unraid downloads..."
rsync -av --progress \
  dist/Nano-Siege.* \
  dist/NanoSiegeLauncher* \
  "${UNRAID_USER}@${UNRAID_HOST}:${UNRAID_DOWNLOADS_DIR}/"

echo
echo "Step 4/5: Rebuilding SHA files on Unraid..."
ssh "${UNRAID_USER}@${UNRAID_HOST}" "bash -s" <<EOF
set -euo pipefail
DOWNLOADS_DIR="${UNRAID_DOWNLOADS_DIR}"
cd "\$DOWNLOADS_DIR"
sha256sum Nano-Siege.exe > Nano-Siege.exe.sha256
sha256sum Nano-Siege.AppImage > Nano-Siege.AppImage.sha256
EOF

echo
echo "Step 5/5: Pulling latest code + deploying on Unraid..."
ssh "${UNRAID_USER}@${UNRAID_HOST}" "bash -s" <<EOF
set -euo pipefail
REPO_DIR="${UNRAID_REPO_DIR}"
cd "\$REPO_DIR"
BRANCH="\$(git rev-parse --abbrev-ref HEAD)"
git pull origin "\$BRANCH" || true
FORCE_LAUNCHER_BUMP=1 ./scripts/deploy-unraid.sh
EOF

echo
echo "All done. Desktop builds + launchers deployed to Unraid."
