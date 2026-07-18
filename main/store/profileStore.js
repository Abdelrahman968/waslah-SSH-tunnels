'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

/**
 * Profile storage.
 * Profiles are persisted as JSON in userData. Passwords are encrypted at
 * rest using Electron's safeStorage (DPAPI on Windows) when available;
 * otherwise they fall back to AES-256-GCM with a machine-derived key so the
 * file is never plain text on disk.
 */

const STORE_FILE = () => path.join(app.getPath('userData'), 'profiles.json');
const FALLBACK_KEY = () =>
  crypto.createHash('sha256').update(app.getPath('userData')).digest();

function encrypt(text) {
  if (safeStorage.isEncryptionAvailable()) {
    return { v: 2, data: safeStorage.encryptString(text).toString('base64') };
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', FALLBACK_KEY(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    data: Buffer.concat([iv, tag, enc]).toString('base64'),
  };
}

function decrypt(payload) {
  if (!payload) return '';
  if (payload.v === 2 && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(payload.data, 'base64'));
  }
  if (payload.v === 1) {
    const buf = Buffer.from(payload.data, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', FALLBACK_KEY(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }
  return '';
}

function readAll() {
  try {
    const raw = fs.readFileSync(STORE_FILE(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { profiles: [], settings: defaultSettings() };
  }
}

function writeAll(state) {
  fs.mkdirSync(path.dirname(STORE_FILE()), { recursive: true });
  fs.writeFileSync(STORE_FILE(), JSON.stringify(state, null, 2), 'utf8');
}

function defaultSettings() {
  return {
    theme: 'dark',
    language: 'en',
    loggingEnabled: true,
    minimizeToTrayOnClose: true,
    showNotifications: true,
    autoFailoverSni: false,
    powerSavingMode: false,
    lastGuestTrialAt: null,
    autoStartWindows: false,
    autoConnectLastProfile: false,
    killSwitch: true,
    reconnect: { enabled: true, maxRetries: 5, intervalMs: 4000 },
    defaultSni: '',
    lastConnectedProfileId: null,
  };
}

function listProfiles() {
  const state = readAll();
  return state.profiles.map((p) => ({
    ...p,
    password: undefined, // never leak ciphertext shape to renderer list view
  }));
}

function getProfileWithSecret(id) {
  const state = readAll();
  const p = state.profiles.find((x) => x.id === id);
  if (!p) return null;
  return { ...p, password: decrypt(p._password) };
}

function upsertProfile(profile) {
  const cap = (v, max) => (typeof v === 'string' ? v.slice(0, max) : v);
  const state = readAll();
  const id = profile.id || crypto.randomUUID();
  const encPassword = encrypt(cap(profile.password, 512) || '');
  const record = {
    id,
    name: cap(profile.name || profile.host, 100),
    host: cap(profile.host, 255),
    port: Number(profile.port) || 443,
    username: cap(profile.username, 255),
    sni: profile.sni || '',
    color: profile.color || '#2DD4BF',
    // 'local' = the user typed this in themselves and can freely export/
    // copy it. 'admin' = imported from the shared server directory —
    // these are deliberately excluded from every plaintext-revealing
    // export path (quick-add copy, JSON export, full backup) below, so
    // the credential can never leave this machine's encrypted store even
    // by the legitimate user who imported it. Combined with safeStorage
    // being tied to the Windows user/machine (DPAPI), copying the
    // underlying profiles.json to another PC won't decrypt there either.
    origin: profile.origin === 'admin' ? 'admin' : 'local',
    createdAt: profile.createdAt || Date.now(),
    updatedAt: Date.now(),
    totalBytesIn: profile.totalBytesIn || 0,
    totalBytesOut: profile.totalBytesOut || 0,
    _password: encPassword,
  };
  const idx = state.profiles.findIndex((x) => x.id === id);
  if (idx >= 0) state.profiles[idx] = record;
  else state.profiles.push(record);
  writeAll(state);
  return { ...record, password: undefined };
}

function deleteProfile(id) {
  const state = readAll();
  state.profiles = state.profiles.filter((x) => x.id !== id);
  writeAll(state);
}

function getSettings() {
  const state = readAll();
  return { ...defaultSettings(), ...state.settings };
}

function updateSettings(partial) {
  const state = readAll();
  state.settings = { ...defaultSettings(), ...state.settings, ...partial };
  writeAll(state);
  return state.settings;
}

function exportProfiles() {
  // Exports with passwords decrypted so the user can move their OWN
  // manually-entered profiles to another machine. Profiles imported from
  // the admin-managed shared directory (origin === 'admin') are
  // deliberately excluded here — see the comment in upsertProfile for why.
  const state = readAll();
  return state.profiles
    .filter((p) => p.origin !== 'admin')
    .map((p) => ({
      name: p.name,
      host: p.host,
      port: p.port,
      username: p.username,
      sni: p.sni,
      color: p.color,
      password: decrypt(p._password),
    }));
}

function importProfiles(list) {
  if (!Array.isArray(list)) throw new Error('INVALID_IMPORT_FILE');
  list.forEach((p) => upsertProfile(p));
  return listProfiles();
}

// ---------------- .wa file format (locked / unlocked) ----------------
// Same local-only, personally-entered profiles as exportProfiles() —
// admin-distributed servers are still never included in either mode,
// preserving the anti-transfer protection already in place. "Locked"
// wraps the same JSON in a passphrase-derived AES-256-GCM envelope so the
// file isn't human-readable without the passphrase (useful for sending a
// profile to someone without exposing the raw password in a text
// editor); "unlocked" is the same plain JSON as before, just saved with
// the .wa extension for a consistent, recognizable file type.

function derivePassphraseKey(passphrase, salt) {
  return crypto.scryptSync(passphrase, salt, 32);
}

function exportWaLocked(passphrase) {
  if (!passphrase) throw new Error('PASSPHRASE_REQUIRED');
  const payload = JSON.stringify({ format: 'wasla-locked-v1', profiles: exportProfiles() });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = derivePassphraseKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    format: 'wasla-locked-v1',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  });
}

function exportWaUnlocked() {
  return JSON.stringify({ format: 'wasla-unlocked-v1', profiles: exportProfiles() });
}

function importWaFile(content, passphrase) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('INVALID_WA_FILE');
  }

  if (parsed.format === 'wasla-locked-v1') {
    if (!passphrase) throw new Error('PASSPHRASE_REQUIRED');
    try {
      const salt = Buffer.from(parsed.salt, 'base64');
      const iv = Buffer.from(parsed.iv, 'base64');
      const tag = Buffer.from(parsed.tag, 'base64');
      const enc = Buffer.from(parsed.data, 'base64');
      const key = derivePassphraseKey(passphrase, salt);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
      const inner = JSON.parse(plain);
      return importProfiles(inner.profiles);
    } catch {
      throw new Error('WRONG_PASSPHRASE_OR_CORRUPTED_FILE');
    }
  }

  if (parsed.format === 'wasla-unlocked-v1') {
    return importProfiles(parsed.profiles);
  }

  throw new Error('UNKNOWN_WA_FILE_FORMAT');
}

