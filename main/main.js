'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawn } = require('child_process');

const store = require('./store/profileStore');
const { parseQuickAdd, buildQuickAddString } = require('./utils/parser');
const { pingHost } = require('./ssh/sshTunnel');
const { ConnectionManager } = require('./ssh/connectionManager');
const { AppLogger } = require('./logger/logger');
const netTools = require('./net/networkTools');
const hotspot = require('./net/hotspot');
const sniTester = require('./net/sniTester');
const appFirewall = require('./net/appFirewall');
const { SSH_PROVIDERS } = require('./store/sshProviders');

const logger = new AppLogger();

/**
 * Checks whether the current process has Administrator rights on Windows.
 * `net session` only succeeds silently when run elevated.
 */
function isElevatedOnWindows() {
  if (os.platform() !== 'win32') return true;
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Relaunches the app elevated via PowerShell's `Start-Process -Verb RunAs`,
 * which triggers the native UAC prompt. Only called explicitly (from the
 * in-app "Restart as Administrator" banner button), never automatically at
 * startup — an automatic pre-ready relaunch that silently fails (UAC
 * cancelled, spawn error, etc.) would exit the app with zero window and
 * zero feedback, which is exactly the "nothing happens" failure mode.
 * Returns true if the relaunch command was issued successfully.
 */
function relaunchElevated() {
  try {
    const exe = process.execPath;
    const appArgs = app.isPackaged
      ? process.argv.slice(1)
      : [path.join(__dirname, '..'), ...process.argv.slice(2)];
    const argString = appArgs.map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
    const psCommand = `Start-Process -FilePath '${exe}' -ArgumentList ${argString || "''"} -Verb RunAs`;

    const child = spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', (err) => {
      console.error('[elevation] فشل تشغيل PowerShell للتصعيد:', err.message);
    });
    child.unref();

    // Give the UAC prompt a moment to spawn, then close this instance.
    // If the user cancels UAC, the new process never starts, but at least
    // they saw the prompt and this instance closing is expected in that
    // flow (they can just run the app again).
    setTimeout(() => {
      app.isQuitting = true;
      app.quit();
    }, 800);
    return true;
  } catch (err) {
    console.error('[elevation] خطأ غير متوقع أثناء محاولة التصعيد:', err.message);
    return false;
  }
}

let mainWindow = null;
let tray = null;
let manager = null;

const resourcesPath = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0B0F17',
    show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (e) => {
    const settings = store.getSettings();
    if (!app.isQuitting && settings.minimizeToTrayOnClose !== false) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray.png');
  const img = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip('Waslah');

  const rebuildMenu = () => {
    const status = manager?.getStatus();
    const connected = status?.state === 'connected';
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: connected ? 'متصل ✅' : 'مش متصل', enabled: false },
        { type: 'separator' },
        {
          label: connected ? 'قطع الاتصال' : 'فتح التطبيق للاتصال',
          click: () => {
            if (connected) manager.disconnect();
            else mainWindow.show();
          },
        },
        { label: 'إظهار النافذة', click: () => mainWindow.show() },
        { type: 'separator' },
        {
          label: 'خروج',
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        },
      ])
    );
  };

  rebuildMenu();
  tray.on('click', () => mainWindow.show());
  manager?.on('state', rebuildMenu);
}

