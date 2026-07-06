'use strict';

// ---------------------------------------------------------------------------
// PRELOAD script.
//
// This runs in a special context that has access to a limited slice of Node/
// Electron, and bridges it to the renderer (the web page) through a safe,
// explicit API on `window.pomo`. Because contextIsolation is on, the renderer
// can ONLY see what we deliberately expose here -- nothing else from Node.
//
// If you later want the timer to read/write files, show native notifications,
// etc., add a method here and a matching ipcMain handler in main.js.
// ---------------------------------------------------------------------------

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomo', {
  // Returns the app version string from package.json.
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  // Returns the CHANGELOG.md text for the in-app "What's New" view.
  getChangelog: () => ipcRenderer.invoke('changelog:get'),
});
