const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

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

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

function issueToken(res, username) {
  const payload = { username };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(TOKEN_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!process.env.NODE_ENV && process.env.NODE_ENV !== 'development',
    path: '/'
  });
  return payload;
}

function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[TOKEN_NAME] : null;
  if (!token) return res.status(401).json({ ok: false, error: 'auth required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
}

// Login or create user.
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'username and password required' });
  }
  const name = String(username).trim();
  if (!name) return res.status(400).json({ ok: false, error: 'invalid username' });

  const db = loadDb();
  let user = db.users.find(u => u.username === name);
  if (!user) {
    const hash = bcrypt.hashSync(password, 10);
    user = { username: name, passwordHash: hash, state: defaultState(), createdAt: Date.now(), updatedAt: Date.now() };
    db.users.push(user);
  }
  const valid = bcrypt.compareSync(password, user.passwordHash);
  if (!valid) return res.status(401).json({ ok: false, error: 'invalid credentials' });
  saveDb(db);
  const payload = issueToken(res, name);
  return res.json({ ok: true, created: false, username: payload.username, state: user.state || defaultState() });
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
  const user = { username: name, passwordHash: hash, state: defaultState(), createdAt: Date.now(), updatedAt: Date.now() };
  db.users.push(user);
  saveDb(db);
  const payload = issueToken(res, name);
  return res.json({ ok: true, created: true, username: payload.username, state: user.state });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(TOKEN_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!process.env.NODE_ENV && process.env.NODE_ENV !== 'development',
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
    .sort((a, b) => (b.waves || 0) - (a.waves || 0))
    .slice(0, 10)
    .map(e => ({ ...e, perfectCombo: e.perfectCombo || 0 }));
  return res.json({ ok: true, entries });
});

app.post('/api/leaderboard', requireAuth, (req, res) => {
  const { waves, perfectCombo, map } = req.body || {};
  if (!Number.isFinite(waves) || waves <= 0) {
    return res.status(400).json({ ok: false, error: 'waves required' });
  }
  const mapKey = (typeof map === 'string' && map.trim()) ? map.trim() : DEFAULT_MAP;
  const perfectVal = Number.isFinite(perfectCombo) ? Math.max(0, Math.floor(perfectCombo)) : 0;
  const db = loadDb();
  db.leaderboard = db.leaderboard || [];
  let entry = db.leaderboard.find(e => e.username === req.user.username && (e.map || DEFAULT_MAP) === mapKey);
  if (entry) {
    if (waves > (entry.waves || 0)) {
      entry.waves = Math.floor(waves);
      entry.updatedAt = Date.now();
    }
    entry.perfectCombo = Math.max(entry.perfectCombo || 0, perfectVal);
    entry.map = mapKey;
  } else {
    db.leaderboard.push({ username: req.user.username, waves: Math.floor(waves), perfectCombo: perfectVal, updatedAt: Date.now(), map: mapKey });
  }
  saveDb(db);
  return res.json({ ok: true });
});

// Static game files
app.use(express.static(PUBLIC_DIR));

// Fallback to index.html for SPA-style routing (optional)
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Nano‑Siege backend listening on port ${PORT}`);
});
