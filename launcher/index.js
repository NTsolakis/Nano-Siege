#!/usr/bin/env node

// Nano‑Siege launcher
// - Detects platform (windows/linux)
// - Fetches a small manifest.json from the server
// - Downloads the appropriate game binary (AppImage / .exe) into a
//   per-user cache directory
// - Presents a lightweight HTML launcher UI (background + Play/Exit)
// - Launches the downloaded desktop build when Play is pressed

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const PLATFORM = process.platform === 'win32'
  ? 'windows'
  : (process.platform === 'linux' ? 'linux' : null);

if (!PLATFORM) {
  console.error(`Unsupported platform: ${process.platform}`);
  process.exit(1);
}

// Public launcher endpoint: same domain players use in the browser.
// The launcher can be overridden in dev with NANO_SIEGE_MANIFEST_URL.
const DEFAULT_MANIFEST_URL = 'https://nano.nicksminecraft.net/launcher/manifest.json';
const MANIFEST_URL = process.env.NANO_SIEGE_MANIFEST_URL || DEFAULT_MANIFEST_URL;

const baseDir = path.join(os.homedir(), '.nano-siege');
const binDir = path.join(baseDir, 'bin');
const stateFile = path.join(baseDir, 'installed.json');

// Basic shared launcher UI state that the small HTML front-end
// polls via /status.
let uiState = {
  phase: 'starting', // starting | checking | downloading | finalizing | ready | error
  statusText: 'Starting launcher…',
  version: null,
  error: null,
  canPlay: false
};

function setUiState(patch) {
  uiState = Object.assign({}, uiState, patch || {});
}

let uiServer = null;
let uiDecisionResolver = null;

function waitForUiDecision() {
  return new Promise((resolve) => {
    uiDecisionResolver = resolve;
  });
}

function resolveUiDecision(action) {
  if (!uiDecisionResolver) return;
  const fn = uiDecisionResolver;
  uiDecisionResolver = null;
  fn(action);
}

function getHttpModule(url) {
  return url.startsWith('https:') ? https : http;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    getHttpModule(url)
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow simple redirects.
          return resolve(fetchJson(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const buf = Buffer.concat(chunks);
            const json = JSON.parse(buf.toString('utf8'));
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function readState() {
  try {
    const raw = fs.readFileSync(stateFile, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeState(obj) {
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(obj, null, 2), 'utf8');
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    getHttpModule(url)
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Simple redirect handling: close current stream and recurse.
          file.close(() => {
            fs.unlink(dest, () => {
              resolve(downloadFile(res.headers.location, dest));
            });
          });
          return;
        }
        if (res.statusCode !== 200) {
          file.close(() => {
            fs.unlink(dest, () => reject(new Error(`HTTP ${res.statusCode} for ${url}`)));
          });
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      })
      .on('error', (err) => {
        file.close(() => {
          fs.unlink(dest, () => reject(err));
        });
      });
  });
}

function versionChanged(current, next) {
  if (!current) return true;
  if (!current.version) return true;
  return String(current.version) !== String(next.version);
}

function prompt(message) {
  return new Promise((resolve) => {
    process.stdout.write(message);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => resolve());
  });
}

function showGuiPrompt(version) {
  if (PLATFORM === 'linux') {
    try {
      // Use KDE's kdialog when available to present a simple
      // Play / Exit launcher window so double‑clicking the
      // launcher from a file manager feels like a normal app.
      const args = [
        '--yesno',
        `Nano‑Siege is ready.\nVersion: ${version}`,
        '--yes-label', 'Play',
        '--no-label', 'Exit',
        '--title', 'Nano‑Siege Launcher'
      ];
      const res = spawnSync('kdialog', args, { stdio: 'ignore' });
      if (res && res.status === 0) return 'play';
      return 'exit';
    } catch (e) {
      // Fall through to CLI prompt if kdialog is unavailable.
    }
  }
  // Default: always play (or let the caller use CLI prompt).
  return 'play';
}

// Basic HTML launcher shell served from the local Node process
// so the launcher feels like a small app instead of a bare
// console window.
const LAUNCHER_BG_URL = (() => {
  try {
    const u = new URL('../data/loading-bg.gif', MANIFEST_URL);
    return u.toString();
  } catch (e) {
    return 'https://nano.nicksminecraft.net/data/loading-bg.gif';
  }
})();

function renderLauncherHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Nano-Siege Launcher</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%;width:100%;background:#050611;color:#e6f7ff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;overflow:hidden}
    body{display:flex;align-items:center;justify-content:center}
    .bg{position:fixed;inset:0;background:url('${LAUNCHER_BG_URL}') center center/cover no-repeat;background-color:#050611;filter:brightness(0.45);z-index:0}
    .overlay{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:16px}
    .card{min-width:320px;max-width:520px;background:rgba(8,10,26,0.92);border-radius:14px;border:1px solid rgba(96,255,255,0.5);box-shadow:0 0 40px rgba(0,0,0,0.85);padding:22px 26px;text-align:center}
    .title{font-size:28px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px;color:#8cf5ff;text-shadow:0 0 12px rgba(0,255,255,0.55)}
    .subtitle{font-size:13px;color:#9fb4ff;margin-bottom:18px}
    .status{font-size:14px;color:#e6f7ff;margin-bottom:6px}
    .version{font-size:12px;color:#8fb7ff;margin-bottom:18px}
    .buttons{display:flex;justify-content:center;gap:10px;margin-top:8px}
    button{min-width:90px;padding:9px 18px;border-radius:999px;border:1px solid rgba(96,255,255,0.7);background:linear-gradient(135deg,#12b5ff,#54ffe6);color:#02131f;font-weight:600;font-size:14px;cursor:pointer;box-shadow:0 0 12px rgba(0,255,255,0.35);transition:transform 0.1s ease,box-shadow 0.1s ease,filter 0.1s ease,background 0.2s}
    button.secondary{background:rgba(4,10,24,0.9);color:#c7d7ff;border-color:rgba(142,189,255,0.8);box-shadow:none}
    button:disabled{opacity:0.6;cursor:default;box-shadow:none}
    button:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 0 16px rgba(0,255,255,0.5);filter:brightness(1.05)}
    button.secondary:not(:disabled):hover{box-shadow:0 0 14px rgba(150,190,255,0.45)}
    .footer{margin-top:14px;font-size:11px;color:#6f88b5;opacity:0.9}
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="overlay">
    <div class="card">
      <h1 class="title">Nano-Siege</h1>
      <p class="subtitle">Reactor Defense Launcher</p>
      <div id="status-line" class="status">Checking for updates…</div>
      <div id="version-line" class="version"></div>
      <div class="buttons">
        <button id="btn-play" disabled>Play</button>
        <button id="btn-exit" class="secondary">Exit</button>
      </div>
      <div class="footer">Launcher will keep Nano-Siege up to date automatically.</div>
    </div>
  </div>
  <script>
    (function(){
      var statusEl = document.getElementById('status-line');
      var versionEl = document.getElementById('version-line');
      var playBtn = document.getElementById('btn-play');
      var exitBtn = document.getElementById('btn-exit');
      function updateStatus(){
        try{
          fetch('/status?_=' + Date.now())
            .then(function(res){ return res.ok ? res.json() : null; })
            .then(function(data){
              if(!data){ throw new Error('bad status'); }
              statusEl.textContent = data.statusText || '';
              versionEl.textContent = data.version ? ('Version ' + data.version) : '';
              if(data.phase === 'ready' && !data.error){
                playBtn.disabled = false;
              }else{
                playBtn.disabled = true;
              }
            })
            .catch(function(){
              statusEl.textContent = 'Connecting to launcher…';
            });
        }catch(e){
          statusEl.textContent = 'Launcher unavailable.';
        }
        setTimeout(updateStatus, 800);
      }
      updateStatus();
      playBtn.addEventListener('click', function(){
        if(playBtn.disabled) return;
        try{ fetch('/action?action=play').catch(function(){}); }catch(e){}
      });
      exitBtn.addEventListener('click', function(){
        try{ fetch('/action?action=exit').catch(function(){}); }catch(e){}
        try{ window.close(); }catch(e){}
      });
    })();
  </script>
</body>
</html>`;
}

function startLauncherUiServer() {
  return new Promise((resolve, reject) => {
    try {
      const server = http.createServer((req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          if (url.pathname === '/') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(renderLauncherHtml());
            return;
          }
          if (url.pathname === '/status') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(uiState));
            return;
          }
          if (url.pathname === '/action') {
            const action = url.searchParams.get('action');
            if (action === 'play' || action === 'exit') {
              resolveUiDecision(action);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: true }));
              return;
            }
            res.statusCode = 400;
            res.end('invalid action');
            return;
          }
          res.statusCode = 404;
          res.end('not found');
        } catch (e) {
          res.statusCode = 500;
          res.end('internal error');
        }
      });
      server.on('error', (err) => reject(err));
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr.port !== 'number') {
          reject(new Error('Failed to bind launcher UI port'));
          return;
        }
        uiServer = server;
        resolve(addr.port);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function openLauncherUi(url) {
  try {
    if (PLATFORM === 'windows') {
      // Use the built-in "start" command on Windows.
      const child = spawn('cmd', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    } else if (PLATFORM === 'linux') {
      // Prefer $BROWSER when set, otherwise fall back to xdg-open.
      const opener = process.env.BROWSER || 'xdg-open';
      const child = spawn(opener, [url], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    }
  } catch (e) {
    // If we can't open a browser, we'll fall back to CLI flow.
  }
}

function launchGame(binaryPath) {
  console.log(`\nLaunching: ${binaryPath}`);
  const args = PLATFORM === 'linux' ? ['--no-sandbox'] : [];
  const child = spawn(binaryPath, args, {
    detached: PLATFORM === 'win32',
    stdio: 'inherit'
  });
  if (PLATFORM === 'win32') {
    child.unref();
    process.exit(0);
  } else {
    child.on('exit', (code, signal) => {
      if (signal) {
        console.log(`Game exited with signal ${signal}`);
      } else {
        console.log(`Game exited with code ${code}`);
      }
      process.exit(code || 0);
    });
  }
}

async function main() {
  console.log('Nano‑Siege Launcher');
  console.log(`Platform: ${PLATFORM}`);
  console.log(`Manifest: ${MANIFEST_URL}\n`);

  let uiPort = null;
  let uiAvailable = false;
  try {
    uiPort = await startLauncherUiServer();
    const url = `http://127.0.0.1:${uiPort}/`;
    openLauncherUi(url);
    uiAvailable = true;
    setUiState({
      phase: 'checking',
      statusText: 'Checking for updates…'
    });
  } catch (e) {
    // UI is optional; fall back to the previous behavior.
    uiAvailable = false;
  }

  const manifest = await fetchJson(MANIFEST_URL);
  const info = manifest && manifest[PLATFORM];
  if (!info || !info.url || !info.version) {
    throw new Error(`Manifest missing entry for platform "${PLATFORM}"`);
  }

  const current = readState();
  const needsUpgrade = versionChanged(current, info);
  const keepPath = current && current.binaryPath && fs.existsSync(current.binaryPath);

  let binaryPath = current && current.binaryPath;

  if (needsUpgrade || !keepPath) {
    console.log(`Updating to version ${info.version}...`);
    setUiState({
      phase: 'downloading',
      statusText: `Downloading Nano‑Siege ${info.version}…`,
      version: info.version
    });
    fs.mkdirSync(binDir, { recursive: true });
    const filename = path.basename(new URL(info.url).pathname || `nano-siege-${info.version}`);
    binaryPath = path.join(binDir, filename);
    await downloadFile(info.url, binaryPath);
    if (PLATFORM === 'linux') {
      try { fs.chmodSync(binaryPath, 0o755); } catch (e) {}
    }
    writeState({ platform: PLATFORM, version: info.version, binaryPath });
    console.log('Update complete.');
    setUiState({
      phase: 'finalizing',
      statusText: 'Finishing install…',
      version: info.version
    });
  } else {
    console.log(`Already up to date (version ${current.version}).`);
    setUiState({
      phase: 'ready',
      statusText: `Up to date — Nano‑Siege ${info.version} is installed.`,
      version: info.version,
      canPlay: true
    });
  }

  // Mark launcher as ready if we just finished an upgrade.
  if (needsUpgrade || !keepPath) {
    setUiState({
      phase: 'ready',
      statusText: `Ready — Nano‑Siege ${info.version} installed. Click Play to start.`,
      version: info.version,
      canPlay: true
    });
  }

  if (uiAvailable) {
    // Let the HTML launcher drive Play / Exit.
    const choice = await waitForUiDecision();
    if (choice === 'play') {
      if (uiServer) {
        try { uiServer.close(); } catch (e) {}
      }
      launchGame(binaryPath);
    } else {
      process.exit(0);
    }
  } else if (PLATFORM === 'linux') {
    const choice = showGuiPrompt(info.version);
    if (choice === 'play') {
      launchGame(binaryPath);
    } else {
      process.exit(0);
    }
  } else {
    await prompt('\nPress Enter to play...');
    launchGame(binaryPath);
  }
}

main().catch((err) => {
  console.error('\nLauncher error:', err.message || err);
  setUiState({
    phase: 'error',
    statusText: 'Launcher error — see console for details.',
    error: err && (err.message || String(err))
  });
  process.exit(1);
});
