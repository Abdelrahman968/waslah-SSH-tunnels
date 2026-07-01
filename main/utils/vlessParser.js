'use strict';

/**
 * Parses a `vless://` URI into its components for display/validation.
 * Does NOT establish any connection — this is config management only.
 * Real VLESS/V2Ray connectivity requires bundling a core (e.g. xray-core)
 * the same way tun2socks is bundled for the SSH VPN path; that's planned
 * as a separate follow-up rather than bolted on here.
 *
 * Format: vless://uuid@host:port?params#remark
 */
function parseVlessUri(raw) {
  try {
    if (!raw.startsWith('vless://')) return { ok: false, error: 'NOT_VLESS_URI' };
    const withoutScheme = raw.slice('vless://'.length);
    const [authPart, rest] = withoutScheme.split('@');
    if (!authPart || !rest) return { ok: false, error: 'MALFORMED_URI' };

    const uuid = authPart;
    const [hostPortAndQuery, remarkEncoded] = rest.split('#');
    const [hostPort, query] = hostPortAndQuery.split('?');
    const [host, portStr] = hostPort.split(':');
    const port = parseInt(portStr, 10);

    if (!uuid || !host || !port) return { ok: false, error: 'MISSING_FIELDS' };

    const params = {};
    if (query) {
      for (const pair of query.split('&')) {
        const [k, v] = pair.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      }
    }

    return {
      ok: true,
      data: {
        uuid,
        host,
        port,
        remark: remarkEncoded ? decodeURIComponent(remarkEncoded) : '',
        params,
      },
    };
  } catch (err) {
    return { ok: false, error: 'PARSE_FAILED' };
  }
}

function parseVlessJson(raw) {
  try {
    const obj = JSON.parse(raw);
    if (!obj.outbounds && !obj.address && !obj.id) {
      return { ok: false, error: 'NOT_VLESS_CONFIG' };
    }
    return { ok: true, data: obj };
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
  }
}

function validateConfig(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { ok: false, error: 'EMPTY_INPUT' };
  if (trimmed.startsWith('vless://')) return parseVlessUri(trimmed);
  return parseVlessJson(trimmed);
}

module.exports = { parseVlessUri, parseVlessJson, validateConfig };
