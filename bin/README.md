# bin/ folder — files you need to download manually

For the real, system-wide VPN feature (via a TUN adapter) to work, you need
to place 2 files in this folder (not included in the project due to their
size and licensing reasons):

## 1) tun2socks.exe

Download it from the official releases here:
https://github.com/xjasonlyu/tun2socks/releases

Pick the Windows build (e.g. `tun2socks-windows-amd64.zip`), extract it,
and put `tun2socks.exe` here in `bin/`.

## 2) wintun.dll

Download it from the official site:
https://www.wintun.net/

Extract it, pick the `amd64/wintun.dll` build, and place it next to
`tun2socks.exe` in the same `bin/` folder.

---

## Important notes

- The app must run with **Administrator** privileges (this is set
  automatically in `package.json` via
  `requestedExecutionLevel: requireAdministrator`), since creating a TUN
  adapter and changing the routing table require admin rights.
- If the two files aren't present, the app can still make a regular
  SSH + SOCKS proxy connection, but the step that turns it into a full
  system-wide VPN will fail with a clear message on the Logs page.
- If you'd rather use just the SOCKS proxy (lighter and simpler) instead
  of the full VPN, you can point any browser/app that supports SOCKS5 at
  `127.0.0.1:10808` after connecting from the app, without needing these
  two files at all.
