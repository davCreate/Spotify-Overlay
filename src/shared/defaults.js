/*
 * Default settings for Spotify Overlay.
 * Shared between the main process (CommonJS) and renderer pages (global `SO_DEFAULTS`).
 * Every user setting must exist here: the settings store only accepts keys present in this tree.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SO_DEFAULTS = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SETTINGS_VERSION = 1;

  const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,

    account: {
      clientId: '',
      redirectPort: 8888
    },

    general: {
      language: 'auto',
      launchAtStartup: false,
      startHidden: false,
      pollInterval: 3000,
      hideWhenIdle: false,
      hideWhenPaused: false,
      pauseHideDelay: 5,
      autoHide: false,
      autoHideAfter: 8,
      showDemoInSettings: true,
      checkForUpdates: true
    },

    layout: {
      placement: 'free',
      style: 'horizontal',
      width: 420,
      scale: 1,
      padding: 14,
      gap: 14,
      radius: 18,
      opacity: 1,
      locked: false
    },

    art: {
      show: true,
      tone: 'natural',
      size: 84,
      shape: 'rounded',
      spin: false,
      pulse: true,
      shadow: true
    },

    text: {
      showTitle: true,
      showArtist: true,
      showAlbum: false,
      showDevice: false,
      align: 'left',
      titleSize: 18,
      artistSize: 14,
      albumSize: 12,
      titleWeight: 700,
      uppercase: false,
      marquee: true,
      textShadow: false
    },

    progress: {
      show: true,
      style: 'bar',
      showTime: true,
      height: 4,
      rounded: true,
      knob: false
    },

    visualizer: {
      enabled: true,
      style: 'bars',
      placement: 'bottom',
      source: 'system',
      bars: 48,
      height: 36,
      sensitivity: 1.2,
      smoothing: 0.7,
      colorMode: 'gradient',
      opacity: 0.9,
      glow: true,
      fps: 60
    },

    animation: {
      trackChange: 'slide',
      duration: 500,
      idle: 'none'
    },

    lyrics: {
      enabled: false
    },

    history: {
      enabled: true,
      items: []
    },

    pet: {
      enabled: false,
      type: 'claude',
      side: 'auto',
      size: 1,
      speed: 1,
      speech: true,
      color: 'orange',
      accessory: 'none',
      idle: true,
      lingerSeconds: 8
    },

    shortcuts: {
      toggleOverlay: 'CommandOrControl+Shift+O',
      toggleLock: 'CommandOrControl+Shift+L',
      sizeUp: 'CommandOrControl+Alt+Up',
      sizeDown: 'CommandOrControl+Alt+Down'
    },

    obs: {
      enabled: false,
      port: 4777
    },

    themeId: 'emerald-night',
    themeOverrides: {},
    customThemes: [],

    window: {
      x: null,
      y: null
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Merge `saved` on top of `defaults`, keeping only keys known to `defaults`
   * (except inside "open" maps like themeOverrides) and only values whose type matches.
   */
  function mergeWithDefaults(defaults, saved, openKeys) {
    const out = clone(defaults);
    if (!isPlainObject(saved)) return out;
    for (const key of Object.keys(defaults)) {
      if (!(key in saved)) continue;
      const def = defaults[key];
      const val = saved[key];
      if (openKeys && openKeys.includes(key)) {
        if (Array.isArray(def) && Array.isArray(val)) out[key] = clone(val);
        else if (isPlainObject(def) && isPlainObject(val)) out[key] = clone(val);
      } else if (isPlainObject(def)) {
        out[key] = mergeWithDefaults(def, val);
      } else if (def === null) {
        if (val === null || typeof val === 'number') out[key] = val;
      } else if (typeof def === typeof val && !Array.isArray(val)) {
        out[key] = val;
      }
    }
    return out;
  }

  function getPath(obj, path) {
    return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
  }

  function hasPath(obj, path) {
    const parts = path.split('.');
    let cur = obj;
    for (const k of parts) {
      if (!isPlainObject(cur) || !Object.prototype.hasOwnProperty.call(cur, k)) return false;
      cur = cur[k];
    }
    return true;
  }

  function setPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
  }

  return {
    SETTINGS_VERSION,
    DEFAULT_SETTINGS,
    OPEN_KEYS: ['themeOverrides', 'customThemes'],
    clone,
    isPlainObject,
    mergeWithDefaults,
    getPath,
    hasPath,
    setPath
  };
});
