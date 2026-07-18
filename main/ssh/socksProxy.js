'use strict';

const socks = require('socksv5');
const { EventEmitter } = require('events');

/**
 * Starts a local SOCKS5 server (127.0.0.1:port) that forwards every
 * connection through the active SSH client via `forwardOut`, exactly what
 * `ssh -D <port>` does on the CLI.
 */
class LocalSocksProxy extends EventEmitter {
  constructor(sshConn, port = 1080) {
    super();
    this.sshConn = sshConn;
    this.port = port;
    this.server = null;
    this.bytesIn = 0;
    this.bytesOut = 0;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = socks.createServer((info, accept, deny) => {
        this.sshConn.forwardOut(
          info.srcAddr,
          info.srcPort,
          info.dstAddr,
          info.dstPort,
          (err, stream) => {
            if (err) {
              this.emit('log', `[socks] Rejected connection to ${info.dstAddr}:${info.dstPort} (${err.message})`);
              return deny();
            }
            const client = accept(true);
            if (!client) return stream.end();

            stream.on('data', (d) => (this.bytesIn += d.length));
            client.on('data', (d) => (this.bytesOut += d.length));

            stream.pipe(client).pipe(stream);
            const cleanup = () => {
              stream.unpipe();
              client.unpipe();
            };
            stream.on('error', cleanup);
            client.on('error', cleanup);
          }
        );
      });

      this.server.useAuth(socks.auth.None());
      this.server.listen(this.port, '127.0.0.1', () => {
        this.emit('log', `[socks] Local SOCKS5 proxy running on 127.0.0.1:${this.port}`);
        resolve(this.port);
      });
      this.server.on('error', reject);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }

  getStats() {
    return { bytesIn: this.bytesIn, bytesOut: this.bytesOut };
  }
}

module.exports = { LocalSocksProxy };
