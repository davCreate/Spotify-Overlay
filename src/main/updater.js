'use strict';

/*
 * Update checker.
 *
 * - Windows installer (NSIS) and Linux AppImage: full in-app updates through electron-updater
 *   (download in the background, then restart to install). No reinstall needed.
 * - macOS (unsigned builds cannot self-update), the Windows portable exe, the .deb package and
 *   running from source: the GitHub "latest release" API is checked and the user gets a
 *   button that opens the download page.
 */

const { EventEmitter } = require('events');
const { app, net } = require('electron');

const OWNER = 'davCreate';
const REPO = 'Spotify-Overlay';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const AUTO_CHECK_DELAY = 15 * 1000;
const AUTO_CHECK_INTERVAL = 6 * 60 * 60 * 1000;

/** Compares two "x.y.z" versions (an optional leading "v" and pre-release suffix are ignored). */
function compareVersions(a, b) {
  const parse = (v) => String(v || '').replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** True when this build can download and install updates by itself. */
function supportsAutoInstall() {
  if (!app.isPackaged) return false;
  if (process.platform === 'win32') return !process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.platform === 'linux') return Boolean(process.env.APPIMAGE);
  return false;
}

class Updater extends EventEmitter {
  constructor({ isAutoCheckEnabled }) {
    super();
    this.isAutoCheckEnabled = isAutoCheckEnabled;
    this.auto = supportsAutoInstall();
    this.autoUpdater = null;
    this.timer = null;
    this.silentCheck = false;
    this.state = {
      status: 'idle', // idle | checking | available | not-available | downloading | downloaded | error
      mode: this.auto ? 'auto' : 'manual',
      currentVersion: app.getVersion(),
      latestVersion: null,
      percent: 0,
      error: null,
      lastChecked: null,
      releaseUrl: RELEASES_URL
    };
    if (this.auto) this.setupAutoUpdater();
  }

  setupAutoUpdater() {
    try {
      this.autoUpdater = require('electron-updater').autoUpdater;
    } catch (err) {
      console.warn('[updater] electron-updater unavailable, falling back to manual mode:', err.message);
      this.auto = false;
      this.state.mode = 'manual';
      return;
    }
    const u = this.autoUpdater;
    u.autoDownload = false;
    u.autoInstallOnAppQuit = true;
    u.logger = null;
    u.on('checking-for-update', () => this.set({ status: 'checking', error: null }));
    u.on('update-available', (info) => this.set({ status: 'available', latestVersion: info.version }));
    u.on('update-not-available', (info) => this.set({ status: 'not-available', latestVersion: info.version }));
    u.on('download-progress', (p) => this.set({ status: 'downloading', percent: Math.round(p.percent || 0) }));
    u.on('update-downloaded', (info) => this.set({ status: 'downloaded', latestVersion: info.version, percent: 100 }));
    u.on('error', (err) => {
      if (!this.silentCheck) this.set({ status: 'error', error: friendlyError(err) });
    });
  }

  set(patch) {
    Object.assign(this.state, patch);
    this.emit('status', this.getState());
  }

  getState() {
    return { ...this.state };
  }

  /** Starts the background schedule (first check shortly after launch, then every few hours). */
  start() {
    const tick = () => {
      if (this.isAutoCheckEnabled()) this.check({ silent: true });
    };
    setTimeout(tick, AUTO_CHECK_DELAY);
    this.timer = setInterval(tick, AUTO_CHECK_INTERVAL);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  async check({ silent = false } = {}) {
    // Never interrupt a download, and keep a finished download ready to install.
    if (['checking', 'downloading', 'downloaded'].includes(this.state.status)) return this.getState();
    this.set({ status: 'checking', error: null });
    this.silentCheck = silent;
    try {
      if (this.auto) {
        await this.autoUpdater.checkForUpdates();
      } else {
        const latest = await fetchLatestRelease();
        const newer = compareVersions(latest.version, this.state.currentVersion) > 0;
        this.set({ status: newer ? 'available' : 'not-available', latestVersion: latest.version, releaseUrl: latest.url || RELEASES_URL });
      }
    } catch (err) {
      // A silent background check that fails (offline, rate-limited...) should not show an error.
      this.set(silent ? { status: 'idle' } : { status: 'error', error: friendlyError(err) });
    }
    this.silentCheck = false;
    this.set({ lastChecked: Date.now() });
    return this.getState();
  }

  async download() {
    if (!this.auto || this.state.status !== 'available') return this.getState();
    this.set({ status: 'downloading', percent: 0, error: null });
    try {
      await this.autoUpdater.downloadUpdate();
    } catch (err) {
      this.set({ status: 'error', error: friendlyError(err) });
    }
    return this.getState();
  }

  /** Quits and runs the installer silently, then relaunches the app. */
  install() {
    if (!this.auto || this.state.status !== 'downloaded') return false;
    setImmediate(() => this.autoUpdater.quitAndInstall(true, true));
    return true;
  }
}

function friendlyError(err) {
  const msg = String((err && err.message) || err || 'Unknown error');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|net::/i.test(msg)) {
    return 'Could not reach GitHub. Check your internet connection and try again.';
  }
  if (/latest.*\.yml|404/i.test(msg)) return 'No update information was found for this release yet. Try again later.';
  if (/403|rate limit/i.test(msg)) return 'GitHub is limiting requests right now. Try again in a few minutes.';
  return msg.split('\n')[0].slice(0, 200);
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const req = net.request({ url: API_URL, method: 'GET' });
    req.setHeader('Accept', 'application/vnd.github+json');
    req.setHeader('User-Agent', 'Spotify-Overlay-Updater');
    const timeout = setTimeout(() => {
      req.abort();
      reject(new Error('ETIMEDOUT'));
    }, 15000);
    req.on('response', (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        clearTimeout(timeout);
        if (res.statusCode !== 200) return reject(new Error(`GitHub responded with ${res.statusCode}`));
        try {
          const data = JSON.parse(body);
          resolve({ version: String(data.tag_name || '').replace(/^v/i, ''), url: data.html_url });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    req.end();
  });
}

module.exports = { Updater, compareVersions, RELEASES_URL };
