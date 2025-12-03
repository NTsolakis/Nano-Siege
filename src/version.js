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

function computeDownloadUrl(meta) {
  try {
    if (typeof window === 'undefined') return null;
    const hostedUrl = window.NANO_DOWNLOAD_URL || 'downloads/NanoSiegeLauncher-linux.AppImage';
    const remoteUrl = window.NANO_REMOTE_DOWNLOAD_URL || 'https://nano.nicksminecraft.net/downloads/NanoSiegeLauncher-linux.AppImage';
    const loc = window.location || {};
    const protocol = String(loc.protocol || '').toLowerCase();
    const isFile = protocol === 'file:';
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    const isElectron = ua.includes('Electron');
    // Hosted browser build: use same-origin relative URL.
    if (!isFile && !isElectron) {
      return hostedUrl;
    }
    // Desktop/local builds: prefer the remote HTTPS URL so updates
    // always come from the live server.
    return remoteUrl;
  } catch (e) {
    return null;
  }
}

async function exitFullscreenIfNeeded() {
  try {
    if (typeof window !== 'undefined' && window.NANO_DESKTOP && typeof window.NANO_DESKTOP.getFullscreen === 'function') {
      try {
        const isFs = await window.NANO_DESKTOP.getFullscreen();
        if (isFs && typeof window.NANO_DESKTOP.toggleFullscreen === 'function') {
          await window.NANO_DESKTOP.toggleFullscreen();
        }
      } catch (e) {}
      return;
    }
  } catch (e) {}
  try {
    if (typeof document !== 'undefined') {
      const doc = document;
      const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
      if (isFs) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      }
    }
  } catch (e) {}
}

function openDownloadLink(url) {
  if (!url) return;
  try {
    if (typeof document !== 'undefined') {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
  } catch (e) {}
  try {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank');
    }
  } catch (e) {}
}

function setupLauncherBanner(meta) {
  try {
    if (typeof document === 'undefined') return;
    const banner = document.getElementById('launcher-banner');
    const textEl = document.getElementById('launcher-banner-text');
    const btn = document.getElementById('launcher-banner-download');
    if (!banner || !btn) return;
    const launcherVersion = meta && (meta.launcherVersion || meta.launcher || '');
    if (!launcherVersion) return;
    // If the player has already acknowledged this launcher version,
    // keep the banner hidden until a newer version is published.
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const ack = window.localStorage.getItem('nanoLauncherAckVersion') || '';
        if (ack && ack === String(launcherVersion)) {
          return;
        }
      }
    } catch (e) {}
    const channel = meta && meta.channel ? String(meta.channel).toUpperCase() : '';
    const labelParts = [];
    if (channel) labelParts.push(channel);
    labelParts.push(`Launcher v${launcherVersion} available`);
    if (textEl) {
      textEl.textContent = labelParts.join(' • ');
    }
    const targetUrl = computeDownloadUrl(meta);
    if (!targetUrl) return;
    banner.style.display = 'flex';
    btn.onclick = async () => {
      try {
        await exitFullscreenIfNeeded();
      } catch (e) {}
      // Small delay so the fullscreen exit animation has time to settle
      // before the external browser appears.
      setTimeout(() => {
        try {
          openDownloadLink(targetUrl);
        } catch (e) {}
      }, 120);
      // Remember that this launcher version has been acknowledged so we
      // don't keep prompting every session for the same version.
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('nanoLauncherAckVersion', String(launcherVersion));
        }
      } catch (e) {}
      try {
        banner.style.display = 'none';
      } catch (e) {}
    };
  } catch (e) {
    // Best-effort; launcher banner is optional.
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
    const launcherVersion = meta.launcherVersion || '';
    const launcherMin = meta.launcherMinVersion || '';

    const parts = [];
    if (gameVersion) parts.push(`Game v${gameVersion}`);
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

    setupLauncherBanner(meta);
  } catch (e) {
    // Best-effort only; version label is optional.
  }
}
