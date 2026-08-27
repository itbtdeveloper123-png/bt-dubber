const { app, BrowserWindow, shell, ipcMain, nativeImage } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const PORT = process.env.PORT || 3000;
let mainWindow = null;
let serverProcess = null;

// Set Application User Model ID for Windows taskbar icon grouping
if (process.platform === 'win32') {
  app.setAppUserModelId('com.btdubber.studio');
}

// Enforce single instance lock
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Locate application root & data directory
function getAppDataDir() {
  if (isDev) {
    return path.join(process.cwd(), 'data');
  }
  const userDir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // Seed database and assets from bundled extraResources if target is missing or unseeded
  try {
    const bundledDataDir = path.join(process.resourcesPath, 'data');
    const bundledDbPath = path.join(bundledDataDir, 'dubber.db');
    const targetDbPath = path.join(userDir, 'dubber.db');

    if (fs.existsSync(bundledDbPath)) {
      let shouldCopyDb = false;
      if (!fs.existsSync(targetDbPath)) {
        shouldCopyDb = true;
      } else {
        const targetSize = fs.statSync(targetDbPath).size;
        const bundledSize = fs.statSync(bundledDbPath).size;
        // If user DB is an empty skeleton (< 1MB) while bundled DB contains actual project data (> 1MB)
        if (targetSize < 1024 * 1024 && bundledSize > targetSize) {
          shouldCopyDb = true;
        }
      }

      if (shouldCopyDb) {
        console.log('[Electron] Initializing user database from bundled dubber.db...');
        fs.copyFileSync(bundledDbPath, targetDbPath);
        console.log('[Electron] Initialized dubber.db successfully at:', targetDbPath);
      }
    }

    // Seed fonts, cloned_voices and other assets
    ['fonts', 'cloned_voices'].forEach((folderName) => {
      const srcFolder = path.join(bundledDataDir, folderName);
      const destFolder = path.join(userDir, folderName);
      if (fs.existsSync(srcFolder) && !fs.existsSync(destFolder)) {
        fs.cpSync(srcFolder, destFolder, { recursive: true });
      }
    });
  } catch (err) {
    console.error('[Electron] Error during database/asset seeding:', err);
  }

  return userDir;
}

// Check if backend HTTP server is ready (must return 200/300 status, not 404/500)
function checkServerHealthy(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(port, timeoutMs = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const healthy = await checkServerHealthy(port);
    if (healthy) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

// Start backend Express server in production
function startBackendServer() {
  if (isDev) {
    console.log('[Electron] Running in DEV mode, connecting to active Vite/Express server on port', PORT);
    return;
  }

  try {
    const appDataDir = getAppDataDir();
    const appPath = app.getAppPath();

    // Prioritize unpacked dist for direct native node execution
    let serverScriptPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'server.cjs');
    if (!fs.existsSync(serverScriptPath)) {
      serverScriptPath = path.join(appPath, 'dist', 'server.cjs');
    }
    if (!fs.existsSync(serverScriptPath)) {
      serverScriptPath = path.join(process.resourcesPath, 'dist', 'server.cjs');
    }

    console.log('[Electron] Launching backend server from:', serverScriptPath);
    console.log('[Electron] App Data Directory:', appDataDir);

    const nodeModulesPath = path.join(appPath, 'node_modules');
    const unpackedModulesPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');

    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      APP_DATA_DIR: appDataDir,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: [unpackedModulesPath, nodeModulesPath].join(path.delimiter)
    };

    serverProcess = spawn(process.execPath, [serverScriptPath], {
      env,
      cwd: isDev ? process.cwd() : path.dirname(serverScriptPath),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (serverProcess.stdout) {
      serverProcess.stdout.on('data', (data) => {
        console.log(`[Server Out]: ${data.toString()}`);
      });
    }

    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', (data) => {
        console.error(`[Server Err]: ${data.toString()}`);
      });
    }

    serverProcess.on('exit', (code, signal) => {
      console.log(`[Server] Process exited with code ${code}, signal ${signal}`);
    });
  } catch (err) {
    console.error('[Electron] Failed to launch backend server:', err);
  }
}

function stopBackendServer() {
  if (serverProcess) {
    console.log('[Electron] Terminating backend server process...');
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t']);
      } else {
        serverProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.error('[Electron] Error killing server process:', e);
    }
    serverProcess = null;
  }
}

async function createWindow() {
  const icoPath = path.join(__dirname, 'resources', 'icon.ico');
  const iconPath = path.join(__dirname, 'resources', 'icon.png');
  let chosenIcon = null;
  try {
    if (fs.existsSync(icoPath)) {
      chosenIcon = nativeImage.createFromPath(icoPath);
    } else if (fs.existsSync(iconPath)) {
      chosenIcon = nativeImage.createFromPath(iconPath);
    }
  } catch (err) {
    console.warn('[Electron] Could not load native icon:', err);
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'BT-Dubber Studio - AI Video Dubbing & Movie Recap',
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    show: false,
    icon: (chosenIcon && !chosenIcon.isEmpty()) ? chosenIcon : (fs.existsSync(icoPath) ? icoPath : iconPath),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  if (chosenIcon && !chosenIcon.isEmpty()) {
    mainWindow.setIcon(chosenIcon);
  }

  mainWindow.maximize();

  // Wait for the backend server to respond with 200 OK
  await waitForServer(PORT, 30000);

  const appUrl = `http://127.0.0.1:${PORT}`;
  console.log(`[Electron] Loading application URL: ${appUrl}`);
  await mainWindow.loadURL(appUrl);

  mainWindow.show();

  // Open external links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handler for opening folder
ipcMain.handle('show-item-in-folder', async (_event, fullPath) => {
  if (fullPath && fs.existsSync(fullPath)) {
    shell.showItemInFolder(fullPath);
    return true;
  }
  return false;
});

// Auto-Updater Configuration (GitHub Releases)
let autoUpdater = null;
try {
  const updaterModule = require('electron-updater');
  autoUpdater = updaterModule.autoUpdater;
  if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
  }
} catch (e) {
  console.warn('[Electron] electron-updater not initialized:', e.message);
}

function setupAutoUpdater() {
  if (isDev || !autoUpdater) return;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates on GitHub Releases...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] App is up to date.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available', info);
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', {
        percent: Math.round(progressObj.percent || 0),
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded successfully:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info);
    }
  });

  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] Update notice:', err?.message || err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', err?.message || 'Check update notice');
    }
  });

  // Check for updates 5 seconds after startup
  setTimeout(() => {
    try {
      autoUpdater.checkForUpdates().catch(e => console.warn('[AutoUpdater] Initial check:', e.message));
    } catch {}
  }, 5000);
}

// IPC Handlers for Auto Updater
ipcMain.handle('check-for-updates', async () => {
  if (isDev || !autoUpdater) {
    return { isDev: true, message: 'កំពុងស្ថិតក្នុង Development Mode' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('start-download-update', async () => {
  if (!autoUpdater) return { success: false, error: 'Updater not available' };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('quit-and-install-update', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall(false, true);
  }
});

// App Lifecycle
app.whenReady().then(async () => {
  startBackendServer();
  await createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackendServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackendServer();
});

app.on('will-quit', () => {
  stopBackendServer();
});
