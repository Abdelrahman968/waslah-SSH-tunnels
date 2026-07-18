'use strict';

const crypto = require('crypto');

/**
 * Encrypts the username/password fields of admin-entered SSH accounts
 * before they're written to Firestore, and decrypts them after reading.
 *
 * Honest limitation, stated plainly: this key is derived from a string
 * baked into the app, so it protects against casual exposure — anyone
 * glancing at the Firestore console, a browser network tab, or a raw
 * Firestore export sees ciphertext, not the real password — but it does
 * NOT protect against someone who reverse-engineers the distributed app
 * itself, since the key has to be present client-side for any signed-in
 * user's app to decrypt and actually connect. True server-side secrecy
 * (where only an authorized backend ever sees the plaintext) would need
 * a Cloud Function gatekeeping decryption per-request, which is real
 * additional infrastructure, not something this desktop client alone can
 * provide. This is defense-in-depth, not a guarantee.
 */
const APP_SECRET = 'wasla-shared-server-directory-v1'; // change this if you fork/rebrand
const KEY = crypto.scryptSync(APP_SECRET, 'wasla-static-salt', 32);

function encryptField(plainText) {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptField(encoded) {
  if (!encoded) return '';
  try {
    const buf = Buffer.from(encoded, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return ''; // corrupted/foreign ciphertext — fail closed, not with a crash
  }
}

/** Encrypts the sensitive fields of a server record before writing. */
function encryptServerRecord(server) {
  return {
    ...server,
    username: encryptField(server.username),
    password: encryptField(server.password),
    _encrypted: true,
  };
}

/** Decrypts the sensitive fields of a server record after reading. */
function decryptServerRecord(server) {
  if (!server._encrypted) return server; // tolerate any pre-existing plaintext rows
  return {
    ...server,
    username: decryptField(server.username),
    password: decryptField(server.password),
  };
}

module.exports = { encryptServerRecord, decryptServerRecord };
