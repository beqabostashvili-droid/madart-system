// Electron shell: full-screen kiosk window for Windows touch screens (spec §6).
const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('node:path');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const KIOSK = process.env.KIOSK_MODE !== 'false';

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    kiosk: false,
    fullscreen: KIOSK,
    autoHideMenuBar: true,
    backgroundColor: '#f7f5f0',
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.setMenuBarVisibility(false);
  if (!KIOSK) win.maximize();
  // A device token (from Admin / seed) can be handed over once via DEVICE_TOKEN; the app stores it.
  const token = process.env.DEVICE_TOKEN;
  if (DEV_URL) win.loadURL(token ? `${DEV_URL}/?token=${encodeURIComponent(token)}` : DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), token ? { query: { token } } : undefined);
  // Staff exit: Ctrl+Shift+Q
  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
