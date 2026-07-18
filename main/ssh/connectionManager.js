'use strict';

const { EventEmitter } = require('events');
const { SSHTunnel } = require('./sshTunnel');
const { LocalSocksProxy } = require('./socksProxy');
const { VpnManager } = require('./vpnManager');
const { testSniBulk, SEED_SNI_CANDIDATES } = require('../net/sniTester');

const SOCKS_PORT = 10808;

/**
 * Coordinates the full chain: SSH -> local SOCKS5 -> system-wide TUN VPN,
 * plus auto-reconnect and kill-switch behaviour driven by user settings.
 */
class ConnectionManager extends EventEmitter {
  constructor({ resourcesPath }) {
    super();
    this.resourcesPath = resourcesPath;
    this.tunnel = null;
    this.socksProxy = null;
    this.vpn = null;
    this.profile = null;
    this.settings = null;
    this.retries = 0;
    this.connectedAt = null;
    this.reconnectTimer = null;
    this.state = 'disconnected'; // disconnected | connecting | connected | reconnecting
  }

  _log(line) {
    this.emit('log', line);
  }

  _setState(state, extra) {
    this.state = state;
    this.emit('state', { state, extra, profile: this.profile });
  }

  async connect(profile, settings) {
    if (this.state === 'connecting' || this.state === 'connected' || this.state === 'reconnecting') {
      this._log('[manager] A connection is already active or in progress — ignored duplicate attempt');
      return;
    }
    this.profile = profile;
    this.settings = settings;
    this.retries = 0;
    await this._doConnect();
  }

  async _doConnect() {
    this._setState('connecting');
    this._log(`[manager] Attempting to connect to ${this.profile.host}:${this.profile.port}...`);

    this.tunnel = new SSHTunnel(this.profile);
    this.tunnel.on('log', (l) => this._log(l));

    this.tunnel.on('status', async (status, errMsg) => {
      if (status === 'connected') {
        this.retries = 0;
        try {
          this.socksProxy = new LocalSocksProxy(this.tunnel.getClient(), SOCKS_PORT);
          this.socksProxy.on('log', (l) => this._log(l));
          await this.socksProxy.start();

          this.vpn = new VpnManager({ resourcesPath: this.resourcesPath });
          this.vpn.on('log', (l) => this._log(l));
          this.vpn.on('killswitch-trigger', () => this._handleDrop());
          await this.vpn.start({ socksPort: SOCKS_PORT, serverIp: this.profile.host });

          this.connectedAt = Date.now();
          this._setState('connected');
        } catch (err) {
          this._log(`[manager] Failed to set up VPN: ${err.message}`);
          this._setState('error', err.message);
          await this._handleDrop();
        }
      } else if (status === 'error') {
        this._setState('error', errMsg);
        await this._handleDrop();
      }
    });

    this.tunnel.on('closed', async ({ manual }) => {
      if (!manual) await this._handleDrop();
    });

    this.tunnel.connect();
  }

  async _handleDrop() {
    const rc = this.settings?.reconnect || { enabled: true, maxRetries: 5, intervalMs: 4000 };

    if (this.vpn?.active && this.settings?.killSwitch) {
      await this.vpn.engageKillSwitch();
    }

    if (rc.enabled && this.retries < rc.maxRetries && this.state !== 'disconnecting') {
      this.retries += 1;
      this._setState('reconnecting', { attempt: this.retries, max: rc.maxRetries });

      if (this.settings?.autoFailoverSni) {
        await this._tryFailoverSni();
      }

      this._log(`[manager] Retrying connection (attempt ${this.retries}/${rc.maxRetries})...`);
      await this._cleanup({ keepVpnDown: true });
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this._doConnect();
      }, rc.intervalMs);
    } else {
      this._log('[manager] Connection permanently lost');
      await this.disconnect();
    }
  }

  /**
   * When auto-failover is enabled and a connection drops, tests the
   * saved SNI list + seed candidates against this profile's host live,
   * and swaps in the best-performing one before the next retry — instead
   * of the user having to notice the drop, open SNI Manager, and pick a
   * new one manually.
   */
  async _tryFailoverSni() {
    try {
      this._log('[manager] Auto-failover: testing SNI candidates before retry...');
      const results = await testSniBulk(this.profile.host, this.profile.port, SEED_SNI_CANDIDATES);
      const best = results.find((r) => r.ok);
      if (best && best.sni !== this.profile.sni) {
        this._log(`[manager] Auto-failover: switching SNI to ${best.sni} (${best.ms}ms)`);
        this.profile.sni = best.sni;
      } else if (!best) {
        this._log('[manager] Auto-failover: no working SNI candidate found, retrying with current settings');
      }
    } catch (err) {
      this._log(`[manager] Auto-failover test failed: ${err.message}`);
    }
  }

  async disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._setState('disconnecting');
    await this._cleanup({ keepVpnDown: false });
    this._setState('disconnected');
  }

  async _cleanup({ keepVpnDown }) {
    if (this.vpn) {
      await this.vpn.stop({ restoreGateway: !keepVpnDown });
      this.vpn = null;
    }
    if (this.socksProxy) {
      await this.socksProxy.stop();
      this.socksProxy = null;
    }
    if (this.tunnel) {
      this.tunnel.disconnect();
      this.tunnel = null;
    }
  }

  getStatus() {
    const socksStats = this.socksProxy?.getStats() || { bytesIn: 0, bytesOut: 0 };
    return {
      state: this.state,
      profile: this.profile,
      connectedAt: this.connectedAt,
      uptimeMs: this.connectedAt ? Date.now() - this.connectedAt : 0,
      bytesIn: socksStats.bytesIn,
      bytesOut: socksStats.bytesOut,
    };
  }
}

module.exports = { ConnectionManager };
