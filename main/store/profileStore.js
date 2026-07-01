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
    language: 'ar',
    loggingEnabled: true,
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
  const state = readAll();
  const id = profile.id || crypto.randomUUID();
  const encPassword = encrypt(profile.password || '');
  const record = {
    id,
    name: profile.name || profile.host,
    host: profile.host,
    port: Number(profile.port) || 443,
    username: profile.username,
    sni: profile.sni || '',
    color: profile.color || '#2DD4BF',
    createdAt: profile.createdAt || Date.now(),
    updatedAt: Date.now(),
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
  // Exports with passwords decrypted so the user can move them to another
  // machine; the app warns the user this file is sensitive.
  const state = readAll();
  return state.profiles.map((p) => ({
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

// ---------------- VLESS / V2Ray profiles ----------------
function listVlessProfiles() {
  const state = readAll();
  return state.vlessProfiles || [];
}

function upsertVlessProfile(profile) {
  const state = readAll();
  state.vlessProfiles = state.vlessProfiles || [];
  const id = profile.id || crypto.randomUUID();
  const record = {
    id,
    name: profile.name || 'VLESS profile',
    raw: profile.raw, // original vless:// URI or JSON string, kept verbatim
    parsed: profile.parsed || null,
    createdAt: profile.createdAt || Date.now(),
  };
  const idx = state.vlessProfiles.findIndex((x) => x.id === id);
  if (idx >= 0) state.vlessProfiles[idx] = record;
  else state.vlessProfiles.push(record);
  writeAll(state);
  return record;
}

function deleteVlessProfile(id) {
  const state = readAll();
  state.vlessProfiles = (state.vlessProfiles || []).filter((x) => x.id !== id);
  writeAll(state);
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
  listVlessProfiles,
  upsertVlessProfile,
  deleteVlessProfile,
};
