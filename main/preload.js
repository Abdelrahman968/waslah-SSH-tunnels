'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('waslah', {
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    getSecret: (id) => ipcRenderer.invoke('profiles:getSecret', id),
    save: (profile) => ipcRenderer.invoke('profiles:save', profile),
    delete: (id) => ipcRenderer.invoke('profiles:delete', id),
    quickAddParse: (raw) => ipcRenderer.invoke('profiles:quickAddParse', raw),
    copyQuickAdd: (id) => ipcRenderer.invoke('profiles:copyQuickAdd', id),
    export: () => ipcRenderer.invoke('profiles:export'),
    import: () => ipcRenderer.invoke('profiles:import'),
    exportWa: (locked, passphrase) => ipcRenderer.invoke('profiles:exportWa', { locked, passphrase }),
    importWa: (passphrase) => ipcRenderer.invoke('profiles:importWa', { passphrase }),
  },
  conn: {
    connect: (id, sniOverride) => ipcRenderer.invoke('conn:connect', { id, sniOverride }),
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
    speedTest: () => ipcRenderer.invoke('net:speedTest'),
  },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
  },
  sni: {
    list: () => ipcRenderer.invoke('sni:list'),
    save: (entry) => ipcRenderer.invoke('sni:save', entry),
    delete: (id) => ipcRenderer.invoke('sni:delete', id),
    testAll: (targetHost, targetPort) => ipcRenderer.invoke('sni:testAll', { targetHost, targetPort }),
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    clear: () => ipcRenderer.invoke('history:clear'),
  },
  appfw: {
    list: () => ipcRenderer.invoke('appfw:list'),
    add: () => ipcRenderer.invoke('appfw:add'),
    remove: (id) => ipcRenderer.invoke('appfw:remove', id),
  },
  hotspot: {
    start: (ssid, password) => ipcRenderer.invoke('hotspot:start', { ssid, password }),
    stop: () => ipcRenderer.invoke('hotspot:stop'),
    status: () => ipcRenderer.invoke('hotspot:status'),
  },
  elevation: {
    check: () => ipcRenderer.invoke('app:isElevated'),
    relaunch: () => ipcRenderer.invoke('app:relaunchElevated'),
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: () => ipcRenderer.invoke('backup:import'),
    resetSettings: () => ipcRenderer.invoke('settings:reset'),
  },
  app: {
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  on: {
    logEntry: (cb) => ipcRenderer.on('log:entry', (_e, entry) => cb(entry)),
    state: (cb) => ipcRenderer.on('state', (_e, payload) => cb(payload)),
    elevationStatus: (cb) => ipcRenderer.on('elevation:status', (_e, payload) => cb(payload)),
  },
});
