'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('waslah', {
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    save: (profile) => ipcRenderer.invoke('profiles:save', profile),
    delete: (id) => ipcRenderer.invoke('profiles:delete', id),
    quickAddParse: (raw) => ipcRenderer.invoke('profiles:quickAddParse', raw),
    copyQuickAdd: (id) => ipcRenderer.invoke('profiles:copyQuickAdd', id),
    export: () => ipcRenderer.invoke('profiles:export'),
    import: () => ipcRenderer.invoke('profiles:import'),
  },
  conn: {
    connect: (id) => ipcRenderer.invoke('conn:connect', id),
    disconnect: () => ipcRenderer.invoke('conn:disconnect'),
    status: () => ipcRenderer.invoke('conn:status'),
    testPing: (host, port) => ipcRenderer.invoke('conn:testPing', { host, port }),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (partial) => ipcRenderer.invoke('settings:update', partial),
  },
  app: {
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  on: {
    log: (cb) => ipcRenderer.on('log', (_e, line) => cb(line)),
    state: (cb) => ipcRenderer.on('state', (_e, payload) => cb(payload)),
  },
});
