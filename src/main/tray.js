/**
 * Menubar / Tray Module
 * Manages system tray icon and menu for background agent mode
 */

const { app, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

class TrayManager {
  constructor() {
    this.tray = null;
    this.mainWindow = null;
    this.config = {
      trayOnly: false,
      launchAtLogin: false
    };
    this.configPath = path.join(app.getPath('userData'), 'tray-config.json');
    this.ipcHandlersSetup = false;
  }

  /**
   * Initialize the tray
   * @param {BrowserWindow} mainWindow - The main application window
   */
  init(mainWindow) {
    this.mainWindow = mainWindow;
    this.loadConfig();
    this.createTray();
    this.applyTrayOnlyMode();
    
    // Setup IPC handlers for tray actions (only once)
    if (!this.ipcHandlersSetup) {
      this.setupIPC();
      this.ipcHandlersSetup = true;
    }
  }

  /**
   * Load configuration from disk
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.config = { ...this.config, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('Failed to load tray config:', error);
    }
  }

  /**
   * Save configuration to disk
   */
  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save tray config:', error);
    }
  }

  /**
   * Create the system tray
   */
  createTray() {
    // Create icon using the menubar image
    let icon;
    try {
      const iconPath = path.join(__dirname, '../../assets/alias-forge-menubar.png');
      if (fs.existsSync(iconPath)) {
        icon = nativeImage.createFromPath(iconPath);
        icon = icon.resize({ width: 16, height: 16 });
        icon.setTemplateImage(false);
      } else {
        console.warn(`Icon not found at ${iconPath}, using fallback`);
        icon = nativeImage.createEmpty();
      }
    } catch (error) {
      console.error('Failed to load tray icon:', error);
      // Fallback
      icon = nativeImage.createEmpty();
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('AliasForge');
    
    // Build menu
    this.updateTrayMenu();

    // Handle click events
    this.tray.on('click', () => {
      this.showMainWindow();
    });

    this.tray.on('right-click', () => {
      this.tray.popUpContextMenu();
    });
  }

  /**
   * Update the tray menu
   */
  updateTrayMenu() {
    const menu = Menu.buildFromTemplate([
      {
        label: 'AliasForge',
        enabled: false
      },
      {
        type: 'separator'
      },
      {
        label: 'Open App',
        click: () => this.showMainWindow()
      },
      {
        type: 'separator'
      },
      {
        label: 'Export Aliases',
        click: () => this.sendActionToRenderer('export-aliases')
      },
      {
        label: 'Import Aliases',
        click: () => this.sendActionToRenderer('import-aliases')
      },
      {
        type: 'separator'
      },
      {
        label: 'Background Mode',
        type: 'checkbox',
        checked: this.config.trayOnly,
        click: (menuItem) => this.toggleTrayOnlyMode(menuItem.checked)
      },
      {
        label: 'Launch at Login',
        type: 'checkbox',
        checked: this.config.launchAtLogin,
        click: (menuItem) => this.toggleLaunchAtLogin(menuItem.checked)
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(menu);
  }

  /**
   * Show the main window
   */
  showMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  /**
   * Toggle tray-only mode
   * @param {boolean} enabled - Whether to enable tray-only mode
   */
  toggleTrayOnlyMode(enabled) {
    this.config.trayOnly = enabled;
    this.saveConfig();
    this.applyTrayOnlyMode();
    this.updateTrayMenu();

    // Notify user
    if (Notification.isSupported()) {
      new Notification({
        title: 'AliasForge',
        body: enabled 
          ? 'Background mode enabled. App will minimize to tray.'
          : 'Background mode disabled. App will show in dock/taskbar.'
      }).show();
    }
  }

  /**
   * Apply tray-only mode settings
   */
  applyTrayOnlyMode() {
    if (process.platform === 'darwin') {
      if (this.config.trayOnly) {
        app.dock.hide();
      } else {
        app.dock.show();
      }
    }

    // Set window behavior
    if (this.mainWindow) {
      if (this.config.trayOnly) {
        this.mainWindow.on('close', (event) => {
          if (!app.isQuitting) {
            event.preventDefault();
            this.mainWindow.hide();
          }
        });
      }
    }
  }

  /**
   * Toggle launch at login
   * @param {boolean} enabled - Whether to enable launch at login
   */
  toggleLaunchAtLogin(enabled) {
    this.config.launchAtLogin = enabled;
    this.saveConfig();

    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: this.config.trayOnly
    });

    this.updateTrayMenu();

    // Notify user
    if (Notification.isSupported()) {
      new Notification({
        title: 'AliasForge',
        body: enabled 
          ? 'App will launch at login.'
          : 'Launch at login disabled.'
      }).show();
    }
  }

  /**
   * Send action to renderer process
   * @param {string} action - Action name
   */
  sendActionToRenderer(action) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('tray-action', action);
      this.showMainWindow();
    }
  }

  /**
   * Setup IPC handlers
   */
  setupIPC() {
    const { ipcMain } = require('electron');

    ipcMain.handle('tray:get-config', () => {
      return this.config;
    });

    ipcMain.handle('tray:set-config', (event, newConfig) => {
      this.config = { ...this.config, ...newConfig };
      this.saveConfig();
      this.applyTrayOnlyMode();
      this.updateTrayMenu();
      return this.config;
    });
  }

  /**
   * Show notification from tray
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   */
  showNotification(title, body) {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        icon: path.join(__dirname, '../../assets/icons/png/64x64.png')
      });

      notification.on('click', () => {
        this.showMainWindow();
      });

      notification.show();
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

// Export singleton instance
module.exports = new TrayManager();
