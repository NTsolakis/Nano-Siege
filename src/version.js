// Lightweight helper to display version info from the shared
// metadata file that is deployed alongside the game assets.

async function fetchMeta() {
  try {
    if (typeof fetch === 'undefined') return null;
    const res = await fetch('data/meta.json', { cache: 'no-store' });
    if (!res || !res.ok) return null;
    const meta = await res.json();
    if (!meta || typeof meta !== 'object') return null;
    return meta;
  } catch (e) {
    return null;
  }
}

export async function initVersionLabel() {
  try {
    if (typeof document === 'undefined') return;
    const label = document.getElementById('version-label');
    if (!label) return;
    const meta = await fetchMeta();
    if (!meta) return;

    const channel = meta.channel ? String(meta.channel).toUpperCase() : '';
    const gameVersion = meta.gameVersion || meta.version || '';
    const backendVersion = meta.backendVersion || '';
    const launcherVersion = meta.launcherVersion || '';
    const launcherMin = meta.launcherMinVersion || '';

    const parts = [];
    if (gameVersion) parts.push(`Game v${gameVersion}`);
    if (backendVersion) parts.push(`Backend v${backendVersion}`);
    if (launcherVersion) {
      if (launcherMin && launcherMin !== launcherVersion) {
        parts.push(`Launcher v${launcherVersion} (min v${launcherMin})`);
      } else {
        parts.push(`Launcher v${launcherVersion}`);
      }
    }
    if (!parts.length) return;

    const prefix = channel ? `${channel} • ` : '';
    label.textContent = prefix + parts.join(' • ');
  } catch (e) {
    // Best-effort only; version label is optional.
  }
}

