// Electron entry point for the MECH MAYHEM desktop wrapper.
//
// Boots a tiny localhost static server for the built game (see static-server.js
// for why file:// won't work), then opens a fullscreen-capable window at that
// URL. When packaged, the built site lives in `dist/` next to this file inside
// the app resources; in dev it's the repo's `dist/` after `npm run build`.

const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const { startServer } = require('./static-server.cjs');

// Where the built game lives. electron-builder packs `dist/` alongside
// `electron/` under the app root, so this resolves in both dev and prod.
const DIST_DIR = path.join(__dirname, '..', 'dist');

let serverHandle = null;
let mainWindow = null;

async function createWindow() {
  const { url, server } = await startServer(DIST_DIR);
  serverHandle = server;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#05070c',
    title: 'MECH MAYHEM',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // WebGL / gamepad work out of the box in Chromium; nothing else needed.
    },
  });

  // Remove the default application menu (File/Edit/…) for a game-like feel,
  // but keep a couple of handy accelerators.
  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(url);

  // Open any target="_blank" / external links in the user's real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl);
    return { action: 'deny' };
  });

  // Keyboard: F11 toggles fullscreen, F12/Ctrl+Shift+I opens devtools,
  // Ctrl/Cmd+R reloads. Nice-to-haves for a self-contained game build.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    if (key === 'f11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    } else if (key === 'f12' || (input.control && input.shift && key === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    } else if ((input.control || input.meta) && key === 'r') {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single-instance: focus the existing window instead of opening a second one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on('window-all-closed', () => {
  if (serverHandle) {
    try { serverHandle.close(); } catch (_) { /* already down */ }
    serverHandle = null;
  }
  // Standard desktop behavior; quit everywhere except macOS.
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (serverHandle) {
    try { serverHandle.close(); } catch (_) { /* already down */ }
  }
});
