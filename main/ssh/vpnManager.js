'use strict';

const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

const execAsync = (cmd) =>
  new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });

/**
 * Wraps the external `tun2socks.exe` binary (xjasonlyu/tun2socks) to turn
 * the local SOCKS5 proxy into a real system-wide VPN via a Wintun adapter.
 *
 * REQUIRED BINARIES (place under /bin, not bundled in source for size and
 * licensing reasons - see bin/README.md):
 *   - tun2socks.exe   https://github.com/xjasonlyu/tun2socks/releases
 *   - wintun.dll      https://www.wintun.net/  (next to tun2socks.exe)
 *
 * The app must run elevated (requestedExecutionLevel=requireAdministrator
 * in package.json build config) because creating a TUN adapter and editing
 * the routing table both require Administrator on Windows.
 */
class VpnManager extends EventEmitter {
  constructor({ resourcesPath, deviceName = 'Waslah' }) {
    super();
    this.resourcesPath = resourcesPath;
    this.deviceName = deviceName;
    this.proc = null;
    this.originalGateway = null;
    this.serverIp = null;
    this.active = false;
  }

  _binPath(name) {
    // In dev: project_root/bin, in production build: resources/bin
    return path.join(this.resourcesPath, 'bin', name);
  }

  async _getDefaultGateway() {
    // Parses `route print 0.0.0.0` output for the current default gateway,
    // needed so we can pin the SSH server's own route through it (avoids
    // routing the SSH connection itself into the tunnel = infinite loop).
    const out = await execAsync('route print -4 0.0.0.0');
    const match = out.match(/0\.0\.0\.0\s+0\.0\.0\.0\s+(\d{1,3}(?:\.\d{1,3}){3})/);
    if (!match) throw new Error('GATEWAY_NOT_FOUND');
    return match[1];
  }

  async start({ socksPort, serverIp }) {
    if (os.platform() !== 'win32') {
      throw new Error('VPN_TUN_ONLY_SUPPORTED_ON_WINDOWS');
    }

    this.serverIp = serverIp;
    this.originalGateway = await this._getDefaultGateway();

    // 1) Pin the SSH server's traffic through the real gateway so it never
    //    loops back into the TUN adapter.
    await execAsync(
      `route add ${serverIp} mask 255.255.255.255 ${this.originalGateway} metric 1`
    ).catch(() => {});

    // 2) Spawn tun2socks pointing at the local SOCKS proxy.
    const bin = this._binPath('tun2socks.exe');
    this.proc = spawn(
      bin,
      [
        '-device',
        `tun://${this.deviceName}`,
        '-proxy',
        `socks5://127.0.0.1:${socksPort}`,
        '-loglevel',
        'warn',
      ],
      { windowsHide: true }
    );

    this.proc.stdout.on('data', (d) => this.emit('log', `[tun2socks] ${d.toString().trim()}`));
    this.proc.stderr.on('data', (d) => this.emit('log', `[tun2socks] ${d.toString().trim()}`));
    this.proc.on('exit', (code) => {
      const wasActive = this.active;
      this.active = false;
      this.emit('log', `[tun2socks] خرج بالكود ${code}`);
      if (code !== 0 && wasActive) this.emit('killswitch-trigger');
      else if (code !== 0) this.emit('vpn-start-failed', code);
    });

    // Give the adapter a moment to come up before re-routing default traffic.
    // tun2socks creates the adapter asynchronously, so poll instead of a
    // single fixed wait (avoids false ADAPTER_NOT_FOUND on slower machines).
    const adapterIndex = await this._waitForAdapter();

    // 3) Replace default route so ALL system traffic flows into the TUN
    //    adapter (this is what makes it a real VPN, not just a proxy).
    await execAsync(`route add 0.0.0.0 mask 0.0.0.0 0.0.0.0 metric 1 if ${adapterIndex}`);

    this.active = true;
    this.emit('log', '[vpn] VPN شغال على مستوى النظام بالكامل');
  }

  async _waitForAdapter(maxAttempts = 8, intervalMs = 1000) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        return await this._getAdapterIndex();
      } catch {
        this.emit('log', `[vpn] لسه بنستنى الـ TUN adapter يظهر... (${i + 1}/${maxAttempts})`);
      }
    }
    throw new Error('ADAPTER_NOT_FOUND');
  }

  async _getAdapterIndex() {
    const out = await execAsync(`netsh interface ipv4 show interfaces`);
    const line = out.split('\n').find((l) => l.includes(this.deviceName));
    if (!line) throw new Error('ADAPTER_NOT_FOUND');
    return line.trim().split(/\s+/)[0];
  }

  /**
   * Kill switch: if the tunnel drops unexpectedly while kill-switch is
   * enabled, we remove the default route entirely instead of restoring the
   * original gateway, so the device has no internet until the user
   * reconnects manually. This prevents leaking traffic outside the tunnel.
   */
  async engageKillSwitch() {
    await execAsync(`route delete 0.0.0.0 mask 0.0.0.0`).catch(() => {});
    this.emit('log', '[killswitch] الإنترنت اتقفل لحد ما تعيد الاتصال (kill switch فعّال)');
  }

  async stop({ restoreGateway = true } = {}) {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    await execAsync(`route delete 0.0.0.0 mask 0.0.0.0`).catch(() => {});
    if (restoreGateway && this.originalGateway) {
      await execAsync(
        `route add 0.0.0.0 mask 0.0.0.0 ${this.originalGateway} metric 1`
      ).catch(() => {});
    }
    if (this.serverIp) {
      await execAsync(`route delete ${this.serverIp} mask 255.255.255.255`).catch(() => {});
    }
    this.active = false;
    this.emit('log', '[vpn] رجّعنا الراوتنج الأصلي');
  }
}

module.exports = { VpnManager };
