'use strict';

const dns = require('dns').promises;
const net = require('net');
const tls = require('tls');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');

const execAsync = (cmd, timeout = 15000) =>
  new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true, timeout }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });

async function whatsMyIp() {
  // Uses two independent public echo endpoints so a single provider being
  // down doesn't break the feature; returns the first that answers.
  const endpoints = ['https://api.ipify.org?format=json', 'https://ifconfig.me/all.json'];
  for (const url of endpoints) {
    try {
      const body = await httpGetText(url, 5000);
      const parsed = JSON.parse(body);
      if (parsed.ip || parsed.ip_addr) return { ok: true, ip: parsed.ip || parsed.ip_addr };
    } catch {
      // try next endpoint
    }
  }
  return { ok: false, error: 'NO_ENDPOINT_REACHABLE' };
}

function httpGetText(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', reject);
  });
}

async function dnsLookup(host) {
  const [a, aaaa, mx, txt, cname] = await Promise.allSettled([
    dns.resolve4(host),
    dns.resolve6(host),
    dns.resolveMx(host),
    dns.resolveTxt(host),
    dns.resolveCname(host),
  ]);
  return {
    A: a.status === 'fulfilled' ? a.value : [],
    AAAA: aaaa.status === 'fulfilled' ? aaaa.value : [],
    MX: mx.status === 'fulfilled' ? mx.value : [],
    TXT: txt.status === 'fulfilled' ? txt.value.map((t) => t.join('')) : [],
    CNAME: cname.status === 'fulfilled' ? cname.value : [],
  };
}

function tcpPing(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let done = false;
    const finish = (ok, ms, error) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ok, ms, error: error || null });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, Date.now() - start));
    socket.once('timeout', () => finish(false, null, 'TIMEOUT'));
    socket.once('error', (err) => finish(false, null, err.message));
    socket.connect(port, host);
  });
}

async function httpPing(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const lib = target.startsWith('https') ? https : http;
    const start = Date.now();
    const req = lib.get(target, { timeout: timeoutMs }, (res) => {
      res.resume();
      res.on('end', () =>
        resolve({ ok: true, status: res.statusCode, ms: Date.now() - start })
      );
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'TIMEOUT' }); });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
  });
}

async function portScan(host, startPort, endPort, concurrency = 60) {
  const ports = [];
  for (let p = startPort; p <= endPort; p++) ports.push(p);
  const open = [];
  let idx = 0;

  async function worker() {
    while (idx < ports.length) {
      const p = ports[idx++];
      const res = await tcpPing(host, p, 800);
      if (res.ok) open.push(p);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ports.length) }, worker));
  return open.sort((a, b) => a - b);
}

function sslCheck(host, port = 443, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port, servername: host, timeout: timeoutMs, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.subject) return reject(new Error('NO_CERTIFICATE'));
        resolve({
          subject: cert.subject,
          issuer: cert.issuer,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          fingerprint: cert.fingerprint,
          protocol: socket.getProtocol(),
        });
      }
    );
    socket.on('timeout', () => { socket.destroy(); reject(new Error('TIMEOUT')); });
    socket.on('error', reject);
  });
}

/**
 * Minimal WHOIS client: queries the IANA root to discover the correct
 * registry server for the TLD, then queries that server directly, avoiding
 * a dependency on any third-party HTTP whois API.
 */
function whoisQuery(domain, server = 'whois.iana.org', timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(43, server);
    let data = '';
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => socket.write(domain + '\r\n'));
    socket.on('data', (chunk) => (data += chunk.toString()));
    socket.on('end', () => resolve(data));
    socket.on('timeout', () => { socket.destroy(); reject(new Error('TIMEOUT')); });
    socket.on('error', reject);
  });
}

async function whois(domain) {
  const iana = await whoisQuery(domain, 'whois.iana.org');
  const match = iana.match(/refer:\s*(\S+)/i);
  if (match) {
    try {
      const full = await whoisQuery(domain, match[1]);
      return full;
    } catch {
      return iana;
    }
  }
  return iana;
}

async function traceroute(host) {
  // Windows-only: shells out to the built-in `tracert`. No raw sockets
  // required (those need admin + WinPcap-style drivers); tracert already
  // handles ICMP correctly under the hood.
  return execAsync(`tracert -d -h 20 -w 800 ${host}`, 25000);
}

module.exports = {
  whatsMyIp,
  dnsLookup,
  tcpPing,
  httpPing,
  portScan,
  sslCheck,
  whois,
  traceroute,
};
