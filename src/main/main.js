'use strict';

/*
 * Spotify Overlay - main process.
 * Owns the overlay window, the settings window, the tray icon, global shortcuts,
 * the Spotify polling client and the optional OBS browser-source server.
 */

const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  shell,
  screen,
  globalShortcut,
  nativeImage,
  dialog,
  desktopCapturer,
  session
} = require('electron');

const { SettingsStore } = require('./store');
const { TokenStore } = require('./token-store');
const { SpotifyClient } = require('./spotify-client');
const { ObsServer } = require('./obs-server');
const { redirectUri } = require('./spotify-auth');
const { getEffectiveTheme, sanitizeThemeValues } = require('../shared/themes');

const IS_DEV = process.argv.includes('--dev');
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');
const OVERLAY_MARGIN_DEFAULT = { width: 480, height: 170 };

// --smoke-test=<dir>: start with a throwaway profile, screenshot both windows into <dir>, quit.
const SMOKE_ARG = process.argv.find((a) => a.startsWith('--smoke-test='));
const SMOKE_DIR = SMOKE_ARG ? path.resolve(SMOKE_ARG.split('=')[1]) : null;
if (SMOKE_DIR) app.setPath('userData', path.join(SMOKE_DIR, 'profile'));

// The visualizer analyses audio without any user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());
  app.whenReady().then(init).catch((err) => {
    console.error(err);
    dialog.showErrorBox('Spotify Overlay failed to start', String(err && err.stack ? err.stack : err));
    app.quit();
  });
}

let store;
let spotify;
let obs;
let overlayWin = null;
let settingsWin = null;
let tray = null;
let overlayVisible = true;
let loggingIn = false;
let shortcutStatus = {};
let moveSaveTimer = null;

/* ------------------------------------------------------------------ helpers */

function settings() {
  return store.get();
}

function isOwnSender(event) {
  const wc = event.sender;
  return (overlayWin && !overlayWin.isDestroyed() && wc === overlayWin.webContents) ||
    (settingsWin && !settingsWin.isDestroyed() && wc === settingsWin.webContents);
}

function sendTo(win, channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function broadcast(channel, data) {
  sendTo(overlayWin, channel, data);
  sendTo(settingsWin, channel, data);
  if (obs) obs.broadcast(channel, data);
}

function authStatus() {
  const s = settings();
  return Object.assign(spotify.status(), {
    loggingIn,
    clientIdSet: Boolean(s.account.clientId),
    redirectUri: redirectUri(s.account.redirectPort)
  });
}

function previewState() {
  return Boolean(settingsWin && !settingsWin.isDestroyed() && settings().general.showDemoInSettings);
}

function appIcon(name) {
  const file = path.join(ASSETS, name);
  return fs.existsSync(file) ? nativeImage.createFromPath(file) : nativeImage.createEmpty();
}

function safeOpenExternal(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') shell.openExternal(u.toString());
  } catch (_) { /* ignore invalid URLs */ }
}

function hardenWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    safeOpenExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Surface renderer warnings/errors in the terminal (all messages with --dev).
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2 || IS_DEV) console.log(`[renderer] ${message} (${path.basename(sourceId || '')}:${line})`);
  });
}

/* ------------------------------------------------------------------ overlay window */

function isPointOnScreen(x, y) {
  return screen.getAllDisplays().some(({ workArea: a }) => x >= a.x && y >= a.y && x < a.x + a.width && y < a.y + a.height);
}

function initialOverlayBounds() {
  const s = settings();
  const { width, height } = OVERLAY_MARGIN_DEFAULT;
  if (Number.isFinite(s.window.x) && Number.isFinite(s.window.y) && isPointOnScreen(s.window.x + 20, s.window.y + 20)) {
    return { x: s.window.x, y: s.window.y, width, height };
  }
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - width - 16, y: a.y + 16, width, height };
}

