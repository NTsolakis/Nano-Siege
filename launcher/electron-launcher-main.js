#!/usr/bin/env node

// Nano‑Siege Electron launcher
// This main process just opens a small window; the renderer
// (launcher.html) handles update/download logic using Node APIs.

const { app, BrowserWindow } = require('electron');
const path = require('path');

// On some Linux setups, Electron needs the sandbox disabled
// to avoid chrome-sandbox SUID errors.
try {
  app.commandLine.appendSwitch('no-sandbox');
} catch (e) {
  // best-effort; fall back to defaults if this fails
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 640,
    height: 380,
    resizable: false,
    useContentSize: true,
    backgroundColor: '#000000',
    title: 'Nano‑Siege Launcher',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'launcher.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
