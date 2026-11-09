/*
 * Spotify Overlay - settings window.
 * Renders sections from schema.js and keeps every control in sync with the main process.
 */
(function () {
  'use strict';

  const api = window.overlayAPI;
  const { SECTIONS } = window.SO_SCHEMA;
  const { PRESETS, FONTS, EFFECTS, CATEGORIES, getEffectiveTheme, findTheme } = window.SO_THEMES;
  const { getPath } = window.SO_DEFAULTS;
  const I18N = window.SO_I18N;

  const REPO_URL = 'https://github.com/davCreate/Spotify-Overlay';
  const DASHBOARD_URL = 'https://developer.spotify.com/dashboard';

  let settings = null;
  let theme = null;
  let auth = { connected: false };
  let obsStatus = { running: false, port: 4777, error: null };
  let shortcutStatus = {};
  let appInfo = { version: '', platform: api.platform };
  let overlayVisible = true;
  let updateState = { status: 'idle', mode: 'manual', currentVersion: '', latestVersion: null, percent: 0, error: null, lastChecked: null };
  let currentSection = 'account';
  let bindings = [];
  let customUpdaters = [];
  let lang = 'en';

  /** Translates English UI text into the selected language (see src/shared/i18n.js). */
  const tr = (text, vars) => I18N.translate(lang, text, vars);

  /** Translates a template with {0}, {1}... placeholders and puts DOM nodes (links, bold words) in them. */
  function rich(template, ...nodes) {
    return tr(template).split(/(\{\d+\})/).filter(Boolean).map((part) => {
      const m = /^\{(\d+)\}$/.exec(part);
      return m ? nodes[Number(m[1])] : part;
    });
  }

  function currentLanguage() {
    return I18N.resolveLanguage(settings && settings.general.language, appInfo.locale || navigator.language);
  }

  /* ---------------------------------------------------------------- DOM helpers */

  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function svgIcon(d) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  let toastTimer = null;
  function toast(message, isError) {
    const t = document.getElementById('toast');
    t.textContent = message;
    t.classList.toggle('error', Boolean(isError));
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 5000 : 2200);
  }

  function errMsg(err) {
    const m = (err && err.message) || String(err);
    // ipcRenderer.invoke prefixes errors with "Error invoking remote method '...': Error: "
    return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }

  async function run(fn, okMessage) {
    try {
      const r = await fn();
      if (okMessage && r !== false) toast(tr(okMessage));
      return r;
    } catch (err) {
      toast(tr(errMsg(err)), true);
      return undefined;
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(tr('Copied to clipboard'));
  }

  /* ---------------------------------------------------------------- values */

  function readValue(key) {
    if (key.startsWith('theme.')) return theme[key.slice(6)];
    return getPath(settings, key);
  }

  const pending = new Map();
  function writeValue(key, value) {
    // Coalesce rapid slider/color events into one IPC call per frame.
    const first = !pending.has(key);
    pending.set(key, value);
    if (!first) return;
    requestAnimationFrame(() => {
      const v = pending.get(key);
      pending.delete(key);
      const p = key.startsWith('theme.') ? api.setThemeValue(key.slice(6), v) : api.setSetting(key, v);
      p.catch((err) => toast(errMsg(err), true));
    });
  }

  function decimalsOf(step) {
    const s = String(step);
    return s.includes('.') ? s.split('.')[1].length : 0;
  }

  function formatRange(field, value) {
    if (field.percent) return Math.round(value * 100) + '%';
    const v = Number(value).toFixed(decimalsOf(field.step || 1));
    return field.unit ? `${v} ${field.unit}`.replace(' °', '°').replace(' ×', '×') : v;
  }

  /* ---------------------------------------------------------------- shortcut capture */

  const CODE_KEYS = {
    Space: 'Space', Enter: 'Enter', Tab: 'Tab', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
    Comma: ',', Period: '.', Slash: '/', Backquote: '`'
  };

  function keyFromEvent(e) {
    const c = e.code;
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit[0-9]$/.test(c)) return c.slice(5);
    if (/^Numpad[0-9]$/.test(c)) return 'num' + c.slice(6);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) return c;
    return CODE_KEYS[c] || null;
  }

  function acceleratorFromEvent(e) {
    const mac = api.platform === 'darwin';
    const mods = [];
    if (mac ? e.metaKey : e.ctrlKey) mods.push('CommandOrControl');
    if (mac && e.ctrlKey) mods.push('Control');
    if (!mac && e.metaKey) mods.push('Super');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    const key = keyFromEvent(e);
    if (!key) return null;
    const isFn = /^F\d+$/.test(key);
    if (!mods.length && !isFn) return null;
    return [...mods, key].join('+');
  }

  function prettyAccelerator(acc) {
    if (!acc) return tr('Disabled');
    const mac = api.platform === 'darwin';
    return acc
      .replace(/CommandOrControl/g, mac ? '⌘' : 'Ctrl')
      .replace(/Control/g, 'Ctrl')
      .replace(/Alt/g, mac ? '⌥' : 'Alt')
      .replace(/Super/g, 'Win')
      .split('+')
      .join(' + ');
  }

  /* ---------------------------------------------------------------- field controls */

  function buildControl(field) {
    const key = field.key;
    let control;
    let update;

    switch (field.type) {
      case 'toggle': {
        const input = h('input', { type: 'checkbox', 'aria-label': tr(field.label), onchange: () => writeValue(key, input.checked) });
        control = h('label', { class: 'switch' }, input, h('span', { class: 'track' }));
        update = (v) => { input.checked = Boolean(v); };
        break;
      }
      case 'range': {
        const out = h('span', { class: 'range-value' });
        const input = h('input', { type: 'range', min: field.min, max: field.max, step: field.step || 1, 'aria-label': tr(field.label) });
        input.addEventListener('input', () => {
          const v = Number(input.value);
          out.textContent = formatRange(field, v);
          writeValue(key, v);
        });
        control = h('div', { class: 'field-control', style: { width: '100%' } }, input, out);
        update = (v) => {
          if (document.activeElement !== input) input.value = v;
          out.textContent = formatRange(field, v);
        };
        break;
      }
      case 'select': {
        const options = typeof field.options === 'function' ? field.options() : field.options;
        const select = h('select', { class: 'input', 'aria-label': tr(field.label), onchange: () => writeValue(key, select.value) },
          options.map((o) => h('option', { value: o.value, text: tr(o.label) })));
        control = select;
        update = (v) => { select.value = v; };
        break;
      }
      case 'color': {
        const picker = h('input', { type: 'color', 'aria-label': tr(field.label) });
        const hex = h('input', { class: 'input mono', type: 'text', maxlength: 7, spellcheck: 'false', 'aria-label': tr(field.label) });
        picker.addEventListener('input', () => {
          hex.value = picker.value;
          writeValue(key, picker.value);
        });
        hex.addEventListener('change', () => {
          let v = hex.value.trim();
          if (!v.startsWith('#')) v = '#' + v;
          if (/^#[0-9a-fA-F]{3}$/.test(v)) v = '#' + v.slice(1).split('').map((c) => c + c).join('');
          if (/^#[0-9a-fA-F]{6}$/.test(v)) writeValue(key, v.toLowerCase());
          else {
            toast(tr('Use a hex color like #1ed760'), true);
            hex.value = readValue(key);
          }
        });
        control = h('div', { class: 'color-wrap' }, picker, hex);
        update = (v) => {
          picker.value = v;
          if (document.activeElement !== hex) hex.value = v;
        };
        break;
      }
      case 'number': {
        const input = h('input', { class: 'input', type: 'number', min: field.min, max: field.max, step: field.step || 1, 'aria-label': tr(field.label), style: { width: '120px' } });
        input.addEventListener('change', () => {
          const v = Math.round(Number(input.value));
          if (!Number.isFinite(v) || v < field.min || v > field.max) {
            toast(tr('Enter a number between {min} and {max}', { min: field.min, max: field.max }), true);
            input.value = readValue(key);
            return;
          }
          writeValue(key, v);
        });
        control = input;
        update = (v) => { if (document.activeElement !== input) input.value = v; };
        break;
      }
      case 'shortcut': {
        const input = h('input', { class: 'input shortcut-input', type: 'text', readonly: true, 'aria-label': field.label });
        const badge = h('span', { class: 'badge' });
        input.addEventListener('focus', () => {
          input.classList.add('recording');
          input.value = tr('Press keys…');
        });
        input.addEventListener('blur', () => {
          input.classList.remove('recording');
          input.value = prettyAccelerator(readValue(key));
        });
        input.addEventListener('keydown', (e) => {
          e.preventDefault();
          if (e.key === 'Escape') { input.blur(); return; }
          if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
            writeValue(key, '');
            input.blur();
            return;
          }
          if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
          const acc = acceleratorFromEvent(e);
          if (!acc) {
            input.value = tr('Use a modifier (Ctrl/Alt/Shift) + key');
            return;
          }
          writeValue(key, acc);
          input.blur();
        });
        control = h('div', { class: 'field-control', style: { width: '100%' } }, input, badge);
        update = (v) => {
          if (document.activeElement !== input) input.value = prettyAccelerator(v);
          const name = key.split('.')[1];
          const st = shortcutStatus[name];
          badge.textContent = tr(st === 'ok' ? 'Active' : st === 'in-use' ? 'Used by another app' : st === 'invalid' ? 'Invalid' : st === 'disabled' ? 'Off' : '');
          badge.className = 'badge ' + (st === 'ok' ? 'ok' : st === 'in-use' || st === 'invalid' ? 'warn' : '');
        };
        break;
      }
      default: {
        const input = h('input', { class: 'input', type: 'text', 'aria-label': field.label });
        input.addEventListener('change', () => writeValue(key, input.value.trim()));
        control = input;
        update = (v) => { if (document.activeElement !== input) input.value = v; };
      }
    }
    return { control, update };
  }

  function buildField(field) {
    const { control, update } = buildControl(field);
    const row = h('div', { class: 'field' },
      h('div', null, h('div', { class: 'field-label', text: tr(field.label) }), field.help ? h('div', { class: 'field-help', text: tr(field.help) }) : null),
      field.type === 'range' || field.type === 'shortcut' ? control : h('div', { class: 'field-control' }, control)
    );
    bindings.push({ field, row, update });
    return row;
  }

  const setScale = (v) => {
    const next = Math.round(Math.min(3, Math.max(0.5, v)) * 100) / 100;
    return run(() => api.setSetting('layout.scale', next), tr('Size: {percent}%', { percent: Math.round(next * 100) }));
  };
  const ACTIONS = {
    'reset-position': () => run(() => api.resetOverlayPosition(), 'Overlay moved'),
    'size-down': () => setScale(settings.layout.scale - 0.1),
    'size-up': () => setScale(settings.layout.scale + 0.1),
    'size-75': () => setScale(0.75),
    'size-100': () => setScale(1),
    'size-150': () => setScale(1.5),
    'size-200': () => setScale(2)
  };

  function buildGroup(group) {
    const node = h('section', { class: 'group' },
      h('div', { class: 'group-title', text: tr(group.title) }),
      h('div', { class: 'group-body' }, group.fields.map(buildField)),
      group.actions ? h('div', { class: 'group-actions' }, group.actions.map((a) => h('button', { class: 'btn btn-small', type: 'button', text: tr(a.label), onclick: ACTIONS[a.id] }))) : null
    );
    if (group.showIf) bindings.push({ group, row: node });
    return node;
  }

  function syncBindings() {
    for (const b of bindings) {
      if (b.group) {
        b.row.style.display = b.group.showIf(settings, theme) ? '' : 'none';
        continue;
      }
      const visible = !b.field.showIf || b.field.showIf(settings, theme);
      b.row.classList.toggle('hidden', !visible);
      b.update(readValue(b.field.key));
    }
    customUpdaters.forEach((fn) => fn());
  }

  /* ---------------------------------------------------------------- custom sections */

  function accountSection(body) {
    const statusBox = h('section', { class: 'group' });
    const clientInput = h('input', { class: 'input mono', type: 'text', placeholder: '1a2b3c4d5e6f…', spellcheck: 'false', 'aria-label': tr('Spotify Client ID') });
    clientInput.addEventListener('change', () => run(() => api.setSetting('account.clientId', clientInput.value.trim()), 'Client ID saved'));
    const portInput = h('input', { class: 'input', type: 'number', min: 1024, max: 65535, style: { width: '120px' }, 'aria-label': tr('Redirect port') });
    portInput.addEventListener('change', () => {
      const v = Math.round(Number(portInput.value));
      if (!Number.isFinite(v) || v < 1024 || v > 65535) {
        toast(tr('Port must be between 1024 and 65535'), true);
        portInput.value = settings.account.redirectPort;
        return;
      }
      run(() => api.setSetting('account.redirectPort', v), 'Port saved — update the Redirect URI in your Spotify app too');
    });
    const uriInput = h('input', { class: 'input mono', type: 'text', readonly: true, 'aria-label': tr('Redirect URI') });

    const guide = h('section', { class: 'group' },
      h('div', { class: 'group-title', text: tr('One-time setup (about 2 minutes)') }),
      h('ol', { class: 'steps' },
        h('li', null, rich('Open the {0} and log in with your Spotify account.', h('a', { href: '#', onclick: (e) => { e.preventDefault(); api.openExternal(DASHBOARD_URL); } }, 'Spotify Developer Dashboard'))),
        h('li', null, rich('Click {0}. Use any name and description (for example “My Overlay”).', h('b', { text: 'Create app' }))),
        h('li', null, rich('In {0} add exactly this address, then click Add:', h('b', { text: 'Redirect URIs' })),
          h('div', { class: 'copy-row' }, uriInput, h('button', { class: 'btn btn-small', type: 'button', text: tr('Copy'), onclick: () => copyText(uriInput.value) }))),
        h('li', null, rich('Under “Which API/SDKs are you planning to use?” tick {0}, accept the terms and Save.', h('b', { text: 'Web API' }))),
        h('li', null, rich('Open the app’s {0}, copy the {1} and paste it below. No Client Secret is needed.', h('b', { text: 'Settings' }), h('b', { text: 'Client ID' }))),
        h('li', null, rich('Click {0} and approve access in your browser.', h('b', { text: tr('Connect Spotify') })))
      )
    );

    const creds = h('section', { class: 'group' },
      h('div', { class: 'group-title', text: tr('Spotify app credentials') }),
      h('div', { class: 'group-body' },
        h('div', { class: 'field' }, h('div', null, h('div', { class: 'field-label', text: 'Client ID' }), h('div', { class: 'field-help', text: tr('Stored on this computer only.') })), h('div', { class: 'field-control' }, clientInput)),
        h('div', { class: 'field' }, h('div', null, h('div', { class: 'field-label', text: tr('Redirect port') }), h('div', { class: 'field-help', text: tr('Change only if 8888 is used by another program.') })), h('div', { class: 'field-control' }, portInput))
      )
    );

    body.append(statusBox, guide, creds);

    customUpdaters.push(() => {
      if (document.activeElement !== clientInput) clientInput.value = settings.account.clientId;
      if (document.activeElement !== portInput) portInput.value = settings.account.redirectPort;
      uriInput.value = auth.redirectUri || `http://127.0.0.1:${settings.account.redirectPort}/callback`;

      statusBox.replaceChildren();
      const user = auth.user;
      const avatar = user && user.image
        ? h('img', { class: 'avatar', src: user.image, alt: '' })
        : h('div', { class: 'avatar', text: user && user.name ? user.name.slice(0, 1).toUpperCase() : '?' });
      const title = auth.connected
        ? (user && user.name ? tr('Connected as {name}', { name: user.name }) : tr('Connected'))
        : tr(auth.loggingIn ? 'Waiting for you to approve in the browser…' : 'Not connected');
      const sub = tr(auth.connected
        ? 'Your overlay updates live from Spotify.'
        : settings.account.clientId ? 'Click Connect to sign in.' : 'Follow the steps below to get your Client ID.');
      const btn = auth.connected
        ? h('button', { class: 'btn btn-danger', type: 'button', text: tr('Disconnect'), onclick: () => run(() => api.logout(), 'Disconnected') })
        : h('button', { class: 'btn btn-primary', type: 'button', text: tr(auth.loggingIn ? 'Connecting…' : 'Connect Spotify'), disabled: auth.loggingIn || !settings.account.clientId, onclick: () => run(() => api.login()) });
      statusBox.append(h('div', { class: 'card-row' },
        avatar,
        h('div', { class: 'grow' }, h('div', { class: 'field-label', text: title }), h('div', { class: 'muted', text: sub }), auth.error ? h('div', { class: 'error-text', text: tr(auth.error) }) : null),
        btn
      ));
    });
  }

  function previewBackground(v) {
    switch (v.background) {
      case 'gradient':
      case 'glass':
        return { background: `linear-gradient(${v.gradientAngle}deg, ${v.bg}, ${v.bg2})` };
      case 'album':
        return { background: `linear-gradient(135deg, ${v.accent}, ${v.bg} 70%)` };
      case 'none':
        return null;
      default:
        return { background: v.bg };
    }
  }

  function themeCard(t, active) {
    const v = t.values;
    const bg = previewBackground(v);
    const preview = h('div', { class: 'theme-preview' + (bg ? '' : ' checker'), style: Object.assign({ fontFamily: (FONTS[v.font] || FONTS.system).stack }, bg || {}) },
      h('div', { class: 'p-art', style: { background: `linear-gradient(135deg, ${v.accent}, ${v.accent2})`, borderRadius: '8px' } }),
      h('div', { class: 'p-lines' },
        h('div', { class: 'p-title', style: { background: v.text } }),
        h('div', { class: 'p-sub', style: { background: v.subtext } }),
        h('div', { class: 'p-bar', style: { background: `linear-gradient(90deg, ${v.accent}, ${v.accent2})` } })
      )
    );
    if (v.borderWidth > 0) preview.style.boxShadow = `inset 0 0 0 ${v.borderWidth}px ${v.borderColor}`;
    const effect = EFFECTS[v.effect] && v.effect !== 'none' ? v.effect : null;
    const frame = h('div', { class: 'theme-frame' + (effect ? ` pfx-${effect}` : '') }, preview);
    frame.style.setProperty('--p-accent', v.accent);
    frame.style.setProperty('--p-accent2', v.accent2);
    frame.style.setProperty('--p-bg', v.bg);
    const tags = [BG_LABELS[v.background] || v.background, effect ? EFFECTS[effect].label : null, (FONTS[v.font] || FONTS.system).label]
      .filter(Boolean)
      .map((tag) => tr(tag))
      .map((tag, i) => h('span', { class: 'theme-tag' + (i === 1 && effect ? ' fx' : ''), text: tag }));
    if (v.useAlbumColors) tags.push(h('span', { class: 'theme-tag', text: tr('Album colors') }));
    const card = h('button', { class: 'theme-card' + (active ? ' active' : ''), type: 'button', 'aria-pressed': active ? 'true' : 'false', title: tr(t.description) || t.name, onclick: () => run(() => api.applyTheme(t.id)) },
      frame,
      h('div', { class: 'theme-meta' },
        h('div', { class: 'theme-name', text: t.name }),
        h('div', { class: 'theme-desc', text: tr(t.description || 'Custom theme') }),
        h('div', { class: 'theme-tags' }, tags)
      )
    );
    if (t.custom) {
      const del = h('span', { class: 'theme-delete', role: 'button', tabindex: '0', title: tr('Delete theme'), 'aria-label': tr('Delete theme'), text: '✕' });
      const doDelete = (e) => {
        e.stopPropagation();
        e.preventDefault();
        run(() => api.deleteCustomTheme(t.id), 'Theme deleted');
      };
      del.addEventListener('click', doDelete);
      del.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') doDelete(e); });
      card.appendChild(del);
    }
    return card;
  }

  const BG_LABELS = { solid: 'Solid', gradient: 'Gradient', glass: 'Glass', album: 'Album art', none: 'Transparent' };
  const THEME_FILTER_KEY = 'so.themeFilter';

  function themesSection(body, section) {
    const nameInput = h('input', { class: 'input', type: 'text', placeholder: tr('New theme name'), maxlength: 60, 'aria-label': tr('New theme name') });
    const resetBtn = h('button', { class: 'btn btn-small', type: 'button', text: tr('Undo my tweaks'), onclick: () => run(() => api.resetThemeOverrides(), 'Theme reset to preset') });
    const toolbar = h('div', { class: 'group-actions theme-toolbar' },
      nameInput,
      h('button', { class: 'btn btn-small btn-primary', type: 'button', text: tr('Save as new theme'), onclick: () => {
        run(() => api.saveCustomTheme(nameInput.value.trim() || tr('My theme')), 'Theme saved').then(() => { nameInput.value = ''; });
      } }),
      resetBtn,
      h('button', { class: 'btn btn-small', type: 'button', text: tr('Import…'), onclick: () => run(() => api.importTheme(), 'Theme imported') }),
      h('button', { class: 'btn btn-small', type: 'button', text: tr('Export…'), onclick: () => run(() => api.exportTheme(), 'Theme exported') })
    );
    const gallery = h('div', { class: 'theme-gallery' });
    const chips = h('div', { class: 'theme-chips', role: 'tablist', 'aria-label': tr('Theme categories') });
    const currentLabel = h('div', { class: 'group-title' });
    body.append(h('section', { class: 'group' }, currentLabel, chips, gallery, toolbar));
    let filter = 'all';
    try { filter = localStorage.getItem(THEME_FILTER_KEY) || 'all'; } catch (_) { /* storage unavailable */ }
    section.groups.forEach((g) => body.appendChild(buildGroup(g)));

    let lastSig = '';
    customUpdaters.push(() => {
      const hasOverrides = Object.keys(settings.themeOverrides || {}).length > 0;
      resetBtn.disabled = !hasOverrides;
      const active = findTheme(settings.themeId, settings.customThemes);
      currentLabel.textContent = tr(hasOverrides ? 'Current theme: {name} (modified)' : 'Current theme: {name}', { name: active ? active.name : tr('Unknown') });
      const sig = JSON.stringify([settings.themeId, settings.customThemes, lang]);
      if (sig === lastSig) return;
      lastSig = sig;
      renderGallery();
    });

    function renderGallery() {
      const custom = settings.customThemes.map((c) => findTheme(c.id, settings.customThemes));
      const cats = CATEGORIES.map((c) => ({ ...c, themes: PRESETS.filter((t) => t.category === c.id) }));
      if (custom.length) cats.push({ id: 'custom', name: 'My themes', description: 'Themes you saved or imported.', themes: custom });
      if (filter !== 'all' && !cats.some((c) => c.id === filter)) filter = 'all';

      const chip = (id, label, count) => h('button', {
        class: 'chip' + (filter === id ? ' active' : ''),
        type: 'button',
        role: 'tab',
        'aria-selected': filter === id ? 'true' : 'false',
        onclick: () => {
          filter = id;
          try { localStorage.setItem(THEME_FILTER_KEY, id); } catch (_) { /* storage unavailable */ }
          renderGallery();
        }
      }, tr(label), h('span', { class: 'chip-count', text: String(count) }));
      chips.replaceChildren(
        chip('all', 'All', cats.reduce((n, c) => n + c.themes.length, 0)),
        ...cats.map((c) => chip(c.id, c.name, c.themes.length))
      );

      gallery.replaceChildren(...cats.filter((c) => filter === 'all' || c.id === filter).map((c) =>
        h('div', { class: 'theme-category' },
          h('div', { class: 'theme-category-head' },
            h('span', { class: 'theme-category-name', text: tr(c.name) }),
            h('span', { class: 'theme-category-desc', text: tr(c.description) })
          ),
          h('div', { class: 'theme-grid' }, c.themes.map((t) => themeCard(t, t.id === settings.themeId)))
        )
      ));
    }
  }

  function obsSection(body, section) {
    section.groups.forEach((g) => body.appendChild(buildGroup(g)));
    const url = h('input', { class: 'input mono', type: 'text', readonly: true, 'aria-label': tr('Browser source URL') });
    const status = h('div', { class: 'muted' });
    body.appendChild(h('section', { class: 'group' },
      h('div', { class: 'group-title', text: tr('Add it to OBS') }),
      h('div', { class: 'info-box' },
        status,
        h('div', { class: 'copy-row' }, url, h('button', { class: 'btn btn-small', type: 'button', text: tr('Copy'), onclick: () => copyText(url.value) })),
        h('ol', { class: 'steps', style: { paddingLeft: '20px' } },
          h('li', null, rich('In OBS, click {0} under Sources and choose {1}.', h('b', { text: '+' }), h('b', { text: 'Browser' }))),
          h('li', null, rich('Paste the URL above. Set width to about {0} and height to {1}.', h('b', { text: '900' }), h('b', { text: '400' }))),
          h('li', null, tr('Leave the custom CSS empty. The background is already transparent.')),
          h('li', null, tr('Every change you make here appears in OBS instantly.'))
        ),
        h('p', { class: 'muted', text: tr('Tip: the “Stream Clean” theme is made for streaming. The browser source always uses the simulated visualizer, because a browser page cannot capture system audio.') })
      )
    ));
    customUpdaters.push(() => {
      url.value = `http://127.0.0.1:${settings.obs.port}/`;
      status.textContent = obsStatus.error
        ? tr('Could not start: {error}', { error: obsStatus.error })
        : tr(settings.obs.enabled ? (obsStatus.running ? 'Server running.' : 'Starting…') : 'Server is off. Enable it above.');
      status.className = obsStatus.error ? 'error-text' : 'muted';
    });
  }

  function advancedSection(body) {
    let confirmTimer = null;
    const resetBtn = h('button', { class: 'btn btn-danger', type: 'button', text: tr('Reset all settings') });
    resetBtn.addEventListener('click', () => {
      if (!resetBtn.classList.contains('confirm')) {
        resetBtn.classList.add('confirm');
        resetBtn.textContent = tr('Click again to confirm');
        confirmTimer = setTimeout(() => {
          resetBtn.classList.remove('confirm');
          resetBtn.textContent = tr('Reset all settings');
        }, 4000);
        return;
      }
      clearTimeout(confirmTimer);
      resetBtn.classList.remove('confirm');
      resetBtn.textContent = tr('Reset all settings');
      run(() => api.resetSettings(), 'Settings reset (your Spotify connection was kept)');
    });
    body.append(
      h('section', { class: 'group' },
        h('div', { class: 'group-title', text: tr('Backup') }),
        h('div', { class: 'info-box' }, h('p', { class: 'muted', text: tr('Export your whole configuration (without your Client ID) to share it or move it to another computer.') })),
        h('div', { class: 'group-actions' },
          h('button', { class: 'btn', type: 'button', text: tr('Export settings…'), onclick: () => run(() => api.exportSettings(), 'Settings exported') }),
          h('button', { class: 'btn', type: 'button', text: tr('Import settings…'), onclick: () => run(() => api.importSettings(), 'Settings imported') }),
          h('button', { class: 'btn', type: 'button', text: tr('Open settings folder'), onclick: () => run(() => api.openConfigFolder()) })
        )
      ),
      h('section', { class: 'group' },
        h('div', { class: 'group-title', text: tr('Danger zone') }),
        h('div', { class: 'info-box' }, h('p', { class: 'muted', text: tr('Restore every option to its default value. Your Spotify login, Client ID and overlay position are kept.') })),
        h('div', { class: 'group-actions' }, resetBtn)
      )
    );
  }

  function aboutSection(body) {
    const versions = h('p', { class: 'muted' });
    body.append(
      h('section', { class: 'group' },
        h('div', { class: 'info-box' },
          h('p', null, rich('{0} is a free, open-source, always-on-top “now playing” overlay with themes and audio visualizers.', h('b', { text: 'Spotify Overlay' }))),
          versions,
          h('p', { class: 'muted', text: tr('This project is not affiliated with, endorsed by, or sponsored by Spotify. Spotify is a trademark of Spotify AB.') }),
          h('p', { class: 'muted', text: tr('Privacy: the app talks only to Spotify’s official API, and to GitHub to check for updates. Your tokens are encrypted on this computer. No analytics, no tracking.') })
        ),
        h('div', { class: 'group-actions links' },
          h('button', { class: 'btn', type: 'button', text: tr('GitHub repository'), onclick: () => api.openExternal(REPO_URL) }),
          h('button', { class: 'btn', type: 'button', text: tr('Report a bug / request a feature'), onclick: () => api.openExternal(REPO_URL + '/issues') }),
          h('button', { class: 'btn', type: 'button', text: tr('MIT License'), onclick: () => api.openExternal(REPO_URL + '/blob/main/LICENSE') })
        )
      )
    );
    customUpdaters.push(() => {
      versions.textContent = `${tr('Version {version}', { version: appInfo.version || '?' })} · Electron ${appInfo.electron || '?'} · ${appInfo.platform}`;
    });
  }

  function updatesSection(body, section) {
    const versionLine = h('p', null);
    const statusLine = h('p', { class: 'muted' });
    const progress = h('div', { class: 'update-progress', hidden: true }, h('div', { class: 'update-progress-fill' }));
    const actions = h('div', { class: 'group-actions' });
    const note = h('p', { class: 'muted' });

    body.appendChild(h('section', { class: 'group' },
      h('div', { class: 'group-title', text: tr('App version') }),
      h('div', { class: 'info-box' }, versionLine, statusLine, progress, note),
      actions
    ));
    section.groups.forEach((g) => body.appendChild(buildGroup(g)));

    const btn = (text, onclick, primary) => h('button', { class: 'btn' + (primary ? ' btn-primary' : ''), type: 'button', text: tr(text), onclick });
    const check = () => run(() => api.checkForUpdates());

    customUpdaters.push(() => {
      const u = updateState;
      const auto = u.mode === 'auto';
      versionLine.replaceChildren(...rich('Installed version: {0}', h('b', { text: `v${u.currentVersion || appInfo.version}` })));
      statusLine.className = u.status === 'error' ? 'error-text' : 'muted';
      progress.hidden = u.status !== 'downloading';
      progress.firstChild.style.width = `${u.percent || 0}%`;

      const when = u.lastChecked ? ' ' + tr('Last checked {time}.', { time: new Date(u.lastChecked).toLocaleTimeString(lang) }) : '';
      const buttons = [];
      switch (u.status) {
        case 'checking':
          statusLine.textContent = tr('Checking for updates…');
          buttons.push(h('button', { class: 'btn', type: 'button', text: tr('Checking…'), disabled: true }));
          break;
        case 'available':
          statusLine.textContent = tr('Version {version} is available.', { version: u.latestVersion });
          buttons.push(auto
            ? btn('Download and install', () => run(() => api.downloadUpdate()), true)
            : btn('Open download page', () => api.openExternal(u.releaseUrl), true));
          buttons.push(btn('Release notes', () => api.openExternal(u.releaseUrl)));
          break;
        case 'downloading':
          statusLine.textContent = tr('Downloading version {version}… {percent}%', { version: u.latestVersion, percent: u.percent || 0 });
          break;
        case 'downloaded':
          statusLine.textContent = tr('Version {version} is ready. Restart the app to finish updating. Your settings and Spotify login are kept.', { version: u.latestVersion });
          buttons.push(btn('Restart and update', () => run(() => api.installUpdate()), true));
          break;
        case 'not-available':
          statusLine.textContent = tr('You have the latest version.') + when;
          buttons.push(btn('Check for updates', check, true));
          break;
        case 'error':
          statusLine.textContent = tr(u.error || 'Could not check for updates.');
          buttons.push(btn('Try again', check, true));
          break;
        default:
          statusLine.textContent = tr('Click the button to see if a newer version is out.') + when;
          buttons.push(btn('Check for updates', check, true));
      }
      buttons.push(btn('All releases', () => api.openExternal(REPO_URL + '/releases')));
      actions.replaceChildren(...buttons);

      note.textContent = tr(auto
        ? 'Updates download in the background and install with one click. You never need to run the installer again.'
        : appInfo.packaged
          ? 'This version of the app (macOS, Windows portable or .deb) cannot install updates by itself. When an update is out, download it from the release page and install it over the current one.'
          : 'You are running from source. Update with "git pull" and "npm install".');
    });
  }

  const CUSTOM = { account: accountSection, themes: themesSection, obs: obsSection, advanced: advancedSection, updates: updatesSection, about: aboutSection };

  /* ---------------------------------------------------------------- navigation */

  function renderNav() {
    const nav = document.getElementById('nav');
    nav.replaceChildren(...SECTIONS.map((s) => h('button', {
      class: 'nav-item' + (s.id === currentSection ? ' active' : ''),
      type: 'button',
      'aria-current': s.id === currentSection ? 'page' : null,
      onclick: () => showSection(s.id)
    }, svgIcon(s.icon), tr(s.title))));
  }

  function showSection(id) {
    const section = SECTIONS.find((s) => s.id === id) || SECTIONS[0];
    currentSection = section.id;
    try { localStorage.setItem('so.section', currentSection); } catch (_) { /* storage unavailable */ }
    renderNav();
    document.getElementById('section-title').textContent = tr(section.title);
    document.getElementById('section-desc').textContent = tr(section.description || '');
    const body = document.getElementById('section-body');
    body.replaceChildren();
    bindings = [];
    customUpdaters = [];
    if (section.custom) CUSTOM[section.custom](body, section);
    else section.groups.forEach((g) => body.appendChild(buildGroup(g)));
    syncBindings();
    document.querySelector('.main').scrollTop = 0;
  }

  /* ---------------------------------------------------------------- global status */

  function updateStatus() {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    dot.className = 'dot' + (auth.connected ? ' ok' : auth.loggingIn ? ' busy' : '');
    text.textContent = auth.connected
      ? tr('Connected') + (auth.user && auth.user.name ? ' · ' + auth.user.name : '')
      : tr(auth.loggingIn ? 'Connecting…' : 'Not connected');
    document.getElementById('toggle-overlay').textContent = tr(overlayVisible ? 'Hide overlay' : 'Show overlay');
  }

  /** Applies the UI language to the static parts of the page. */
  function applyLanguage() {
    lang = currentLanguage();
    document.documentElement.lang = lang;
    document.title = tr('Spotify Overlay — Settings');
    document.getElementById('nav').setAttribute('aria-label', tr('Settings sections'));
  }

  function onSettings(s) {
    settings = s;
    theme = getEffectiveTheme(s);
    if (currentLanguage() !== lang) {
      applyLanguage();
      showSection(currentSection);
      updateStatus();
      return;
    }
    syncBindings();
  }

  document.getElementById('toggle-overlay').addEventListener('click', () => {
    run(() => api.setOverlayVisible(!overlayVisible));
  });

  // The main process can ask to open a section (e.g. tray → "Check for updates…").
  // It may arrive before init() finishes, so remember it until then.
  let ready = false;
  let navTarget = null;
  api.onNavigate((id) => {
    if (!SECTIONS.some((s) => s.id === id)) return;
    if (ready) showSection(id);
    else navTarget = id;
  });

  async function init() {
    const [s, a, o, sc, info, vis, up] = await Promise.all([
      api.getSettings(), api.getAuthStatus(), api.getObsStatus(), api.getShortcutStatus(), api.getAppInfo(), api.getOverlayVisible(), api.getUpdateStatus()
    ]);
    updateState = up;
    settings = s;
    theme = getEffectiveTheme(s);
    auth = a;
    obsStatus = o;
    shortcutStatus = sc || {};
    appInfo = info;
    overlayVisible = vis;
    document.getElementById('version').textContent = `v${info.version}`;
    applyLanguage();

    let saved = null;
    try { saved = localStorage.getItem('so.section'); } catch (_) { /* storage unavailable */ }
    // First run: start on Account until connected.
    showSection(navTarget || (!auth.connected ? 'account' : saved || 'themes'));
    ready = true;
    updateStatus();

    api.onSettings(onSettings);
    api.onAuth((st) => {
      const wasConnected = auth.connected;
      auth = st;
      updateStatus();
      syncBindings();
      if (!wasConnected && st.connected) toast(tr('Spotify connected!'));
    });
    api.onObsStatus((st) => { obsStatus = st; syncBindings(); });
    api.onShortcutStatus((st) => { shortcutStatus = st || {}; syncBindings(); });
    api.onOverlayVisible((v) => { overlayVisible = Boolean(v); updateStatus(); });
    api.onUpdateStatus((st) => { updateState = st; syncBindings(); });
  }

  init().catch((err) => toast(tr('Failed to load settings: {error}', { error: errMsg(err) }), true));
})();
