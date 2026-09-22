// Exposes a tiny, safe bridge. Hardware (printer/terminal) bridges land here in Phase 9.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('madartDevice', { platform: process.platform, isElectron: true });
