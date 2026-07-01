# Waslah

<div align="center">

<img src="assets/icon.png" width="128" alt="Waslah Logo">

# Waslah (وصلة)

**A modern Electron-powered SSH tunneling client with SNI support, system-wide VPN capabilities, advanced networking tools, and a clean multilingual interface.**

![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge)
![Electron](https://img.shields.io/badge/Electron-Latest-47848F?style=for-the-badge&logo=electron)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Language](https://img.shields.io/badge/Languages-English%20%7C%20العربية-success?style=for-the-badge)

_A lightweight yet powerful SSH manager designed to simplify secure tunneling while delivering a modern desktop experience._

</div>

---

# ✨ Overview

Waslah is a desktop application built with **Electron** that allows you to create and manage encrypted SSH tunnels with optional **TLS/SNI encapsulation**.

Unlike traditional SSH clients, Waslah combines SSH profile management, networking utilities, VPN routing, multilingual support, encrypted local storage, and a modern UI into a single application.

The application can operate as:

- Secure SSH Tunnel
- SOCKS5 Proxy
- System-wide VPN (via tun2socks + Wintun)
- Network Diagnostic Toolkit
- SSH Profile Manager

---

# 🚀 Features

## 🔐 SSH Management

- Unlimited SSH profiles
- One-click connect/disconnect
- Quick profile import

```
host:port@username:password#sni
```

- Password visibility toggle
- Duplicate profile detection
- Favorites
- Search & filtering
- Import / Export profiles
- Automatic reconnect
- Connection timeout handling
- Connection duration tracking

---

## 🌐 SNI Manager

Organize and reuse SNI hosts across multiple profiles.

Features include:

- Global default SNI
- Favorite SNIs
- Search
- Edit/Delete
- One-click assignment
- Automatic validation

---

## 🛡 True System-Wide VPN

Powered by:

- Wintun
- tun2socks

Capabilities:

- Full system routing
- Kill Switch
- Automatic routing restoration
- DNS forwarding
- Auto reconnect
- Automatic cleanup
- Live traffic statistics

---

## ⚡ SOCKS5 Proxy

Every SSH connection can expose a local SOCKS5 proxy.

Supports:

- Custom local ports
- Browser proxy
- Game launcher proxy
- Command-line applications
- IDEs
- Git
- npm
- curl
- PowerShell

---

## 📡 VLESS / V2Ray Configuration Manager

Manage VLESS configurations without external tools.

Supported:

- Import from vless://
- Import JSON
- QR Code scanning
- Configuration validation
- Export
- Edit
- Delete

> **Note**
>
> This module currently manages configurations only.
> Native VLESS/V2Ray connections are planned for future releases.

---

## 🧰 Network Toolkit

Built-in networking utilities include:

- What's My IP
- DNS Lookup
- TCP Ping
- HTTP Ping
- Port Scanner
- SSL Certificate Checker
- Traceroute
- Whois Lookup
- Base64 Encode / Decode
- URL Encode / Decode

Everything is available directly inside the application.

---

## 📊 Live Dashboard

Real-time statistics including:

- Connection state
- Upload speed
- Download speed
- Session duration
- Active profile
- Last events
- Current IP
- VPN status

---

## 📄 Logging System

Powerful logging designed for troubleshooting.

Supports:

- Categories
- Severity levels
- Search
- Filtering
- Export
- Clear logs
- Enable/Disable
- Recent dashboard events

---

## 🌍 Localization

Fully multilingual.

Languages:

- 🇺🇸 English
- 🇪🇬 العربية (RTL)

Switch languages instantly without restarting the application.

---

## 🎨 Modern UI

Designed with productivity in mind.

Features:

- Dark Mode
- Light Mode
- Responsive layout
- Smooth animations
- Keyboard shortcuts
- Dashboard widgets
- Modern cards
- Status indicators

---

## 🔒 Security

Security is one of Waslah's core priorities.

### Password Encryption

Passwords are encrypted locally using:

```
Electron safeStorage
```

Sensitive information is never stored as plain text.

### Local Storage

- No cloud synchronization
- No telemetry
- No tracking
- No external credential storage

Everything remains on the user's computer.

---

# 📦 Installation

Clone the repository

```bash
git clone https://github.com/yourusername/waslah.git
```

Install dependencies

```bash
npm install
```

Run

```bash
npm start
```

---

# ⚠ Administrator Privileges

Waslah automatically requests Administrator permissions (Windows UAC) when launched.

Administrator rights are required for:

- Wintun
- Route management
- VPN mode
- DNS routing
- Kill Switch

SSH-only mode works normally without VPN functionality.

---

# 📁 Required External Files

The following binaries must be placed inside:

```
bin/
```

Required files:

```
tun2socks.exe
wintun.dll
```

Without these binaries:

✅ SSH Tunnel works

✅ SOCKS5 works

❌ System-wide VPN unavailable

---

# 🏗 Build

Create a Windows installer:

```bash
npm run build
```

Output:

```
dist/
```

---

# 📂 Project Structure

```
Waslah/

├── main/
│   ├── main.js
│   ├── preload.js
│   ├── store/
│   │   └── profileStore.js
│   ├── ssh/
│   │   ├── sshTunnel.js
│   │   ├── socksProxy.js
│   │   ├── vpnManager.js
│   │   └── connectionManager.js
│   └── utils/
│       └── parser.js
│
├── renderer/
│   ├── index.html
│   ├── css/
│   └── js/
│
├── assets/
│
├── bin/
│
├── package.json
│
└── README.md
```

---

# 🛠 Technology Stack

| Technology | Purpose           |
| ---------- | ----------------- |
| Electron   | Desktop Framework |
| Node.js    | Backend Runtime   |
| SSH2       | SSH Client        |
| Wintun     | TUN Adapter       |
| tun2socks  | VPN Routing       |
| HTML5      | UI                |
| CSS3       | Styling           |
| JavaScript | Application Logic |

---

# 🗺 Roadmap

## Upcoming Features

- Native VLESS Engine
- VMess Support
- Trojan Support
- WireGuard Support
- OpenVPN Support
- Plugin System
- Bandwidth Graphs
- Split Tunneling
- Auto Update
- Connection Scheduler
- SSH Key Authentication
- Multi-Hop SSH
- Plugin Marketplace
- Profile Synchronization
- Portable Mode
- Linux Support
- macOS Support

---

# 🤝 Contributing

Contributions are welcome.

You can help by:

- Reporting bugs
- Suggesting new features
- Improving documentation
- Creating pull requests
- Translating the application

---

# 📜 Disclaimer

Waslah is a graphical frontend for standard SSH tunneling technologies.

It does **not** exploit security vulnerabilities, bypass authentication mechanisms, or perform unauthorized access.

The software is intended for:

- Secure remote access
- Privacy
- Development
- Network diagnostics
- Educational purposes

Users are solely responsible for complying with the laws, regulations, and terms of service applicable in their jurisdiction.

---

# 📄 License

Licensed under the **MIT License**.

See the **LICENSE** file for details.

---

# ❤️ Credits

Built with ❤️ using:

- Electron
- Node.js
- SSH2
- Wintun
- tun2socks

---

<div align="center">

## Waslah

**Fast • Secure • Modern**

Designed & Developed by

# Abdelrahman Ayman

**MERN Stack Developer**

🇪🇬 Dakahlia, Egypt

</div>
