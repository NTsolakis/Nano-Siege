## Nano‑Siege – Project Context & Deploy Flow

This file is the high‑level snapshot of how Nano‑Siege is set up and how updates are deployed. It is intentionally **non‑code** and should be the first place to look when opening the repo.

---

### Machines and OS

- **Home desktop**
  - OS: KDE Neon (Linux)
  - Has direct LAN access to the Unraid server and its `/mnt/user/www` share.
  - Main development box (VS Code, “Go Live” for browser testing, desktop builds).

- **Laptop**
  - OS: KDE Neon (Linux)
  - Typically remote; **no direct share mount**, but has access to:
    - `tower.nicksminecraft.net` (Unraid web UI + web terminal/console)
    - `nano.nicksminecraft.net` (public game site)
  - Used for coding and for triggering deploys on Unraid via the web console or SSH.

- **Future Windows VM**
  - Not set up yet; will be used for testing Windows desktop builds and launcher behavior.

---

### Unraid / Server Overview

- **Server**
  - Hostname / UI: `tower.nicksminecraft.net`
  - LAN IP: `10.0.0.201`
  - Public game URL: `https://nano.nicksminecraft.net`

- **Relevant Unraid share**
  - Share name: `www`
  - Path: `/mnt/user/www`
  - Subdirectories (as seen in the Unraid Shares browser):
    - `/mnt/user/www/nano-siege` – public web root for the game
    - `/mnt/user/www/nano-siege-backend` – backend app code mounted into the Node container
    - `/mnt/user/www/nano-siege-data` – persistent user data (users.json, saves, etc.)
    - `/mnt/user/www/nano-siege-repo` – Git checkout of this repo on the server side

---

### Backend Docker Container (Unraid)

Container template (from the Unraid Docker UI):

- **Name:** `nano-siege-backend`
- **Image:** `node:18-alpine`
- **Network:** `bridge`
- **Console shell:** `sh` (or default Shell)
- **Ports:**
  - Host: `3339` → Container: `3000`  
    (Game backend listens on container port 3000.)
- **Volume mappings:**
  - Backend Code:
    - Host: `/mnt/user/www/nano-siege-backend/`
    - Container: `/app`
  - Static Data:
    - Host: `/mnt/user/www/nano-siege-data/`
    - Container: `/app/data`
  - Game Public Files:
    - Host: `/mnt/user/www/nano-siege`
    - Container: `/app/public`

Backend entrypoint inside the container should run the Node app from `/app` (e.g. `node server/server.js` or `npm start`), using the files that `deploy-unraid.sh` syncs.

---

### Standard Deploy Flow (Home desktop or laptop)

This is the **canonical four‑step flow** and should be followed for all server updates:

1. **Make changes to the game**
   - Edit code in this repo on your dev machine (VS Code on KDE Neon).
   - Test locally (browser via `Go Live` / `npm start`, desktop builds via `npm run desktop`, etc.).

2. **Push changes to GitHub**
   - From the repo root:
     ```bash
     git status
     git add .
     git commit -m "Describe the change"
     git push origin master
     ```
   - Remote: `origin` → `https://github.com/NTsolakis/Nano-Siege.git`

3. **Update the Git repo on Unraid**
   - On Unraid, there is a clone at: `/mnt/user/www/nano-siege-repo`
   - From the Unraid web terminal **or** SSH (from laptop or desktop):
     ```bash
     cd /mnt/user/www/nano-siege-repo
     git pull origin master
     ```

4. **Deploy the updated code to the running backend + public folder**
   - From the same directory on Unraid:
     ```bash
     ./scripts/deploy-unraid.sh
     ```
   - This script:
     - Syncs backend files → `/mnt/user/www/nano-siege-backend`
     - Syncs public game files → `/mnt/user/www/nano-siege`
     - Builds/updates `nano-siege-local.zip` for local offline play
   - The `nano-siege-backend` docker container serves:
     - API from `/app` (code in `nano-siege-backend`)
     - Static public files from `/app/public` (code in `nano-siege`)

For quick reference, the same deploy commands are also in `docs/deploy-unraid-commands.md`.

---

### How this doc is meant to be used

- This file is the **single source of truth** for:
  - Which machines exist and what they can access.
  - How the Unraid server and Docker container are laid out.
  - The standard “make changes → push → pull on Unraid → deploy” workflow.
- When working on a new computer or after a long break, open `PROJECT_CONTEXT.md` first to re‑orient.

---

### “Commit this to memory” notes

When you say **“commit this to memory”** in future conversations, we will:

1. Record the important detail here (in this section) as a bullet point or short paragraph.
2. Keep the entry high‑level (environment, deployment flow, paths, credentials pattern, etc.), **never secrets**.

Current notes:

- Main dev flow is **always**:
  1. Make changes locally.
  2. `git push origin master` from the dev machine.
  3. On Unraid: `cd /mnt/user/www/nano-siege-repo && git pull origin master`.
  4. On Unraid: `./scripts/deploy-unraid.sh` to update backend + public game files.
 - When you say “I want to rebuild” (meaning rebuild the Electron launchers and clean old launcher artifacts), show this exact command:
   ```bash
   rm -rf dist/NanoSiegeLauncher* dist/linux-unpacked dist/win-unpacked dist/latest-linux.yml dist/builder-debug.yml dist/builder-effective-config.yaml && \
   npm run build:launcher:electron:linux && \
   npm run build:launcher:electron:win
   ```
