// Auto-update module for 13rew
// Uses electron-updater for reliable update management
// Reference: https://www.electronjs.org/docs/latest/tutorial/updates

const { app, dialog, Notification } = require('electron');
const log = require('electron-log');

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');

let autoUpdater;
let updaterAvailable = false;
let updateCheckInterval = null;
let mainWindow = null;

// Configure logging
// Note: Logging is configured in main.js, so we don't reconfigure here

// Try to require electron-updater; if missing, disable updater gracefully
try {
  ({ autoUpdater } = require('electron-updater'));
  updaterAvailable = true;
  autoUpdater.logger = log;
  // Configure auto-updater with explicit GitHub settings (point to Alias Forge repo)
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'rrajendran',
      repo: 'alias-forge',
      private: false
    });
  } catch (e) {
    log.warn('[Updater] Could not call setFeedURL:', e && e.message ? e.message : e);
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  
  // Allow updates in development mode
  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.allowPrerelease = true;
  }
} catch (e) {
  log.warn('[Updater] electron-updater is not available; updater disabled. Error:', e && e.message ? e.message : e);
  updaterAvailable = false;
  autoUpdater = {
    on: () => {},
    setFeedURL: () => {},
    checkForUpdates: async () => { throw new Error('electron-updater not available'); },
    downloadUpdate: async () => { throw new Error('electron-updater not available'); },
    quitAndInstall: () => { throw new Error('electron-updater not available'); },
    removeAllListeners: () => {},
  };
}

class Updater {
  constructor() {
    this.mainWindow = null;
    this.lastDownloadedPath = null;
    this.lastUpdateInfo = null;
    this.updateCheckInterval = null;
    this.checkIntervalMs = 1000 * 60 * 60 * 6; // default 6 hours
  }

  /**
   * Initialize the updater with the main window
   * @param {BrowserWindow} mainWindow - The main Electron window
   */
  init(mainWindow) {
    this.mainWindow = mainWindow;
    log.info('[Updater] Initializing updater');

    if (!updaterAvailable) {
      log.warn('[Updater] Updater not available, skipping initialization');
      return;
    }

    // Set up event listeners
    autoUpdater.on('checking-for-update', () => {
      log.info('[Updater] Checking for update...');
      this.sendStatusToRenderer('checking');
    });

    autoUpdater.on('update-available', (info) => {
      log.info('[Updater] Update available:', info.version);
      this.lastUpdateInfo = info;
      this.sendStatusToRenderer('available', { version: info.version });
      
      // Ask user if they want to download now or later
      this.promptDownload(info);
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('[Updater] Update not available');
      this.sendStatusToRenderer('not-available');
    });

    autoUpdater.on('error', (err) => {
      log.error('[Updater] Update error:', err.message);
      this.sendStatusToRenderer('error', { message: err.message });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      log.info('[Updater] Download progress:', progressObj.percent, '%');
      this.sendStatusToRenderer('download-progress', progressObj);
    });

    // Check for updates on startup
    this.checkForUpdates();
  }

  /**
   * Check for updates
   * @param {boolean} silent - If true, don't show UI notifications
   * @returns {Promise<Object>} Update information or null if no update
   */
  async checkForUpdates(silent = false) {
    if (!updaterAvailable) {
      log.warn('[Updater] Updater not available, cannot check for updates');
      return null;
    }

    try {
      log.info('[Updater] Checking for updates...');
      const result = await autoUpdater.checkForUpdates();
      
      if (result && result.updateInfo) {
        this.lastUpdateInfo = result.updateInfo;
        log.info('[Updater] Update check result:', result.updateInfo.version);
        return result.updateInfo;
      } else {
        log.info('[Updater] No update information returned');
        return null;
      }
    } catch (error) {
      log.error('[Updater] Error checking for updates:', error.message);
      if (!silent) {
        this.sendStatusToRenderer('error', { message: error.message });
      }
      throw error;
    }
  }

  /**
   * Install the downloaded update
   * @param {Object} info - Update information
   */
  installUpdate(info) {
    log.info('[Updater] Attempting to install update:', info.version);
    
    try {
      // Try the standard quitAndInstall
      autoUpdater.quitAndInstall(false, true);
    } catch (error) {
      log.error('[Updater] quitAndInstall failed:', error.message);
      log.info('[Updater] Falling back to opening downloaded asset');
      
      // Fallback: find and open the downloaded asset
      this.openDownloadedAsset();
    }
  }

  /**
   * Open the downloaded update asset as fallback when install fails
   */
  openDownloadedAsset() {
    // First try to open an installer file (.dmg, .exe, .deb, .appimage)
    const installerOpened = this.openInstallerFile();
    if (installerOpened) {
      return;
    }
    
    // If no installer found/opened, open the cache directory
    log.info('[Updater] No installer file found/opened, opening cache directory');
    this.openCacheDirectory();
  }

