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

async function apiRequest(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(API_BASE + path, { credentials: 'include' });
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

export async function loginUser(username, password) {
  return apiRequest('/api/login', { username, password });
}

export async function createUser(username, password) {
  return apiRequest('/api/create', { username, password });
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
  return apiRequest('/api/logout', {});
}
