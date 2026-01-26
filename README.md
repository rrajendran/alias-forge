# AliasForge

**Shape your shortcuts once, use them everywhere.**

AliasForge is a cross-platform desktop application for managing shell and CLI aliases across macOS, Windows, and Linux. Define your aliases once and map them to platform-specific commands for zsh, bash, fish, PowerShell, and cmd.

## Features

### Core Functionality
- **Cross-Platform**: Works on macOS, Windows, and Linux
- **Multiple Shells**: Support for zsh, bash, fish, PowerShell, and cmd
- **Beautiful Themes**: Four built-in themes (Dark, Light, Sunset Glow, Forest Canopy) with dynamic theme switching
- **Profile Management**: Organize aliases into profiles
- **Safe Export**: Backup and rollback capabilities
- **Secure**: Built with Electron security best practices

### Alias Management
- **Create & Edit**: Intuitive modal dialog for managing aliases
- **Enable/Disable**: Toggle aliases on/off without deletion
- **Tags**: Organize aliases with multiple tags per alias
- **Search**: Real-time search across alias names, commands, and descriptions
- **Tag Filtering**: Filter aliases by tags with visual chips
- **Sorting**: Sort by name, description, or enabled status
- **Pagination**: Navigate large alias collections efficiently
- **Drag-to-Resize**: Adjustable sidebar width

### Bulk Operations
- **Bulk Selection**: Select multiple aliases with checkboxes
- **Select All**: Select all aliases across pages (with tri-state checkbox)
- **Filter-Aware**: Bulk actions respect active search and tag filters
- **Update Tags**: Add or remove tags from multiple aliases at once
  - Visual tag display with counts
  - Remove individual tags with one click
  - Autocomplete with keyboard navigation (↑↓ arrows, Enter, Escape)
- **Update Prefix**: Add, replace, or remove prefixes for alias names
  - Automatic prefix detection from selected aliases
  - Replace mode: swap existing prefix with new one
  - Remove mode: leave input empty to remove detected prefix
- **Enable/Disable**: Toggle multiple aliases in one action
- **Delete**: Remove multiple aliases with confirmation
- **Remove Duplicates**: Automatically find and remove duplicate aliases (same name and command)

### Import & Export
- **Import from Shell**: Load existing aliases from shell configuration
- **Import from File**: Import aliases from JSON with validation
  - Comprehensive validation with detailed error reporting
  - Duplicate detection and prevention
  - Continue with valid aliases or exit on errors
  - Line-by-line error tracking
- **Export to Shell**: Save aliases to shell configuration files
- **Export to File**: Download aliases as JSON with metadata
- **Auto-Export**: Changes automatically sync to shell configuration

### User Experience
- **Statistics**: View total aliases, enabled count, and duplicate count
- **Tag Autocomplete**: Smart suggestions while typing tags (both in edit and bulk dialogs)
- **Keyboard Navigation**: Navigate autocomplete with arrow keys
- **Dynamic Theming**: Choose from 4 built-in themes with persistent preferences
  - Dark: Modern dark theme with soft contrasts and vibrant accents
  - Light: Clean light theme with soft backgrounds and vibrant accents
  - Sunset Glow: Warm sunset theme with golden amber tones
  - Forest Canopy: Nature theme with earthy greens and natural tones
- **Theme Manager**: Dynamic theme loading and custom theme support
- **Themed Dialogs**: All UI elements respect the active theme
- **Toast Notifications**: Clear feedback for all operations
- **Confirmation Dialogs**: Safe guards for destructive actions
- **Responsive Design**: Optimized for various screen sizes
- **Resizable Sidebar**: Drag to adjust sidebar width with persistent sizing
- **Empty States**: Helpful prompts when no aliases exist

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

## Usage

### Getting Started

1. **Import Existing Aliases**: Click "Import" → "Import from Shell" to load your current shell aliases
2. **Create New Alias**: Click "+ New Alias" to create a new alias
3. **Add Tags**: Use tags to organize your aliases (e.g., "git", "docker", "productivity")
4. **Export to Shell**: Click "Save" → "Save to Shell" to write aliases to your shell configuration

