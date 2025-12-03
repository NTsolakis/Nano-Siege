// Simple API helpers for user login + save.

// In the hosted browser build we talk to the backend on the same
// origin ("/api/..."). In the standalone desktop build the game is
// loaded from file:// so relative "/api" URLs would fail; detect that
// case and pin the API base to the public Nano‑Siege domain instead.
const API_BASE = (() => {
  try {
    if (typeof window !== 'undefined') {
      const loc = window.location || {};
      const isFile = String(loc.protocol || '').toLowerCase() === 'file:';
      const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
      const isElectron = ua.includes('Electron');
      if (isFile || isElectron) {
        return 'https://nano.nicksminecraft.net';
      }
    }
  } catch (e) {}
  // Browser build at https://nano.nicksminecraft.net uses same-origin.
  return '';
})();

let authToken = null;

async function apiRequest(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
    credentials: 'include'
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok || !data || data.ok === false) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function apiGet(path) {
  const headers = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const res = await fetch(API_BASE + path, { credentials: 'include', headers });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok || !data || data.ok === false) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function fetchUserProfile(username) {
  const name = (username || '').trim();
  if (!name) {
    throw new Error('Username required');
  }
  return apiGet(`/api/user/${encodeURIComponent(name)}`);
}

export async function loginUser(username, password) {
  const data = await apiRequest('/api/login', { username, password });
  if (data && typeof data.token === 'string' && data.token) {
    authToken = data.token;
  }
  return data;
}

export async function createUser(username, password) {
  const data = await apiRequest('/api/create', { username, password });
  if (data && typeof data.token === 'string' && data.token) {
    authToken = data.token;
  }
  return data;
}

export async function saveUserState(state) {
  return apiRequest('/api/save', { state });
}

export async function fetchLeaderboard(mapKey) {
  const suffix = mapKey ? `?map=${encodeURIComponent(mapKey)}` : '';
  return apiGet('/api/leaderboard' + suffix);
}

export async function submitLeaderboard(username, waves, perfectCombo=0, map=null, character=null) {
  // Username is inferred from the auth token server-side; we include
  // map + character metadata so the backend can store per‑pilot runs.
  return apiRequest('/api/leaderboard', { waves, perfectCombo, map, character });
}

export async function logoutUser() {
  const out = await apiRequest('/api/logout', {});
  authToken = null;
  return out;
}
