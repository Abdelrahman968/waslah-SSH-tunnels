# `bin/` Folder --- Files You Need to Download Manually

This folder requires three executable files. They are **not included**
in the project due to their size and licensing reasons.

## 1) `tun2socks.exe`

Download it from the official releases:

https://github.com/xjasonlyu/tun2socks/releases

Choose the **Windows** version, extract the archive, and place
`tun2socks.exe` inside the `bin/` folder.

## 2) `wintun.dll`

Download it from the official website:

https://www.wintun.net/

Select the `amd64/wintun.dll` version and place it in the same `bin/`
folder next to `tun2socks.exe`.

## 3) `xray.exe` (Required only for VLESS/V2Ray)

Download it from the official Xray-core releases:

https://github.com/XTLS/Xray-core/releases

Choose `Xray-windows-64.zip`, extract it, and place `xray.exe` inside
the `bin/` folder.

If this file is missing, **SSH connections will continue to work
normally**, but any attempt to connect using **VLESS** will fail with a
clear `XRAY_BINARY_MISSING` message in the application log.

---

## Important Notes

- The application **must be run as Administrator**. If it is not
  running with administrator privileges, a red banner will appear at
  the top of the application with a **"Restart as Administrator"**
  button that automatically triggers the UAC prompt.
- If you only want to use a **SOCKS5 proxy** (without a full VPN), an
  SSH connection opens a local SOCKS5 proxy on `127.0.0.1:10808`,
  while a VLESS connection opens one on `127.0.0.1:10809`. You can
  configure any browser or application to use these addresses directly
  without requiring `tun2socks` or `wintun`.
