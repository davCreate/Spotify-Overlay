'use strict';

/*
 * Persistent settings store.
 * Settings live in <userData>/settings.json and are always merged with DEFAULT_SETTINGS,
 * so new versions of the app can add settings without breaking old config files.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const {
  DEFAULT_SETTINGS,
  OPEN_KEYS,
  clone,
  mergeWithDefaults,
  getPath,
  hasPath,
  setPath
} = require('../shared/defaults');
const { isValidThemeValue, sanitizeThemeValues, findTheme } = require('../shared/themes');

const MAX_CUSTOM_THEMES = 50;

/** Numeric limits enforced on the main side (the UI also enforces them). */
const NUMBER_LIMITS = {
  'account.redirectPort': [1024, 65535],
  'general.pollInterval': [1000, 10000],
  'general.pauseHideDelay': [0, 600],
  'general.autoHideAfter': [1, 600],
  'layout.width': [220, 900],
  'layout.scale': [0.5, 3],
  'layout.padding': [0, 48],
  'layout.gap': [0, 48],
  'layout.radius': [0, 64],
  'layout.opacity': [0.1, 1],
  'art.size': [32, 320],
  'text.titleSize': [8, 64],
  'text.artistSize': [8, 48],
  'text.albumSize': [8, 40],
  'text.titleWeight': [100, 900],
  'progress.height': [1, 16],
  'visualizer.bars': [8, 128],
  'visualizer.height': [12, 200],
  'visualizer.sensitivity': [0.1, 5],
  'visualizer.smoothing': [0, 0.95],
  'visualizer.opacity': [0.05, 1],
  'visualizer.fps': [15, 144],
  'animation.duration': [0, 3000],
  'pet.size': [0.5, 2],
  'pet.speed': [0.5, 2.5],
  'pet.lingerSeconds': [0, 30],
  'obs.port': [1024, 65535]
};

/** Allowed values for string settings that are enumerations. */
const ENUMS = {
  'general.language': ['auto', 'en', 'es', 'fr', 'ru'],
  'layout.style': ['horizontal', 'vertical', 'compact', 'minimal'],
  'art.shape': ['square', 'rounded', 'circle', 'vinyl'],
  'text.align': ['left', 'center', 'right'],
  'visualizer.style': ['bars', 'mirror', 'wave', 'line', 'circle', 'dots', 'blocks'],
  'visualizer.placement': ['bottom', 'background', 'top'],
  'visualizer.source': ['system', 'simulated'],
  'visualizer.colorMode': ['accent', 'gradient', 'rainbow', 'text'],
  'animation.trackChange': ['none', 'fade', 'slide', 'zoom', 'flip', 'blur'],
  'animation.idle': ['none', 'float', 'breathe'],
  'layout.placement': ['free', 'top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right', 'island'],
  'pet.type': ['claude'],
  'pet.side': ['auto', 'left', 'right'],
  'pet.color': ['orange', 'blue', 'green', 'purple', 'pink', 'graphite'],
  'pet.accessory': ['none', 'tophat', 'headphones', 'bowtie', 'glasses']
};

