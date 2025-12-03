const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const USERS_FILE = process.env.NANO_SIEGE_USERS_FILE || DEFAULT_USERS_FILE;

function load() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return { users: [] };
  }
}

function save(db) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2), 'utf8');
}

const db = load();
db.users = db.users || [];

let addedId = 0;
let addedRoles = 0;
let defaultBanned = 0;
let addedLoginHistory = 0;
let setLastLogin = 0;
let addedScoreHistory = 0;

for (const u of db.users) {
  if (!u.id) {
    u.id = crypto.randomUUID();
    addedId++;
  }
  if (!u.roles) {
    u.roles = ['user'];
    addedRoles++;
  }
  if (typeof u.banned !== 'boolean') {
    u.banned = false;
    defaultBanned++;
  }
  if (!u.loginHistory) {
    u.loginHistory = [];
    addedLoginHistory++;
  }
  if (!u.lastLoginAt) {
    u.lastLoginAt = u.createdAt || Date.now();
    setLastLogin++;
  }
  if (!u.scoreHistory) {
    u.scoreHistory = [];
    addedScoreHistory++;
  }
}

save(db);
console.log(
  `Migration complete. Users: ${db.users.length}. ` +
  `addedId=${addedId}, roles=${addedRoles}, bannedDefaulted=${defaultBanned}, ` +
  `loginHistory=${addedLoginHistory}, lastLoginAt=${setLastLogin}, scoreHistory=${addedScoreHistory}.`
);
