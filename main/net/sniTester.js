'use strict';

const tls = require('tls');

/**
 * A curated seed list of commonly-available "bug host" SNI candidates used
 * in the SSH/SNI-bypass community. These are hosts most ISPs allow through
 * their DPI filtering because they're large, widely-used CDNs/services —
 * they're starting points, not guarantees, since ISP filtering rules vary
 * by network and change over time.
 */
const SEED_SNI_CANDIDATES = [
  'ea.com', 'discord.com', 'whatsapp.com', 'zoom.us', 'telegram.org',
  'cloudflare.com', 'akamai.com', 'fastly.com', 'microsoft.com',
  'apple.com', 'googlevideo.com', 'wechat.com', 'tiktokcdn.com',
];

/**
 * Tests whether a given SNI hostname lets a TLS handshake reach the target
 * SSH/VLESS server through the user's actual current network path — this
 * is the real question a "does this SNI work for bypass" test has to
 * answer, and it can only be answered by attempting it live from the
 * user's own network, which is exactly what this desktop app can do (most
 * competing SSH-tunnel apps make users find working SNI hosts manually on
 * forums instead).
 */
function testSniHost(targetHost, targetPort, sniHost, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    const finish = (ok, extra) => {
      if (settled) return;
      settled = true;
      resolve({ sni: sniHost, ok, ms: ok ? Date.now() - start : null, ...extra });
    };

    try {
      const socket = tls.connect(
        {
          host: targetHost,
          port: targetPort,
          servername: sniHost,
          rejectUnauthorized: false,
          timeout: timeoutMs,
        },
        () => { finish(true); socket.end(); }
      );
      socket.on('timeout', () => { socket.destroy(); finish(false, { error: 'TIMEOUT' }); });
      socket.on('error', (err) => finish(false, { error: err.message }));
    } catch (err) {
      finish(false, { error: err.message });
    }
  });
}

/**
 * Runs tests concurrently (bounded) across a candidate list and returns
 * results sorted by latency, successes first.
 */
async function testSniBulk(targetHost, targetPort, candidates, concurrency = 6) {
  const list = [...new Set(candidates)];
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < list.length) {
      const sni = list[idx++];
      results.push(await testSniHost(targetHost, targetPort, sni));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));

  return results.sort((a, b) => {
    if (a.ok && !b.ok) return -1;
    if (!a.ok && b.ok) return 1;
    if (a.ok && b.ok) return a.ms - b.ms;
    return 0;
  });
}

module.exports = { SEED_SNI_CANDIDATES, testSniHost, testSniBulk };
