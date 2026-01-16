const { contextBridge, ipcRenderer } = require("electron");

/**
 * Secure preload script that exposes minimal, explicit APIs to the renderer
 * Uses contextBridge to safely expose functionality from main process
 * 
 * SECURITY NOTES:
 * - Never expose require, fs, or child_process directly
 * - All IPC channels use invoke/handle pattern for security
 * - Input validation happens in main process
 */

// Allowed IPC channels - whitelist approach
const ALLOWED_CHANNELS = {
  system: ["system:get-platform"],
  settings: ["settings:load", "settings:save"],
  aliases: ["aliases:load", "aliases:save", "aliases:import", "aliases:export"],
  shell: ["shell:detect"],
  file: ["file:read", "file:write", "file:backup"]
};

/**
 * Validate that a channel is in the allowed list
 */
function validateChannel(channel) {
  for (const category of Object.values(ALLOWED_CHANNELS)) {
    if (category.includes(channel)) {
      return true;
    }
  }
  return false;
}

/**
 * Safely invoke an IPC handler
 */
async function invokeSecure(channel, ...args) {
  if (!validateChannel(channel)) {
    throw new Error(`IPC channel not allowed: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

// Expose secure API to renderer process
contextBridge.exposeInMainWorld("api", {
  // System information
  system: {
    getPlatform: () => invokeSecure("system:get-platform")
  },

  // Settings management
  settings: {
    load: () => invokeSecure("settings:load"),
    save: (settings) => invokeSecure("settings:save", settings)
  },

  // Alias management
  aliases: {
    load: () => invokeSecure("aliases:load"),
    save: (data) => invokeSecure("aliases:save", data),
    import: (shellName) => invokeSecure("aliases:import", shellName),
    export: (aliases, shellName) => invokeSecure("aliases:export", aliases, shellName)
  },

  // Shell detection
  shell: {
    detect: () => invokeSecure("shell:detect")
  },

  // File operations
  file: {
    read: (filePath) => invokeSecure("file:read", filePath),
    write: (filePath, content) => invokeSecure("file:write", filePath, content),
    backup: (filePath) => invokeSecure("file:backup", filePath)
  }
});

// Expose version info
contextBridge.exposeInMainWorld("versions", {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron
});
