// Patch notes API client for Nano‑Siege.
// Fetches game-facing patch notes from the backend and exposes a
// simple helper used by the main menu "Patch Notes" screen.

function computeApiBase() {
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
  return '';
}

const API_BASE = computeApiBase();

export async function fetchPatchNotes() {
  try {
    if (typeof fetch === 'undefined') return null;
    const res = await fetch(API_BASE + '/api/patchnotes', {
      credentials: 'include'
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok || !data || data.ok === false) {
      return null;
    }
    const meta = data.meta && typeof data.meta === 'object' ? data.meta : null;
    const versions = Array.isArray(data.versions) ? data.versions : [];
    return { meta, versions };
  } catch (e) {
    return null;
  }
}