function createOverlay() {
  const bounds = initialOverlayBounds();
  overlayWin = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    title: 'Spotify Overlay',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      partition: 'overlay'
    }
  });
  hardenWindow(overlayWin);
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // System-audio loopback for the visualizer (Windows). The renderer requests a display
  // stream; we answer with the primary screen + loopback audio and it drops the video track.
  session.fromPartition('overlay').setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then((sources) => {
        if (!sources.length) return callback({});
        callback({ video: sources[0], audio: 'loopback' });
      })
      .catch(() => callback({}));
  });

  overlayWin.loadFile(path.join(RENDERER, 'overlay', 'index.html'));
  overlayWin.once('ready-to-show', () => {
    applyLock();
    overlayVisible = !settings().general.startHidden;
    if (overlayVisible) overlayWin.showInactive();
    updateTrayMenu();
  });

  const savePos = () => {
    clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(() => {
      if (!overlayWin || overlayWin.isDestroyed()) return;
      const [x, y] = overlayWin.getPosition();
      store.set('window.x', x);
      store.set('window.y', y);
    }, 400);
  };
  overlayWin.on('move', savePos);
  overlayWin.on('closed', () => { overlayWin = null; });
  if (IS_DEV) overlayWin.webContents.openDevTools({ mode: 'detach' });
}

function applyLock() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  const locked = settings().layout.locked;
  // Locked = fully click-through so it never blocks games or apps underneath.
  overlayWin.setIgnoreMouseEvents(locked, locked ? { forward: true } : undefined);
  overlayWin.setFocusable(!locked);
}

function setOverlayVisible(visible) {
  overlayVisible = visible;
  if (overlayWin && !overlayWin.isDestroyed()) {
    if (visible) overlayWin.showInactive();
    else overlayWin.hide();
  }
  sendTo(settingsWin, 'overlay-visible', overlayVisible);
  updateTrayMenu();
}

/* ------------------------------------------------------------------ settings window */

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 1060,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    show: false,
    title: 'Spotify Overlay — Settings',
    backgroundColor: '#0f0f10',
    icon: appIcon('icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (process.platform !== 'darwin') settingsWin.setMenu(null);
  hardenWindow(settingsWin);
  settingsWin.loadFile(path.join(RENDERER, 'settings', 'index.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => {
    settingsWin = null;
    broadcast('preview', previewState());
  });
  broadcast('preview', previewState());
  if (IS_DEV) settingsWin.webContents.openDevTools({ mode: 'detach' });
}

/* ------------------------------------------------------------------ tray */

function updateTrayMenu() {
  if (!tray) return;
  const s = settings();
  const menu = Menu.buildFromTemplate([
    { label: 'Spotify Overlay', enabled: false },
    { type: 'separator' },
    { label: overlayVisible ? 'Hide overlay' : 'Show overlay', click: () => setOverlayVisible(!overlayVisible) },
    { label: s.layout.locked ? 'Unlock position (move overlay)' : 'Lock position (click-through)', click: () => store.set('layout.locked', !s.layout.locked) },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const icon = appIcon('tray.png');
  tray = new Tray(icon.isEmpty() ? appIcon('icon.png').resize({ width: 16, height: 16 }) : icon);
  tray.setToolTip('Spotify Overlay');
  tray.on('click', openSettings);
  updateTrayMenu();
}

/* ------------------------------------------------------------------ shortcuts & startup */

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const s = settings().shortcuts;
  const actions = {
    toggleOverlay: () => setOverlayVisible(!overlayVisible),
    toggleLock: () => store.set('layout.locked', !settings().layout.locked)
  };
  shortcutStatus = {};
  for (const [name, fn] of Object.entries(actions)) {
    const acc = s[name];
    if (!acc) {
      shortcutStatus[name] = 'disabled';
      continue;
    }
    try {
      shortcutStatus[name] = globalShortcut.register(acc, fn) ? 'ok' : 'in-use';
    } catch (_) {
      shortcutStatus[name] = 'invalid';
    }
  }
  sendTo(settingsWin, 'shortcuts-status', shortcutStatus);
}

function applyLoginItem() {
  // Only meaningful for the packaged app; in development it would register electron.exe.
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({ openAtLogin: settings().general.launchAtStartup });
  } catch (err) {
    console.warn('[startup] Could not update login item:', err.message);
  }
}

