const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DEFAULT_MAP = 'corridor';
const JWT_SECRET = process.env.JWT_SECRET || 'nano-siege-secret';
const TOKEN_NAME = 'nano_siege_token';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function normalizeDb(db) {
  if (!db || typeof db !== 'object') db = {};
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.leaderboard)) db.leaderboard = [];
  return db;
}

function loadDb() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeDb(parsed);
  } catch (e) {
    return normalizeDb({});
  }
}

function saveDb(db) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(normalizeDb(db), null, 2), 'utf8');
}

function defaultState() {
  return {
    missionUnlockLevel: 1,
    nanoCredits: 0,
    dataFragments: 0,
    coreShards: 0,
    bestPerfectCombo: 0,
    passives: { active: [], capacity: 4, levels: {} },
    abilities: {
      bomb: { level: 0, unlocked: false },
      overclock: { level: 0, unlocked: false },
      cryo: { level: 0, unlocked: false },
      corehp: { level: 0 }
    },
    shopIndex: 0
  };
}

app.use(cookieParser());
app.use(express.json());

// Disable caching so new deployments are always fetched fresh.
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Basic IP + User-Agent logging for lightweight diagnostics.
app.use((req, res, next) => {
  try {
    const ua = req.headers && req.headers['user-agent'];
    console.log(`[REQ] ${req.method} ${req.path} from ${req.ip} - ${ua || 'unknown'}`);
  } catch (e) {}
  next();
});

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

function issueToken(res, username) {
  const payload = { username };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(TOKEN_NAME, token, {
    httpOnly: true,
    sameSite: 'none',
    // For SameSite=None to work in cross-site/Electron contexts,
    // the cookie must always be Secure (HTTPS only).
    secure: true,
    path: '/'
  });
  // Return both username + token so browser builds can keep using
  // cookie auth while desktop builds may send the token explicitly
  // via an Authorization header (Bearer).
  return { username, token };
}

function getAuthToken(req) {
  const header = req.headers && req.headers.authorization;
  if (header && typeof header === 'string') {
    const parts = header.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0]) && parts[1]) {
      return parts[1];
    }
  }
  return req.cookies ? req.cookies[TOKEN_NAME] : null;
}

function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'auth required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
}

function requireRole(role) {
  return function(req, res, next) {
    const db = loadDb();
    const user = db.users.find(u => u.username === req.user.username);
    if (!user || !user.roles || !user.roles.includes(role)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    next();
  };
}

// Admin helpers
app.get('/api/admin/users', requireAuth, requireRole('admin'), (req, res) => {
  const db = loadDb();
  res.json({ ok: true, users: db.users });
});

// Login existing user (no auto‑create).
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
  const ua = (req.headers && req.headers['user-agent']) || 'unknown';

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'username and password required' });
  }
  const name = String(username).trim();
  if (!name) return res.status(400).json({ ok: false, error: 'invalid username' });

  const now = Date.now();
  const db = loadDb();
  let user = db.users.find(u => u.username === name);

  // If the user doesn't exist, reject login instead of silently creating them.
  if (!user) {
    return res.status(404).json({ ok: false, error: 'user not found' });
  }

  // Password check
  const valid = bcrypt.compareSync(password, user.passwordHash);
  if (!valid) return res.status(401).json({ ok: false, error: 'invalid credentials' });

  // If banned, deny login
  if (user.banned) {
    return res.status(403).json({ ok: false, error: 'banned' });
  }

  // Record login event
  user.lastLoginAt = now;
  user.loginHistory = user.loginHistory || [];
  user.loginHistory.push({ at: now, ip, ua });
  user.updatedAt = now;

  saveDb(db);

  const session = issueToken(res, name);
  return res.json({
    ok: true,
    created: false,
    username: session.username,
    token: session.token,
    state: user.state || defaultState()
  });
});

