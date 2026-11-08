/*
 * Theme presets for Spotify Overlay.
 * Shared between the main process (CommonJS) and renderer pages (global `SO_THEMES`).
 *
 * A theme is a flat object of THEME_FIELDS. The effective theme is:
 *   preset (or user custom theme)  <-  settings.themeOverrides
 * See docs/THEMES.md for how to write your own.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SO_THEMES = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FONTS = {
    system: { label: 'System UI', stack: "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif" },
    rounded: { label: 'Rounded', stack: "'Nunito', 'Varela Round', 'Segoe UI Variable Display', 'SF Pro Rounded', 'Segoe UI', system-ui, sans-serif" },
    condensed: { label: 'Condensed', stack: "'Bahnschrift', 'Roboto Condensed', 'Arial Narrow', 'Helvetica Neue', sans-serif" },
    serif: { label: 'Serif', stack: "Georgia, 'Times New Roman', 'Noto Serif', serif" },
    mono: { label: 'Monospace', stack: "'Cascadia Code', 'JetBrains Mono', Consolas, 'SF Mono', Menlo, monospace" },
    display: { label: 'Display', stack: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif" }
  };

  /** Field definitions: type is used for validation and for the settings UI. */
  const THEME_FIELDS = {
    background: { type: 'select', options: ['solid', 'gradient', 'glass', 'album', 'none'] },
    bg: { type: 'color' },
    bg2: { type: 'color' },
    gradientAngle: { type: 'number', min: 0, max: 360 },
    bgOpacity: { type: 'number', min: 0, max: 1 },
    albumBlur: { type: 'number', min: 0, max: 80 },
    text: { type: 'color' },
    subtext: { type: 'color' },
    accent: { type: 'color' },
    accent2: { type: 'color' },
    useAlbumColors: { type: 'boolean' },
    borderWidth: { type: 'number', min: 0, max: 8 },
    borderColor: { type: 'color' },
    shadow: { type: 'number', min: 0, max: 80 },
    glow: { type: 'number', min: 0, max: 60 },
    font: { type: 'select', options: Object.keys(FONTS) }
  };

  const BASE = {
    background: 'solid',
    bg: '#121212',
    bg2: '#1e1e1e',
    gradientAngle: 135,
    bgOpacity: 0.92,
    albumBlur: 30,
    text: '#ffffff',
    subtext: '#b3b3b3',
    accent: '#1ed760',
    accent2: '#1db954',
    useAlbumColors: false,
    borderWidth: 0,
    borderColor: '#ffffff',
    shadow: 24,
    glow: 0,
    font: 'system'
  };

  function preset(id, name, description, values) {
    return { id, name, description, values: Object.assign({}, BASE, values) };
  }

  const PRESETS = [
    preset('emerald-night', 'Emerald Night', 'Dark charcoal card with a fresh green accent.', {}),
    preset('midnight-glass', 'Midnight Glass', 'Translucent frosted card with a soft border.', {
      background: 'glass', bg: '#0f172a', bg2: '#1e293b', bgOpacity: 0.55, text: '#f8fafc', subtext: '#cbd5e1',
      accent: '#60a5fa', accent2: '#a78bfa', borderWidth: 1, borderColor: '#94a3b8', shadow: 30
    }),
    preset('synthwave', 'Synthwave', 'Retro 80s magenta-to-violet gradient with neon glow.', {
      background: 'gradient', bg: '#2b1055', bg2: '#d53a9d', gradientAngle: 160, bgOpacity: 0.95,
      text: '#fff0fb', subtext: '#ffb8ec', accent: '#ff3ec8', accent2: '#00e5ff', glow: 22, font: 'condensed'
    }),
    preset('cyberpunk', 'Cyberpunk', 'High-contrast yellow and cyan on deep black.', {
      background: 'solid', bg: '#0a0a0f', bgOpacity: 0.95, text: '#fcee0a', subtext: '#00f0ff',
      accent: '#fcee0a', accent2: '#00f0ff', borderWidth: 2, borderColor: '#fcee0a', glow: 16, font: 'condensed'
    }),
    preset('minimal-light', 'Minimal Light', 'Clean white card for bright setups.', {
      background: 'solid', bg: '#ffffff', bgOpacity: 0.96, text: '#111827', subtext: '#6b7280',
      accent: '#111827', accent2: '#6b7280', shadow: 18
    }),
    preset('minimal-dark', 'Minimal Dark', 'Quiet near-black card, no distractions.', {
      background: 'solid', bg: '#0b0b0b', bgOpacity: 0.9, text: '#f5f5f5', subtext: '#8a8a8a',
      accent: '#f5f5f5', accent2: '#8a8a8a', shadow: 12
    }),
    preset('vaporwave', 'Vaporwave', 'Pastel pink, teal and lavender dreams.', {
      background: 'gradient', bg: '#ff9ad5', bg2: '#7ee8fa', gradientAngle: 120, bgOpacity: 0.92,
      text: '#2d1b4e', subtext: '#5b3f8c', accent: '#8a2be2', accent2: '#ff71ce', font: 'serif'
    }),
    preset('ocean', 'Ocean Depths', 'Deep sea blues with an aqua shimmer.', {
      background: 'gradient', bg: '#03254c', bg2: '#0a6c8f', gradientAngle: 180, text: '#e0f7ff', subtext: '#8fd3ea',
      accent: '#2ee6d6', accent2: '#1fa2ff', glow: 10
    }),
    preset('sunset', 'Sunset Boulevard', 'Warm orange-to-rose evening gradient.', {
      background: 'gradient', bg: '#ff7e5f', bg2: '#8e2de2', gradientAngle: 135, text: '#ffffff', subtext: '#ffe3d6',
      accent: '#ffd166', accent2: '#ff5e8a'
    }),
    preset('forest', 'Forest Canopy', 'Earthy greens and moss tones.', {
      background: 'gradient', bg: '#0f2a1d', bg2: '#2d5a3a', gradientAngle: 160, text: '#effae9', subtext: '#a8c5a0',
      accent: '#9be564', accent2: '#d7f75b', font: 'rounded'
    }),
    preset('terminal', 'Retro Terminal', 'Phosphor green monospace on black, like an old CRT.', {
      background: 'solid', bg: '#000000', bgOpacity: 0.9, text: '#33ff66', subtext: '#1fae47',
      accent: '#33ff66', accent2: '#1fae47', borderWidth: 1, borderColor: '#33ff66', glow: 12, font: 'mono'
    }),
    preset('monochrome', 'Monochrome', 'Pure black and white, sharp and bold.', {
      background: 'solid', bg: '#000000', bgOpacity: 1, text: '#ffffff', subtext: '#bdbdbd',
      accent: '#ffffff', accent2: '#7a7a7a', borderWidth: 2, borderColor: '#ffffff', shadow: 0, font: 'display'
    }),
    preset('nocturne', 'Nocturne', 'Moody purples with pink highlights.', {
      background: 'solid', bg: '#282a36', bgOpacity: 0.94, text: '#f8f8f2', subtext: '#a9aed1',
      accent: '#ff79c6', accent2: '#bd93f9'
    }),
    preset('arctic', 'Arctic Frost', 'Cool polar greys and icy blues.', {
      background: 'solid', bg: '#2e3440', bgOpacity: 0.94, text: '#eceff4', subtext: '#a3adc2',
      accent: '#88c0d0', accent2: '#81a1c1', font: 'rounded'
    }),
    preset('album-adaptive', 'Album Adaptive', 'Blurred album art background with colors pulled from the cover.', {
      background: 'album', bg: '#000000', bgOpacity: 0.45, albumBlur: 34, text: '#ffffff', subtext: '#e5e5e5',
      useAlbumColors: true, shadow: 30
    }),
    preset('stream-clean', 'Stream Clean', 'No background, crisp text for OBS and streaming.', {
      background: 'none', bgOpacity: 0, text: '#ffffff', subtext: '#e0e0e0', accent: '#ffffff', accent2: '#cccccc',
      shadow: 0, glow: 0
    }),
    preset('gold-luxe', 'Gold Luxe', 'Black velvet with golden trims.', {
      background: 'gradient', bg: '#0d0d0d', bg2: '#2a2112', gradientAngle: 145, text: '#f6e7c1', subtext: '#c9a75b',
      accent: '#d4af37', accent2: '#f7e7a1', borderWidth: 1, borderColor: '#d4af37', font: 'serif'
    }),
    preset('sakura', 'Sakura', 'Soft cherry blossom pinks.', {
      background: 'gradient', bg: '#fff0f5', bg2: '#ffc6d9', gradientAngle: 135, bgOpacity: 0.95,
      text: '#5a2a3a', subtext: '#a35a74', accent: '#ff6f9c', accent2: '#ffa6c1', shadow: 16, font: 'rounded'
    })
  ];

  const HEX = /^#[0-9a-fA-F]{6}$/;

  /** Returns true if `value` is valid for theme field `key`. */
  function isValidThemeValue(key, value) {
    const field = THEME_FIELDS[key];
    if (!field) return false;
    switch (field.type) {
      case 'color':
        return typeof value === 'string' && HEX.test(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'number':
        return typeof value === 'number' && Number.isFinite(value) && value >= field.min && value <= field.max;
      case 'select':
        return field.options.includes(value);
      default:
        return false;
    }
  }

  /** Keep only valid theme fields from an arbitrary object. */
  function sanitizeThemeValues(values) {
    const out = {};
    if (!values || typeof values !== 'object') return out;
    for (const key of Object.keys(THEME_FIELDS)) {
      if (key in values && isValidThemeValue(key, values[key])) out[key] = values[key];
    }
    return out;
  }

  function findTheme(id, customThemes) {
    const builtIn = PRESETS.find((t) => t.id === id);
    if (builtIn) return builtIn;
    const custom = (customThemes || []).find((t) => t && t.id === id);
    if (custom) return { id: custom.id, name: custom.name, description: 'Custom theme', custom: true, values: Object.assign({}, BASE, sanitizeThemeValues(custom.values)) };
    return null;
  }

  /** Effective theme values for a settings object. */
  function getEffectiveTheme(settings) {
    const theme = findTheme(settings.themeId, settings.customThemes) || PRESETS[0];
    return Object.assign({}, theme.values, sanitizeThemeValues(settings.themeOverrides));
  }

  return { FONTS, THEME_FIELDS, BASE, PRESETS, isValidThemeValue, sanitizeThemeValues, findTheme, getEffectiveTheme };
});
