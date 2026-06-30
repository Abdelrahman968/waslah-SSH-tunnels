"use strict";

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  shell,
  dialog,
  nativeImage,
} = require("electron");
const path = require("path");
const fs = require("fs");

const store = require("./store/profileStore");
const { parseQuickAdd, buildQuickAddString } = require("./utils/parser");
const { pingHost } = require("./ssh/sshTunnel");
const { ConnectionManager } = require("./ssh/connectionManager");

let mainWindow = null;
let tray = null;
let manager = null;

Menu.setApplicationMenu(null);

const resourcesPath = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, "..");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#0B0F17",
    show: false,
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "assets", "tray.png");
  const img = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip("Waslah");

  const rebuildMenu = () => {
    const status = manager?.getStatus();
    const connected = status?.state === "connected";
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: connected ? "متصل ✅" : "مش متصل", enabled: false },
        { type: "separator" },
        {
          label: connected ? "قطع الاتصال" : "فتح التطبيق للاتصال",
          click: () => {
            if (connected) manager.disconnect();
            else mainWindow.show();
          },
        },
        { label: "إظهار النافذة", click: () => mainWindow.show() },
        { type: "separator" },
        {
          label: "خروج",
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        },
      ]),
    );
  };

  rebuildMenu();
  tray.on("click", () => mainWindow.show());
  manager?.on("state", rebuildMenu);
}

app.whenReady().then(() => {
  manager = new ConnectionManager({ resourcesPath });
  manager.on("log", (line) => mainWindow?.webContents.send("log", line));
  manager.on("state", (payload) =>
    mainWindow?.webContents.send("state", payload),
  );

  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------- IPC: profiles ----------
ipcMain.handle("profiles:list", () => store.listProfiles());
ipcMain.handle("profiles:save", (_e, profile) => store.upsertProfile(profile));
ipcMain.handle("profiles:delete", (_e, id) => store.deleteProfile(id));
ipcMain.handle("profiles:quickAddParse", (_e, raw) => parseQuickAdd(raw));
ipcMain.handle("profiles:copyQuickAdd", (_e, id) => {
  const p = store.getProfileWithSecret(id);
  return p ? buildQuickAddString(p) : null;
});

ipcMain.handle("profiles:export", async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: "تصدير البروفايلات",
    defaultPath: "waslah-profiles.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(
    filePath,
    JSON.stringify(store.exportProfiles(), null, 2),
    "utf8",
  );
  return { ok: true, filePath };
});

ipcMain.handle("profiles:import", async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: "استيراد بروفايلات",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (canceled || !filePaths[0]) return { ok: false };
  const data = JSON.parse(fs.readFileSync(filePaths[0], "utf8"));
  const profiles = store.importProfiles(data);
  return { ok: true, profiles };
});

// ---------- IPC: connection ----------
ipcMain.handle("conn:connect", async (_e, profileId) => {
  const profile = store.getProfileWithSecret(profileId);
  if (!profile) throw new Error("PROFILE_NOT_FOUND");
  const settings = store.getSettings();

  // Global SNI fallback: a profile-specific SNI always wins, but if a
  // profile has none set, apply the user's default SNI to every connection
  // automatically instead of requiring it per-profile.
  if (!profile.sni && settings.defaultSni) {
    profile.sni = settings.defaultSni;
  }

  store.updateSettings({ lastConnectedProfileId: profileId });
  await manager.connect(profile, settings);
  return manager.getStatus();
});

ipcMain.handle("conn:disconnect", async () => {
  await manager.disconnect();
  return manager.getStatus();
});

ipcMain.handle("conn:status", () => manager.getStatus());

ipcMain.handle("conn:testPing", async (_e, { host, port }) =>
  pingHost(host, port),
);

// ---------- IPC: settings ----------
ipcMain.handle("settings:get", () => store.getSettings());
ipcMain.handle("settings:update", (_e, partial) =>
  store.updateSettings(partial),
);

// ---------- IPC: misc ----------
ipcMain.handle("app:openExternal", (_e, url) => shell.openExternal(url));
ipcMain.handle("app:getVersion", () => app.getVersion());
