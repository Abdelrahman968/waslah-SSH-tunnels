'use strict';

const { Client } = require('ssh2');
const tls = require('tls');
const net = require('net');
const { EventEmitter } = require('events');

/**
 * Wraps a single SSH connection (optionally behind a TLS/SNI front) and
 * exposes lifecycle events: connecting, ready, error, close.
 *
 * SNI mode: opens a TLS socket to host:port using `servername = sni`
 * (this is the "bug host" trick many networks allow through DPI), then
 * hands that already-established socket to ssh2 instead of opening a new
 * TCP connection.
 */
class SSHTunnel extends EventEmitter {
  constructor(profile) {
    super();
    this.profile = profile;
    this.conn = null;
    this.status = 'idle'; // idle | connecting | connected | error | closed
    this._manualClose = false;
  }

  connect() {
    this._manualClose = false;
    this.status = 'connecting';
    this.emit('status', this.status);

    const { host, port, username, password, sni } = this.profile;
    const conn = new Client();
    this.conn = conn;

    const sshOpts = {
      username,
      password,
      readyTimeout: 15000,
      keepaliveInterval: 8000,
      keepaliveCountMax: 3,
    };

    conn.on('ready', () => {
      this.status = 'connected';
      this.connectedAt = Date.now();
      this.emit('status', this.status);
      this.emit('log', `[ssh] Connected successfully to ${host}:${port}`);
    });

    conn.on('error', (err) => {
      this.status = 'error';
      this.emit('status', this.status, err.message);
      this.emit('log', `[ssh] Error: ${err.message}`);
    });

    conn.on('close', () => {
      this.status = this._manualClose ? 'closed' : 'error';
      this.emit('status', this.status);
      this.emit('log', '[ssh] Connection closed');
      this.emit('closed', { manual: this._manualClose });
    });

    if (sni) {
      this.emit('log', `[tls] Opening TLS handshake to ${host}:${port} with SNI=${sni}`);
      const socket = tls.connect(
        {
          host,
          port,
          servername: sni,
          rejectUnauthorized: false,
        },
        () => {
          this.emit('log', '[tls] Handshake succeeded, handing socket to SSH');
          conn.connect({ ...sshOpts, sock: socket });
        }
      );
      socket.on('error', (err) => {
        this.status = 'error';
        this.emit('status', this.status, err.message);
        this.emit('log', `[tls] Error: ${err.message}`);
      });
    } else {
      conn.connect({ ...sshOpts, host, port });
    }

    return this;
  }

  disconnect() {
    this._manualClose = true;
    if (this.conn) this.conn.end();
  }

  getClient() {
    return this.conn;
  }
}

/**
 * Lightweight latency check (raw TCP connect time) used for the
 * "test connection" button before saving/connecting a profile.
 */
function pingHost(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let done = false;
    const finish = (ok, ms) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ok, ms });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, Date.now() - start));
    socket.once('timeout', () => finish(false, null));
    socket.once('error', () => finish(false, null));
    socket.connect(port, host);
  });
}

module.exports = { SSHTunnel, pingHost };
