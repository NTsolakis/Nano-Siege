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
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  if git commit -m "Incremental desktop/launcher update"; then
    echo "Created commit."
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
./scripts/deploy-unraid.sh
EOF

echo
echo "All done. Desktop builds + launchers deployed to Unraid."