// Dedicated endpoint to create a new user.
app.post('/api/create', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'username and password required' });
  }
  const name = String(username).trim();
  if (!name) {
    return res.status(400).json({ ok: false, error: 'invalid username' });
  }
  const db = loadDb();
  const existing = db.users.find(u => u.username === name);
  if (existing) {
    return res.status(409).json({ ok: false, error: 'user already exists' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const now = Date.now();
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
  const ua = (req.headers && req.headers['user-agent']) || 'unknown';
  const user = {
    id: crypto.randomUUID(),
    username: name,
    passwordHash: hash,
    roles: ['user'],
    banned: false,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    loginHistory: [{ at: now, ip, ua }],
    state: defaultState(),
    scoreHistory: []
  };
  db.users.push(user);
  saveDb(db);
  const session = issueToken(res, name);
  return res.json({
    ok: true,
    created: true,
    username: session.username,
    token: session.token,
    state: user.state || defaultState()
  });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(TOKEN_NAME, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/'
  });
  return res.json({ ok: true });
});

// Save current state for a user.
app.post('/api/save', requireAuth, (req, res) => {
  const { state } = req.body || {};
  if (!state) return res.status(400).json({ ok: false, error: 'state required' });
  const db = loadDb();
  const user = db.users.find(u => u.username === req.user.username);
  if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
  user.state = state;
  user.updatedAt = Date.now();
  saveDb(db);
  return res.json({ ok: true });
});

app.get('/api/leaderboard', (req, res) => {
  const db = loadDb();
  const mapKey = (req.query && req.query.map) ? String(req.query.map).trim() : '';
  const target = mapKey || '';
  const entries = (db.leaderboard || [])
    .filter(e=>{
      if(!target) return true;
      const emap = (e.map || DEFAULT_MAP);
      return emap === target;
    })
    .slice()
    .sort((a, b) => {
      const wa = a.waves || 0;
      const wb = b.waves || 0;
      if (wb !== wa) return wb - wa;
      const pa = a.perfectCombo || 0;
      const pb = b.perfectCombo || 0;
      if (pb !== pa) return pb - pa;
      // Stable fallback: earlier updatedAt wins if everything else ties.
      return (a.updatedAt || 0) - (b.updatedAt || 0);
    })
    .slice(0, 10)
    .map(e => ({ ...e, perfectCombo: e.perfectCombo || 0 }));
  return res.json({ ok: true, entries });
});

app.post('/api/leaderboard', requireAuth, (req, res) => {
  const { waves, perfectCombo, map, character } = req.body || {};
  // Lightweight diagnostics to help trace desktop/Electron submissions.
  try {
    console.log('[leaderboard:submit]', {
      user: req.user && req.user.username,
      waves,
      perfectCombo,
      map,
      character
    });
  } catch (e) {}
  if (!Number.isFinite(waves) || waves <= 0) {
    return res.status(400).json({ ok: false, error: 'waves required' });
  }
  const mapKey = (typeof map === 'string' && map.trim()) ? map.trim() : DEFAULT_MAP;
  const perfectVal = Number.isFinite(perfectCombo) ? Math.max(0, Math.floor(perfectCombo)) : 0;
  const pilot = (typeof character === 'string' && character.trim()) ? character.trim() : null;
  const db = loadDb();
  db.leaderboard = db.leaderboard || [];

  // Add run to user's personal scoreHistory
  const user = db.users.find(u => u.username === req.user.username);
  if (user) {
    user.scoreHistory = user.scoreHistory || [];
    user.scoreHistory.push({
      map: mapKey,
      waves: Math.floor(waves),
      perfectCombo: perfectVal,
      character: pilot || null,
      at: Date.now()
    });
  }

  let entry = db.leaderboard.find(e => e.username === req.user.username && (e.map || DEFAULT_MAP) === mapKey);
  if (entry) {
    if (waves > (entry.waves || 0)) {
      entry.waves = Math.floor(waves);
      entry.updatedAt = Date.now();
      if (pilot) entry.character = pilot;
    }
    entry.perfectCombo = Math.max(entry.perfectCombo || 0, perfectVal);
    entry.map = mapKey;
  } else {
    db.leaderboard.push({
      username: req.user.username,
      waves: Math.floor(waves),
      perfectCombo: perfectVal,
      updatedAt: Date.now(),
      map: mapKey,
      character: pilot
    });
  }
  saveDb(db);
  return res.json({ ok: true });
});

