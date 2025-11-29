#!/usr/bin/env node

// Nano‑Siege launcher (prototype)
// - Detects platform (windows/linux)
// - Fetches a small manifest.json from the server
// - Downloads the appropriate game binary (AppImage / .exe) into a
//   per-user cache directory
// - On Linux, launches the AppImage with --no-sandbox
// - On Windows, launches the .exe directly

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

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
    fs.mkdirSync(binDir, { recursive: true });
    const filename = path.basename(new URL(info.url).pathname || `nano-siege-${info.version}`);
    binaryPath = path.join(binDir, filename);
    await downloadFile(info.url, binaryPath);
    if (PLATFORM === 'linux') {
      try { fs.chmodSync(binaryPath, 0o755); } catch (e) {}
    }
    writeState({ platform: PLATFORM, version: info.version, binaryPath });
    console.log('Update complete.');
  } else {
    console.log(`Already up to date (version ${current.version}).`);
  }

  await prompt('\nPress Enter to play...');
  launchGame(binaryPath);
}

main().catch((err) => {
  console.error('\nLauncher error:', err.message || err);
  process.exit(1);
});