  /**
   * Try to find and open an installer file based on platform
   * @returns {boolean} true if an installer was found and opened
   */
  openInstallerFile() {
    const cacheDir = this.getUpdaterCacheDir();
    if (!cacheDir || !fs.existsSync(cacheDir)) {
      log.warn('[Updater] Cache directory not available');
      return false;
    }

    // Define installer extensions by platform
    let installerExts = [];
    if (process.platform === 'darwin') {
      installerExts = ['.dmg'];
    } else if (process.platform === 'win32') {
      installerExts = ['.exe', '.msi'];
    } else {
      installerExts = ['.deb', '.rpm', '.appimage'];
    }

    // Look for installer files in cache
    for (const ext of installerExts) {
      const installerPath = this.findInstallerByExt(ext);
      if (installerPath) {
        log.info('[Updater] Found installer file:', installerPath);
        
        try {
          if (process.platform === 'darwin') {
            exec(`open "${installerPath}"`, (error) => {
              if (error) {
                log.error('[Updater] Failed to open installer:', error.message);
              } else {
                log.info('[Updater] Successfully opened installer:', installerPath);
              }
            });
          } else if (process.platform === 'win32') {
            const proc = spawn(installerPath, [], { detached: true, stdio: 'ignore' });
            proc.unref();
            log.info('[Updater] Successfully launched installer:', installerPath);
          } else {
            // Linux
            if (ext === '.appimage') {
              const proc = spawn(installerPath, [], { detached: true, stdio: 'ignore' });
              proc.unref();
              log.info('[Updater] Successfully launched AppImage:', installerPath);
            } else {
              // For .deb/.rpm, try to open with default application
              exec(`xdg-open "${installerPath}"`, (error) => {
                if (error) {
                  log.error('[Updater] Failed to open installer:', error.message);
                } else {
                  log.info('[Updater] Successfully opened installer:', installerPath);
                }
              });
            }
          }
          return true;
        } catch (error) {
          log.error('[Updater] Error opening installer:', error.message);
        }
      }
    }

    log.info('[Updater] No installer files found for platform:', process.platform);
    return false;
  }

  /**
   * Open the updater cache directory
   */
  openCacheDirectory() {
    const cacheDir = this.getUpdaterCacheDir();
    if (cacheDir && fs.existsSync(cacheDir)) {
      this.openFolder(cacheDir);
      log.info('[Updater] Opened cache directory:', cacheDir);
    } else {
      log.warn('[Updater] Cache directory not available to open');
    }
  }

