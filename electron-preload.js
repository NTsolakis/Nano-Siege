// Preload for the Nano‑Siege desktop build.
// Keep this very small; it just tags the window so the existing
// front‑end can tweak behavior where needed and exposes a safe
// "quit app" hook the renderer can call after confirming exit.

const { contextBridge, ipcRenderer } = require('electron');

function parseLaunchAuth(argv) {
  try {
    let username = null;
    let token = null;
    let stay = false;
    for (const arg of argv || []) {
      if (!arg || typeof arg !== 'string') continue;
      if (arg.startsWith('--nano-user=')) {
        const raw = arg.slice('--nano-user='.length);
        try {
          username = decodeURIComponent(raw);
        } catch (e) {
          username = raw;
        }
      } else if (arg.startsWith('--nano-token=')) {
        const raw = arg.slice('--nano-token='.length);
        try {
          token = decodeURIComponent(raw);
        } catch (e) {
          token = raw;
        }
      } else if (arg === '--nano-stay=1' || arg === '--nano-stay') {
        stay = true;
      }
    }
    return { username, token, stay };
  } catch (e) {
    return { username: null, token: null, stay: false };
  }
}

const launchAuth = parseLaunchAuth(process.argv || []);

try {
  contextBridge.exposeInMainWorld('NANO_DESKTOP', {
    flavor: 'desktop',
    launcherUser: launchAuth.username || null,
    launcherToken: launchAuth.token || null,
    launcherStaySignedIn: !!launchAuth.stay,
    quit: () => {
      try {
        ipcRenderer.send('nano-quit');
      } catch (e) {
        // Best-effort; renderer also has a window.close fallback.
      }
    },
    getFullscreen: async () => {
      try {
        return await ipcRenderer.invoke('nano-fullscreen-get');
      } catch (e) {
        return false;
      }
    },
    toggleFullscreen: async () => {
      try {
        return await ipcRenderer.invoke('nano-fullscreen-toggle');
      } catch (e) {
        return false;
      }
    },
    onFullscreenChanged: (handler) => {
      try {
        if (typeof handler !== 'function') return;
        ipcRenderer.on('nano-fullscreen-changed', (_event, isFullscreen) => {
          try {
            handler(!!isFullscreen);
          } catch (_) {
            // Ignore handler errors to avoid breaking future events.
          }
        });
      } catch (e) {
        // Ignore; fullscreen events are optional.
      }
    }
  });
} catch (e) {
  // If contextBridge fails for some reason, renderer will fall back
  // to user-agent detection and window.close.
}

(() => {
  try {
    if (typeof window !== 'undefined') {
      // Identify this runtime as a desktop/Electron build for older checks.
      window.NANO_BUILD_FLAVOR = 'desktop';
    }
  } catch (e) {
    // Ignore; desktop features are optional.
  }
})();
