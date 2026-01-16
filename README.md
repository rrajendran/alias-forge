# AliasForge

**Shape your shortcuts once, use them everywhere.**

AliasForge is a cross-platform desktop application for managing shell and CLI aliases across macOS, Windows, and Linux. Define your aliases once and map them to platform-specific commands for zsh, bash, fish, PowerShell, and cmd.

## Features

- **Cross-Platform**: Works on macOS, Windows, and Linux
- **Multiple Shells**: Support for zsh, bash, fish, PowerShell, and cmd
- **VS Code-Style UI**: Familiar dark/light themed interface
- **Profile Management**: Organize aliases into profiles
- **Safe Export**: Backup and rollback capabilities
- **Secure**: Built with Electron security best practices

## Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Run with DevTools
npm run dev
```

### Building

```bash
# Build for current platform
npm run build

# Build for specific platform
npm run build:mac
npm run build:win
npm run build:linux
```

## Project Structure

```
alias-forge/
├── src/
│   ├── main/           # Main process (Node.js)
│   ├── preload/        # Preload scripts (secure bridge)
│   └── renderer/       # Renderer process (UI)
├── static/
│   ├── css/            # Stylesheets
│   └── js/             # UI JavaScript
├── assets/
│   └── icons/          # Application icons
└── package.json
```

## Security

This application follows Electron security best practices:

- ✅ Context isolation enabled
- ✅ Node integration disabled in renderer
- ✅ Sandbox enabled
- ✅ No remote module usage
- ✅ Secure IPC with whitelist
- ✅ Input validation in main process

## Development

### Architecture

- **Main Process**: Handles file I/O, OS integration, and secure IPC handlers
- **Preload Script**: Exposes minimal, explicit APIs via contextBridge
- **Renderer Process**: UI logic only, no direct Node.js access

### Key Technologies

- Electron 28+
- Node.js
- Pug (templating)
- Modern CSS with CSS variables
- Vanilla JavaScript (no frameworks)

## Contributing

Contributions are welcome! Please read the instructions files in `.github/instructions/` for coding guidelines.

## License

MIT License - see LICENSE file for details

## Credits

Built with ❤️ for developers and power users who want their aliases everywhere.
