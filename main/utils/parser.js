'use strict';

/**
 * Quick-add parser for SSH account strings.
 *
 * Supported formats:
 *   host:port@username:password
 *   host@username:password                (port defaults to 443)
 *   host:port@username:password#sni.host   (optional SNI suffix)
 *
 * Example:
 *   2.24.192.219:443@Gjdg6:Gduhd6
 *   sub.example.com@user1:pass1#cdn.example.com
 */

const QUICK_ADD_REGEX =
  /^\s*([a-zA-Z0-9.\-]+)(?::(\d{1,5}))?@([^:@#\s]+):([^#\s]+)(?:#([a-zA-Z0-9.\-]+))?\s*$/;

function parseQuickAdd(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'EMPTY_INPUT' };
  }

  const match = raw.trim().match(QUICK_ADD_REGEX);
  if (!match) {
    return { ok: false, error: 'INVALID_FORMAT' };
  }

  const [, host, portStr, username, password, sni] = match;
  const port = portStr ? parseInt(portStr, 10) : 443;

  if (port < 1 || port > 65535) {
    return { ok: false, error: 'INVALID_PORT' };
  }

  return {
    ok: true,
    data: {
      host,
      port,
      username,
      password,
      sni: sni || '',
    },
  };
}

/**
 * Builds the quick-add string back from a profile object, useful for
 * "copy as quick-add" / export-to-clipboard features.
 */
function buildQuickAddString(profile) {
  const base = `${profile.host}:${profile.port}@${profile.username}:${profile.password}`;
  return profile.sni ? `${base}#${profile.sni}` : base;
}

module.exports = { parseQuickAdd, buildQuickAddString, QUICK_ADD_REGEX };