  /**
   * Prompt user to install the downloaded update
   * @param {Object} info - Update information
   */
  promptInstall(info) {
    log.info('[Updater] Showing install prompt for version:', info.version);
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
        log.info('[Updater] User chose to install update - calling quitAndInstall()');
        try {
          autoUpdater.quitAndInstall(false, true);
        } catch (error) {
          log.error('[Updater] quitAndInstall() failed:', error.message);
          log.warn('[Updater] Attempting fallback to openExecutable()');
          this.openExecutable();
        }
        // In dev/non-signed builds on macOS, auto-install may silently fail.
        // Schedule a fallback launch of the downloaded asset if the app does not quit promptly.
        setTimeout(() => {
          log.warn('[Updater] Fallback timer: attempting to open downloaded update asset');
          this.openExecutable();
        }, 2000);
      } else {
        log.info('[Updater] User deferred update installation');
      }
    });
  }

  /**
   * Prompt user to download the available update
   * @param {Object} info - Update information
   */
  promptDownload(info) {
    log.info('[Updater] Showing download prompt for version:', info.version);
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available.`,
      detail: 'Would you like to download and install the update now?',
      buttons: ['Download Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        log.info('[Updater] User chose to download update now');
        this.sendStatusToRenderer('downloading');
        // Use custom download and install to avoid code signature issues
        this.handleUpdateAvailable(this.lastUpdateInfo).catch(error => {
          log.error('[Updater] Custom download failed:', error.message);
          this.sendStatusToRenderer('error', { message: error.message });
        });
      } else {
        log.info('[Updater] User deferred update download');
        this.sendStatusToRenderer('deferred');
      }
    });
  }

  /**
   * Open the executable as fallback when auto-install fails
   */
  openExecutable() {
    log.info('[Updater] Opening executable as fallback (platform:', process.platform, ')');
    try {
      // Prefer opening from a downloaded asset if available
      const handled = this.openDownloadedUpdateIfAvailable();
      // if (handled) {
      //   // Close current app shortly after launching the new one
      //   log.info('[Updater] Closing current app in 1500ms after launching update');
      //   setTimeout(() => {
      //     log.info('[Updater] Calling app.exit()');
      //     app.exit();
      //   }, 1500);
      //   return;
      // }
      const cacheDir = this.getUpdaterCacheDir();
      log.info('[Updater] Updater cache directory:', cacheDir);
      if (process.platform === 'darwin') {
        // macOS: prefer opening the downloaded asset in the updater cache
        try {
          
          let appBundle = undefined;

          // If lastDownloadedPath points to a folder or zip/extracted app, try to resolve
          if (this.lastDownloadedPath) {
            const candidate = path.isAbsolute(this.lastDownloadedPath)
              ? this.lastDownloadedPath
              : path.join(cacheDir || '', path.basename(this.lastDownloadedPath));
            // if candidate is a dir with .app or is the .app itself
            if (candidate && fs.existsSync(candidate)) {
              const stat = fs.statSync(candidate);
              if (stat.isDirectory() && candidate.toLowerCase().endsWith('.app')) {
                appBundle = candidate;
              } else if (stat.isFile() && path.extname(candidate).toLowerCase() === '.zip') {
                // extracted app may already exist alongside zip
                const maybe = this.findFirstByExtension(path.dirname(candidate), '.app');
                if (maybe) appBundle = maybe;
              }
            }
          }

          // If not found, search the updater cache pending directory for a .app
          if (!appBundle && cacheDir && fs.existsSync(cacheDir)) {
            appBundle = this.findFirstByExtension(cacheDir, '.app');
          }

          if (appBundle) {
            log.info('[Updater] macOS: Opening downloaded app bundle from cache:', appBundle);
            exec(`open "${appBundle}"`, (error) => {
              if (error) {
                log.error('[Updater] FAILED: Could not open downloaded app bundle -', error.message);
              } else {
                log.info('[Updater] SUCCESS: Downloaded app bundle opened successfully');
              }
            });
          } else {
            // Before falling back to the repo dist, check cache for a named app bundle
            const appName = app.getName ? app.getName() : path.basename(process.execPath, path.extname(process.execPath));
            const candidateByName = cacheDir ? path.join(cacheDir, `${appName}.app`) : null;
            const candidateByZipBase = this.lastDownloadedPath ? path.join(cacheDir || '', `${path.basename(this.lastDownloadedPath, path.extname(this.lastDownloadedPath))}.app`) : null;
            let handled = false;
            try {
              if (candidateByName && fs.existsSync(candidateByName)) {
                log.info('[Updater] Found app bundle in cache by app name:', candidateByName);
                exec(`open "${candidateByName}"`);
                handled = true;
              } else if (candidateByZipBase && fs.existsSync(candidateByZipBase)) {
                log.info('[Updater] Found app bundle in cache by zip base name:', candidateByZipBase);
                exec(`open "${candidateByZipBase}"`);
                handled = true;
              } else {
                // try a recursive search for any .app under cacheDir one more time
                const maybe = cacheDir && fs.existsSync(cacheDir) ? this.findFirstByExtension(cacheDir, '.app') : undefined;
                if (maybe) {
                  log.info('[Updater] Found .app in cache via recursive search:', maybe);
                  exec(`open "${maybe}"`);
                  handled = true;
                }
              }
            } catch (e) {
              log.warn('[Updater] Error while checking cache for app bundle:', e && e.message ? e.message : e);
            }

            if (handled) {
              log.info('[Updater] Opened extracted app from cache');
            } else {
              // Fallback: prefer opening repository dist/mac when available (dev),
              // otherwise open the .app bundle root (not the Contents folder)
              const repoDist = path.join(__dirname, '..', '..', 'dist', 'mac');
              if (fs.existsSync(repoDist)) {
                log.warn('[Updater] No downloaded .app found in cache, opening repo dist folder instead:', repoDist);
                exec(`open "${repoDist}"`, (error) => {
                  if (error) {
                    log.error('[Updater] FAILED: Could not open repo dist folder -', error.message);
                  } else {
                    log.info('[Updater] SUCCESS: Repo dist folder opened');
                  }
                });
              } else {
                // open .app bundle root (up 3 levels from app.getAppPath(), which may point into Resources)
                const appPath = app.getAppPath();
                const bundleRoot = path.resolve(appPath, '..', '..', '..');
                log.warn('[Updater] No downloaded .app found in cache, falling back to bundle root path:', bundleRoot);
                exec(`open "${bundleRoot}"`, (error) => {
                  if (error) {
                    log.error('[Updater] FAILED: Could not open fallback macOS bundle -', error.message);
                  } else {
                    log.info('[Updater] SUCCESS: Fallback macOS bundle opened');
                  }
                });
              }
            }
          }
        } catch (err) {
          log.error('[Updater] Error while attempting to open downloaded macOS bundle:', err.message);
        }
      } else if (process.platform === 'win32') {
        // Windows: launch the executable
        const execPath = app.getPath('exe');
        log.info('[Updater] Windows: Launching executable at:', execPath);
        const process_ref = spawn(execPath, [], { detached: true, stdio: 'ignore' });
        process_ref.unref();
        log.info('[Updater] SUCCESS: Windows executable spawned successfully');
      } else {
        // Linux: launch the executable
        const execPath = app.getPath('exe');
        log.info('[Updater] Linux: Launching executable at:', execPath);
        const process_ref = spawn(execPath, [], { detached: true, stdio: 'ignore' });
        process_ref.unref();
        log.info('[Updater] SUCCESS: Linux executable spawned successfully');
      }
      
      // Close the current app
      log.info('[Updater] Closing current app in 500ms');
      // setTimeout(() => {
      //   log.info('[Updater] Calling app.quit()');
      //   app.quit();
      // }, 500);
    } catch (error) {
      log.error('[Updater] FAILED: Could not open executable -', error.message);
      log.error('[Updater] Error stack:', error.stack);
    }
  }

  /**
   * Attempt to open a downloaded update asset (zip/dmg/exe) if present.
   * Ensures the asset matches the current platform and architecture.
   * @returns {boolean} true if an asset was handled and launched.
   */
  openDownloadedUpdateIfAvailable() {
    try {
      const assetPath = this.findPendingUpdateAsset();
      if (!assetPath) {
        log.info('[Updater] No pending update asset found for current platform/arch');
        return false;
      }

      const ext = path.extname(assetPath).toLowerCase();
      log.info('[Updater] Found pending asset:', assetPath, 'ext:', ext);

      if (process.platform === 'darwin') {
        if (ext === '.dmg') {
          log.info('[Updater] macOS: Opening DMG directly');
          exec(`open "${assetPath}"`, (error) => {
            if (error) {
              log.error('[Updater] FAILED: Could not open DMG -', error.message);
            } else {
              log.info('[Updater] SUCCESS: DMG opened');
            }
          });
          return true;
        } else if (ext === '.zip') {
          return this.extractZipAndOpenApp(assetPath);
        }
      } else if (process.platform === 'win32') {
        if (ext === '.zip') {
          return this.extractZipAndRunWindowsExe(assetPath);
        } else if (ext === '.exe') {
          log.info('[Updater] Windows: Executing installer');
          const proc = spawn(assetPath, [], { detached: true, stdio: 'ignore' });
          proc.unref();
          return true;
        }
      } else {
        // linux
        if (ext === '.zip') {
          return this.extractZipAndRunLinux(assetPath);
        } else if (ext === '.appimage') {
          log.info('[Updater] Linux: Running AppImage');
          const proc = spawn(assetPath, [], { detached: true, stdio: 'ignore' });
          proc.unref();
          return true;
        }
      }

      log.warn('[Updater] Unsupported asset type for automatic handling:', ext);
      return false;
    } catch (err) {
      log.error('[Updater] Error while handling pending asset:', err.message);
      return false;
    }
  }

  /**
   * Find a pending update asset in known cache locations that matches platform/arch.
   * Prefers the last known downloaded path.
   * @returns {string|undefined} Absolute path to asset.
   */
  findPendingUpdateAsset() {
    // Prefer path reported by electron-updater
    if (this.lastDownloadedPath) {
      const fileName = path.basename(this.lastDownloadedPath);
      if (path.isAbsolute(this.lastDownloadedPath) && fs.existsSync(this.lastDownloadedPath)) {
        if (this.assetMatchesPlatformArch(fileName)) return this.lastDownloadedPath;
      }
    }

    // Fallback: search known cache directory
    const cacheDir = this.getUpdaterCacheDir();
    if (!cacheDir || !fs.existsSync(cacheDir)) {
      log.info('[Updater] Cache directory not found:', cacheDir);
      return undefined;
    }

    // If lastDownloadedPath looks like a filename, try resolve under cache dir first
    if (this.lastDownloadedPath && !path.isAbsolute(this.lastDownloadedPath)) {
      const candidate = path.join(cacheDir, path.basename(this.lastDownloadedPath));
      if (fs.existsSync(candidate)) {
        const name = path.basename(candidate);
        if (this.assetMatchesPlatformArch(name) || this.assetMatchesPlatform(name)) {
          return candidate;
        }
      }
    }

    const entries = fs.readdirSync(cacheDir).map(name => ({
      name,
      fullPath: path.join(cacheDir, name),
      stat: (() => { try { return fs.statSync(path.join(cacheDir, name)); } catch { return null; } })()
    })).filter(e => e.stat && e.stat.isFile());

    // Choose best candidate with preference order
    const exact = entries.filter(e => this.assetMatchesPlatformArch(e.name));
    const platOnly = entries.filter(e => this.assetMatchesPlatform(e.name));
    const any = entries.filter(e => this.assetLooksInstallable(e.name));

    let candidates = exact.length ? exact : (platOnly.length ? platOnly : any);
    if (candidates.length === 0) return undefined;

    // Prefer installer types (mac: dmg > zip, win: exe > zip, linux: AppImage/deb/rpm > zip) and recent mtime
    const weight = (name) => {
      const ext = path.extname(name).toLowerCase();
      if (process.platform === 'darwin') return ext === '.dmg' ? 3 : (ext === '.zip' ? 2 : 1);
      if (process.platform === 'win32') return ext === '.exe' ? 3 : (ext === '.zip' ? 2 : 1);
      return (ext === '.appimage' || ext === '.deb' || ext === '.rpm') ? 3 : (ext === '.zip' ? 2 : 1);
    };

    candidates.sort((a, b) => {
      const w = weight(b.name) - weight(a.name);
      if (w !== 0) return w;
      return b.stat.mtimeMs - a.stat.mtimeMs;
    });
    return candidates[0].fullPath;
  }

  /**
   * Determine expected asset suffix based on platform and arch and match filename.
   * @param {string} fileName
   * @returns {boolean}
   */
  assetMatchesPlatformArch(fileName) {
    const platformMap = { darwin: 'mac', win32: 'win', linux: 'linux' };
    const archMap = { x64: 'x64', arm64: 'arm64' };
    const plat = platformMap[process.platform] || process.platform;
    const arch = archMap[process.arch] || process.arch;
    const regex = new RegExp(`(mac|win|linux)[-_.](${Object.values(archMap).join('|')})`, 'i');
    const hasPlatArch = regex.test(fileName) && fileName.toLowerCase().includes(plat.toLowerCase()) && fileName.toLowerCase().includes(arch.toLowerCase());
    return hasPlatArch;
  }

  /**
   * Match filename to current platform regardless of arch.
   */
  assetMatchesPlatform(fileName) {
    const platformMap = { darwin: 'mac', win32: 'win', linux: 'linux' };
    const plat = platformMap[process.platform] || process.platform;
    return fileName.toLowerCase().includes(plat.toLowerCase());
  }

  /**
   * Check if filename looks like an installable asset we can handle.
   */
  assetLooksInstallable(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    return ['.zip', '.dmg', '.exe', '.deb', '.rpm', '.appimage'].includes(ext);
  }

  /**
   * Get electron-updater cache directory for the current OS.
   */
  getUpdaterCacheDir() {
    try {
      if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Caches', 'alias-forge-updater', 'pending');
      } else if (process.platform === 'win32') {
        const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        return path.join(base, 'alias-forge-updater', 'pending');
      } else {
        return path.join(os.homedir(), '.cache', 'alias-forge-updater', 'pending');
      }
    } catch (e) {
      log.error('[Updater] Could not determine updater cache dir:', e.message);
      return undefined;
    }
  }

  /**
   * macOS: extract zip with ditto and open the .app bundle inside.
   */
  extractZipAndOpenApp(zipPath) {
    log.info('[Updater] macOS: Extracting zip and opening .app bundle:', zipPath);
    const destDir = path.dirname(zipPath); // extract alongside the zip
    // If an app bundle already exists, open it directly
    const existingApp = this.findFirstByExtension(destDir, '.app');
    if (existingApp) {
      log.info('[Updater] macOS: Existing .app found, opening without re-extracting:', existingApp);
      exec(`open "${existingApp}"`, (openErr) => {
        if (openErr) {
          log.error('[Updater] FAILED: Could not open existing app -', openErr.message);
        } else {
          log.info('[Updater] SUCCESS: Existing app opened');
        }
      });
      return true;
    }

    log.info('[Updater] macOS: Extracting zip with ditto to existing dir:', destDir);
    exec(`ditto -x -k "${zipPath}" "${destDir}"`, (error) => {
      if (error) {
        log.error('[Updater] FAILED: ditto unzip error -', error.message);
        this.openDmgFallback();
        return;
      }
        // Find .app inside destDir
        let filenames = [];
        try { filenames = fs.readdirSync(destDir); } catch (e) { filenames = []; }
        log.info('[Updater] Filenames in directory:', filenames);

        const appBundle = this.findFirstByExtension(destDir, '.app');
      if (!appBundle) {
        log.error('[Updater] No .app bundle found after extraction');
        // Try a second pass after a short delay in case filesystem lags
        setTimeout(() => {
          const delayedApp = this.findFirstByExtension(destDir, '.app');
          if (delayedApp) {
            log.info('[Updater] Found .app on delayed scan, opening:', delayedApp);
            exec(`open "${delayedApp}"`, (openErr) => {
              if (openErr) {
                log.error('[Updater] FAILED: Could not open delayed app -', openErr.message);
              } else {
                log.info('[Updater] SUCCESS: Delayed app opened');
              }
            });
          } else {
            this.openDmgFallback();
          }
        }, 500);
        return;
      }
      log.info('[Updater] Opening extracted app bundle:', appBundle);
      exec(`open "${appBundle}"`, (openErr) => {
        if (openErr) {
          log.error('[Updater] FAILED: Could not open extracted app -', openErr.message);
        } else {
          log.info('[Updater] SUCCESS: Extracted app opened');
        }
      });
    });
    return true;
  }

  /**
   * Windows: extract zip and run the contained .exe
   */
  extractZipAndRunWindowsExe(zipPath) {
    const destDir = path.join(path.dirname(zipPath), `extracted-${Date.now()}`);
    try { fs.mkdirSync(destDir, { recursive: true }); } catch {}
    const psCmd = `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`;
    log.info('[Updater] Windows: Extracting zip via PowerShell to:', destDir);
    try {
      exec(psCmd, (error) => {
        if (error) {
          log.error('[Updater] FAILED: Expand-Archive error -', error.message);
          return;
        }
        const exePath = this.findFirstByExtension(destDir, '.exe');
        if (!exePath) {
          log.error('[Updater] No .exe found after extraction');
          return;
        }
        log.info('[Updater] Launching extracted .exe:', exePath);
        const proc = spawn(exePath, [], { detached: true, stdio: 'ignore' });
        proc.unref();
      });
    } catch (e) {
      log.error('[Updater] Windows: extraction/launch error -', e.message);
      return false;
    }
    return true;
  }

  /**
   * Linux: extract zip and run the contained executable/AppImage
   */
  extractZipAndRunLinux(zipPath) {
    const destDir = path.join(path.dirname(zipPath), `extracted-${Date.now()}`);
    try { fs.mkdirSync(destDir, { recursive: true }); } catch {}
    const unzipCmd = `unzip -q "${zipPath}" -d "${destDir}"`;
    log.info('[Updater] Linux: Extracting zip via unzip to:', destDir);
    try {
      exec(unzipCmd, (error) => {
        if (error) {
          log.error('[Updater] FAILED: unzip error -', error.message);
          return;
        }
        // Prefer AppImage, else any executable file
        const appImage = this.findFirstByExtension(destDir, '.appimage');
        const exePath = appImage || this.findFirstExecutable(destDir);
        if (!exePath) {
          log.error('[Updater] No executable found after extraction');
          return;
        }
        log.info('[Updater] Launching extracted binary:', exePath);
        const proc = spawn(exePath, [], { detached: true, stdio: 'ignore' });
        proc.unref();
      });
    } catch (e) {
      log.error('[Updater] Linux: extraction/launch error -', e.message);
      return false;
    }
    return true;
  }

  /**
   * Recursively find first file by extension under a directory.
   */
  findFirstByExtension(rootDir, extLower) {
    log.info('[Updater] Searching for first file with extension', extLower, 'under', rootDir);
    const stack = [rootDir];
    while (stack.length) {
      const dir = stack.pop();
      let children;
      try { children = fs.readdirSync(dir); } catch { continue; }
      for (const name of children) {
        const full = path.join(dir, name);
        let stat; try { stat = fs.statSync(full); } catch { continue; }
        const childExt = path.extname(full).toLowerCase();
        if (stat.isDirectory()) {
          // If the directory itself has the desired extension (e.g., MyApp.app), return it
          if (childExt === extLower.toLowerCase()) {
            return full;
          }
          stack.push(full);
        } else if (childExt === extLower.toLowerCase()) {
          return full;
        }
      }
    }
    return undefined;
  }

  /**
   * Linux helper: find first executable file under a directory.
   */
  findFirstExecutable(rootDir) {
    const stack = [rootDir];
    while (stack.length) {
      const dir = stack.pop();
      let children;
      try { children = fs.readdirSync(dir); } catch { continue; }
      for (const name of children) {
        const full = path.join(dir, name);
        let stat; try { stat = fs.statSync(full); } catch { continue; }
        if (stat.isDirectory()) {
          stack.push(full);
        } else {
          // Check executable bit
          const isExec = (stat.mode & 0o111) !== 0;
          if (isExec) return full;
        }
      }
    }
    return undefined;
  }

  /**
   * macOS helper: if zip extraction fails to produce an app, try opening a dmg in cache.
   */
  openDmgFallback() {
    const dmg = this.findInstallerByExt('.dmg');
    if (!dmg) {
      log.warn('[Updater] No DMG fallback found in cache');
      return false;
    }
    log.info('[Updater] Opening DMG fallback:', dmg);
    exec(`open "${dmg}"`, (err) => {
      if (err) {
        log.error('[Updater] FAILED: Could not open DMG fallback -', err.message);
      } else {
        log.info('[Updater] SUCCESS: DMG fallback opened');
      }
    });
    return true;
  }

  /**
   * Locate installer by extension in updater cache, preferring platform/arch.
   */
  findInstallerByExt(ext) {
    const cacheDir = this.getUpdaterCacheDir();
    if (!cacheDir || !fs.existsSync(cacheDir)) return undefined;
    const entries = fs.readdirSync(cacheDir).map(name => ({
      name,
      fullPath: path.join(cacheDir, name),
      stat: (() => { try { return fs.statSync(path.join(cacheDir, name)); } catch { return null; } })()
    })).filter(e => e.stat && e.stat.isFile() && path.extname(e.name).toLowerCase() === ext.toLowerCase());

    if (entries.length === 0) return undefined;
    const exact = entries.filter(e => this.assetMatchesPlatformArch(e.name));
    const plat = entries.filter(e => this.assetMatchesPlatform(e.name));
    const pool = exact.length ? exact : (plat.length ? plat : entries);
    pool.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return pool[0]?.fullPath;
  }

  /**
   * Handle an available update: pick matching asset, download, extract and process.
   * @param {Object} info
   */
  async handleUpdateAvailable(info) {
    log.info('[Updater] handleUpdateAvailable() starting for version:', info.version);
    try {
      const asset = this.selectBestAssetFromInfo(info);
      if (!asset) {
        log.warn('[Updater] No matching asset found in release info, falling back to autoUpdater download');
        // fallback to built-in downloader
        await autoUpdater.downloadUpdate();
        return;
      }

      // Determine URL for asset
      const url = (typeof asset === 'string') ? asset : (asset.url || asset.path || asset.file || asset.name || asset.filename);
      if (!url) {
        log.warn('[Updater] Selected asset has no usable URL, falling back to autoUpdater download');
        await autoUpdater.downloadUpdate();
        return;
      }

      // If URL is not HTTP(S), assume it's a filename and construct GitHub release URL
      let finalUrl = url;
      if (typeof finalUrl === 'string' && !finalUrl.startsWith('http')) {
        const version = info.version;
        finalUrl = `https://github.com/rrajendran/alias-forge/releases/download/v${version}/${finalUrl}`;
        log.info('[Updater] Constructed full URL:', finalUrl);
      }

      const cacheDir = this.getUpdaterCacheDir();
      if (!cacheDir) throw new Error('Updater cache directory unavailable');
      try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}

      const dest = path.join(cacheDir, path.basename(finalUrl));
      log.info('[Updater] Resolving asset URL/path:', finalUrl, 'dest:', dest);

      let downloaded;
      // Handle local file URLs / absolute paths / existing cache files first
      try {
        if (typeof finalUrl === 'string' && finalUrl.startsWith('file://')) {
          const filePath = finalUrl.replace(/^file:\/\//, '');
          if (fs.existsSync(filePath)) {
            if (path.resolve(filePath) !== path.resolve(dest)) fs.copyFileSync(filePath, dest);
            downloaded = dest;
          } else {
            throw new Error('Local asset not found: ' + filePath);
          }
        } else if (typeof finalUrl === 'string' && path.isAbsolute(finalUrl)) {
          if (fs.existsSync(finalUrl)) {
            if (path.resolve(finalUrl) !== path.resolve(dest)) fs.copyFileSync(finalUrl, dest);
            downloaded = dest;
          } else {
            throw new Error('Absolute asset path not found: ' + finalUrl);
          }
        } else if (typeof finalUrl === 'string' && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(finalUrl)) {
          // No scheme; treat as filename relative to cache dir first
          const candidate = path.join(cacheDir, finalUrl);
          if (fs.existsSync(candidate)) {
            if (path.resolve(candidate) !== path.resolve(dest)) fs.copyFileSync(candidate, dest);
            downloaded = dest;
          } else {
            // Not present locally; fall back to HTTP if it looks like a URL-ish string
            log.info('[Updater] Asset appears to be a bare filename but not present in cache, will attempt HTTP download');
          }
        }
      } catch (e) {
        log.warn('[Updater] Local asset handling failed:', e && e.message ? e.message : e);
      }

      // If not handled by local-copy logic, attempt HTTP(S) download
      if (!downloaded) {
        if (typeof finalUrl === 'string' && (finalUrl.startsWith('http://') || finalUrl.startsWith('https://'))) {
          log.info('[Updater] Downloading asset via HTTP(S) to:', dest);
          downloaded = await this.downloadFile(finalUrl, dest);
        } else if (typeof finalUrl === 'string' && fs.existsSync(path.join(cacheDir, finalUrl))) {
          // final fallback: file present in cache under filename
          const candidate = path.join(cacheDir, finalUrl);
          if (path.resolve(candidate) !== path.resolve(dest)) fs.copyFileSync(candidate, dest);
          downloaded = dest;
        } else {
          log.warn('[Updater] Asset URL is not HTTP(S) and not present locally; falling back to autoUpdater.downloadUpdate()');
          await autoUpdater.downloadUpdate();
          return;
        }
      }

      log.info('[Updater] Download completed/resolved to:', downloaded);
      this.lastDownloadedPath = downloaded;

      // Extract and process downloaded asset
      await this.extractAndProcessAsset(downloaded);
      this.sendStatusToRenderer('asset-processed', { path: downloaded });
    } catch (err) {
      log.error('[Updater] Error in handleUpdateAvailable:', err && err.message ? err.message : err);
      throw err;
    }
  }

  /**
   * Choose best asset from the info.files list to match current platform/arch
   */
  selectBestAssetFromInfo(info) {
    if (!info || !info.files || !Array.isArray(info.files)) return undefined;
    // Normalize to objects with url/path/name
    const files = info.files.map((f) => {
      if (!f) return null;
      if (typeof f === 'string') return { url: f };
      return f;
    }).filter(Boolean);

    const version = info.version ? info.version.toString() : null;

    const normalizeName = (f) => ((f.path || f.name || f.filename || f.url || '') + '').toString();
    const extOf = (f) => path.extname(normalizeName(f)).toLowerCase();

    // Define priority: executables first, then archives
    const execExts = ['.dmg', '.exe', '.deb', '.rpm', '.appimage'];
    const archiveExts = ['.zip'];

    const byPreference = (extList) => {
      // filter by ext list
      const candidates = files.filter(f => extList.includes(extOf(f)));
      if (!candidates.length) return [];
      // prefer exact platform+arch
      const exact = candidates.filter(f => this.assetMatchesPlatformArch(normalizeName(f)));
      if (exact.length) return exact;
      // prefer platform-only
      const plat = candidates.filter(f => this.assetMatchesPlatform(normalizeName(f)));
      if (plat.length) return plat;
      // prefer those containing version string
      if (version) {
        const withVer = candidates.filter(f => normalizeName(f).includes(version));
        if (withVer.length) return withVer;
      }
      return candidates;
    };

    // Try executables first
    const execCandidates = byPreference(execExts);
    if (execCandidates.length) return execCandidates[0];

    // Then archives
    const archiveCandidates = byPreference(archiveExts);
    if (archiveCandidates.length) return archiveCandidates[0];

    // Fallback to best matching by platform/arch or first
    const exactAll = files.filter(f => this.assetMatchesPlatformArch(normalizeName(f)));
    if (exactAll.length) return exactAll[0];
    const platAll = files.filter(f => this.assetMatchesPlatform(normalizeName(f)));
    if (platAll.length) return platAll[0];

    return files[0];
  }

  /**
   * Download remote file to destination path using http/https
   * @returns {Promise<string>} path
   */
  downloadFile(url, dest, redirectCount = 0) {
    return new Promise((resolve, reject) => {
      if (redirectCount > 5) {
        return reject(new Error('Too many redirects'));
      }
      try {
        const proto = url.startsWith('https') ? require('https') : require('http');
        const file = fs.createWriteStream(dest);
        const req = proto.get(url, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // Handle redirect
            file.close();
            try { fs.unlinkSync(dest); } catch {};
            const redirectUrl = res.headers.location.startsWith('http') ? res.headers.location : require('url').resolve(url, res.headers.location);
            log.info('[Updater] Following redirect to:', redirectUrl);
            return this.downloadFile(redirectUrl, dest, redirectCount + 1).then(resolve).catch(reject);
          }
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`Download failed: ${res.statusCode} ${res.statusMessage}`));
          }
          res.pipe(file);
          file.on('finish', () => {
            file.close(() => resolve(dest));
          });
        });
        req.on('error', (err) => {
          try { fs.unlinkSync(dest); } catch {};
          reject(err);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Extract and process asset at given path. Handles zip/dmg/exe/deb/rpm/AppImage
   * @param {string} assetPath
   */
  async extractAndProcessAsset(assetPath) {
    try {
      const ext = path.extname(assetPath).toLowerCase();
      log.info('[Updater] extractAndProcessAsset ext:', ext, 'path:', assetPath);
      if (process.platform === 'darwin') {
        if (ext === '.zip') {
          // extract next to zip and open the extraction directory
          const dest = path.dirname(assetPath);
          await new Promise((resolve, reject) => {
            exec(`ditto -x -k "${assetPath}" "${dest}"`, (err) => err ? reject(err) : resolve());
          });
          // If an .app exists inside, prefer opening it; otherwise open the dest folder
          const appBundle = this.findFirstByExtension(dest, '.app');
          if (appBundle) {
            log.info('[Updater] Found .app after unzip:', appBundle);
            exec(`open "${appBundle}"`, (err) => {
              if (err) log.error('[Updater] Could not open extracted .app:', err.message);
            });
            return true;
          }
          log.info('[Updater] No .app found inside zip; opening extraction directory:', dest);
          this.openFolder(dest);
          return true;
        }

        if (ext === '.dmg') {
          // Try to open the DMG file
          exec(`open "${assetPath}"`, (error) => {
            if (error) {
              log.error('[Updater] Failed to open DMG, opening directory');
              this.openFolder(path.dirname(assetPath));
            } else {
              log.info('[Updater] DMG opened successfully');
            }
          });
          return true;
        }

        // other file types: open containing folder
        this.openFolder(path.dirname(assetPath));
        return false;
      } else if (process.platform === 'win32') {
        // For windows, zip -> extract and run exe if found, else open folder
        if (ext === '.zip') {
          return this.extractZipAndRunWindowsExe(assetPath);
        }
        if (ext === '.exe') {
          const proc = spawn(assetPath, [], { detached: true, stdio: 'ignore' });
          proc.on('error', (error) => {
            log.error('[Updater] Failed to launch exe, opening directory');
            this.openFolder(path.dirname(assetPath));
          });
          proc.unref();
          return true;
        }
        this.openFolder(path.dirname(assetPath));
        return false;
      } else {
        // linux
        if (ext === '.zip') {
          return this.extractZipAndRunLinux(assetPath);
        }
        if (ext === '.appimage') {
          const proc = spawn(assetPath, [], { detached: true, stdio: 'ignore' });
          proc.on('error', (error) => {
            log.error('[Updater] Failed to launch AppImage, opening directory');
            this.openFolder(path.dirname(assetPath));
          });
          proc.unref();
          return true;
        }
        if (ext === '.deb' || ext === '.rpm') {
          // Try to open the package file with default application
          exec(`xdg-open "${assetPath}"`, (error) => {
            if (error) {
              log.error('[Updater] Failed to open package, opening directory');
              this.openFolder(path.dirname(assetPath));
            } else {
              log.info('[Updater] Package opened successfully');
            }
          });
          return true;
        }
        this.openFolder(path.dirname(assetPath));
        return false;
      }
    } catch (e) {
      log.error('[Updater] extractAndProcessAsset error:', e && e.message ? e.message : e);
      // open cache dir as graceful fallback
      try { this.openFolder(path.dirname(assetPath)); } catch (ee) {}
      return false;
    }
  }

  /**
   * Handle DMG: mount, find .app, move to /Applications, detach
   */
  async handleDmg(dmgPath) {
    log.info('[Updater] handleDmg mounting dmg:', dmgPath);
    const mountPointPrefix = '/Volumes';
    try {
      // Attach dmg read-only
      const attachCmd = `hdiutil attach "${dmgPath}" -nobrowse -readonly`;
      const { stdout, stderr } = await new Promise((resolve, reject) => {
        exec(attachCmd, (err, out, errout) => err ? reject(err) : resolve({ stdout: out, stderr: errout }));
      });
      log.info('[Updater] hdiutil attach output:', stdout || stderr);
      // parse mount point lines for /Volumes/<Name>
      const lines = (stdout || stderr || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const vols = lines.map(l => {
        const m = l.match(/(\/Volumes\/[^\s]+)/);
        return m ? m[1] : null;
      }).filter(Boolean);
      if (!vols.length) {
        log.warn('[Updater] No mount point detected for DMG');
        this.openFolder(path.dirname(dmgPath));
        return false;
      }
      // find .app inside mounts
      let foundApp;
      for (const vol of vols) {
        const candidate = this.findFirstByExtension(vol, '.app');
        if (candidate) { foundApp = candidate; break; }
      }
      if (!foundApp) {
        log.warn('[Updater] No .app found inside mounted DMG');
        // detach mounts then open cache
        for (const vol of vols) {
          try { exec(`hdiutil detach "${vol}" -quiet`); } catch {}
        }
        this.openFolder(path.dirname(dmgPath));
        return false;
      }
      log.info('[Updater] Found app in DMG:', foundApp, '-> moving to /Applications');
      // Use ditto to copy app to /Applications
      const dest = path.join('/Applications', path.basename(foundApp));
      await new Promise((resolve, reject) => {
        exec(`ditto "${foundApp}" "${dest}"`, (err) => err ? reject(err) : resolve());
      });
      log.info('[Updater] Copied app to /Applications:', dest);
      // detach mounts
      for (const vol of vols) {
        try { exec(`hdiutil detach "${vol}" -quiet`); } catch (e) { log.warn('[Updater] hdiutil detach failed:', e && e.message ? e.message : e); }
      }
      // open /Applications to show result
      this.openFolder('/Applications');
      return true;
    } catch (e) {
      log.error('[Updater] handleDmg failed:', e && e.message ? e.message : e);
      try { exec(`hdiutil detach "${dmgPath}" -quiet`); } catch {};
      this.openFolder(path.dirname(dmgPath));
      return false;
    }
  }

  /**
   * Open a folder in OS file browser
   */
  openFolder(folder) {
    try {
      if (!folder || !fs.existsSync(folder)) {
        log.warn('[Updater] openFolder: folder does not exist:', folder);
        return false;
      }
      if (process.platform === 'darwin') {
        exec(`open "${folder}"`);
      } else if (process.platform === 'win32') {
        exec(`explorer "${folder.replace(/\//g, '\\\\')}"`);
      } else {
        exec(`xdg-open "${folder}"`);
      }
      return true;
    } catch (e) {
      log.error('[Updater] openFolder failed:', e && e.message ? e.message : e);
      return false;
    }
  }

  /**
   * Get last update info
   * @returns {Object|null} Last update information or null if no update found
   */
  getLastUpdateInfo() {
    log.info('[Updater] getLastUpdateInfo() called - returning:', this.lastUpdateInfo ? this.lastUpdateInfo.version : 'null');
    return this.lastUpdateInfo;
  }

  /**
   * Send update status to renderer process
   * @param {string} status - Update status
   * @param {Object} data - Additional data
   */
  sendStatusToRenderer(status, data = {}) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      log.info('[Updater] Sending status to renderer:', status);
      this.mainWindow.webContents.send('update-status', {
        status,
        data,
        timestamp: Date.now()
      });
    } else {
      log.warn('[Updater] Cannot send status to renderer - window is not available');
    }
  }

  /**
   * Start periodic update checks
   */
  startPeriodicChecks() {
    if (this.updateCheckInterval) {
      log.warn('[Updater] Periodic checks already running, clearing previous interval');
      clearInterval(this.updateCheckInterval);
    }

    const intervalHours = this.checkIntervalMs / 1000 / 60 / 60;
    log.info('[Updater] Starting periodic update checks (every', intervalHours, 'hours)');

    this.updateCheckInterval = setInterval(() => {
      log.info('[Updater] Running scheduled periodic update check');
      this.checkForUpdates(true);
    }, this.checkIntervalMs);

    log.info('[Updater] Periodic update checks enabled');
  }

  /**
   * Stop periodic update checks
   */
  stopPeriodicChecks() {
    if (this.updateCheckInterval) {
      log.info('[Updater] Stopping periodic update checks');
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
      log.info('[Updater] Periodic update checks disabled');
    } else {
      log.warn('[Updater] No periodic checks to stop');
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    log.info('[Updater] Cleaning up resources');
    this.stopPeriodicChecks();
    autoUpdater.removeAllListeners();
    log.info('[Updater] Updater cleaned up successfully');
  }
}

// Export singleton instance
module.exports = new Updater();