async function applyObs() {
  const s = settings().obs;
  try {
    if (s.enabled) await obs.start(s.port);
    else await obs.stop();
    sendTo(settingsWin, 'obs-status', { running: obs.isRunning(), port: s.port, error: null });
  } catch (err) {
    sendTo(settingsWin, 'obs-status', { running: false, port: s.port, error: err.message });
  }
}

/* ------------------------------------------------------------------ IPC */

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isOwnSender(event)) throw new Error('Unauthorized');
    return fn(...args);
  });
}

function registerIpc() {
  handle('settings:get', () => settings());
  handle('settings:set', (p, value) => store.set(p, value));
  handle('settings:reset', () => store.reset());
  handle('theme:apply', (id) => store.applyTheme(id));
  handle('theme:set', (key, value) => store.setThemeValue(key, value));
  handle('theme:reset-overrides', () => store.resetThemeOverrides());
  handle('theme:save-custom', (name) => store.saveCustomTheme(name, getEffectiveTheme(settings())));
  handle('theme:delete-custom', (id) => store.deleteCustomTheme(id));

  handle('theme:export', async () => {
    const s = settings();
    const { canceled, filePath } = await dialog.showSaveDialog(settingsWin, {
      title: 'Export theme',
      defaultPath: 'my-overlay-theme.json',
      filters: [{ name: 'Theme JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return false;
    const name = (require('../shared/themes').findTheme(s.themeId, s.customThemes) || {}).name || 'Theme';
    fs.writeFileSync(filePath, JSON.stringify({ type: 'spotify-overlay-theme', name, values: getEffectiveTheme(s) }, null, 2));
    return true;
  });

  handle('theme:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(settingsWin, {
      title: 'Import theme',
      properties: ['openFile'],
      filters: [{ name: 'Theme JSON', extensions: ['json'] }]
    });
    if (canceled || !filePaths[0]) return false;
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    const values = sanitizeThemeValues(data && data.values);
    if (!Object.keys(values).length) throw new Error('This file does not contain a valid theme.');
    store.saveCustomTheme(typeof data.name === 'string' ? data.name : 'Imported theme', values);
    return true;
  });

  handle('settings:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(settingsWin, {
      title: 'Export settings',
      defaultPath: 'spotify-overlay-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return false;
    const s = settings();
    delete s.window;
    s.account = { clientId: '', redirectPort: s.account.redirectPort };
    fs.writeFileSync(filePath, JSON.stringify(s, null, 2));
    return true;
  });

  handle('settings:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(settingsWin, {
      title: 'Import settings',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePaths[0]) return false;
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    if (data && data.account && !data.account.clientId) data.account.clientId = settings().account.clientId;
    store.replaceAll(data);
    return true;
  });

  handle('app:open-config', () => shell.openPath(app.getPath('userData')));
  handle('app:open-external', (url) => safeOpenExternal(url));
  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    packaged: app.isPackaged
  }));

  handle('playback:get', () => spotify.lastState);
  handle('preview:get', () => previewState());
  handle('auth:status', () => authStatus());
  handle('auth:login', async () => {
    if (loggingIn) return authStatus();
    loggingIn = true;
    broadcast('auth', authStatus());
    try {
      await spotify.login((url) => shell.openExternal(url), settings().account.redirectPort);
    } catch (err) {
      spotify.lastError = err.message;
    } finally {
      loggingIn = false;
      broadcast('auth', authStatus());
    }
    return authStatus();
  });
  handle('auth:logout', () => {
    spotify.logout();
    return authStatus();
  });

  handle('overlay:visible-get', () => overlayVisible);
  handle('overlay:visible-set', (v) => setOverlayVisible(Boolean(v)));
  handle('overlay:reset-position', () => {
    if (!overlayWin) return;
    const a = screen.getPrimaryDisplay().workArea;
    const [w] = overlayWin.getSize();
    overlayWin.setPosition(a.x + a.width - w - 16, a.y + 16);
  });
  handle('obs:status', () => ({ running: obs.isRunning(), port: settings().obs.port, error: null }));
  handle('shortcuts:status', () => shortcutStatus);

  // Fire-and-forget: overlay reports its content size so the window hugs the card.
  ipcMain.on('overlay:resize', (event, size) => {
    if (!overlayWin || event.sender !== overlayWin.webContents || !size) return;
    const width = Math.round(Math.min(2400, Math.max(40, Number(size.width) || 0)));
    const height = Math.round(Math.min(2400, Math.max(40, Number(size.height) || 0)));
    const [x, y] = overlayWin.getPosition();
    const [cw, ch] = overlayWin.getSize();
    if (cw !== width || ch !== height) overlayWin.setBounds({ x, y, width, height });
  });
}

