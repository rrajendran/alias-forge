# Application Icons

This directory contains application icons for all platforms.

## Required Icons

### macOS
- `icon.icns` - macOS icon bundle (1024×1024 recommended)
- Multi-resolution icon file for macOS apps

### Windows
- `icon.ico` - Windows icon file
- Should include multiple sizes: 256, 128, 64, 32, 16

### Linux
- `icon.png` - Main icon (512×512 recommended)
- Additional sizes in subdirectories if needed

### Tray Icons
- `tray-icon.png` - Menubar/tray icon (16×16 or 24×24)
- `tray-icon-light.png` - Light variant for dark menubars
- `tray-icon-dark.png` - Dark variant for light menubars

## Icon Design

Base concept (from instructions):
- Shape: Rounded square tile
- Background: Dark slate gradient (#1E1E1E → #252526)
- Foreground: Terminal-style `>` with link/anvil/forge motif
- Accent: Blue (#007ACC)

## Generating Icons

You can use tools like:
- `electron-icon-builder` npm package
- Online icon generators
- Design tools like Figma, Sketch, or Photoshop

Example command:
```bash
npx electron-icon-builder --input=./icon-source.png --output=./assets/icons
```

## Placeholder

Currently, this directory contains placeholder notes. Replace with actual icon files before building for production.
