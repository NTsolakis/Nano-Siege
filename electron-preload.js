// Preload for the Nano‑Siege desktop build.
// Keep this very small; it just tags the window so the existing
// front‑end can tweak behavior where needed and exposes a safe
// "quit app" hook the renderer can call after confirming exit.

const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('NANO_DESKTOP', {
    flavor: 'desktop',
    quit: () => {
      try {
        ipcRenderer.send('nano-quit');
      } catch (e) {
        // Best-effort; renderer also has a window.close fallback.
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
