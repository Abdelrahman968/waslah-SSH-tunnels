'use strict';

const { EventEmitter } = require('events');
const { SSHTunnel } = require('./sshTunnel');
const { LocalSocksProxy } = require('./socksProxy');
const { VpnManager } = require('./vpnManager');

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
      this._log('[manager] فيه اتصال شغال أو جاري بالفعل — اتجاهلت المحاولة المكررة');
      return;
    }
    this.profile = profile;
    this.settings = settings;
    this.retries = 0;
    await this._doConnect();
  }

  async _doConnect() {
    this._setState('connecting');
    this._log(`[manager] بنحاول نتصل بـ ${this.profile.host}:${this.profile.port}...`);

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
          this._log(`[manager] فشل تجهيز الـ VPN: ${err.message}`);
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
      this._log(`[manager] هنحاول نعيد الاتصال (محاولة ${this.retries}/${rc.maxRetries})...`);
      await this._cleanup({ keepVpnDown: true });
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this._doConnect();
      }, rc.intervalMs);
    } else {
      this._log('[manager] الاتصال اتقطع نهائيًا');
      await this.disconnect();
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
