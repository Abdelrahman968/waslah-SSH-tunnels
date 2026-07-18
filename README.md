# Waslah

**Waslah** is a Windows desktop client for connecting through SSH tunnels, with SNI-based TLS fronting for networks that filter by SNI. Built with Electron.

> Waslah is a personal networking utility comparable to apps like NetMod or HTTP Injector: it opens a tunnel from an SSH account you already have, optionally disguises the TLS handshake behind a different SNI hostname, and turns that into a full system-wide VPN via `tun2socks` + Wintun.

---

## Features

### Core tunneling
- **SSH tunnel client** with username/password auth, optional SNI/TLS fronting to bypass SNI-based network filtering.
- **Quick-add profiles** using the compact format `host:port@user:pass` (port optional, defaults to 443) with an optional `#sni.host` suffix.
- **System-wide VPN** — the SSH tunnel routes through `tun2socks` + Wintun, not just a local proxy, so all traffic on the machine goes through the tunnel.
- **Kill switch** — blocks all internet traffic if the tunnel drops unexpectedly, instead of silently falling back to the unprotected connection.
- **Auto-reconnect** with a configurable retry count and interval.
- **SNI Auto-Failover** (optional) — on an unexpected drop, live-tests a list of SNI candidates against the server and switches to the fastest working one before retrying.
- **Destination-based split tunneling** — exclude specific IPs/CIDRs from the tunnel so they route via the normal connection instead. (Note: this is destination-based, not per-application; true per-process routing would require a kernel-level driver this project doesn't bundle.)

### SNI management
- Reusable SNI list with favorites and a settable "default SNI" applied automatically to any profile that doesn't specify its own.
- **SNI Auto-Tester** — live-tests your saved SNI list plus a curated seed list against a target server and ranks them by real handshake latency on your current network.
- Per-connection SNI override selectable directly from the main dashboard, without editing the saved profile.

### Profiles
- Full CRUD: add, edit, duplicate, delete.
- Encrypted password storage at rest via Electron's `safeStorage` (Windows DPAPI), with an AES-256-GCM fallback.
- Import/export profiles as JSON.
- Full backup & restore (profiles + SNI list + settings) as a single file.

### Network tools
- What's My IP, DNS Lookup, TCP Ping, HTTP Ping, Port Scanner (capped at 1000 ports per scan), Traceroute, SSL Certificate Checker, Whois (root + registry referral, handles both `refer:` and `whois:` IANA fields), Base64 / URL encode-decode, download speed test, and a DNS leak checker (compares your public IP against your active DNS resolver's apparent IP).
- Curated list of known free SSH account providers with direct links.

### Internet sharing
- One-click shortcut to Windows' built-in Mobile Hotspot settings (the reliable path).
- Experimental advanced path using the legacy Hosted Network API + ICS, with friendly error messages when the Wi-Fi adapter/driver doesn't support it (common on newer hardware).

### Reliability & diagnostics
- Structured, searchable, filterable logs (by category and status) with export, clear, and an enable/disable toggle.
- Connection history — every session logged with protocol, profile, start/end time, duration, and disconnect reason.
- Per-profile cumulative data usage tracking for SSH connections.
- Desktop notifications on connect/disconnect/error (toggleable).

### App-level
- Bilingual UI: English (default) and Arabic (full RTL layout, Cairo font).
- Light and dark themes.
- Automatic Administrator-privilege check with an in-app "Restart as Administrator" prompt (never silently exits — the window always opens so failures are visible).
- System tray integration; configurable minimize-to-tray-on-close behavior.
- Settings reset to defaults.

---

## Requirements