function notifyStateChange(protocolLabel, payload) {
  const settings = store.getSettings();
  if (settings.showNotifications === false) return;
  if (!Notification.isSupported()) return;

  if (payload.state === 'connected') {
    new Notification({
      title: 'Waslah',
      body: `${protocolLabel} connected${payload.profile?.name ? ' — ' + payload.profile.name : ''}`,
    }).show();
  } else if (payload.state === 'error') {
    new Notification({
      title: 'Waslah',
      body: `${protocolLabel} connection error${payload.extra ? ': ' + payload.extra : ''}`,
    }).show();
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  logger.setEnabled(store.getSettings().loggingEnabled !== false);

  manager = new ConnectionManager({ resourcesPath });
  manager.on('log', (line) => {
    const entry = logger.push(line);
    if (entry) mainWindow?.webContents.send('log:entry', entry);
  });

  let sshSessionStart = null;
  let sshUsagePoll = null;
  let lastSshBytes = { in: 0, out: 0 };

  manager.on('state', (payload) => {
    mainWindow?.webContents.send('state', payload);
    notifyStateChange('SSH', payload);

    if (['connected', 'disconnected', 'error'].includes(payload.state)) {
      const apps = store.listVpnOnlyApps().map((a) => a.exePath);
      if (apps.length) {
        appFirewall.applyStateToAll(apps, payload.state === 'connected').catch((err) => {
          console.error('[appFirewall] applyStateToAll failed:', err.message);
        });
      }
    }

    if (payload.state === 'connected') {
      sshSessionStart = Date.now();
      lastSshBytes = { in: 0, out: 0 };
      if (sshUsagePoll) clearInterval(sshUsagePoll);
      sshUsagePoll = setInterval(async () => {
        const status = manager.getStatus();
        lastSshBytes = { in: status.bytesIn || 0, out: status.bytesOut || 0 };
      }, 5000);
    } else if (['disconnected', 'error'].includes(payload.state) && sshSessionStart) {
      if (sshUsagePoll) { clearInterval(sshUsagePoll); sshUsagePoll = null; }
      store.appendConnectionHistory({
        protocol: 'SSH',
        profileName: payload.profile?.name || payload.profile?.host || 'Unknown',
        startedAt: sshSessionStart,
        endedAt: Date.now(),
        reason: payload.state,
      });
      if (payload.profile?.id) {
        store.addProfileUsage(payload.profile.id, lastSshBytes.in, lastSshBytes.out);
      }
      sshSessionStart = null;
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  createWindow();
  createTray();

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('elevation:status', { elevated: isElevatedOnWindows(), platform: os.platform() });
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC: profiles ----------
ipcMain.handle('profiles:list', () => store.listProfiles());
ipcMain.handle('profiles:getSecret', (_e, id) => store.getProfileWithSecret(id));
ipcMain.handle('profiles:save', (_e, profile) => store.upsertProfile(profile));
ipcMain.handle('profiles:delete', (_e, id) => store.deleteProfile(id));
ipcMain.handle('profiles:quickAddParse', (_e, raw) => parseQuickAdd(raw));
ipcMain.handle('profiles:copyQuickAdd', (_e, id) => {
  const p = store.getProfileWithSecret(id);
  return p ? buildQuickAddString(p) : null;
});

ipcMain.handle('profiles:export', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'تصدير البروفايلات',
    defaultPath: 'waslah-profiles.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, JSON.stringify(store.exportProfiles(), null, 2), 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('profiles:import', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'استيراد بروفايلات',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePaths[0]) return { ok: false };
  const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  const profiles = store.importProfiles(data);
  return { ok: true, profiles };
});

ipcMain.handle('profiles:exportWa', async (_e, { locked, passphrase }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: locked ? 'Export locked .wa file' : 'Export .wa file',
    defaultPath: 'profiles.wa',
    filters: [{ name: 'Wasla file', extensions: ['wa'] }],
  });
  if (canceled || !filePath) return { ok: false };
  try {
    const content = locked ? store.exportWaLocked(passphrase) : store.exportWaUnlocked();
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('profiles:importWa', async (_e, { passphrase }) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import .wa file',
    properties: ['openFile'],
    filters: [{ name: 'Wasla file', extensions: ['wa'] }],
  });
  if (canceled || !filePaths[0]) return { ok: false };
  try {
    const content = fs.readFileSync(filePaths[0], 'utf8');
    const profiles = store.importWaFile(content, passphrase);
    return { ok: true, profiles };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ---------- IPC: connection ----------
ipcMain.handle('conn:connect', async (_e, args) => {
  const { id: profileId, sniOverride } = typeof args === 'string' ? { id: args } : args;
  const profile = store.getProfileWithSecret(profileId);
  if (!profile) throw new Error('PROFILE_NOT_FOUND');
  const settings = store.getSettings();

  // Per-connection SNI override (from the dashboard quick-select) takes
  // priority; otherwise fall back to the profile's own SNI, then the
  // user's global default SNI.
  if (sniOverride) {
    profile.sni = sniOverride;
  } else if (!profile.sni && settings.defaultSni) {
    profile.sni = settings.defaultSni;
  }

  store.updateSettings({ lastConnectedProfileId: profileId });
  await manager.connect(profile, settings);
  return manager.getStatus();
});

ipcMain.handle('conn:disconnect', async () => {
  await manager.disconnect();
  return manager.getStatus();
});

ipcMain.handle('conn:status', () => manager.getStatus());

ipcMain.handle('conn:testPing', async (_e, { host, port }) => pingHost(host, port));

// ---------- IPC: settings ----------
ipcMain.handle('settings:get', () => store.getSettings());
ipcMain.handle('settings:update', (_e, partial) => {
  const updated = store.updateSettings(partial);
  if (typeof partial.loggingEnabled === 'boolean') logger.setEnabled(partial.loggingEnabled);
  return updated;
});

ipcMain.handle('history:list', () => store.listConnectionHistory());
ipcMain.handle('history:clear', () => store.clearConnectionHistory());

ipcMain.handle('appfw:list', () => store.listVpnOnlyApps());
ipcMain.handle('appfw:add', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'اختار تطبيق',
    properties: ['openFile'],
    filters: [{ name: 'Executable', extensions: ['exe'] }],
  });
  if (canceled || !filePaths[0]) return { ok: false };
  const exePath = filePaths[0];
  const label = path.basename(exePath);
  const list = store.addVpnOnlyApp(exePath, label);
  // If VPN is currently disconnected, block it immediately; if connected,
  // leave it unblocked — the next disconnect will pick it up naturally.
  const status = manager.getStatus();
  if (status.state !== 'connected') {
    try { await appFirewall.blockApp(exePath); } catch (err) { console.error('[appfw] block failed:', err.message); }
  }
  return { ok: true, list };
});
ipcMain.handle('appfw:remove', async (_e, id) => {
  const removed = store.removeVpnOnlyApp(id);
  if (removed) {
    try { await appFirewall.unblockApp(removed.exePath); } catch (err) { console.error('[appfw] unblock failed:', err.message); }
  }
  return { ok: true };
});

// ---------- IPC: hotspot / internet sharing ----------
ipcMain.handle('hotspot:start', async (_e, { ssid, password }) => {
  try {
    const result = await hotspot.startHotspot(ssid, password);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('hotspot:stop', async () => {
  try {
    const result = await hotspot.stopHotspot();
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('hotspot:status', () => hotspot.hotspotStatus());

// ---------- IPC: backup & restore (full app data) ----------
ipcMain.handle('backup:export', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'نسخة احتياطية كاملة',
    defaultPath: `waslah-backup-${Date.now()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false };
  const blob = {
    version: app.getVersion(),
    exportedAt: Date.now(),
    profiles: store.exportProfiles(),
    sni: store.listSni(),
    settings: store.getSettings(),
  };
  fs.writeFileSync(filePath, JSON.stringify(blob, null, 2), 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('backup:import', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'استرجاع نسخة احتياطية',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePaths[0]) return { ok: false };
  const blob = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  if (blob.profiles) store.importProfiles(blob.profiles);
  if (blob.sni) blob.sni.forEach((s) => store.upsertSni(s));
  if (blob.settings) store.updateSettings(blob.settings);
  return { ok: true };
});

ipcMain.handle('settings:reset', () => {
  store.updateSettings({
    theme: 'dark', language: 'en', loggingEnabled: true, autoStartWindows: false,
    autoConnectLastProfile: false, killSwitch: true,
    reconnect: { enabled: true, maxRetries: 5, intervalMs: 4000 },
    defaultSni: '', lastConnectedProfileId: null,
  });
  return store.getSettings();
});

// ---------- IPC: network tools (speed test) ----------
ipcMain.handle('net:speedTest', () => netTools.speedTest());

// ---------- IPC: elevation ----------
ipcMain.handle('app:isElevated', () => ({ elevated: isElevatedOnWindows(), platform: os.platform() }));
ipcMain.handle('app:relaunchElevated', () => relaunchElevated());

// ---------- IPC: misc ----------
ipcMain.handle('app:openExternal', (_e, url) => shell.openExternal(url));
ipcMain.handle('app:getVersion', () => app.getVersion());

// ---------- IPC: logs ----------
ipcMain.handle('logs:list', (_e, filter) => logger.list(filter || {}));
ipcMain.handle('logs:clear', () => logger.clear());
ipcMain.handle('logs:setEnabled', (_e, enabled) => {
  logger.setEnabled(enabled);
  store.updateSettings({ loggingEnabled: enabled });
  return enabled;
});
ipcMain.handle('logs:export', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'تصدير السجل',
    defaultPath: `waslah-log-${Date.now()}.txt`,
    filters: [{ name: 'Text', extensions: ['txt'] }],
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, logger.exportText(), 'utf8');
  return { ok: true, filePath };
});

// ---------- IPC: network tools ----------
ipcMain.handle('net:whatsMyIp', () => netTools.whatsMyIp());
ipcMain.handle('net:dnsLookup', (_e, host) => netTools.dnsLookup(host));
ipcMain.handle('net:tcpPing', (_e, { host, port }) => netTools.tcpPing(host, Number(port)));
ipcMain.handle('net:httpPing', (_e, url) => netTools.httpPing(url));
ipcMain.handle('net:portScan', (_e, { host, start, end }) =>
  netTools.portScan(host, Number(start), Number(end))
);
ipcMain.handle('net:sslCheck', (_e, { host, port }) => netTools.sslCheck(host, Number(port) || 443));
ipcMain.handle('net:whois', (_e, domain) => netTools.whois(domain));
ipcMain.handle('net:traceroute', (_e, host) => netTools.traceroute(host));

// ---------- IPC: SSH providers ----------
ipcMain.handle('providers:list', () => SSH_PROVIDERS);

// ---------- IPC: SNI manager ----------
ipcMain.handle('sni:list', () => store.listSni());
ipcMain.handle('sni:save', (_e, entry) => store.upsertSni(entry));
ipcMain.handle('sni:delete', (_e, id) => store.deleteSni(id));
ipcMain.handle('sni:testAll', (_e, { targetHost, targetPort, extraCandidates }) => {
  const userSni = store.listSni().map((s) => s.host);
  const candidates = [...new Set([...userSni, ...sniTester.SEED_SNI_CANDIDATES, ...(extraCandidates || [])])];
  return sniTester.testSniBulk(targetHost, Number(targetPort) || 443, candidates);
});
