const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

// On some Linux setups (including many desktop distros without a
// properly configured SUID sandbox binary), Electron will refuse to
// start unless the sandbox is disabled. For this standalone game
// build we explicitly opt out of the sandbox so the AppImage runs
// without requiring root-owned helpers.
try {
  app.commandLine.appendSwitch('no-sandbox');
} catch (e) {
  // best-effort; if this fails we fall back to default behavior
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    useContentSize: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow the desktop build to call the hosted backend API
      // (https://nano.nicksminecraft.net) without being blocked by
      // CORS / same-origin checks when running from file://.
      webSecurity: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));

  // Open external links (e.g. update/download URLs) in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.on('nano-quit', () => {
  try {
    app.quit();
  } catch (e) {
    // Fallback: try closing all windows if quit fails.
    try {
      BrowserWindow.getAllWindows().forEach((w) => {
        try { w.close(); } catch (_) {}
      });
    } catch (_) {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
