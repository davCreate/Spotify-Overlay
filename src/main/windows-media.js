'use strict';

/*
 * Windows-only "now playing" source that reads the Spotify desktop app through Windows' media
 * controls (SMTC). It needs no Spotify Web API call, so it keeps working when the Web API is
 * rate limited or the account is not connected.
 *
 * A long-running PowerShell process (windows-media.ps1) prints one JSON line per second.
 *
 * Events:
 *   'state' (raw)   { found, title, artist, album, playing, positionMs, durationMs, art? }
 */

const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const RESTART_DELAY_MS = 5000;

class WindowsMediaSource extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.running = false;
    this.restartTimer = null;
    this.buffer = '';
    this.last = null;
    this.lastAt = 0;
  }

  static isSupported() {
    return process.platform === 'win32';
  }

  start() {
    if (this.running || !WindowsMediaSource.isSupported()) return;
    this.running = true;
    this.spawn();
  }

  stop() {
    this.running = false;
    clearTimeout(this.restartTimer);
    if (this.proc) {
      try { this.proc.kill(); } catch (_) { /* ignore */ }
      this.proc = null;
    }
  }

  /** Latest state if it is recent enough to trust, else null. */
  current(maxAgeMs = 3000) {
    return this.last && Date.now() - this.lastAt <= maxAgeMs ? this.last : null;
  }

  spawn() {
    let script;
    try {
      // Read through fs (works inside app.asar) and pass the script inline, because
      // powershell.exe cannot open files packed inside the asar archive.
      script = fs.readFileSync(path.join(__dirname, 'windows-media.ps1'), 'utf8');
    } catch (err) {
      console.warn('[windows-media] Could not read script:', err.message);
      this.running = false;
      return;
    }
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    try {
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch (err) {
      console.warn('[windows-media] Could not start PowerShell:', err.message);
      this.scheduleRestart();
      return;
    }
    this.buffer = '';
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => this.onData(chunk));
    this.proc.on('error', (err) => console.warn('[windows-media]', err.message));
    this.proc.on('exit', () => {
      this.proc = null;
      this.last = null;
      this.scheduleRestart();
    });
  }

  scheduleRestart() {
    if (!this.running) return;
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => { if (this.running) this.spawn(); }, RESTART_DELAY_MS);
  }

  onData(chunk) {
    this.buffer += chunk;
    let nl;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let raw;
      try {
        raw = JSON.parse(line);
      } catch (_) {
        continue;
      }
      this.last = raw;
      this.lastAt = Date.now();
      this.emit('state', raw);
    }
  }
}

module.exports = { WindowsMediaSource };
