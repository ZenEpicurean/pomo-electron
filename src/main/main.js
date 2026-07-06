'use strict';

// ---------------------------------------------------------------------------
// Electron MAIN process.
//
// The main process is the app's entry point (see "main" in package.json). It
// runs in a full Node.js environment and is responsible for creating windows
// and talking to the operating system. It does NOT draw any UI itself -- it
// just opens a BrowserWindow that loads our HTML/CSS/JS (the "renderer").
//
// All of the actual timer logic lives in the renderer (src/renderer/*). This
// file stays deliberately small.
// ---------------------------------------------------------------------------

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a reference so the window isn't garbage-collected.
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    // Fixed, non-resizable window sized to fit the tallest screen (the config
    // form) so nothing ever scrolls. useContentSize means width/height refer to
    // the web content area itself, not counting the OS title bar/borders.
    useContentSize: true,
    width: 380,
    height: 575,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#1b1b1f',
    title: 'Pomo Electron',
    // Window/taskbar icon. On packaged Windows builds the exe icon comes from
    // build/icon.ico (set in package.json); this covers dev runs and Linux.
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      // Security best practices: the renderer has NO direct Node.js access.
      // Anything it needs from Node is exposed explicitly via preload.js.
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Hide the default menu bar (File/Edit/View...). Press Alt to reveal it, or
  // remove this line if you want the menu always visible.
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Uncomment to open Chrome DevTools automatically for debugging:
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Let the renderer ask the main process for the app version (used in the
// footer). This is a simple example of IPC (inter-process communication).
ipcMain.handle('app:getVersion', () => app.getVersion());

// Return the raw CHANGELOG.md text so the renderer can show a "What's New"
// view. Read from the app root (works both in dev and inside the packaged
// app.asar). Returns '' if it can't be read, so the UI can degrade gracefully.
ipcMain.handle('changelog:get', () => {
  try {
    return fs.readFileSync(path.join(app.getAppPath(), 'CHANGELOG.md'), 'utf8');
  } catch (e) {
    return '';
  }
});

// Electron is ready -- create the window.
app.whenReady().then(() => {
  createWindow();

  // macOS convention: re-create a window when the dock icon is clicked and no
  // windows are open. Harmless on Windows/Linux.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed (except on macOS, per platform convention).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
