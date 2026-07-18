'use strict';

const { exec } = require('child_process');

const execAsync = (cmd, timeout = 15000) =>
  new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true, timeout }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });

/**
 * "VPN-only apps": binary network access gating via Windows Firewall, NOT
 * per-app traffic routing. When Waslah's VPN is disconnected, a chosen
 * app has zero network access (both directions blocked); when connected,
 * the block is lifted and the app behaves normally. This does not route
 * that app's traffic through the tunnel selectively while everything
 * else goes direct — true per-process routing needs a kernel-level
 * packet filter driver, which is out of scope here, exactly as already
 * noted for destination-based split tunneling.
 */
function ruleName(exePath, direction) {
  const safe = Buffer.from(exePath).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
  return `Waslah-VpnOnly-${direction}-${safe}`;
}

async function blockApp(exePath) {
  await execAsync(
    `netsh advfirewall firewall add rule name="${ruleName(exePath, 'out')}" dir=out program="${exePath}" action=block enable=yes`
  );
  await execAsync(
    `netsh advfirewall firewall add rule name="${ruleName(exePath, 'in')}" dir=in program="${exePath}" action=block enable=yes`
  );
}

async function unblockApp(exePath) {
  await execAsync(`netsh advfirewall firewall delete rule name="${ruleName(exePath, 'out')}"`).catch(() => {});
  await execAsync(`netsh advfirewall firewall delete rule name="${ruleName(exePath, 'in')}"`).catch(() => {});
}

/** Applies the current connection state to every registered VPN-only app. */
async function applyStateToAll(exePaths, connected) {
  for (const exePath of exePaths) {
    try {
      if (connected) await unblockApp(exePath);
      else await blockApp(exePath);
    } catch (err) {
      // One app's rule failing (e.g. bad path) shouldn't stop the others.
      console.error(`[appFirewall] failed for ${exePath}:`, err.message);
    }
  }
}

module.exports = { blockApp, unblockApp, applyStateToAll };
