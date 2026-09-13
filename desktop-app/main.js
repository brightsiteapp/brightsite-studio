const { app, BrowserWindow, shell, Menu, nativeImage, session } = require('electron');
const path = require('path');
const { createApp, PORT } = require('./server');
const { initAutoUpdates } = require('./lib/app-updater');

const ICON_PATH = path.join(__dirname, 'public', 'icon.png');

let server;
let mainWindow;

function start() {
  // Sets the Dock icon for local `npm start` runs — the packaged .app
  // (see package.json build.mac.icon) gets the same icon baked in, so
  // this only matters during development.
  if (process.platform === 'darwin') {
    app.dock.setIcon(nativeImage.createFromPath(ICON_PATH));
  }
  // A linked website (see /api/import-site) shows in the preview frame
  // even if it normally refuses to be shown inside another page
  // (X-Frame-Options / CSP frame-ancestors). Only frame responses in the
  // app's own window are touched — the hidden page reader in
  // lib/browser-fetch.js uses its own session.
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
  server = createApp().listen(PORT, () => {
    createWindow();
    // Background only — never blocks startup; no-op in development.
    initAutoUpdates(() => mainWindow);
  });
}

function createWindow() {
  const win = (mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    title: 'BrightSite Studio',
    icon: ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  }));
  win.loadURL(`http://localhost:${PORT}`);

  const menu = Menu.buildFromTemplate([
    {
      label: 'BrightSite Studio',
      submenu: [
        {
          label: 'Open in Browser (for colleagues)',
          click: () => shell.openExternal(`http://localhost:${PORT}`)
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(start);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
