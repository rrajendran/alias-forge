Below is an `INSTRUCTIONS.md`-style document written with a relaxed “vibe coding” tone, based on the requirements defined previously.

---

# AliasForge – INSTRUCTIONS

Shape your shortcuts once, use them everywhere.

This document explains what AliasForge is, how it should feel, and what needs to be built. Treat it as the north star while coding.

---

## 1. What we’re building

AliasForge is a cross‑platform desktop app (macOS, Windows, Linux) for managing shell and CLI aliases in one place.
Users define aliases once, then map them to platform‑specific commands for zsh/bash/fish/PowerShell/cmd.

- Tech stack: Electron (Node), Pug templates, modern CSS.
- Vibe: VS Code–style interface with dark/light themes and a clean, developer‑friendly flow.

---

## 2. Naming, tagline, and identity

- App name: **AliasForge**.
- Tagline: “Shape your shortcuts once, use them everywhere.”

Brand feel:

- Built for devs and power users.
- Calm UI, low‑contrast surfaces, high‑contrast accents when needed.
- Feels like configuring VS Code or a terminal, not like a corporate installer wizard.

---

## 3. Visual style and themes

### 3.1 Dark theme (default)

Base it on a VS Code‑style workbench.

- Workbench background: `#1E1E1E`
- Editor/content background: `#252526`
- Primary accent (buttons, active items): `#007ACC`
- Success: `#4CAF50`
- Warning: `#FFB300`
- Error: `#F44747`
- Text primary: `#FFFFFF`
- Text secondary: `#CCCCCC`
- Borders/dividers: `#3C3C3C`

Use the accent color for:

- Active tab underline.
- Primary CTAs (Apply, Save).
- Selected filters / chips.

### 3.2 Light theme

Same structure, lighter neutrals.

- Workbench background: `#F3F3F3`
- Editor/content background: `#FFFFFF`
- Primary accent: `#007ACC`
- Success: `#2E7D32`
- Warning: `#FFA000`
- Error: `#D32F2F`
- Text primary: `#1E1E1E`
- Text secondary: `#555555`
- Borders/dividers: `#D4D4D4`

Theme handling:

- Ship Dark + Light out of the box.
- Respect OS theme preference when possible.
- Add a simple toggle in settings and remember the choice.

### 3.3 Theme tokens

Use CSS variables to keep things flexible.

Examples:

- `--bg-workbench`
- `--bg-editor`
- `--fg-primary`
- `--fg-muted`
- `--border-subtle`
- `--accent-primary`
- `--accent-error`

Map these tokens to Dark/Light palettes; no hardcoded colors in components.

---

## 4. Layout and VS Code–like UI

The app should feel like a small, focused VS Code workbench rather than a random settings dialog.

### 4.1 High-level layout

- Left sidebar:
  - Platform selector (macOS / Windows / Linux / All).
  - Profiles list.
  - Tag filters.
- Main area:
  - Top tabs: “Aliases”, “Profiles”, “Export log”, “Settings”.
  - Aliases tab:
    - List/table of aliases: Name, Platforms, Command snippet, Tags, Profile, Enabled toggle.
    - Clicking an alias opens a detail editor pane.
  - Detail editor:
    - Tabs inside alias: “Logical”, “macOS”, “Linux”, “Windows”.

### 4.2 Interaction vibe

- Command palette (Ctrl/Cmd+Shift+P) to jump to actions like “Add alias”, “Switch profile”, “Run export”.
- Keyboard‑friendly: tab through inputs, Enter/escape where it makes sense.
- Inline validation and gentle hints, not aggressive error popups.

---

## 5. Core data model

### 5.1 Alias

Each alias (core object) has:

- `name` – unique within a scope.
- `description` – optional but encouraged.
- `logicalTemplate` – an abstract / platform‑agnostic template (optional).
- Per‑platform implementation:
  - macOS: shell (zsh/bash/fish) + command string.
  - Linux: shell (zsh/bash/fish) + command string.
  - Windows: environment (PowerShell/cmd) + command string.
- `tags` – list of strings (git, docker, etc.).
- `scope` – global / per‑machine / per‑project.
- `enabled` per platform.

Support placeholders like `{path}`, `{branch}` in commands; treat them as simple string templates for now.

### 5.2 Profiles and collections

Profiles group aliases.

