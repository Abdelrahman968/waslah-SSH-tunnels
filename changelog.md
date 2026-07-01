# Changelog

All notable changes to this project will be documented in this file.

The format follows the principles of Keep a Changelog and Semantic Versioning.

---

## [1.0.0] - 2026-07-01

### Initial Public Release

This is the first public release of **Waslah**, introducing a modern Electron-based SSH tunneling client with multilingual support, integrated networking tools, and a clean desktop experience.

### Added

#### SSH Management

- SSH profile management
- Unlimited SSH profiles
- One-click connect and disconnect
- Quick profile import using:
  ```
  host:port@username:password#sni
  ```
- Profile search and filtering
- Favorite profiles
- Duplicate profile detection
- Import and export functionality
- Automatic reconnect
- Connection timeout handling
- Session duration tracking

#### SNI Manager

- Reusable SNI host manager
- Global default SNI
- Favorite SNIs
- Search support
- Edit and delete functionality
- One-click profile assignment
- Automatic SNI validation

#### VPN Support

- Wintun integration
- tun2socks integration
- System-wide VPN mode
- Kill Switch
- Automatic route restoration
- DNS forwarding
- Automatic cleanup
- Automatic reconnect
- Live traffic statistics

#### SOCKS5 Proxy

- Built-in SOCKS5 proxy server
- Configurable local proxy port
- Compatible with browsers, IDEs, Git, npm, curl, PowerShell, and other SOCKS-compatible applications

#### VLESS Configuration Manager

- Import from `vless://` links
- Import JSON configurations
- QR Code configuration import
- Configuration validation
- Export, edit, and delete configurations

> Note: Native VLESS connections are planned for a future release.

#### Network Toolkit

- Public IP checker
- DNS Lookup
- TCP Ping
- HTTP Ping
- Port Scanner
- SSL Certificate Checker
- Traceroute
- Whois Lookup
- Base64 Encode / Decode
- URL Encode / Decode

#### Dashboard

- Real-time connection monitoring
- Upload and download statistics
- Session timer
- VPN status
- Current IP display
- Active profile information
- Recent activity panel

#### Logging

- Categorized logging
- Severity levels
- Search and filtering
- Log export
- Log clearing
- Dashboard event history

#### Localization

- English language support
- Arabic (RTL) language support
- Instant language switching without restarting

#### User Interface

- Modern dashboard
- Responsive layout
- Dark mode
- Light mode
- Keyboard shortcuts
- Animated interface
- Status indicators

#### Security

- Password encryption using Electron safeStorage
- Secure local credential storage
- No telemetry
- No tracking
- No cloud synchronization

### Build

- Initial Windows desktop release
- Electron-based architecture
- Windows installer generated with Electron Builder

### Known Limitations

- Native VLESS engine is not yet implemented.
- VMess, Trojan, WireGuard, and OpenVPN support will be added in future releases.
- Windows is currently the only supported platform.

### Acknowledgements

Special thanks to everyone who tested the application and provided feedback during development.

---

**Waslah v1.0.0** is the first stable public release and provides the foundation for future protocol support, platform expansion, and advanced networking capabilities.