class SettingsStore extends EventEmitter {
  constructor(userDataDir) {
    super();
    this.file = path.join(userDataDir, 'settings.json');
    this.saveTimer = null;
    this.data = this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      return this.normalize(JSON.parse(raw));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Corrupt file: keep a backup so the user can recover it, then start fresh.
        try {
          fs.copyFileSync(this.file, this.file + '.corrupt-' + Date.now());
        } catch (_) { /* ignore */ }
        console.warn('[store] Could not read settings, using defaults:', err.message);
      }
      return clone(DEFAULT_SETTINGS);
    }
  }

  /** Merge with defaults and sanitize every value. */
  normalize(raw) {
    const merged = mergeWithDefaults(DEFAULT_SETTINGS, raw, OPEN_KEYS);
    for (const [p, [min, max]] of Object.entries(NUMBER_LIMITS)) {
      const v = getPath(merged, p);
      if (!Number.isFinite(v)) setPath(merged, p, getPath(DEFAULT_SETTINGS, p));
      else setPath(merged, p, Math.min(max, Math.max(min, v)));
    }
    for (const [p, allowed] of Object.entries(ENUMS)) {
      if (!allowed.includes(getPath(merged, p))) setPath(merged, p, getPath(DEFAULT_SETTINGS, p));
    }
    merged.themeOverrides = sanitizeThemeValues(merged.themeOverrides);
    merged.customThemes = (Array.isArray(merged.customThemes) ? merged.customThemes : [])
      .filter((t) => t && typeof t.id === 'string' && t.id.startsWith('user-') && typeof t.name === 'string')
      .slice(0, MAX_CUSTOM_THEMES)
      .map((t) => ({ id: t.id, name: t.name.slice(0, 60), values: sanitizeThemeValues(t.values) }));
    if (!findTheme(merged.themeId, merged.customThemes)) merged.themeId = DEFAULT_SETTINGS.themeId;
    merged.version = DEFAULT_SETTINGS.version;
    return merged;
  }

  get() {
    return clone(this.data);
  }

  /** Validate a single value for a settings path. Returns the (clamped) value or throws. */
  validate(p, value) {
    if (typeof p !== 'string' || !hasPath(DEFAULT_SETTINGS, p)) throw new Error(`Unknown setting: ${p}`);
    const top = p.split('.')[0];
    if (OPEN_KEYS.includes(top) || top === 'version') throw new Error(`Setting ${p} cannot be set directly`);
    const def = getPath(DEFAULT_SETTINGS, p);
    if (def !== null && typeof def === 'object') throw new Error(`Setting ${p} is a group`);
    if (def === null) {
      if (value !== null && !Number.isFinite(value)) throw new Error(`Invalid value for ${p}`);
      return value;
    }
    if (typeof value !== typeof def) throw new Error(`Invalid type for ${p}`);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`Invalid number for ${p}`);
      const limits = NUMBER_LIMITS[p];
      return limits ? Math.min(limits[1], Math.max(limits[0], value)) : value;
    }
    if (typeof value === 'string') {
      if (ENUMS[p] && !ENUMS[p].includes(value)) throw new Error(`Invalid option for ${p}`);
      return value.slice(0, 200).trim();
    }
    return value;
  }

  set(p, value) {
    const clean = this.validate(p, value);
    const prev = getPath(this.data, p);
    if (prev === clean) return clean;
    setPath(this.data, p, clean);
    this.changed([p]);
    return clean;
  }

  applyTheme(id) {
    if (!findTheme(id, this.data.customThemes)) throw new Error(`Unknown theme: ${id}`);
    this.data.themeId = id;
    this.data.themeOverrides = {};
    this.changed(['themeId', 'themeOverrides']);
  }

  setThemeValue(key, value) {
    if (!isValidThemeValue(key, value)) throw new Error(`Invalid theme value for ${key}`);
    this.data.themeOverrides[key] = value;
    this.changed(['themeOverrides']);
  }

  resetThemeOverrides() {
    this.data.themeOverrides = {};
    this.changed(['themeOverrides']);
  }

  saveCustomTheme(name, values) {
    const cleanName = String(name || '').trim().slice(0, 60) || 'My theme';
    if (this.data.customThemes.length >= MAX_CUSTOM_THEMES) throw new Error('Too many custom themes');
    const id = 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.data.customThemes.push({ id, name: cleanName, values: sanitizeThemeValues(values) });
    this.data.themeId = id;
    this.data.themeOverrides = {};
    this.changed(['customThemes', 'themeId', 'themeOverrides']);
    return id;
  }

  deleteCustomTheme(id) {
    const before = this.data.customThemes.length;
    this.data.customThemes = this.data.customThemes.filter((t) => t.id !== id);
    if (this.data.customThemes.length === before) return;
    const keys = ['customThemes'];
    if (this.data.themeId === id) {
      this.data.themeId = DEFAULT_SETTINGS.themeId;
      keys.push('themeId');
    }
    this.changed(keys);
  }

  /** Replace everything (import). Window position and account are kept unless provided. */
  replaceAll(raw) {
    const input = Object.assign({}, raw);
    if (!input.account) input.account = this.data.account;
    if (!input.window) input.window = this.data.window;
    this.data = this.normalize(input);
    this.changed(['*']);
  }

  reset() {
    const keepAccount = clone(this.data.account);
    const keepWindow = clone(this.data.window);
    this.data = clone(DEFAULT_SETTINGS);
    this.data.account = keepAccount;
    this.data.window = keepWindow;
    this.changed(['*']);
  }

  changed(keys) {
    this.scheduleSave();
    this.emit('change', keys, this.get());
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 300);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] Failed to save settings:', err.message);
    }
  }
}

module.exports = { SettingsStore, NUMBER_LIMITS, ENUMS };
