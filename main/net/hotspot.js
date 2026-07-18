'use strict';

const { exec } = require('child_process');

const execAsync = (cmd, timeout = 15000) =>
  new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true, timeout }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || stdout || err.message));
      resolve(stdout.trim());
    });
  });

/**
 * Windows internet sharing via the legacy "Hosted Network" API (netsh wlan).
 * This is a best-effort feature: many modern Wi-Fi adapters/drivers
 * (especially Wi-Fi 6/6E cards) no longer support Hosted Network at all,
 * in which case Windows' own Settings > Mobile hotspot (which uses a newer
 * WinRT API) is the only reliable path — the app always offers that as the
 * primary option and this as a secondary/advanced one.
 */
/**
 * Translates the common raw Windows/netsh error strings into a friendlier
 * message, since the raw ones (like "The group or resource is not in the
 * correct state...") are accurate but meaningless to most users. The most
 * frequent cause by far is the Wi-Fi adapter/driver simply not supporting
 * the legacy Hosted Network API at all — very common on modern hardware.
 */
function friendlyHotspotError(rawMessage) {
  const msg = rawMessage.toLowerCase();
  if (msg.includes('not in the correct state') || msg.includes('not supported')) {
    return 'Your Wi-Fi adapter/driver does not support Hosted Network. Use the "Open Windows Settings" button instead — it uses the modern Mobile Hotspot feature, which works on far more devices.';
  }
  if (msg.includes('access is denied')) {
    return 'Access denied — make sure Waslah is running as Administrator.';
  }
  return rawMessage;
}

async function startHotspot(ssid, password) {
  if (!ssid || !password || password.length < 8) {
    throw new Error('SSID and password are required, and the password must be at least 8 characters.');
  }

  try {
    await execAsync(`netsh wlan set hostednetwork mode=allow ssid="${ssid}" key="${password}"`);
    const startResult = await execAsync('netsh wlan start hostednetwork');

    if (/not (supported|started)/i.test(startResult)) {
      throw new Error(friendlyHotspotError(startResult));
    }

    return await enableIcsAfterHostedNetwork(startResult);
  } catch (err) {
    throw new Error(friendlyHotspotError(err.message));
  }
}

async function enableIcsAfterHostedNetwork(startResult) {

  // Enable Internet Connection Sharing (ICS) from the active internet
  // adapter to the new virtual "Local Area Connection* n" hosted-network
  // adapter, via the HNetCfg.HNetShare COM object (no CLI equivalent).
  const psScript = `
    $shareObj = New-Object -ComObject HNetCfg.HNetShare
    $connections = $shareObj.EnumEveryConnection
    $publicConn = $null
    $privateConn = $null
    foreach ($conn in $connections) {
      $props = $shareObj.NetConnectionProps($conn)
      $config = $shareObj.INetSharingConfigurationForINetConnection($conn)
      if ($props.Name -match 'Local Area Connection\\*' -or $props.Name -match 'Microsoft Hosted Network') {
        $privateConn = $conn
      } elseif ($config.SharingEnabled -eq $false -and $props.Status -eq 2) {
        $publicConn = $conn
      }
    }
    if ($publicConn -and $privateConn) {
      $shareObj.INetSharingConfigurationForINetConnection($publicConn).EnableSharing(0)
      $shareObj.INetSharingConfigurationForINetConnection($privateConn).EnableSharing(1)
      "ICS_ENABLED"
    } else {
      "ICS_ADAPTER_NOT_FOUND"
    }
  `.replace(/\r?\n/g, ' ');

  let icsResult = 'ICS_SKIPPED';
  try {
    icsResult = await execAsync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, 15000);
  } catch (err) {
    icsResult = `ICS_FAILED: ${err.message}`;
  }

  return { hostedNetwork: startResult, ics: icsResult };
}

async function stopHotspot() {
  return execAsync('netsh wlan stop hostednetwork');
}

async function hotspotStatus() {
  return execAsync('netsh wlan show hostednetwork');
}

module.exports = { startHotspot, stopHotspot, hotspotStatus };
