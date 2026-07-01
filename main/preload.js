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
  logs: {
    list: (filter) => ipcRenderer.invoke('logs:list', filter),
    clear: () => ipcRenderer.invoke('logs:clear'),
    setEnabled: (enabled) => ipcRenderer.invoke('logs:setEnabled', enabled),
    export: () => ipcRenderer.invoke('logs:export'),
  },
  net: {
    whatsMyIp: () => ipcRenderer.invoke('net:whatsMyIp'),
    dnsLookup: (host) => ipcRenderer.invoke('net:dnsLookup', host),
    tcpPing: (host, port) => ipcRenderer.invoke('net:tcpPing', { host, port }),
    httpPing: (url) => ipcRenderer.invoke('net:httpPing', url),
    portScan: (host, start, end) => ipcRenderer.invoke('net:portScan', { host, start, end }),
    sslCheck: (host, port) => ipcRenderer.invoke('net:sslCheck', { host, port }),
    whois: (domain) => ipcRenderer.invoke('net:whois', domain),
    traceroute: (host) => ipcRenderer.invoke('net:traceroute', host),
  },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
  },
  sni: {
    list: () => ipcRenderer.invoke('sni:list'),
    save: (entry) => ipcRenderer.invoke('sni:save', entry),
    delete: (id) => ipcRenderer.invoke('sni:delete', id),
  },
  vless: {
    list: () => ipcRenderer.invoke('vless:list'),
    validate: (raw) => ipcRenderer.invoke('vless:validate', raw),
    save: (profile) => ipcRenderer.invoke('vless:save', profile),
    delete: (id) => ipcRenderer.invoke('vless:delete', id),
    importQr: () => ipcRenderer.invoke('vless:importQr'),
  },
  app: {
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  on: {
    logEntry: (cb) => ipcRenderer.on('log:entry', (_e, entry) => cb(entry)),
    state: (cb) => ipcRenderer.on('state', (_e, payload) => cb(payload)),
  },
});
