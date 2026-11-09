/*
 * Settings UI schema. Each section renders a list of fields bound to a settings path.
 * Paths starting with "theme." edit the current theme (stored as theme overrides).
 *
 * Field types: toggle, range, select, color, text, number, shortcut
 */
(function () {
  'use strict';

  const opt = (...pairs) => pairs.map(([value, label]) => ({ value, label }));

  const SECTIONS = [
    {
      id: 'account',
      title: 'Account',
      icon: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5z',
      description: 'Connect your Spotify account. You use your own free Spotify developer app, so your data never goes through anyone else.',
      custom: 'account'
    },
    {
      id: 'themes',
      title: 'Themes',
      icon: 'M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2zM6.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
      description: 'Pick a preset, then fine-tune any color. Changes are applied live to the overlay.',
      custom: 'themes',
      groups: [
        {
          title: 'Effect',
          fields: [
            { key: 'theme.effect', label: 'Visual effect', type: 'select', options: () => Object.entries(window.SO_THEMES.EFFECTS).map(([value, e]) => ({ value, label: e.label })), help: '3D, neon, holographic, animated and retro effects. Works with any colors below.' }
          ]
        },
        {
          title: 'Background',
          fields: [
            { key: 'theme.background', label: 'Background style', type: 'select', options: opt(['solid', 'Solid color'], ['gradient', 'Gradient'], ['glass', 'Glass'], ['album', 'Blurred album art'], ['none', 'None (transparent)']) },
            { key: 'theme.bg', label: 'Background color', type: 'color' },
            { key: 'theme.bg2', label: 'Second background color', type: 'color', help: 'Used by Gradient and Glass styles.', showIf: (s, t) => ['gradient', 'glass'].includes(t.background) },
            { key: 'theme.gradientAngle', label: 'Gradient angle', type: 'range', min: 0, max: 360, step: 5, unit: '°', showIf: (s, t) => ['gradient', 'glass'].includes(t.background) },
            { key: 'theme.bgOpacity', label: 'Background opacity', type: 'range', min: 0, max: 1, step: 0.01, percent: true },
            { key: 'theme.albumBlur', label: 'Album art blur', type: 'range', min: 0, max: 80, step: 1, unit: 'px', showIf: (s, t) => t.background === 'album' }
          ]
        },
        {
          title: 'Colors',
          fields: [
            { key: 'theme.text', label: 'Title text', type: 'color' },
            { key: 'theme.subtext', label: 'Secondary text', type: 'color' },
            { key: 'theme.accent', label: 'Accent', type: 'color', help: 'Progress bar, visualizer and highlights.' },
            { key: 'theme.accent2', label: 'Second accent', type: 'color', help: 'End color of gradients.' },
            { key: 'theme.useAlbumColors', label: 'Adapt accent colors to album art', type: 'toggle', help: 'Extracts the most vivid colors from each cover.' }
          ]
        },
        {
          title: 'Border, shadow & font',
          fields: [
            { key: 'theme.borderWidth', label: 'Border width', type: 'range', min: 0, max: 8, step: 1, unit: 'px' },
            { key: 'theme.borderColor', label: 'Border color', type: 'color', showIf: (s, t) => t.borderWidth > 0 },
            { key: 'theme.shadow', label: 'Drop shadow', type: 'range', min: 0, max: 80, step: 1, unit: 'px' },
            { key: 'theme.glow', label: 'Accent glow', type: 'range', min: 0, max: 60, step: 1, unit: 'px' },
            { key: 'theme.font', label: 'Font', type: 'select', options: () => Object.entries(window.SO_THEMES.FONTS).map(([value, f]) => ({ value, label: f.label })) }
          ]
        }
      ]
    },
    {
      id: 'general',
      title: 'General',
      icon: 'M19.4 13a7.7 7.7 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 0 0-1.7-1L15 3h-4l-.3 2.9a7.3 7.3 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.7 7.7 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.3-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
      groups: [
        {
          title: 'Startup',
          fields: [
            { key: 'general.launchAtStartup', label: 'Launch when I sign in to my computer', type: 'toggle', help: 'Only works in the installed app, not when running from source.' },
            { key: 'general.startHidden', label: 'Start with the overlay hidden', type: 'toggle', help: 'Show it later with the shortcut or the tray icon.' }
          ]
        },
        {
          title: 'Updates from Spotify',
          fields: [
            { key: 'general.pollInterval', label: 'Refresh interval', type: 'range', min: 500, max: 10000, step: 250, unit: 'ms', help: 'How often Spotify is asked what is playing. Progress moves smoothly in between. 1000 ms is recommended.' }
          ]
        },
        {
          title: 'When to show the overlay',
          fields: [
            { key: 'general.hideWhenIdle', label: 'Hide when nothing is playing', type: 'toggle' },
            { key: 'general.hideWhenPaused', label: 'Hide when paused', type: 'toggle' },
            { key: 'general.pauseHideDelay', label: 'Hide after being paused for', type: 'range', min: 0, max: 120, step: 1, unit: 's', showIf: (s) => s.general.hideWhenPaused },
            { key: 'general.autoHide', label: 'Auto-hide: only show on song change or play/pause', type: 'toggle', help: 'Great for gaming: the overlay pops in, then fades out.' },
            { key: 'general.autoHideAfter', label: 'Hide after', type: 'range', min: 1, max: 60, step: 1, unit: 's', showIf: (s) => s.general.autoHide },
            { key: 'general.showDemoInSettings', label: 'Show a demo track while Settings is open', type: 'toggle', help: 'Lets you design your overlay even when nothing is playing.' }
          ]
        }
      ]
    },
    {
      id: 'layout',
      title: 'Layout',
      icon: 'M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10-3h8v11h-8V10z',
      groups: [
        {
          title: 'Size',
          fields: [
            { key: 'layout.scale', label: 'Overall size', type: 'range', min: 0.5, max: 3, step: 0.05, percent: true, help: 'Makes the whole overlay bigger or smaller and keeps its proportions. Also in the tray menu (Size) and with the size shortcuts in Settings → Shortcuts.' }
          ],
          actions: [
            { id: 'size-down', label: '− Smaller' },
            { id: 'size-up', label: '+ Bigger' },
            { id: 'size-75', label: 'Small (75%)' },
            { id: 'size-100', label: 'Normal (100%)' },
            { id: 'size-150', label: 'Large (150%)' },
            { id: 'size-200', label: 'Extra large (200%)' }
          ]
        },
        {
          title: 'Card',
          fields: [
            { key: 'layout.style', label: 'Layout', type: 'select', options: opt(['horizontal', 'Horizontal (art left)'], ['vertical', 'Vertical (art on top)'], ['compact', 'Compact'], ['minimal', 'Minimal (text only)']) },
            { key: 'layout.width', label: 'Width', type: 'range', min: 220, max: 900, step: 5, unit: 'px' },
            { key: 'layout.padding', label: 'Inner padding', type: 'range', min: 0, max: 48, step: 1, unit: 'px' },
            { key: 'layout.gap', label: 'Spacing between art and text', type: 'range', min: 0, max: 48, step: 1, unit: 'px' },
            { key: 'layout.radius', label: 'Corner radius', type: 'range', min: 0, max: 64, step: 1, unit: 'px' },
            { key: 'layout.opacity', label: 'Overall opacity', type: 'range', min: 0.1, max: 1, step: 0.01, percent: true }
          ]
        },
        {
          title: 'Position',
          fields: [
            { key: 'layout.locked', label: 'Lock position (click-through)', type: 'toggle', help: 'Unlock to drag the overlay anywhere. When locked, clicks pass through it to the app underneath.' }
          ],
          actions: [{ id: 'reset-position', label: 'Move overlay back to the top-right corner' }]
        }
      ]
    },
    {
      id: 'art',
      title: 'Album art',
      icon: 'M4 4h16v16H4V4zm2 12h12l-4-5-3 4-2-2-3 3z',
      groups: [
        {
          title: 'Cover',
          fields: [
            { key: 'art.show', label: 'Show album art', type: 'toggle' },
            { key: 'art.size', label: 'Size', type: 'range', min: 32, max: 320, step: 2, unit: 'px', showIf: (s) => s.art.show },
            { key: 'art.shape', label: 'Shape', type: 'select', options: opt(['square', 'Square'], ['rounded', 'Rounded'], ['circle', 'Circle'], ['vinyl', 'Vinyl record']), showIf: (s) => s.art.show },
            { key: 'art.spin', label: 'Spin while playing', type: 'toggle', help: 'Works with Circle and Vinyl shapes.', showIf: (s) => s.art.show && (s.art.shape === 'circle' || s.art.shape === 'vinyl') },
            { key: 'art.pulse', label: 'Pulse to the beat', type: 'toggle', showIf: (s) => s.art.show },
            { key: 'art.shadow', label: 'Cover shadow', type: 'toggle', showIf: (s) => s.art.show }
          ]
        }
      ]
    },
    {
      id: 'text',
      title: 'Text',
      icon: 'M5 4h14v3h-2V6h-4v12h2v2H9v-2h2V6H7v1H5V4z',
      groups: [
        {
          title: 'What to show',
          fields: [
            { key: 'text.showTitle', label: 'Song title', type: 'toggle' },
            { key: 'text.showArtist', label: 'Artist', type: 'toggle' },
            { key: 'text.showAlbum', label: 'Album', type: 'toggle' },
            { key: 'text.showDevice', label: 'Playing device', type: 'toggle', help: 'For example “Desktop” or “Living room speaker”.' }
          ]
        },
        {
          title: 'Style',
          fields: [
            { key: 'text.align', label: 'Alignment', type: 'select', options: opt(['left', 'Left'], ['center', 'Center'], ['right', 'Right']), help: 'The vertical layout is always centered.' },
            { key: 'text.titleSize', label: 'Title size', type: 'range', min: 8, max: 64, step: 1, unit: 'px' },
            { key: 'text.titleWeight', label: 'Title weight', type: 'range', min: 100, max: 900, step: 100 },
            { key: 'text.artistSize', label: 'Artist size', type: 'range', min: 8, max: 48, step: 1, unit: 'px' },
            { key: 'text.albumSize', label: 'Album / device size', type: 'range', min: 8, max: 40, step: 1, unit: 'px' },
            { key: 'text.uppercase', label: 'Uppercase', type: 'toggle' },
            { key: 'text.textShadow', label: 'Text shadow (better over busy backgrounds)', type: 'toggle' },
            { key: 'text.marquee', label: 'Scroll long titles', type: 'toggle' }
          ]
        }
      ]
    },
    {
      id: 'progress',
      title: 'Progress bar',
      icon: 'M3 11h12v2H3v-2zm14 0h4v2h-4v-2z',
      groups: [
        {
          title: 'Progress',
          fields: [
            { key: 'progress.show', label: 'Show progress bar', type: 'toggle' },
            { key: 'progress.showTime', label: 'Show elapsed / total time', type: 'toggle', showIf: (s) => s.progress.show },
            { key: 'progress.height', label: 'Thickness', type: 'range', min: 1, max: 16, step: 1, unit: 'px', showIf: (s) => s.progress.show },
            { key: 'progress.rounded', label: 'Rounded ends', type: 'toggle', showIf: (s) => s.progress.show },
            { key: 'progress.knob', label: 'Show position knob', type: 'toggle', showIf: (s) => s.progress.show }
          ]
        }
      ]
    },
    {
      id: 'visualizer',
      title: 'Visualizer',
      icon: 'M3 10h2v4H3v-4zm4-4h2v12H7V6zm4-3h2v18h-2V3zm4 5h2v8h-2V8zm4 3h2v2h-2v-2z',
      groups: [
        {
          title: 'Sound wave',
          fields: [
            { key: 'visualizer.enabled', label: 'Show visualizer', type: 'toggle' },
            { key: 'visualizer.style', label: 'Style', type: 'select', options: opt(['bars', 'Bars'], ['mirror', 'Mirrored bars'], ['blocks', 'LED blocks'], ['dots', 'Dots'], ['wave', 'Wave'], ['line', 'Waveform lines'], ['circle', 'Circle (best as background)']), showIf: (s) => s.visualizer.enabled },
            { key: 'visualizer.placement', label: 'Placement', type: 'select', options: opt(['bottom', 'Below the song info'], ['top', 'Above the song info'], ['background', 'Behind everything']), showIf: (s) => s.visualizer.enabled },
            { key: 'visualizer.source', label: 'Audio source', type: 'select', options: opt(['system', 'Real system audio (Windows)'], ['simulated', 'Simulated (no audio capture)']), help: 'Real mode reacts to everything you hear. It needs Windows; other systems automatically use Simulated.', showIf: (s) => s.visualizer.enabled }
          ]
        },
        {
          title: 'Look & feel',
          fields: [
            { key: 'visualizer.bars', label: 'Number of bands', type: 'range', min: 8, max: 128, step: 1 },
            { key: 'visualizer.height', label: 'Height', type: 'range', min: 12, max: 200, step: 1, unit: 'px', help: 'Ignored when placed behind everything.' },
            { key: 'visualizer.sensitivity', label: 'Sensitivity', type: 'range', min: 0.1, max: 5, step: 0.05, unit: '×' },
            { key: 'visualizer.smoothing', label: 'Smoothing', type: 'range', min: 0, max: 0.95, step: 0.01, percent: true },
            { key: 'visualizer.colorMode', label: 'Colors', type: 'select', options: opt(['gradient', 'Accent gradient'], ['accent', 'Accent color'], ['rainbow', 'Rainbow'], ['text', 'Text color']) },
            { key: 'visualizer.opacity', label: 'Opacity', type: 'range', min: 0.05, max: 1, step: 0.01, percent: true },
            { key: 'visualizer.glow', label: 'Glow', type: 'toggle' },
            { key: 'visualizer.fps', label: 'Frame rate limit', type: 'range', min: 15, max: 144, step: 1, unit: 'fps', help: 'Lower values use less CPU/GPU.' }
          ],
          showIf: (s) => s.visualizer.enabled
        }
      ]
    },
    {
      id: 'animation',
      title: 'Animations',
      icon: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
      groups: [
        {
          title: 'Motion',
          fields: [
            { key: 'animation.trackChange', label: 'Song change transition', type: 'select', options: opt(['none', 'None'], ['fade', 'Fade'], ['slide', 'Slide'], ['zoom', 'Zoom'], ['flip', 'Flip'], ['blur', 'Blur']) },
            { key: 'animation.duration', label: 'Transition duration', type: 'range', min: 0, max: 3000, step: 50, unit: 'ms', showIf: (s) => s.animation.trackChange !== 'none' },
            { key: 'animation.idle', label: 'Idle animation', type: 'select', options: opt(['none', 'None'], ['float', 'Gentle float'], ['breathe', 'Breathe']) }
          ]
        }
      ]
    },
    {
      id: 'shortcuts',
      title: 'Shortcuts',
      icon: 'M2 6h20v12H2V6zm2 2v2h2V8H4zm4 0v2h2V8H8zm4 0v2h2V8h-2zm4 0v2h2V8h-2zM4 12v2h2v-2H4zm4 0v2h8v-2H8zm10 0v2h2v-2h-2z',
      description: 'Global shortcuts work even when the app is in the background. Click a box and press the new key combination. Press Backspace to disable a shortcut.',
      groups: [
        {
          title: 'Global shortcuts',
          fields: [
            { key: 'shortcuts.toggleOverlay', label: 'Show / hide overlay', type: 'shortcut' },
            { key: 'shortcuts.toggleLock', label: 'Lock / unlock position', type: 'shortcut' },
            { key: 'shortcuts.sizeUp', label: 'Make overlay bigger', type: 'shortcut' },
            { key: 'shortcuts.sizeDown', label: 'Make overlay smaller', type: 'shortcut' }
          ]
        }
      ]
    },
    {
      id: 'obs',
      title: 'OBS / Streaming',
      icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 14.5v-9l6 4.5-6 4.5z',
      description: 'Use the overlay as a Browser Source in OBS Studio, Streamlabs or any streaming tool. The server only listens on this computer (127.0.0.1).',
      custom: 'obs',
      groups: [
        {
          title: 'Browser source server',
          fields: [
            { key: 'obs.enabled', label: 'Enable browser source', type: 'toggle' },
            { key: 'obs.port', label: 'Port', type: 'number', min: 1024, max: 65535, step: 1 }
          ]
        }
      ]
    },
    {
      id: 'advanced',
      title: 'Advanced',
      icon: 'M4 6h16v2H4V6zm0 5h10v2H4v-2zm0 5h16v2H4v-2z',
      custom: 'advanced'
    },
    {
      id: 'updates',
      title: 'Updates',
      icon: 'M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z',
      description: 'Get new versions without downloading and reinstalling the app yourself.',
      custom: 'updates',
      groups: [
        {
          title: 'Automatic checks',
          fields: [
            { key: 'general.checkForUpdates', label: 'Check for updates automatically', type: 'toggle', help: 'Checks GitHub shortly after launch and every 6 hours. Nothing is downloaded until you click Update.' }
          ]
        }
      ]
    },
    {
      id: 'about',
      title: 'About',
      icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
      custom: 'about'
    }
  ];

  window.SO_SCHEMA = { SECTIONS };
})();
