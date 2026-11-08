'use strict';

/*
 * Stores Spotify OAuth tokens on disk.
 * Uses Electron's safeStorage (OS keychain / DPAPI) to encrypt them when available.
 */

const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

class TokenStore {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, 'tokens.bin');
  }

  canEncrypt() {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch (_) {
      return false;
    }
  }

  load() {
    try {
      const buf = fs.readFileSync(this.file);
      let json;
      if (buf.subarray(0, 6).toString('utf8') === 'PLAIN:') json = buf.subarray(6).toString('utf8');
      else json = safeStorage.decryptString(buf);
      const tokens = JSON.parse(json);
      if (tokens && typeof tokens.refreshToken === 'string') return tokens;
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[tokens] Could not read tokens:', err.message);
    }
    return null;
  }

  save(tokens) {
    const json = JSON.stringify(tokens);
    const data = this.canEncrypt()
      ? safeStorage.encryptString(json)
      : Buffer.concat([Buffer.from('PLAIN:', 'utf8'), Buffer.from(json, 'utf8')]);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, data, { mode: 0o600 });
  }

  clear() {
    try {
      fs.unlinkSync(this.file);
    } catch (_) { /* already gone */ }
  }
}

module.exports = { TokenStore };