/* ------------------------------------------------------------------ init */

async function init() {
  if (process.platform === 'win32') app.setAppUserModelId('com.davcreate.spotifyoverlay');
  const userData = app.getPath('userData');
  store = new SettingsStore(userData);
  const tokenStore = new TokenStore(userData);
  spotify = new SpotifyClient({
    tokenStore,
    getClientId: () => settings().account.clientId,
    getPollInterval: () => settings().general.pollInterval
  });
  obs = new ObsServer({
    getSnapshot: () => ({ settings: settings(), playback: spotify.lastState, auth: authStatus() })
  });

  spotify.on('playback', (state) => broadcast('playback', state));
  spotify.on('auth', () => broadcast('auth', authStatus()));

  store.on('change', (keys, s) => {
    const all = keys.includes('*');
    // Window position changes only need saving, not a re-render everywhere.
    if (!all && keys.every((k) => k.startsWith('window.'))) return;
    broadcast('settings', s);
    const touched = (prefix) => all || keys.some((k) => k === prefix || k.startsWith(prefix + '.'));
    if (touched('layout.locked')) {
      applyLock();
      updateTrayMenu();
    }
    if (touched('shortcuts')) registerShortcuts();
    if (touched('general.launchAtStartup')) applyLoginItem();
    if (touched('obs')) applyObs();
    if (touched('general.showDemoInSettings')) broadcast('preview', previewState());
    if (touched('account')) broadcast('auth', authStatus());
    if (touched('general.pollInterval')) spotify.pollNow();
  });

  registerIpc();
  createOverlay();
  createTray();
  registerShortcuts();
  applyLoginItem();
  applyObs();
  spotify.start();

  const s = settings();
  if (!s.account.clientId || !spotify.isConnected() || process.argv.includes('--settings') || SMOKE_DIR) openSettings();
  if (SMOKE_DIR) runSmokeTest();
}

function runSmokeTest() {
  setTimeout(async () => {
    try {
      fs.mkdirSync(SMOKE_DIR, { recursive: true });
      for (const [name, win] of [['overlay', overlayWin], ['settings', settingsWin]]) {
        if (!win || win.isDestroyed()) throw new Error(`${name} window missing`);
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(SMOKE_DIR, `${name}.png`), img.toPNG());
        console.log(`[smoke] ${name}: ${img.getSize().width}x${img.getSize().height}`);
      }
      // Visit every settings section so rendering errors in any of them surface.
      const wc = settingsWin.webContents;
      const count = await wc.executeJavaScript("document.querySelectorAll('.nav-item').length");
      for (let i = 0; i < count; i++) {
        const title = await wc.executeJavaScript(`document.querySelectorAll('.nav-item')[${i}].click(); document.getElementById('section-title').textContent`);
        await new Promise((r) => setTimeout(r, 250));
        const fields = await wc.executeJavaScript("document.querySelectorAll('#section-body .field, #section-body .theme-card').length");
        fs.writeFileSync(path.join(SMOKE_DIR, `section-${i}.png`), (await wc.capturePage()).toPNG());
        console.log(`[smoke] section ${title}: ${fields} controls`);
      }
      console.log('[smoke] OK');
      app.exit(0);
    } catch (err) {
      console.error('[smoke] FAILED', err);
      app.exit(1);
    }
  }, 5000);
}

app.on('window-all-closed', () => {
  // Keep running in the tray.
});

app.on('activate', () => openSettings());

app.on('before-quit', () => {
  if (store) store.saveNow();
  globalShortcut.unregisterAll();
  if (spotify) spotify.stop();
  if (obs) obs.stop();
});