// Public player profile lookup by username.
app.get('/api/user/:username', (req, res) => {
  const name = String(req.params && req.params.username || '').trim();
  if (!name) {
    return res.status(400).json({ ok: false, error: 'invalid username' });
  }
  const db = loadDb();
  const user = db.users.find(u => u.username === name);
  if (!user) {
    return res.status(404).json({ ok: false, error: 'user not found' });
  }

  const safeScoreHistory = Array.isArray(user.scoreHistory) ? user.scoreHistory.map(entry => ({
    map: entry.map || null,
    waves: Number.isFinite(entry.waves) ? Math.floor(entry.waves) : 0,
    perfectCombo: Number.isFinite(entry.perfectCombo) ? Math.max(0, Math.floor(entry.perfectCombo)) : 0,
    character: entry.character || entry.pilot || null,
    at: Number.isFinite(entry.at) ? entry.at : null
  })) : [];

  const profile = {
    username: user.username,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
    roles: Array.isArray(user.roles) && user.roles.length ? user.roles : ['user'],
    bestPerfectCombo: user.state && Number.isFinite(user.state.bestPerfectCombo)
      ? user.state.bestPerfectCombo
      : 0,
    missionUnlockLevel: user.state && Number.isFinite(user.state.missionUnlockLevel)
      ? user.state.missionUnlockLevel
      : 1,
    scoreHistory: safeScoreHistory
  };

  return res.json({ ok: true, profile });
});

function readPublicMeta() {
  try {
    const metaPath = path.join(PUBLIC_DIR, 'data', 'meta.json');
    const raw = fs.readFileSync(metaPath, 'utf8');
    const meta = JSON.parse(raw);
    if (!meta || typeof meta !== 'object') return null;
    return meta;
  } catch (e) {
    return null;
  }
}

function parseSemverTriplet(v) {
  const parts = String(v || '').split('.');
  const major = parseInt(parts[0], 10) || 0;
  const minor = parseInt(parts[1], 10) || 0;
  const patch = parseInt(parts[2], 10) || 0;
  return { major, minor, patch };
}

function compareVersionsDesc(a, b) {
  const va = parseSemverTriplet(a);
  const vb = parseSemverTriplet(b);
  if (va.major !== vb.major) return vb.major - va.major;
  if (va.minor !== vb.minor) return vb.minor - va.minor;
  return vb.patch - va.patch;
}

function readPatchNotesFromPublic() {
  const dir = path.join(PUBLIC_DIR, 'data');
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const out = [];
  for (const ent of entries) {
    try {
      if (!ent || !ent.isFile || !ent.isFile()) continue;
      const name = ent.name || '';
      const m = /^patchnotes-(\d+\.\d+\.\d+)\.txt$/.exec(name);
      if (!m) continue;
      const version = m[1];
      const fullPath = path.join(dir, name);
      let raw;
      try {
        raw = fs.readFileSync(fullPath, 'utf8');
      } catch (e) {
        continue;
      }
      const lines = String(raw)
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (!lines.length) continue;
      out.push({ version, notes: lines });
    } catch (e) {
      // Ignore malformed entries so a single bad file never breaks the API.
    }
  }
  // Sort newest-first by semantic version triplet.
  out.sort((a, b) => compareVersionsDesc(a.version, b.version));
  return out;
}

// Public patch notes API used by the in-game "Patch Notes" screen.
// Returns only game-facing notes; backend/launcher-only details are
// intentionally omitted by the deploy script.
app.get('/api/patchnotes', (req, res) => {
  try {
    const meta = readPublicMeta();
    const versions = readPatchNotesFromPublic();
    return res.json({
      ok: true,
      meta: meta || null,
      versions
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'patchnotes_unavailable' });
  }
});

// Static game files
app.use(express.static(PUBLIC_DIR));

// Fallback to index.html for SPA-style routing, but only for routes
// that don't look like direct asset requests (no file extension).
app.get('*', (req, res, next) => {
  const ext = path.extname(req.path || '');
  if (ext) return next();
  return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Nano‑Siege backend listening on port ${PORT}`);
});
