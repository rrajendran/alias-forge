# 🚀 AliasForge v0.0.1 - Initial Release

**Shape your shortcuts once, use them everywhere.**

We're excited to announce the initial release of AliasForge, a cross-platform desktop application for managing shell and CLI aliases across macOS, Windows, and Linux.

## ✨ What's New

### 🎯 Core Features
- **Cross-Platform Support**: Native builds for macOS, Windows, and Linux
- **Multi-Shell Compatibility**: Support for zsh, bash, fish, PowerShell, and cmd
- **Beautiful Theming**: Four built-in themes (Dark, Light, Sunset Glow, Forest Canopy)
- **Profile Management**: Organize aliases into customizable profiles
- **Secure Architecture**: Built with Electron security best practices

### 🏷️ Alias Management
- **Intuitive Interface**: Clean, modal-based alias creation and editing
- **Enable/Disable Toggle**: Quickly enable or disable aliases without deletion
- **Tag Organization**: Organize aliases with multiple tags and visual filtering
- **Real-time Search**: Search across alias names, commands, and descriptions
- **Advanced Sorting**: Sort by name, description, or enabled status
- **Pagination**: Efficient navigation through large alias collections
- **Resizable Sidebar**: Drag-to-resize sidebar with persistent sizing

### ⚡ Bulk Operations
- **Smart Selection**: Select multiple aliases with checkboxes and "Select All" functionality
- **Tag Management**: Add or remove tags from multiple aliases simultaneously
- **Prefix Operations**: Add, replace, or remove prefixes from alias names
- **Bulk Enable/Disable**: Toggle multiple aliases in one action
- **Duplicate Removal**: Automatically find and remove duplicate aliases
- **Safe Deletion**: Confirmation dialogs for destructive operations

### 📥📤 Import & Export
- **Shell Integration**: Import existing aliases from shell configuration files
- **File Import**: Import aliases from JSON with comprehensive validation
- **Shell Export**: Export aliases back to shell configuration files
- **JSON Export**: Download aliases as JSON with metadata
- **Auto-Sync**: Changes automatically sync to shell configuration

### 🎨 User Experience
- **Statistics Dashboard**: View total aliases, enabled count, and duplicate statistics
- **Tag Autocomplete**: Smart tag suggestions with keyboard navigation
- **Toast Notifications**: Clear feedback for all operations
- **Responsive Design**: Optimized for various screen sizes
- **Empty States**: Helpful prompts and guidance

## 🛠️ Technical Highlights

- **Electron 28+**: Modern desktop application framework
- **Security First**: Context isolation, sandboxing, and secure IPC
- **Comprehensive Testing**: Jest test suite with 80%+ coverage
- **Auto-Updates**: Built-in update mechanism with platform-specific handling
- **Cross-Platform Builds**: Native installers for all major platforms

## 📦 Installation

### Prerequisites
- Node.js 18 or higher
- npm or yarn

### Quick Start
```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build for your platform
npm run build
```

## 🎯 Getting Started

1. **Import Existing Aliases**: Click "Import" → "Import from Shell" to load your current aliases
2. **Create New Aliases**: Use the "+ New Alias" button to create shortcuts
3. **Organize with Tags**: Add tags like "git", "docker", "productivity" to categorize aliases
4. **Export to Shell**: Save your aliases to make them available in your terminal

## 🔧 Supported Platforms

- **macOS**: `.dmg` installer with native integration
- **Windows**: `.exe` installer with system integration
- **Linux**: `.deb`, `.rpm`, and `.AppImage` packages

## 🧪 Quality Assurance

- **Unit Tests**: Comprehensive Jest test suite
- **Security**: Follows Electron security best practices
- **Validation**: Input validation and error handling throughout
- **Backup**: Safe export with rollback capabilities

## 📋 File Format

Aliases are stored in a structured JSON format:
```json
{
  "version": "1.0",
  "exportDate": "2026-01-26T...",
  "aliases": [
    {
      "id": "unique-id",
      "name": "alias-name",
      "description": "Description",
      "tags": ["tag1", "tag2"],
      "enabled": true,
      "command": "the actual command",
      "profile": "default"
    }
  ]
}
```

## 🤝 Contributing

We welcome contributions! Check out our coding guidelines in `.github/instructions/` for development setup and contribution guidelines.

## 📄 License

Released under the MIT License. See LICENSE file for details.

## 🙏 Acknowledgments

Built with ❤️ for developers and power users who want their aliases everywhere. Special thanks to the Electron community and all contributors.

---

**Ready to streamline your command-line workflow? Download AliasForge and take control of your aliases!**

#️⃣ #AliasForge #CrossPlatform #ShellAliases #DeveloperTools #Productivity