### Bulk Operations

1. **Select Aliases**: Click checkboxes next to aliases you want to modify
2. **Select All**: Use the checkbox in the table header to select all filtered aliases
3. **Choose Action**: Click "Bulk Actions" and select:
   - **Update Tags**: Add or remove tags from all selected aliases
   - **Update Prefix**: Add/replace/remove name prefixes (e.g., `dev_`, `prod_`)
   - **Enable/Disable**: Toggle multiple aliases at once
   - **Remove Duplicates**: Find and remove duplicate aliases automatically
   - **Delete**: Remove selected aliases (with confirmation)

### Advanced Features

#### Keyboard Shortcuts
- **Escape**: Close dialogs and autocomplete dropdowns
- **Arrow Keys**: Navigate tag autocomplete suggestions
- **Enter**: Select highlighted autocomplete item
- **Tab**: Switch between form fields

#### Import Validation
When importing from file, the app validates:
- Required fields (id, name)
- Data types (tags as array, enabled as boolean)
- Duplicates (prevents importing aliases that already exist)

If validation fails, you can:
- **Exit**: Cancel the import completely
- **Continue**: Import only the valid aliases

#### Prefix Management
The Update Prefix feature detects common prefixes and allows you to:
- **Add**: Prepend a new prefix to all selected aliases
- **Replace**: Swap an existing prefix with a new one
- **Remove**: Leave input empty to remove the detected prefix

### File Format

Exported JSON structure:
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

## Project Structure

```
alias-forge/
├── src/
│   ├── main/           # Main process (Node.js)
│   ├── preload/        # Preload scripts (secure bridge)
│   └── renderer/       # Renderer process (UI)
├── static/
│   ├── css/            # Stylesheets and theme files
│   │   ├── themes/     # Theme CSS files (Dark, Light, Sunset Glow, Forest Canopy)
│   │   └── main.css    # Core application styles
│   └── js/             # UI JavaScript
│       ├── main.js             # Main application logic
│       ├── theme-manager.js    # Dynamic theme management
│       └── sidebar-manager.js  # Sidebar resize functionality
├── tests/
│   └── main.test.js    # Jest unit tests
├── coverage/           # Test coverage reports
├── assets/
│   └── icons/          # Application icons (mac, win, png)
├── data/
│   └── aliases.example.json  # Example aliases file
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

## Testing

AliasForge includes a comprehensive test suite using Jest:

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Coverage

The test suite covers:
- Window creation and configuration
- IPC handlers (settings, aliases, shell detection, file operations)
- Utility functions (path validation, shell config detection)
- Error handling and edge cases
- Async operations (file I/O, command execution)

Coverage target: 80%+ across all major code paths.

Coverage reports are generated in the `coverage/` directory:
- HTML report: `coverage/lcov-report/index.html`
- JSON report: `coverage/coverage-final.json`
- LCOV format: `coverage/lcov.info`

## Development

### Architecture

- **Main Process**: Handles file I/O, OS integration, and secure IPC handlers
- **Preload Script**: Exposes minimal, explicit APIs via contextBridge
- **Renderer Process**: UI logic only, no direct Node.js access

### Key Technologies

- **Electron 28+**: Desktop application framework
- **Node.js**: Backend runtime
- **Pug**: HTML templating engine
- **Modern CSS**: CSS variables, custom themes, responsive design
- **Vanilla JavaScript**: No frameworks, modular architecture
- **Jest 30+**: Testing framework with coverage reporting
- **electron-updater**: Auto-update functionality
- **electron-log**: Centralized logging

## Contributing

Contributions are welcome! Please read the instructions files in `.github/instructions/` for coding guidelines.

## License

MIT License - see LICENSE file for details

## Credits

Built with ❤️ for developers and power users who want their aliases everywhere.
