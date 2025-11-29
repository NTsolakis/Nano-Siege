// Preload for the Nano‑Siege desktop build.
// Keep this very small; it just tags the window so the existing
// front‑end can tweak behavior where needed.

(() => {
  try {
    if (typeof window !== 'undefined') {
      // Identify this runtime as a desktop/Electron build.
      window.NANO_BUILD_FLAVOR = 'desktop';
    }
  } catch (e) {
    // Ignore; desktop features are optional.
  }
})();