- Profiles:
  - Have a name and optional description.
  - Can be enabled per machine.
  - Support composition/stacking with predictable conflict rules (priority order).
- Collections (for sharing/export):
  - Export/import profiles as JSON/YAML.
  - Include version metadata for future migrations.

---

## 6. Functional behavior

### 6.1 Alias operations

The app must support:

- Create/read/update/delete aliases.
- Bulk actions: enable/disable, tag assignment, duplication.
- Search: free‑text over name/description/command.
- Filters: platform, shell, tags, enabled/disabled.

### 6.2 Platform integration and export

High‑level flow:

- Detect OS and likely default shell / environment.
- Let users configure export targets once (e.g., `~/.zshrc` or a separate `aliases-forge.zsh` file).

When exporting:

- Show a dry‑run preview before writing.
- Write aliases wrapped in clearly marked blocks (start/end comments) so app‑managed content is isolated.
- Take backups of any file before first write and before each subsequent update.
- Maintain change history and allow rollback of the app‑managed blocks.

Targets (MVP):

- macOS/Linux:
  - Either write into main rc file or a dedicated file sourced from it.
- Windows:
  - PowerShell profile script.
  - Optional cmd batch file (doskey) if configured.

### 6.3 Settings

Settings should cover:

- General: default platform filter, minimize‑to‑tray behavior, open‑on‑login toggle.
- Export: paths for each platform and strategy (direct write vs dedicated alias file).
- Backups: how many snapshots to keep, auto‑restore behavior on failure.

---

## 7. UX flows

### 7.1 First-run experience

Keep it short and friendly.

Steps:

1. Detect OS and shell / environment.
2. Ask where to write alias blocks (with safe defaults).
3. Create a “Default” profile and a few sample aliases.
4. Offer a “Test export” with a diff view before writing.

### 7.2 Editing an alias

- Open alias detail view with tabs (Logical, macOS, Linux, Windows).
- Show badges when a platform implementation is missing or invalid.
- Provide “Copy from [other platform]” to speed up setup.

### 7.3 Notifications

Use subtle toasts in the corner, no blocking dialogs unless truly necessary.

Notify on:

- Export success/failure.
- Backup created.
- Conflicts detected in target files.

---

## 8. Architecture notes

### 8.1 Technical structure

- Electron main process:
  - File I/O for shell/profile files.
  - Backup management.
  - OS/shell detection.
- Renderer (Pug + JS/TS + CSS):
  - UI rendering.
  - State management (aliases, profiles, settings).
  - Talks to main via IPC channels (alias CRUD, export, settings).
- Storage:
  - App data folder per OS.
  - Use JSON (or a tiny embedded DB) for aliases and settings.
  - Store backup metadata and export history there too.

### 8.2 Non-functional expectations

- Get to interactive UI in ~1–2 seconds on modern hardware.
- Keep UI responsive while doing file operations (exports run in background).
- Exports should be idempotent; re‑applying should not duplicate content.

### 8.3 Safety and security

- No remote code execution; aliases are text config only.
- Make it clear aliases can execute arbitrary commands when run in the shell.
- Keep file writes constrained to configured paths.
- Use context isolation and avoid unnecessary Node powers in the renderer.

---

## 9. Icons and branding assets

### 9.1 Core icon concept

- Base shape: rounded square tile.
- Background: dark slate gradient `#1E1E1E` → `#252526`.
- Foreground: terminal‑style `>` with a small link/anvil/forge motif in accent blue `#007ACC`.

### 9.2 Platform exports

- macOS:
  - 1024×1024 master, rounded rectangle style, subtle shadow.
- Windows:
  - Multi‑size `.ico` (256, 128, 64, 32, 16).
- Linux:
  - PNGs in common sizes (512, 256, 128, 64).

Menubar/tray icon:

- Monochrome, simplified `>` + link.
- Light/dark variants for contrast.
- Sizes around 16–24px depending on platform.

---

## 10. Future ideas (not MVP)

Nice to keep in mind while structuring the code, but not required for the first cut:

- Git‑backed sync of profiles.
- Cloud storage integrations.
- Import helpers to parse existing dotfiles and suggest aliases.
- Community alias packs.

---

Use this doc as a living guide while coding; update it when the product shape evolves so the vibe and behavior stay aligned.

<div align="center">⁂</div>

: https://code.visualstudio.com/docs/configure/themes