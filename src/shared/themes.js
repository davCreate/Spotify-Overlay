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

  /**
   * Visual effects. Each one adds a CSS class (fx-<id>) to the card.
   * `margin` is the extra space (px) the overlay window needs around the card for it.
   */
  const EFFECTS = {
    none: { label: 'None', description: 'Flat card, no extra effect.', margin: 0 },
    tilt: { label: '3D tilt', description: 'Card is turned in 3D space and sways slowly.', margin: 30 },
    extrude: { label: '3D extruded block', description: 'Solid side walls make the card look like a thick block.', margin: 14 },
    layered: { label: '3D stacked cards', description: 'Ghost cards stacked behind, like a deck.', margin: 30 },
    neumorph: { label: 'Soft 3D (neumorphism)', description: 'Soft light and shadow, as if pressed out of the background.', margin: 22 },
    neon: { label: 'Neon tube', description: 'Glowing border and text that flicker like a neon sign.', margin: 18 },
    holo: { label: 'Holographic', description: 'Rainbow foil shine that moves across the card.', margin: 0 },
    aurora: { label: 'Aurora', description: 'Slowly moving northern-lights colors behind the text.', margin: 0 },
    shimmer: { label: 'Shimmer', description: 'A light sheen sweeps across the card every few seconds.', margin: 0 },
    scanlines: { label: 'CRT scanlines', description: 'Old-monitor scanlines with a soft phosphor glow.', margin: 6 },
    pixel: { label: 'Pixel / 8-bit', description: 'Square corners, chunky border and a hard pixel shadow.', margin: 12 },
    sticker: { label: 'Sticker', description: 'Thick white outline and a slight angle, like a sticker.', margin: 16 },
    orbit: { label: '3D orbit', description: 'Turns left and right in 3D while a light sweeps over it.', margin: 46 },
    hover3d: { label: '3D hover', description: 'Floats in a figure eight above its own shadow.', margin: 48 },
    cube: { label: '3D box', description: 'A solid box with real top, bottom and side faces that slowly turns.', margin: 52 },
    parallax: { label: '3D parallax', description: 'Cover, text and background float at different depths.', margin: 40 },
    hologram: { label: 'Hologram projector', description: 'Leans back and flickers above a glowing projector.', margin: 60 },
    beat3d: { label: 'Beat pulse 3D', description: 'Jumps toward you on the beat of the music.', margin: 44 },
    swing: { label: 'Hanging sign', description: 'Hangs from two strings and swings gently.', margin: 58 }
  };

  /** Gallery sections, in display order. */
  const CATEGORIES = [
    { id: 'classic', name: 'Normal', description: 'Clean, readable cards that fit any setup.' },
    { id: 'minimal', name: 'Minimal', description: 'As little as possible: quiet colors, no decoration.' },
    { id: '3d', name: '3D', description: 'Depth, perspective and stacked layers.' },
    { id: 'glass', name: 'Glass', description: 'See-through frosted glass.' },
    { id: 'neon', name: 'Neon & Glow', description: 'Bright colors that light up the screen.' },
    { id: 'animated', name: 'Animated', description: 'Backgrounds and shines that move on their own.' },
    { id: 'retro', name: 'Retro', description: 'CRT monitors, arcades and the 80s.' },
    { id: 'colorful', name: 'Colorful & Nature', description: 'Gradients inspired by places and seasons.' },
    { id: 'stream', name: 'Streaming', description: 'Made for OBS and recordings.' }
  ];

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
    font: { type: 'select', options: Object.keys(FONTS) },
    effect: { type: 'select', options: Object.keys(EFFECTS) }
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
    font: 'system',
    effect: 'none'
  };

  function preset(id, name, category, description, values) {
    return { id, name, category, description, values: Object.assign({}, BASE, values) };
  }

  const PRESETS = [
    /* Normal */
    preset('emerald-night', 'Emerald Night', 'classic', 'Dark charcoal card with a fresh green accent.', {}),
    preset('nocturne', 'Nocturne', 'classic', 'Moody purples with pink highlights.', {
      background: 'solid', bg: '#282a36', bgOpacity: 0.94, text: '#f8f8f2', subtext: '#a9aed1',
      accent: '#ff79c6', accent2: '#bd93f9'
    }),
    preset('arctic', 'Arctic Frost', 'classic', 'Cool polar greys and icy blues.', {
      background: 'solid', bg: '#2e3440', bgOpacity: 0.94, text: '#eceff4', subtext: '#a3adc2',
      accent: '#88c0d0', accent2: '#81a1c1', font: 'rounded'
    }),
    preset('gold-luxe', 'Gold Luxe', 'classic', 'Black velvet with golden trims.', {
      background: 'gradient', bg: '#0d0d0d', bg2: '#2a2112', gradientAngle: 145, text: '#f6e7c1', subtext: '#c9a75b',
      accent: '#d4af37', accent2: '#f7e7a1', borderWidth: 1, borderColor: '#d4af37', font: 'serif'
    }),
    preset('album-adaptive', 'Album Adaptive', 'classic', 'Blurred album art background with colors pulled from the cover.', {
      background: 'album', bg: '#000000', bgOpacity: 0.45, albumBlur: 34, text: '#ffffff', subtext: '#e5e5e5',
      useAlbumColors: true, shadow: 30
    }),
    preset('espresso', 'Espresso', 'classic', 'Warm coffee browns with a caramel accent.', {
      background: 'solid', bg: '#2a1d17', bgOpacity: 0.95, text: '#f5e9dc', subtext: '#c4a68a',
      accent: '#e0a458', accent2: '#c26a2e', font: 'serif'
    }),

    /* Minimal */
    preset('minimal-light', 'Minimal Light', 'minimal', 'Clean white card for bright setups.', {
      background: 'solid', bg: '#ffffff', bgOpacity: 0.96, text: '#111827', subtext: '#6b7280',
      accent: '#111827', accent2: '#6b7280', shadow: 18
    }),
    preset('minimal-dark', 'Minimal Dark', 'minimal', 'Quiet near-black card, no distractions.', {
      background: 'solid', bg: '#0b0b0b', bgOpacity: 0.9, text: '#f5f5f5', subtext: '#8a8a8a',
      accent: '#f5f5f5', accent2: '#8a8a8a', shadow: 12
    }),
    preset('monochrome', 'Monochrome', 'minimal', 'Pure black and white, sharp and bold.', {
      background: 'solid', bg: '#000000', bgOpacity: 1, text: '#ffffff', subtext: '#bdbdbd',
      accent: '#ffffff', accent2: '#7a7a7a', borderWidth: 2, borderColor: '#ffffff', shadow: 0, font: 'display'
    }),

    /* 3D */
    preset('tilted-stage', 'Tilted Stage', '3d', 'A deep blue card turned in 3D space that sways gently.', {
      background: 'gradient', bg: '#0b1e3f', bg2: '#1d4ed8', gradientAngle: 135, bgOpacity: 0.96,
      text: '#ffffff', subtext: '#bfdbfe', accent: '#38bdf8', accent2: '#a78bfa', shadow: 36, effect: 'tilt'
    }),
    preset('solid-block', 'Solid Block', '3d', 'A chunky extruded block with thick side walls.', {
      background: 'solid', bg: '#ff5a5f', bgOpacity: 1, text: '#ffffff', subtext: '#ffe1e2',
      accent: '#ffffff', accent2: '#ffd1d3', shadow: 10, font: 'rounded', effect: 'extrude'
    }),
    preset('deck', 'Card Deck', '3d', 'Ghost cards stacked behind the main one.', {
      background: 'solid', bg: '#18181b', bgOpacity: 0.97, text: '#fafafa', subtext: '#a1a1aa',
      accent: '#f97316', accent2: '#facc15', shadow: 26, effect: 'layered'
    }),
    preset('isometric', 'Isometric', '3d', 'Mint block with a deep teal extrusion.', {
      background: 'gradient', bg: '#14b8a6', bg2: '#0f766e', gradientAngle: 160, bgOpacity: 1,
      text: '#f0fdfa', subtext: '#ccfbf1', accent: '#fef08a', accent2: '#ffffff', shadow: 8, font: 'condensed', effect: 'extrude'
    }),
    preset('soft-clay', 'Soft Clay', '3d', 'Light neumorphic card that looks pressed out of clay.', {
      background: 'solid', bg: '#e6e9ef', bgOpacity: 1, text: '#2d3748', subtext: '#718096',
      accent: '#6c63ff', accent2: '#a29bfe', shadow: 0, font: 'rounded', effect: 'neumorph'
    }),
    preset('soft-night', 'Soft Night', '3d', 'Dark neumorphism with soft highlights.', {
      background: 'solid', bg: '#2b2f3a', bgOpacity: 1, text: '#e2e8f0', subtext: '#94a3b8',
      accent: '#22d3ee', accent2: '#818cf8', shadow: 0, font: 'rounded', effect: 'neumorph'
    }),
    preset('sapphire-orbit', 'Sapphire Orbit', '3d', 'Deep blue card that turns in 3D under a moving light.', {
      background: 'gradient', bg: '#0a1a4a', bg2: '#2547d0', gradientAngle: 130, bgOpacity: 0.97,
      text: '#ffffff', subtext: '#c7d6ff', accent: '#5ee7ff', accent2: '#a78bfa', shadow: 30, effect: 'orbit'
    }),
    preset('golden-turntable', 'Golden Turntable', '3d', 'Black and gold, turning slowly like a record on display.', {
      background: 'gradient', bg: '#0c0c0c', bg2: '#2e2410', gradientAngle: 150, bgOpacity: 1, text: '#fbefd0', subtext: '#d2b06a',
      accent: '#e6b84a', accent2: '#fff1c1', borderWidth: 1, borderColor: '#b8912f', shadow: 28, font: 'serif', effect: 'orbit'
    }),
    preset('hover-mint', 'Hover Mint', '3d', 'Fresh mint card floating above the screen.', {
      background: 'gradient', bg: '#34d399', bg2: '#0d9488', gradientAngle: 150, bgOpacity: 1,
      text: '#f0fdf4', subtext: '#d1fae5', accent: '#fef9c3', accent2: '#ffffff', shadow: 10, font: 'rounded', effect: 'hover3d'
    }),
    preset('cloud-nine', 'Cloud Nine', '3d', 'Light sky glass that drifts like a cloud.', {
      background: 'glass', bg: '#bfdbfe', bg2: '#ffffff', bgOpacity: 0.6, text: '#0f172a', subtext: '#334155',
      accent: '#3b82f6', accent2: '#f472b6', borderWidth: 1, borderColor: '#ffffff', shadow: 10, font: 'rounded', effect: 'hover3d'
    }),
    preset('neon-cube', 'Neon Cube', '3d', 'A dark box with glowing pink edges that turns in space.', {
      background: 'solid', bg: '#1a1033', bgOpacity: 1, text: '#ffffff', subtext: '#f0abfc',
      accent: '#ff3ec8', accent2: '#00e5ff', borderWidth: 1, borderColor: '#ff3ec8', glow: 18, shadow: 24, font: 'condensed', effect: 'cube'
    }),
    preset('toy-block', 'Toy Block', '3d', 'A chunky yellow toy block with real sides.', {
      background: 'solid', bg: '#fbbf24', bgOpacity: 1, text: '#3b1d00', subtext: '#7c4a03',
      accent: '#ef4444', accent2: '#2563eb', shadow: 20, font: 'rounded', effect: 'cube'
    }),
    preset('obsidian-box', 'Obsidian Box', '3d', 'A heavy black stone box with a violet sheen.', {
      background: 'gradient', bg: '#18181b', bg2: '#3b0764', gradientAngle: 160, bgOpacity: 1, text: '#faf5ff', subtext: '#c4b5fd',
      accent: '#a855f7', accent2: '#e879f9', shadow: 30, effect: 'cube'
    }),
    preset('depth-field', 'Depth Field', '3d', 'Cover and text float above a glowing purple backdrop.', {
      background: 'gradient', bg: '#1e1b4b', bg2: '#581c87', gradientAngle: 135, bgOpacity: 0.97,
      text: '#ffffff', subtext: '#ddd6fe', accent: '#f472b6', accent2: '#60a5fa', shadow: 30, effect: 'parallax'
    }),
    preset('paper-layers', 'Paper Layers', '3d', 'Warm paper cut-out layers with real depth.', {
      background: 'solid', bg: '#fdf2e9', bgOpacity: 1, text: '#3f2a1d', subtext: '#8a6a52',
      accent: '#f97316', accent2: '#14b8a6', shadow: 22, font: 'serif', effect: 'parallax'
    }),
    preset('hologram-cyan', 'Hologram', '3d', 'A flickering blue hologram above its projector.', {
      background: 'solid', bg: '#021b2b', bgOpacity: 0.55, text: '#e0fbff', subtext: '#7ee8fa',
      accent: '#22d3ee', accent2: '#a5f3fc', glow: 10, shadow: 0, font: 'mono', effect: 'hologram'
    }),
    preset('mars-projection', 'Mars Projection', '3d', 'A red-orange hologram broadcast from far away.', {
      background: 'solid', bg: '#2a0a02', bgOpacity: 0.55, text: '#ffe4d6', subtext: '#fdba74',
      accent: '#fb5607', accent2: '#ffbe0b', glow: 10, shadow: 0, font: 'condensed', effect: 'hologram'
    }),
    preset('bass-drop', 'Bass Drop', '3d', 'Black card that punches toward you on every beat.', {
      background: 'gradient', bg: '#050505', bg2: '#1a0b2e', gradientAngle: 135, bgOpacity: 0.97,
      text: '#ffffff', subtext: '#c4b5fd', accent: '#ff2bd6', accent2: '#2bf3ff', glow: 8, shadow: 24, font: 'display', effect: 'beat3d'
    }),
    preset('heartbeat', 'Heartbeat', '3d', 'Deep red card that pulses with the music.', {
      background: 'gradient', bg: '#3b0410', bg2: '#9f1239', gradientAngle: 160, bgOpacity: 0.97,
      text: '#fff1f2', subtext: '#fecdd3', accent: '#fb7185', accent2: '#fda4af', glow: 6, shadow: 26, font: 'rounded', effect: 'beat3d'
    }),
    preset('cafe-sign', 'Cafe Sign', '3d', 'A wooden cafe sign hanging from a nail.', {
      background: 'gradient', bg: '#5b3a1e', bg2: '#8b5a2b', gradientAngle: 100, bgOpacity: 1,
      text: '#fff7e6', subtext: '#f1d3a5', accent: '#fbbf24', accent2: '#fde68a', borderWidth: 2, borderColor: '#3b240f', shadow: 20, font: 'serif', effect: 'swing'
    }),

    /* Glass */
    preset('midnight-glass', 'Midnight Glass', 'glass', 'Translucent frosted card with a soft border.', {
      background: 'glass', bg: '#0f172a', bg2: '#1e293b', bgOpacity: 0.55, text: '#f8fafc', subtext: '#cbd5e1',
      accent: '#60a5fa', accent2: '#a78bfa', borderWidth: 1, borderColor: '#94a3b8', shadow: 30
    }),
    preset('frosted-ice', 'Frosted Ice', 'glass', 'Bright icy glass with a cool blue tint.', {
      background: 'glass', bg: '#dbeafe', bg2: '#ffffff', bgOpacity: 0.45, text: '#0f172a', subtext: '#334155',
      accent: '#2563eb', accent2: '#06b6d4', borderWidth: 1, borderColor: '#ffffff', shadow: 24, font: 'rounded'
    }),
    preset('smoked-glass', 'Smoked Glass', 'glass', 'Dark tinted glass, like a car window.', {
      background: 'glass', bg: '#000000', bg2: '#27272a', bgOpacity: 0.5, text: '#ffffff', subtext: '#d4d4d8',
      accent: '#e4e4e7', accent2: '#71717a', borderWidth: 1, borderColor: '#52525b', shadow: 28
    }),
    preset('rose-glass', 'Rose Glass', 'glass', 'Pink frosted glass with a shimmering sheen.', {
      background: 'glass', bg: '#be185d', bg2: '#f9a8d4', bgOpacity: 0.5, text: '#fff1f7', subtext: '#fbcfe8',
      accent: '#ffffff', accent2: '#f9a8d4', borderWidth: 1, borderColor: '#fbcfe8', shadow: 26, effect: 'shimmer'
    }),

    /* Neon & Glow */
    preset('synthwave', 'Synthwave', 'neon', 'Retro 80s magenta-to-violet gradient with neon glow.', {
      background: 'gradient', bg: '#2b1055', bg2: '#d53a9d', gradientAngle: 160, bgOpacity: 0.95,
      text: '#fff0fb', subtext: '#ffb8ec', accent: '#ff3ec8', accent2: '#00e5ff', glow: 22, font: 'condensed'
    }),
    preset('cyberpunk', 'Cyberpunk', 'neon', 'High-contrast yellow and cyan on deep black.', {
      background: 'solid', bg: '#0a0a0f', bgOpacity: 0.95, text: '#fcee0a', subtext: '#00f0ff',
      accent: '#fcee0a', accent2: '#00f0ff', borderWidth: 2, borderColor: '#fcee0a', glow: 16, font: 'condensed'
    }),
    preset('neon-tokyo', 'Neon Tokyo', 'neon', 'A pink neon tube sign glowing in the dark.', {
      background: 'solid', bg: '#0d0221', bgOpacity: 0.92, text: '#ffffff', subtext: '#ff9de2',
      accent: '#ff2a6d', accent2: '#05d9e8', borderWidth: 2, glow: 18, shadow: 10, font: 'condensed', effect: 'neon'
    }),
    preset('toxic', 'Toxic', 'neon', 'Radioactive green neon on black.', {
      background: 'solid', bg: '#050a05', bgOpacity: 0.92, text: '#eaffd0', subtext: '#a3e635',
      accent: '#39ff14', accent2: '#ccff00', borderWidth: 2, glow: 16, shadow: 10, font: 'mono', effect: 'neon'
    }),
    preset('electric-blue', 'Electric Blue', 'neon', 'Cold blue glow with a strong halo.', {
      background: 'gradient', bg: '#020617', bg2: '#0c1f4a', gradientAngle: 180, bgOpacity: 0.95,
      text: '#e0f2fe', subtext: '#7dd3fc', accent: '#00b3ff', accent2: '#7c3aed', glow: 30, shadow: 12
    }),

    /* Animated */
    preset('aurora', 'Aurora', 'animated', 'Northern lights drifting slowly behind the song.', {
      background: 'solid', bg: '#04121f', bgOpacity: 0.95, text: '#ecfeff', subtext: '#a5f3fc',
      accent: '#34d399', accent2: '#8b5cf6', shadow: 30, effect: 'aurora'
    }),
    preset('holographic', 'Holographic', 'animated', 'Rainbow foil that shifts like a holographic card.', {
      background: 'gradient', bg: '#c7d2fe', bg2: '#fbcfe8', gradientAngle: 120, bgOpacity: 0.96,
      text: '#1e1b4b', subtext: '#4c1d95', accent: '#7c3aed', accent2: '#db2777', shadow: 22, font: 'rounded', effect: 'holo'
    }),
    preset('lava-lamp', 'Lava Lamp', 'animated', 'Warm orange and red blobs that slowly move.', {
      background: 'solid', bg: '#1a0505', bgOpacity: 0.95, text: '#fff7ed', subtext: '#fdba74',
      accent: '#f97316', accent2: '#e11d48', shadow: 30, font: 'rounded', effect: 'aurora'
    }),
    preset('liquid-gold', 'Liquid Gold', 'animated', 'Black and gold with a sheen that sweeps across.', {
      background: 'gradient', bg: '#111111', bg2: '#3b2f12', gradientAngle: 135, text: '#fdf6e3', subtext: '#e0c070',
      accent: '#f5c542', accent2: '#fff1b8', borderWidth: 1, borderColor: '#b8912f', font: 'serif', effect: 'shimmer'
    }),

    /* Retro */
    preset('terminal', 'Retro Terminal', 'retro', 'Phosphor green monospace on black, like an old CRT.', {
      background: 'solid', bg: '#000000', bgOpacity: 0.9, text: '#33ff66', subtext: '#1fae47',
      accent: '#33ff66', accent2: '#1fae47', borderWidth: 1, borderColor: '#33ff66', glow: 12, font: 'mono', effect: 'scanlines'
    }),
    preset('amber-crt', 'Amber CRT', 'retro', 'Orange phosphor monitor from the 80s.', {
      background: 'solid', bg: '#120a00', bgOpacity: 0.92, text: '#ffb000', subtext: '#cc8400',
      accent: '#ffb000', accent2: '#ff7a00', glow: 10, font: 'mono', effect: 'scanlines'
    }),
    preset('arcade', 'Arcade 8-bit', 'retro', 'Chunky pixel card straight out of a game cabinet.', {
      background: 'solid', bg: '#1d2b53', bgOpacity: 1, text: '#fff1e8', subtext: '#ffccaa',
      accent: '#ff004d', accent2: '#ffec27', borderWidth: 3, borderColor: '#fff1e8', shadow: 0, font: 'mono', effect: 'pixel'
    }),
    preset('vaporwave', 'Vaporwave', 'retro', 'Pastel pink, teal and lavender dreams.', {
      background: 'gradient', bg: '#ff9ad5', bg2: '#7ee8fa', gradientAngle: 120, bgOpacity: 0.92,
      text: '#2d1b4e', subtext: '#5b3f8c', accent: '#8a2be2', accent2: '#ff71ce', font: 'serif'
    }),
    preset('bubblegum', 'Bubblegum Sticker', 'retro', 'A tilted pink sticker with a fat white outline.', {
      background: 'gradient', bg: '#db2777', bg2: '#f472b6', gradientAngle: 135, bgOpacity: 1,
      text: '#ffffff', subtext: '#fde4f2', accent: '#ffffff', accent2: '#fde047', shadow: 14, font: 'rounded', effect: 'sticker'
    }),

    /* Colorful & Nature */
    preset('ocean', 'Ocean Depths', 'colorful', 'Deep sea blues with an aqua shimmer.', {
      background: 'gradient', bg: '#03254c', bg2: '#0a6c8f', gradientAngle: 180, text: '#e0f7ff', subtext: '#8fd3ea',
      accent: '#2ee6d6', accent2: '#1fa2ff', glow: 10
    }),
    preset('sunset', 'Sunset Boulevard', 'colorful', 'Warm orange-to-rose evening gradient.', {
      background: 'gradient', bg: '#ff7e5f', bg2: '#8e2de2', gradientAngle: 135, text: '#ffffff', subtext: '#ffe3d6',
      accent: '#ffd166', accent2: '#ff5e8a'
    }),
    preset('forest', 'Forest Canopy', 'colorful', 'Earthy greens and moss tones.', {
      background: 'gradient', bg: '#0f2a1d', bg2: '#2d5a3a', gradientAngle: 160, text: '#effae9', subtext: '#a8c5a0',
      accent: '#9be564', accent2: '#d7f75b', font: 'rounded'
    }),
    preset('sakura', 'Sakura', 'colorful', 'Soft cherry blossom pinks.', {
      background: 'gradient', bg: '#fff0f5', bg2: '#ffc6d9', gradientAngle: 135, bgOpacity: 0.95,
      text: '#5a2a3a', subtext: '#a35a74', accent: '#ff6f9c', accent2: '#ffa6c1', shadow: 16, font: 'rounded'
    }),
    preset('desert', 'Desert Dunes', 'colorful', 'Sand and terracotta under a warm sky.', {
      background: 'gradient', bg: '#c2410c', bg2: '#f59e0b', gradientAngle: 150, text: '#fffbeb', subtext: '#fde68a',
      accent: '#fff7ed', accent2: '#fed7aa', font: 'condensed'
    }),
    preset('galaxy', 'Galaxy', 'colorful', 'Deep space purple with a cosmic glow.', {
      background: 'gradient', bg: '#0b0320', bg2: '#4c1d95', gradientAngle: 200, text: '#f5f3ff', subtext: '#c4b5fd',
      accent: '#f0abfc', accent2: '#60a5fa', glow: 14
    }),

    /* Streaming */
    preset('stream-clean', 'Stream Clean', 'stream', 'No background, crisp text for OBS and streaming.', {
      background: 'none', bgOpacity: 0, text: '#ffffff', subtext: '#e0e0e0', accent: '#ffffff', accent2: '#cccccc',
      shadow: 0, glow: 0
    }),
    preset('stream-bar', 'Stream Lower Third', 'stream', 'Solid broadcast-style bar with a bold accent.', {
      background: 'gradient', bg: '#111827', bg2: '#1f2937', gradientAngle: 90, bgOpacity: 0.95, text: '#ffffff', subtext: '#9ca3af',
      accent: '#ef4444', accent2: '#f59e0b', shadow: 14, font: 'condensed'
    }),
    preset('chroma-key', 'Chroma Key', 'stream', 'Pure green background you can key out in OBS.', {
      background: 'solid', bg: '#00ff00', bgOpacity: 1, text: '#ffffff', subtext: '#f0f0f0', accent: '#ffffff', accent2: '#dddddd',
      shadow: 0, glow: 0
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
    if (custom) return { id: custom.id, name: custom.name, description: 'Custom theme', category: 'custom', custom: true, values: Object.assign({}, BASE, sanitizeThemeValues(custom.values)) };
    return null;
  }

  /** Effective theme values for a settings object. */
  function getEffectiveTheme(settings) {
    const theme = findTheme(settings.themeId, settings.customThemes) || PRESETS[0];
    return Object.assign({}, theme.values, sanitizeThemeValues(settings.themeOverrides));
  }

  return { FONTS, EFFECTS, CATEGORIES, THEME_FIELDS, BASE, PRESETS, isValidThemeValue, sanitizeThemeValues, findTheme, getEffectiveTheme };
});
