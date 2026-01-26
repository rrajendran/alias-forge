/**
 * Auto Update Module
 * Handles application updates using Electron's update system
 * Reference: https://www.electronjs.org/docs/latest/tutorial/updates
 */

const { autoUpdater } = require('electron-updater');
const { app, dialog, BrowserWindow } = require('electron');
const log = require('electron-log');

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

class Updater {
  constructor() {
    this.updateCheckInterval = null;
    this.checkIntervalMs = 4 * 60 * 60 * 1000; // Check every 4 hours
    this.isChecking = false;
  }

  /**
   * Initialize the updater
   * @param {BrowserWindow} mainWindow - The main application window
   */
  init(mainWindow) {
    this.mainWindow = mainWindow;

    // Configure auto-updater
    autoUpdater.autoDownload = false; // Manual download control
    autoUpdater.autoInstallOnAppQuit = true;

    // Set update channel based on app version
    const version = app.getVersion();
    if (version.includes('beta')) {
      autoUpdater.channel = 'beta';
    } else if (version.includes('canary')) {
      autoUpdater.channel = 'canary';
    } else {
      autoUpdater.channel = 'stable';
    }

    this.setupEventHandlers();
    
    // Check for updates on app start (after 5 seconds)
    setTimeout(() => {
      this.checkForUpdates();
    }, 5000);

    // Set up periodic update checks
    this.startPeriodicChecks();

    log.info('Updater initialized');
  }

  /**
   * Setup event handlers for auto-updater lifecycle
   */
  setupEventHandlers() {
    // Checking for update
    autoUpdater.on('checking-for-update', () => {
      this.isChecking = true;
      log.info('Checking for updates...');
      this.sendStatusToRenderer('checking-for-update');
    });

    // Update available
    autoUpdater.on('update-available', (info) => {
      this.isChecking = false;
      log.info('Update available:', info.version);
      this.sendStatusToRenderer('update-available', info);
      this.promptDownload(info);
    });

    // Update not available
    autoUpdater.on('update-not-available', (info) => {
      this.isChecking = false;
      log.info('Update not available. Current version is latest.');
      this.sendStatusToRenderer('update-not-available', info);
    });

    // Download progress
    autoUpdater.on('download-progress', (progressObj) => {
      const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
      log.info(logMessage);
      this.sendStatusToRenderer('download-progress', progressObj);
    });

    // Update downloaded
    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info.version);
      this.sendStatusToRenderer('update-downloaded', info);
      this.promptInstall(info);
    });

    // Error occurred
    autoUpdater.on('error', (error) => {
      this.isChecking = false;
      log.error('Update error:', error);
      this.sendStatusToRenderer('error', { message: error.message });
      
      // Show error dialog only for critical errors
      if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
        log.info('Network error during update check - will retry later');
      }
    });
  }

  /**
   * Manually check for updates
   * @param {boolean} silent - If true, don't show "no updates" dialog
   */
  async checkForUpdates(silent = true) {
    if (this.isChecking) {
      log.info('Update check already in progress');
      return;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log.error('Failed to check for updates:', error);
      if (!silent) {
        dialog.showMessageBox(this.mainWindow, {
          type: 'error',
          title: 'Update Check Failed',
          message: 'Failed to check for updates. Please try again later.',
          detail: error.message
        });
      }
    }
  }

  /**
   * Prompt user to download the update
   * @param {Object} info - Update information
   */
  promptDownload(info) {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available!`,
      detail: 'Would you like to download it now? The update will be installed when you restart the application.',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
        this.sendStatusToRenderer('download-started');
      }
    });
  }

  /**
   * Prompt user to install the downloaded update
   * @param {Object} info - Update information
   */
  promptInstall(info) {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'The application will restart to install the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  }

  /**
   * Send update status to renderer process
   * @param {string} status - Update status
   * @param {Object} data - Additional data
   */
  sendStatusToRenderer(status, data = {}) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', {
        status,
        data,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Start periodic update checks
   */
  startPeriodicChecks() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }

    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates(true);
    }, this.checkIntervalMs);

    log.info(`Periodic update checks enabled (every ${this.checkIntervalMs / 1000 / 60 / 60} hours)`);
  }

  /**
   * Stop periodic update checks
   */
  stopPeriodicChecks() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
      log.info('Periodic update checks disabled');
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.stopPeriodicChecks();
    autoUpdater.removeAllListeners();
    log.info('Updater cleaned up');
  }
}

// Export singleton instance
module.exports = new Updater();