// ---------------- SNI list ----------------
function listSni() {
  const state = readAll();
  return state.sniList || [];
}

function upsertSni(entry) {
  const state = readAll();
  state.sniList = state.sniList || [];
  const id = entry.id || crypto.randomUUID();
  const record = {
    id,
    host: entry.host,
    favorite: !!entry.favorite,
    createdAt: entry.createdAt || Date.now(),
  };
  const idx = state.sniList.findIndex((x) => x.id === id);
  if (idx >= 0) state.sniList[idx] = record;
  else state.sniList.push(record);
  writeAll(state);
  return record;
}

function deleteSni(id) {
  const state = readAll();
  state.sniList = (state.sniList || []).filter((x) => x.id !== id);
  writeAll(state);
}

// ---------------- Connection history ----------------
const MAX_HISTORY = 200;

function listConnectionHistory() {
  const state = readAll();
  return (state.connectionHistory || []).slice().reverse();
}

function appendConnectionHistory(entry) {
  const state = readAll();
  state.connectionHistory = state.connectionHistory || [];
  state.connectionHistory.push({
    id: crypto.randomUUID(),
    protocol: entry.protocol,
    profileName: entry.profileName,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    durationMs: entry.endedAt - entry.startedAt,
    reason: entry.reason || 'disconnected',
  });
  if (state.connectionHistory.length > MAX_HISTORY) {
    state.connectionHistory = state.connectionHistory.slice(-MAX_HISTORY);
  }
  writeAll(state);
}

function clearConnectionHistory() {
  const state = readAll();
  state.connectionHistory = [];
  writeAll(state);
}

// ---------------- Per-profile data usage (SSH profiles only — see note in
// main.js on why VLESS usage isn't tracked yet) ----------------
function addProfileUsage(profileId, bytesIn, bytesOut) {
  const state = readAll();
  const p = state.profiles.find((x) => x.id === profileId);
  if (!p) return;
  p.totalBytesIn = (p.totalBytesIn || 0) + (bytesIn || 0);
  p.totalBytesOut = (p.totalBytesOut || 0) + (bytesOut || 0);
  writeAll(state);
}

// ---------------- VPN-only apps (per-app firewall gating) ----------------
function listVpnOnlyApps() {
  const state = readAll();
  return state.vpnOnlyApps || [];
}

function addVpnOnlyApp(exePath, label) {
  const state = readAll();
  state.vpnOnlyApps = state.vpnOnlyApps || [];
  if (state.vpnOnlyApps.some((a) => a.exePath === exePath)) return state.vpnOnlyApps;
  state.vpnOnlyApps.push({ id: crypto.randomUUID(), exePath, label: label || exePath });
  writeAll(state);
  return state.vpnOnlyApps;
}

function removeVpnOnlyApp(id) {
  const state = readAll();
  const removed = (state.vpnOnlyApps || []).find((a) => a.id === id);
  state.vpnOnlyApps = (state.vpnOnlyApps || []).filter((a) => a.id !== id);
  writeAll(state);
  return removed;
}

module.exports = {
  listProfiles,
  getProfileWithSecret,
  upsertProfile,
  deleteProfile,
  getSettings,
  updateSettings,
  exportProfiles,
  importProfiles,
  listSni,
  upsertSni,
  deleteSni,
  listConnectionHistory,
  appendConnectionHistory,
  clearConnectionHistory,
  addProfileUsage,
  listVpnOnlyApps,
  addVpnOnlyApp,
  removeVpnOnlyApp,
  exportWaLocked,
  exportWaUnlocked,
  importWaFile,
};
