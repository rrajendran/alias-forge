const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const { exec } = require("child_process");
const { promisify } = require("util");

// Import updater and tray modules
const updater = require("./updater");
const tray = require("./tray");

const execAsync = promisify(exec);
let mainWindow = null;

/**
 * Create the main application window with secure settings
 */
function createMainWindow() {
  // Determine the icon path based on platform
  let iconPath;
  if (process.platform === "darwin") {
    // macOS: use .icns file
    iconPath = path.join(__dirname, "../assets/icons/mac/icon.icns");
  } else if (process.platform === "win32") {
    // Windows: use .ico file
    iconPath = path.join(__dirname, "../assets/icons/win/icon.ico");
  } else {
    // Linux: use .png file
    // Use a packaged PNG icon from the assets folder
    iconPath = path.join(__dirname, "../assets/icons/png/128x128.png");
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#1E1E1E",
    icon: iconPath,
    titleBarStyle: 'hiddenInset', // macOS: traffic lights visible, title bar area available for custom content
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  // Show window when ready to avoid flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  // Open DevTools in development mode
  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Get the application data directory
 */
function getAppDataPath() {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "data");
}

/**
 * Ensure application data directory exists
 */
async function ensureDataDirectory() {
  const dataPath = getAppDataPath();
  try {
    await fs.access(dataPath);
  } catch {
    await fs.mkdir(dataPath, { recursive: true });
  }
}

/**
 * Get path to a data file
 */
function getDataFilePath(filename) {
  return path.join(getAppDataPath(), filename);
}

/**
 * Validate file path to prevent directory traversal
 */
function validateFilePath(filePath) {
  const normalizedPath = path.normalize(filePath);
  if (normalizedPath.includes("..")) {
    throw new Error("Invalid file path");
  }
  return normalizedPath;
}

// ============================================
// App Lifecycle
// ============================================

app.whenReady().then(async () => {
  await ensureDataDirectory();
  await setupIpcHandlers();
  createMainWindow();

  // Initialize updater (production only)
  if (!app.isPackaged && !process.argv.includes("--dev")) {
    // Skip updater in development
  } else if (app.isPackaged) {
    updater.init(mainWindow);
  }

  // Initialize tray
  tray.init(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      tray.init(mainWindow);
    } else {
      tray.showMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS with tray mode, keep app running
  if (process.platform === "darwin" && tray.config.trayOnly) {
    return;
  }
  
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  // Cleanup
  if (updater) {
    updater.cleanup();
  }
  if (tray) {
    tray.cleanup();
  }
});

// ============================================
// IPC Handlers (Security-focused)
// ============================================

async function setupIpcHandlers() {
  // System info
  ipcMain.handle("system:get-platform", async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.version
    };
  });

  // Settings management
  ipcMain.handle("settings:load", async () => {
    try {
      const settingsPath = getDataFilePath("settings.json");
      const data = await fs.readFile(settingsPath, "utf8");
      return JSON.parse(data);
    } catch (err) {
      if (err.code === "ENOENT") {
        // Return default settings if file doesn't exist
        return getDefaultSettings();
      }
      throw new Error("Failed to load settings");
    }
  });

  ipcMain.handle("settings:save", async (_, settings) => {
    try {
      const settingsPath = getDataFilePath("settings.json");
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
      return { success: true };
    } catch (err) {
      console.error("Failed to save settings:", err);
      throw new Error("Failed to save settings");
    }
  });

  // Alias management
  ipcMain.handle("aliases:load", async () => {
    try {
      const aliasesPath = getDataFilePath("aliases.json");
      const data = await fs.readFile(aliasesPath, "utf8");
      return JSON.parse(data);
    } catch (err) {
      if (err.code === "ENOENT") {
        return { aliases: [], profiles: [] };
      }
      throw new Error("Failed to load aliases");
    }
  });

  ipcMain.handle("aliases:save", async (_, data) => {
    try {
      const aliasesPath = getDataFilePath("aliases.json");
      await fs.writeFile(aliasesPath, JSON.stringify(data, null, 2), "utf8");
      return { success: true };
    } catch (err) {
      console.error("Failed to save aliases:", err);
      throw new Error("Failed to save aliases");
    }
  });

  // Shell detection
  ipcMain.handle("shell:detect", async () => {
    const platform = process.platform;
    const env = process.env;

    let defaultShell = null;
    let shellPath = null;

    if (platform === "win32") {
      defaultShell = "powershell";
      shellPath = env.SHELL || "powershell.exe";
    } else {
      shellPath = env.SHELL || "/bin/bash";
      console.log(`Detected shell path: ${shellPath}`);
      const shellName = path.basename(shellPath);
      
      if (shellName.includes("zsh")) {
        defaultShell = "zsh";
      } else if (shellName.includes("bash")) {
        defaultShell = "bash";
      } else if (shellName.includes("fish")) {
        defaultShell = "fish";
      } else {
        defaultShell = "bash";
      }
    }

    return {
      platform,
      defaultShell,
      shellPath,
      configPath: getShellConfigPath(defaultShell)
    };
  });

  // Import aliases from system
  ipcMain.handle("aliases:import", async (_, shellName) => {
    try {
      const aliases = await parseAliasesFromShell(shellName);
      console.log(`Imported ${aliases.length} aliases from ${shellName}`);
      return { success: true, aliases, count: aliases.length };
    } catch (err) {
      console.error("Failed to import aliases:", err);
      return { success: false, error: err.message, stack: err.stack };
    }
  });

  // Export aliases to shell immediately
  ipcMain.handle("aliases:export", async (_, aliases, shellName) => {
    try {
      const result = await writeAliasesToShell(aliases, shellName);
      return result;
    } catch (err) {
      console.error("Failed to export aliases:", err);
      return { success: false, error: err.message };
    }
  });

  // File operations (with validation)
  ipcMain.handle("file:read", async (_, filePath) => {
    try {
      const validPath = validateFilePath(filePath);
      const content = await fs.readFile(validPath, "utf8");
      return { success: true, content };
    } catch (err) {
      console.error("Failed to read file:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("file:write", async (_, filePath, content) => {
    try {
      const validPath = validateFilePath(filePath);
      await fs.writeFile(validPath, content, "utf8");
      return { success: true };
    } catch (err) {
      console.error("Failed to write file:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("file:backup", async (_, filePath) => {
    try {
      const validPath = validateFilePath(filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = `${validPath}.backup-${timestamp}`;
      
      await fs.copyFile(validPath, backupPath);
      return { success: true, backupPath };
    } catch (err) {
      console.error("Failed to backup file:", err);
      return { success: false, error: err.message };
    }
  });

  // Updater check
  ipcMain.handle("updater:check", async () => {
    try {
      if (updater && typeof updater.checkForUpdates === 'function') {
        await updater.checkForUpdates(false);
        // Return result will come via update events
        return { success: true, checking: true };
      }
      return { success: false, error: 'Updater not available' };
    } catch (err) {
      console.error("Failed to check for updates:", err);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Get shell config file path based on shell and platform
 */
function getShellConfigPath(shellName) {
  const home = app.getPath("home");
  const platform = process.platform;
  
  if (platform === "win32") {
    if (shellName === "powershell") {
      return path.join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
    } else {
      return path.join(home, "aliases.cmd");
    }
  } else {
    // macOS and Linux
    switch (shellName) {
      case "zsh":
        return path.join(home, ".zshrc");
      case "bash":
        return path.join(home, ".bashrc");
      case "fish":
        return path.join(home, ".config", "fish", "config.fish");
      default:
        return path.join(home, ".bashrc");
    }
  }
}

/**
 * Parse aliases by running the alias command
 */
async function parseAliasesFromShell(shellName) {
  try {
    const platform = process.platform;
    let command;
    
    if (platform === "win32") {
      if (shellName === "powershell") {
        command = "Get-Alias | Format-Table -HideTableHeaders Name, Definition";
      } else {
        command = "doskey /macros";
      }
    } else {
      // Unix-like systems (macOS, Linux)
      // Run alias command in interactive shell
      const shellPath = process.env.SHELL || "/bin/bash";
      command = `${shellPath} -i -c "alias"`;
    }
    
    console.log(`Running command: ${command}`);
    
      const { stdout, stderr } = await execAsync(command);
    // console.log(`Command output length: ${stdout.length} bytes`);
    // console.log(`First 500 chars: ${stdout.substring(0, 500)}`);
    if (stderr) {
      console.log(`Command stderr: ${stderr}`);
    }
    
    // Clean control / escape sequences (OSC/CSI and similar) that some shells
    // emit when running interactive commands in embedded contexts (e.g. iTerm2
    // reports with OSC 1337 sequences). Remove them before parsing.
    let cleaned = stdout || "";

    // Remove OSC sequences like ESC ] 1337;... BEL or ESC\\ terminated
    cleaned = cleaned.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
    // Remove common ANSI CSI sequences
    cleaned = cleaned.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
    // Also remove stray BEL or other non-printables except newline and basic punctuation
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

    const aliases = [];
    const lines = cleaned.split('\n').map(l => l.trim()).filter(line => line.length > 0);
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (!line) continue;

      // Some shells print lines with a leading "alias " prefix. Remove it
      // so the remainder matches name=command patterns.
      if (line.startsWith("alias ")) {
        line = line.slice(6).trim();
      }
      
      if (platform === "win32" && shellName === "powershell") {
        // PowerShell format: Name    Definition
        const parts = line.split(/\s{2,}/);
        if (parts.length >= 2) {
          aliases.push({
            id: `imported-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            name: parts[0].trim(),
            command: parts[1].trim(),
            description: "",
            tags: ["imported"],
            enabled: true,
            source: "system"
          });
        }
      } else if (platform === "win32") {
        // CMD format: name=command
        const match = line.match(/^([^=]+)=(.+)$/);
        if (match) {
          aliases.push({
            id: `imported-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            name: match[1].trim(),
            command: match[2].trim(),
            description: "",
            tags: ["imported"],
            enabled: true,
            source: "system"
          });
        }
      } else {
        // Unix format from 'alias' command output: name='command' or name="command"
        const match = line.match(/^([^=]+)=(.+)$/);
        if (match) {
          let name = match[1].trim();
          let command = match[2].trim();

          // Remove surrounding quotes if present
          if ((command.startsWith("'") && command.endsWith("'")) ||
              (command.startsWith('"') && command.endsWith('"'))) {
            command = command.slice(1, -1);
          }

          // Validate alias name: must start with a letter or underscore and
          // contain at least one alphanumeric character. This filters out
          // strange entries like "-='cd -'" which originate from shells.
          const validName = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name);
          if (!validName) {
            console.log(`Skipping invalid alias name when importing: "${name}"`);
            continue;
          }

          aliases.push({
            id: `imported-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            command: command,
            description: "",
            tags: ["imported"],
            enabled: true,
            source: "system"
          });
        }
      }
    }
    
    console.log(`Found ${aliases.length} aliases`);
    return aliases;
  } catch (err) {
    console.error("Failed to get aliases from shell:", err);
    return [];
  }
}

/**
 * Write aliases to shell config file
 */
async function writeAliasesToShell(aliases, shellName) {
  try {
    const configPath = getShellConfigPath(shellName);
    const platform = process.platform;
    
    // Create backup first
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${configPath}.aliasforge-backup-${timestamp}`;
    
    try {
      await fs.copyFile(configPath, backupPath);
    } catch (err) {
      // File might not exist yet, that's okay
      console.log("No existing config to backup");
    }
    
    // Read existing content
    let existingContent = "";
    try {
      existingContent = await fs.readFile(configPath, "utf8");
    } catch (err) {
      // File doesn't exist, will create new
    }
    
    // Remove old AliasForge block
    const blockStart = "# >>> AliasForge managed aliases >>>";
    const blockEnd = "# <<< AliasForge managed aliases <<<";
    
    const startIndex = existingContent.indexOf(blockStart);
    const endIndex = existingContent.indexOf(blockEnd);
    
    if (startIndex !== -1 && endIndex !== -1) {
      existingContent = existingContent.substring(0, startIndex) + 
                       existingContent.substring(endIndex + blockEnd.length);
    }
    
    // Generate alias commands
    let aliasBlock = "\n" + blockStart + "\n";
    aliasBlock += "# Managed by AliasForge - do not edit manually\n";
    aliasBlock += "# Last updated: " + new Date().toISOString() + "\n\n";
    
    const enabledAliases = aliases.filter(a => a.enabled);
    
    if (platform === "win32" && shellName === "powershell") {
      // PowerShell format
      for (const alias of enabledAliases) {
        if (alias.description) {
          aliasBlock += `# ${alias.description}\n`;
        }
        aliasBlock += `function ${alias.name} { ${alias.command} }\n`;
      }
    } else {
      // Unix shell format
      for (const alias of enabledAliases) {
        if (alias.description) {
          aliasBlock += `# ${alias.description}\n`;
        }
        aliasBlock += `alias ${alias.name}='${alias.command.replace(/'/g, "'\\''")}'\n`;
      }
    }
    
    aliasBlock += "\n" + blockEnd + "\n";
    
    // Write updated content
    const newContent = existingContent.trimEnd() + aliasBlock;
    await fs.writeFile(configPath, newContent, "utf8");
    
    return { success: true, path: configPath, backupPath };
  } catch (err) {
    console.error("Failed to write aliases to shell:", err);
    throw new Error("Failed to update shell configuration");
  }
}

/**
 * Get default application settings
 */
function getDefaultSettings() {
  const platform = process.platform;
  const home = app.getPath("home");
  
  let exportPaths = {};
  
  if (platform === "darwin" || platform === "linux") {
    exportPaths = {
      zsh: path.join(home, ".zshrc"),
      bash: path.join(home, ".bashrc"),
      fish: path.join(home, ".config", "fish", "config.fish")
    };
  } else if (platform === "win32") {
    exportPaths = {
      powershell: path.join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
      cmd: path.join(home, "aliases.cmd")
    };
  }

  return {
    theme: "dark",
    defaultPlatform: "all",
    exportPaths,
    exportStrategy: "dedicated",
    backupCount: 5,
    openOnLogin: false,
    minimizeToTray: false
  };
}