- Windows 10/11 (the VPN/TUN and hotspot features are Windows-only; the SSH tunnel logic itself is cross-platform but the packaged app targets Windows).
- [Node.js](https://nodejs.org/) and npm, for building from source.
- Administrator privileges at runtime (the app will prompt for this automatically).

### External binaries (not bundled — see `bin/README.md`)
| File | Needed for | Source |
|---|---|---|
| `tun2socks.exe` | System-wide VPN | [xjasonlyu/tun2socks](https://github.com/xjasonlyu/tun2socks/releases) |
| `wintun.dll` | TUN adapter driver | [wintun.net](https://www.wintun.net/) |

Without these, SSH tunneling + local SOCKS5 proxying still works; only the full system-wide VPN step requires them.

---

## Getting started

```bash
git clone <this-repo>
cd waslah
npm install
npm start
```

On first launch, if the app isn't running elevated, a red banner appears with a **Restart as Administrator** button — click it and accept the UAC prompt.

### Building an installer

```bash
npm run build
```

Produces a Windows installer in `dist/` via `electron-builder`.

---

## Project structure

```
main/
  main.js                 Electron main process, window/tray, all IPC handlers
  preload.js               contextBridge API exposed to the renderer
  logger/logger.js         In-memory structured log ring buffer
  store/
    profileStore.js        Encrypted profile storage, settings, SNI list,
                            connection history, data usage
    sshProviders.js         Static list of free SSH providers
  utils/
    parser.js               Quick-add string parser
    qrDecoder.js             QR code image decoding
  ssh/
    sshTunnel.js             SSH connection + SNI/TLS fronting
    socksProxy.js             Local SOCKS5 proxy over the SSH tunnel
    vpnManager.js              tun2socks/TUN adapter + routing + kill switch
    connectionManager.js        Orchestrates SSH → SOCKS → VPN, reconnect,
                                 SNI auto-failover
    vlessConnectionManager.js    Orchestrates xray-core → VpnManager
  net/
    networkTools.js            DNS/ping/port-scan/whois/traceroute/etc.
    sniTester.js                 Live SNI candidate testing
    hotspot.js                    Windows internet sharing (Hosted Network + ICS)

renderer/
  index.html / css / js       UI: Dashboard, Profiles, SNI Manager,
                               Network Tools, Hotspot, Logs, Settings, About
  i18n/en.json, ar.json        Translation dictionaries
  fonts/Cairo-Variable.ttf      Arabic UI font

bin/                          Place tun2socks.exe / wintun.dll / xray.exe here
```

---

## Known limitations

- **Split tunneling is destination-based, not per-application.** Excluding a specific app's traffic from the tunnel would require a kernel-level packet filter driver (similar in spirit to WinDivert), which isn't part of this project.
- **VLESS data usage isn't tracked yet.** The SSH path counts bytes through Waslah's own local SOCKS proxy; the VLESS path uses `xray-core`'s own SOCKS inbound directly, which isn't wrapped by that counter. Reading `xray-core`'s stats API is a separate, scoped piece of future work.
- **Hosted Network hotspot sharing depends on Wi-Fi driver support**, which many newer adapters (especially Wi-Fi 6/6E) have dropped. The in-app shortcut to Windows' native Mobile Hotspot settings is the reliable fallback.
- **Windows only.** The VPN/TUN integration, hotspot sharing, and Administrator-elevation flow all use Windows-specific APIs (`netsh`, `route`, PowerShell COM automation).
- This is not an Android/iOS app. Electron only builds desktop apps; a mobile version would be a separate, ground-up project using each platform's native VPN APIs.

---

## Disclaimer

SNI-based TLS fronting and SSH tunneling are standard networking techniques, not exploits — this app doesn't perform any unauthorized access. Using it to route around a specific network's filtering may still be against that network's or ISP's terms of service depending on where you are; that's on the user to check.

---

## License

MIT — see `package.json`.

## Author

**Abdelrahman Ayman** — Frontend Developer (React / Next.js)
[Portfolio](https://abdelrahman-portfolio-rho.vercel.app) · [GitHub](https://github.com/Abdelrahman968) · [LinkedIn](https://linkedin.com/in/abdelrahman968)
