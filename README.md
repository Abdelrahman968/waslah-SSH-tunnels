# Waslah (وصلة)

A desktop app built with Electron for managing and running SSH tunnels with
SNI bypass support, turning them into a real system-wide VPN on Windows via
a TUN adapter.

## Features

- **Multiple profiles**: save more than one SSH account and switch between
  them easily.
- **One-line quick add**: `host:port@user:pass` (port is optional, defaults
  to 443), with support for `#sni.host` to add an SNI on the same line.
- **SNI / TLS bypass**: routes the connection through a TLS handshake with a
  custom SNI before it reaches SSH, for networks that filter at the
  DNS/SNI level.
- **Real system-wide VPN**: not just a proxy — all of the device's traffic
  goes through the tunnel via `tun2socks` + Wintun.
- **Kill Switch**: if the tunnel drops unexpectedly, the internet is cut off
  completely instead of leaking traffic outside the VPN.
- **Auto-reconnect** with a configurable number of attempts and interval.
- **Password encryption** locally via `safeStorage` (DPAPI on Windows).
- **Import/export profiles** as a JSON file.
- **Connection test** (ping) before saving or connecting to any profile.
- **Live stats**: connection duration, download/upload, tunnel status with
  an interactive visual.
- **System Tray**: close the window without closing the connection, with
  quick controls from the tray.
- **Full technical logs** for every stage: SSH → SOCKS5 → TUN/VPN.
- **"About the Developer" page** with GitHub and portfolio links.

## Running (Development)

```bash
npm install
npm start
```

> On Windows, run the terminal/IDE with Administrator privileges so the VPN
> part (TUN adapter + routing changes) works correctly.

## Files you need to set up manually

See `bin/README.md` — you'll need `tun2socks.exe` and `wintun.dll` for the
full system-wide VPN feature. Without them, the app still works as a
regular SSH + SOCKS5 proxy.

## Building an installer (.exe)

```bash
npm run build
```

The output will be in `dist/`.

## Structure

```
main/
  main.js              Electron main process + IPC + Tray
  preload.js           Secure bridge between main and renderer
  store/profileStore.js Profile storage + password encryption
  utils/parser.js       Quick-add format parser
  ssh/sshTunnel.js       SSH connection + SNI/TLS support
  ssh/socksProxy.js      Local SOCKS5 proxy over the tunnel
  ssh/vpnManager.js      TUN adapter + routing + kill switch
  ssh/connectionManager.js Coordinates everything + auto-reconnect
renderer/
  index.html / css / js  UI (Dashboard, Profiles, Logs, Settings, About)
bin/                      Where tun2socks.exe and wintun.dll go (not included)
```

## Disclaimer

This tool is technically just regular SSH tunneling (the same idea as
`ssh -D`) wrapped in a GUI, and contains no hacking or security bypass of
any kind. Using it to get around a particular network's filtering may
violate your service provider's terms of use — that responsibility is on
the user.

---

Built by **Abdelrahman Ayman** Egypt 🇪🇬
