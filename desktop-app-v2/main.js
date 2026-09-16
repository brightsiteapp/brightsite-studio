// BrightSite Studio V2 — Electron entry. Same shell as V1's main.js (updates,
// framed-site headers, menu) around V2's server, on its own port and with its
// own app name, so both versions can be installed and open at the same time.
const { app, BrowserWindow, shell, Menu, nativeImage, session } = require('electron');
const path = require('path');
const { createV2App, PORT, V1_DIR } = require('./server');
const { initAutoUpdates } = require(path.join(V1_DIR, 'lib', 'app-updater'));

const ICON_PATH = path.join(V1_DIR, 'public', 'icon.png');

let server;
let mainWindow;

function start() {
  if (process.platform === 'darwin') {
    app.dock.setIcon(nativeImage.createFromPath(ICON_PATH));
  }
  // As in V1: a linked website shows in the preview frame even if it
  // normally refuses to be framed. Only frames in this window are touched.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'subFrame') return callback({});
    const responseHeaders = { ...details.responseHeaders };
    for (const name of Object.keys(responseHeaders)) {
      const lower = name.toLowerCase();
      if (lower === 'x-frame-options') delete responseHeaders[name];
      else if (lower === 'content-security-policy') {
        responseHeaders[name] = responseHeaders[name].map(v => v.replace(/frame-ancestors[^;]*;?/gi, ''));
      }
    }
    callback({ responseHeaders });
  });
  server = createV2App().listen(PORT, () => {
    createWindow();
    initAutoUpdates(() => mainWindow);
  });
}

function createWindow() {
  const win = (mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 700,
    title: 'BrightSite Studio',
    icon: ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(V1_DIR, 'preload.js')
    }
  }));
  win.loadURL(`http://localhost:${PORT}`);

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'BrightSite Studio',
      submenu: [
        { label: 'Open in Browser (for colleagues)', click: () => shell.openExternal(`http://localhost:${PORT}`) },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]));
}

app.whenReady().then(start);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
