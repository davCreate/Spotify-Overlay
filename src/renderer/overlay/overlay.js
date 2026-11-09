/*
 * Spotify Overlay - overlay renderer.
 * Runs inside the transparent Electron window, and also as an OBS browser source
 * (served by the app's local server, fed by Server-Sent Events).
 */
(function () {
  'use strict';

  const { getEffectiveTheme, FONTS, EFFECTS } = window.SO_THEMES;
  const { DEFAULT_SETTINGS, clone } = window.SO_DEFAULTS;

  /* ---------------------------------------------------------------- API (Electron or web) */

  function createWebAPI() {
    const cache = {};
    const listeners = { settings: [], playback: [], auth: [] };
    const waiters = { settings: [], playback: [], auth: [] };
    const es = new EventSource('/events');
    Object.keys(listeners).forEach((name) => {
      es.addEventListener(name, (e) => {
        let data;
        try {
          data = JSON.parse(e.data);
        } catch (_) {
          return;
        }
        cache[name] = data;
        waiters[name].splice(0).forEach((r) => r(data));
        listeners[name].forEach((cb) => cb(data));
      });
    });
    const get = (name) => () => (name in cache ? Promise.resolve(cache[name]) : new Promise((r) => waiters[name].push(r)));
    const sub = (name) => (cb) => {
      listeners[name].push(cb);
      return () => { listeners[name] = listeners[name].filter((f) => f !== cb); };
    };
    return {
      mode: 'web',
      platform: 'web',
      getSettings: get('settings'),
      getPlayback: get('playback'),
      getAuthStatus: get('auth'),
      getPreview: () => Promise.resolve(false),
      onSettings: sub('settings'),
      onPlayback: sub('playback'),
      onAuth: sub('auth'),
      onPreview: () => () => {},
      resizeOverlay: () => {}
    };
  }

  const api = window.overlayAPI || createWebAPI();
  const IS_WEB = api.mode === 'web';
  if (IS_WEB) document.body.classList.add('web');

  /* ---------------------------------------------------------------- elements & state */

  const $ = (sel) => document.querySelector(sel);
  const el = {
    root: document.documentElement,
    scaler: $('#scaler'),
    card: $('#card'),
    content: $('.content'),
    artWrap: $('.art-wrap'),
    art: $('.art'),
    artImg: $('.art-img'),
    bgAlbum: $('.bg-album'),
    title: $('.line.title'),
    artist: $('.line.artist'),
    album: $('.line.album'),
    device: $('.line.device'),
    progress: $('.progress'),
    fill: $('.progress .fill'),
    cur: $('.time.cur'),
    dur: $('.time.dur'),
    canvas: $('canvas.viz'),
    slotBottom: $('.viz-bottom-slot'),
    slotTop: $('.viz-top-slot'),
    slotBg: $('.viz-bg-slot'),
    hint: $('.edit-hint')
  };

  const DEMO_TRACK = {
    id: '__demo__',
    type: 'track',
    title: 'Midnight City Lights',
    artists: 'The Overlay Band',
    album: 'Preview track · nothing is playing',
    artUrl: null,
    durationMs: 213000
  };
  const DEMO_START = Date.now();

  let settings = clone(DEFAULT_SETTINGS);
  let theme = getEffectiveTheme(settings);
  let playback = { active: false, isPlaying: false, track: null, progressMs: 0, receivedAt: Date.now(), device: null };
  let auth = { connected: false };
  let preview = false;
  let shownKey = null;
  let current = null;
  let pausedSince = null;
  let lastActivity = Date.now();
  let albumColors = null;
  let currentArtUrl = null;
  let transitionToken = 0;
  let margin = 24;
  const colorCache = new Map();

  const viz = new window.Visualizer(el.canvas);
  viz.start();

  /* ---------------------------------------------------------------- helpers */

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function fmtTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }

  function prettyAccelerator(acc) {
    if (!acc) return '';
    const mac = api.platform === 'darwin';
    return acc
      .replace(/CommandOrControl|CmdOrCtrl/g, mac ? '⌘' : 'Ctrl')
      .replace(/Command|Cmd/g, '⌘')
      .replace(/Control/g, 'Ctrl')
      .replace(/Alt|Option/g, mac ? '⌥' : 'Alt');
  }

  function isSafeImageUrl(url) {
    return typeof url === 'string' && /^https:\/\//i.test(url);
  }

  function loadImage(url, timeout) {
    return new Promise((resolve) => {
      const img = new Image();
      const t = setTimeout(resolve, timeout);
      img.onload = img.onerror = () => {
        clearTimeout(t);
        resolve();
      };
      img.src = url;
    });
  }

  /* ---------------------------------------------------------------- album colors */

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    return [0, s, l];
  }

  function toHex(r, g, b) {
    return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }

  function mix(c, target, amount) {
    return c.map((v) => v + (target - v) * amount);
  }

  function pickColors(data) {
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const bucket = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b;
      buckets.set(key, bucket);
    }
    const scored = [];
    for (const bk of buckets.values()) {
      const c = [bk.r / bk.n, bk.g / bk.n, bk.b / bk.n];
      const [, s, l] = rgbToHsl(c[0], c[1], c[2]);
      const lightOk = l > 0.15 && l < 0.9 ? 1 : 0.15;
      scored.push({ c, score: bk.n * (0.15 + s) * lightOk });
    }
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    let main = scored[0].c;
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    let second = (scored.find((x) => dist(x.c, main) > 80) || { c: mix(main, 255, 0.35) }).c;
    const ensureBright = (c) => {
      const [, , l] = rgbToHsl(c[0], c[1], c[2]);
      return l < 0.45 ? mix(c, 255, 0.45 - l + 0.15) : c;
    };
    main = ensureBright(main);
    second = ensureBright(second);
    return { accent: toHex(...main), accent2: toHex(...second) };
  }

  function extractColors(url) {
    if (colorCache.has(url)) return Promise.resolve(colorCache.get(url));
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 32;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, 32, 32);
          const colors = pickColors(ctx.getImageData(0, 0, 32, 32).data);
          colorCache.set(url, colors);
          if (colorCache.size > 50) colorCache.delete(colorCache.keys().next().value);
          resolve(colors);
        } catch (_) {
          resolve(null); // CORS-tainted canvas: keep theme colors
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  /* ---------------------------------------------------------------- settings → CSS */

  function setVar(name, value) {
    el.root.style.setProperty(name, value);
  }

  function setClass(node, prefix, value, all) {
    all.forEach((v) => node.classList.remove(prefix + v));
    node.classList.add(prefix + value);
  }

  function activeColors() {
    if (theme.useAlbumColors && albumColors) return albumColors;
    return { accent: theme.accent, accent2: theme.accent2 };
  }

  function applyColors() {
    const c = activeColors();
    setVar('--accent', c.accent);
    setVar('--accent2', c.accent2);
    viz.setOptions({ accent: c.accent, accent2: c.accent2, text: theme.text });
  }

  function isUnlocked() {
    return !IS_WEB && !settings.layout.locked;
  }

  function wantedSource() {
    const v = settings.visualizer;
    if (IS_WEB || api.platform !== 'win32') return 'simulated';
    if (!v.enabled && !settings.art.pulse) return 'simulated';
    return v.source;
  }

  function applySettings() {
    const s = settings;
    theme = getEffectiveTheme(s);

    setVar('--scale', s.layout.scale);
    setVar('--width', s.layout.width + 'px');
    setVar('--padding', s.layout.padding + 'px');
    setVar('--gap', s.layout.gap + 'px');
    setVar('--radius', s.layout.radius + 'px');
    setVar('--opacity', s.layout.opacity);
    setVar('--art-size', s.art.size + 'px');
    setVar('--title-size', s.text.titleSize + 'px');
    setVar('--artist-size', s.text.artistSize + 'px');
    setVar('--album-size', s.text.albumSize + 'px');
    setVar('--title-weight', s.text.titleWeight);
    setVar('--progress-h', s.progress.height + 'px');
    setVar('--viz-h', s.visualizer.height + 'px');
    setVar('--viz-opacity', s.visualizer.opacity);
    setVar('--anim-ms', s.animation.duration + 'ms');

    setVar('--font', (FONTS[theme.font] || FONTS.system).stack);
    setVar('--bg', theme.bg);
    setVar('--bg2', theme.bg2);
    setVar('--angle', theme.gradientAngle + 'deg');
    setVar('--bg-opacity', theme.bgOpacity);
    setVar('--album-blur', theme.albumBlur + 'px');
    setVar('--text', theme.text);
    setVar('--subtext', theme.subtext);
    setVar('--border-w', theme.borderWidth + 'px');
    setVar('--border-c', theme.borderColor);
    setVar('--shadow', theme.shadow + 'px');
    setVar('--glow', theme.glow + 'px');
    applyColors();

    const card = el.card;
    setClass(card, 'layout-', s.layout.style, ['horizontal', 'vertical', 'compact', 'minimal']);
    setClass(card, 'shape-', s.art.shape, ['square', 'rounded', 'circle', 'vinyl']);
    setClass(card, 'align-', s.layout.style === 'vertical' ? 'center' : s.text.align, ['left', 'center', 'right']);
    setClass(card, 'bg-', theme.background, ['solid', 'gradient', 'glass', 'album', 'none']);
    setClass(card, 'idle-', s.animation.idle, ['none', 'float', 'breathe']);
    setClass(card, 'fx-', EFFECTS[theme.effect] ? theme.effect : 'none', Object.keys(EFFECTS));
    card.classList.toggle('uppercase', s.text.uppercase);
    card.classList.toggle('text-shadow', s.text.textShadow || theme.background === 'none');
    el.art.classList.toggle('has-shadow', s.art.shadow);

    el.artWrap.style.display = s.art.show ? '' : 'none';
    el.title.style.display = s.text.showTitle ? '' : 'none';
    el.artist.style.display = s.text.showArtist ? '' : 'none';
    el.album.style.display = s.text.showAlbum ? '' : 'none';
    el.device.style.display = s.text.showDevice ? '' : 'none';
    el.progress.style.display = s.progress.show ? '' : 'none';
    el.progress.classList.toggle('no-time', !s.progress.showTime);
    el.progress.classList.toggle('rounded', s.progress.rounded);
    el.progress.classList.toggle('with-knob', s.progress.knob);

    // Visualizer placement
    const v = s.visualizer;
    const slot = v.placement === 'background' ? el.slotBg : v.placement === 'top' ? el.slotTop : el.slotBottom;
    if (el.canvas.parentElement !== slot) slot.appendChild(el.canvas);
    [el.slotBg, el.slotTop, el.slotBottom].forEach((n) => n.classList.toggle('active', v.enabled && n === slot));
    viz.setOptions({
      enabled: v.enabled,
      style: v.style,
      bars: v.bars,
      sensitivity: v.sensitivity,
      smoothing: v.smoothing,
      colorMode: v.colorMode,
      glow: v.glow,
      fps: v.fps
    });
    viz.setSource(wantedSource());

    // Edit mode
    document.body.classList.toggle('unlocked', isUnlocked());
    const lockKey = prettyAccelerator(s.shortcuts.toggleLock);
    el.hint.textContent = 'Drag to move · lock it from the tray' + (lockKey ? ` or ${lockKey}` : '');
    setVar('--hint-scale', 1 / s.layout.scale);

    const fxMargin = (EFFECTS[theme.effect] || EFFECTS.none).margin;
    margin = clamp(Math.ceil(Math.max(theme.shadow + 12, theme.glow * 1.6, 16) + fxMargin), 16, 150);
    if (isUnlocked()) margin = Math.max(margin, 34);
    setVar('--margin', margin + 'px');

    updateArtClasses();
    requestResize();
    refreshMarquee();
  }

  /* ---------------------------------------------------------------- sizing */

  let resizeQueued = false;
  function requestResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      const scale = settings.layout.scale;
      const w = Math.ceil(el.card.offsetWidth * scale + margin * 2);
      const h = Math.ceil(el.card.offsetHeight * scale + margin * 2);
      api.resizeOverlay(w, h);
    });
  }
  new ResizeObserver(requestResize).observe(el.card);

  function refreshMarquee() {
    requestAnimationFrame(() => {
      [el.title, el.artist, el.album, el.device].forEach((line) => {
        line.classList.remove('scrolling');
        const span = line.firstElementChild;
        if (!settings.text.marquee || !span || line.style.display === 'none') return;
        const overflow = span.scrollWidth - line.clientWidth;
        if (overflow > 2) {
          line.style.setProperty('--marquee-distance', overflow + 'px');
          line.style.setProperty('--marquee-time', Math.max(6, overflow / 25 + 4).toFixed(1) + 's');
          line.classList.add('scrolling');
        }
      });
    });
  }

  /* ---------------------------------------------------------------- display model */

  function currentDisplay() {
    if (playback.active && playback.track) {
      return { kind: 'track', track: playback.track, isPlaying: playback.isPlaying, progressMs: playback.progressMs, receivedAt: playback.receivedAt, device: playback.device };
    }
    if (preview) {
      return { kind: 'track', demo: true, track: DEMO_TRACK, isPlaying: true, progressMs: (Date.now() - DEMO_START) % DEMO_TRACK.durationMs, receivedAt: Date.now(), device: 'Preview' };
    }
    if (!auth.connected) {
      return { kind: 'message', title: 'Spotify not connected', subtitle: IS_WEB ? 'Connect your account in the Spotify Overlay app' : 'Open Settings from the tray icon to connect' };
    }
    return { kind: 'message', title: 'Nothing playing', subtitle: 'Start a song in Spotify' };
  }

  function displayKey(d) {
    return d.kind === 'track' ? 'track:' + d.track.id : 'msg:' + d.title;
  }

  function setText(line, text) {
    line.firstElementChild.textContent = text || '';
  }

  function setArt(url) {
    const safe = isSafeImageUrl(url) ? url : null;
    if (safe === currentArtUrl) return;
    currentArtUrl = safe;
    albumColors = null;
    if (safe) {
      el.artImg.classList.remove('loaded');
      el.artImg.onload = () => el.artImg.classList.add('loaded');
      el.artImg.onerror = () => el.artImg.classList.remove('loaded');
      el.artImg.src = safe;
      el.bgAlbum.style.backgroundImage = `url("${safe.replace(/["\\]/g, '')}")`;
      if (theme.useAlbumColors) {
        extractColors(safe).then((colors) => {
          if (currentArtUrl !== safe) return;
          albumColors = colors;
          applyColors();
        });
      }
    } else {
      el.artImg.onload = el.artImg.onerror = null;
      el.artImg.removeAttribute('src');
      el.artImg.classList.remove('loaded');
      el.bgAlbum.style.backgroundImage = '';
    }
    applyColors();
  }

  function fillContent(d) {
    el.card.classList.toggle('message', d.kind === 'message');
    if (d.kind === 'track') {
      setText(el.title, d.track.title);
      setText(el.artist, d.track.artists);
      setText(el.album, d.track.album);
      setText(el.device, d.device || '');
      setArt(d.track.artUrl);
    } else {
      setText(el.title, d.title);
      setText(el.artist, d.subtitle);
      setText(el.album, '');
      setText(el.device, '');
      setArt(null);
    }
    refreshMarquee();
    requestResize();
  }

  const KEYFRAMES = {
    fade: [[{ opacity: 1 }, { opacity: 0 }], [{ opacity: 0 }, { opacity: 1 }]],
    slide: [
      [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-28px)' }],
      [{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'translateX(0)' }]
    ],
    zoom: [
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.85)' }],
      [{ opacity: 0, transform: 'scale(1.1)' }, { opacity: 1, transform: 'scale(1)' }]
    ],
    flip: [
      [{ opacity: 1, transform: 'rotateX(0deg)' }, { opacity: 0, transform: 'rotateX(90deg)' }],
      [{ opacity: 0, transform: 'rotateX(-90deg)' }, { opacity: 1, transform: 'rotateX(0deg)' }]
    ],
    blur: [
      [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(10px)' }],
      [{ opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0px)' }]
    ]
  };

  async function transitionTo(d) {
    const token = ++transitionToken;
    const type = settings.animation.trackChange;
    const duration = settings.animation.duration;
    const frames = KEYFRAMES[type];
    const hidden = el.scaler.classList.contains('is-hidden');
    if (!frames || duration <= 0 || shownKey === null || hidden) {
      el.content.getAnimations().forEach((a) => a.cancel());
      fillContent(d);
      return;
    }
    const url = d.kind === 'track' && isSafeImageUrl(d.track.artUrl) ? d.track.artUrl : null;
    const half = duration / 2;
    const out = el.content.animate(frames[0], { duration: half, easing: 'ease-in', fill: 'forwards' });
    await Promise.all([out.finished.catch(() => {}), url ? loadImage(url, 1500) : null]);
    if (token !== transitionToken) return; // a newer change took over
    fillContent(d);
    el.content.getAnimations().forEach((a) => a.cancel());
    el.content.animate(frames[1], { duration: half, easing: 'ease-out' });
  }

  function updateArtClasses() {
    const d = current;
    const spin = settings.art.spin && (settings.art.shape === 'circle' || settings.art.shape === 'vinyl');
    el.artWrap.classList.toggle('spinning', spin);
    el.artWrap.classList.toggle('paused', !(d && d.kind === 'track' && d.isPlaying));
  }

  function render() {
    const d = currentDisplay();
    current = d;
    const key = displayKey(d);
    if (key !== shownKey) {
      transitionTo(d);
      shownKey = key;
    } else if (d.kind === 'track') {
      // Same item: keep text fresh (e.g. device switched) without animating.
      if (el.device.firstElementChild.textContent !== (d.device || '')) {
        setText(el.device, d.device || '');
        refreshMarquee();
      }
    }
    viz.setPlaying(d.kind === 'track' && d.isPlaying);
    updateArtClasses();
    tick();
  }

  /* ---------------------------------------------------------------- per-tick updates */

  function computeVisible(d, now) {
    if (isUnlocked()) return true;
    const g = settings.general;
    if (d.kind === 'message') return !g.hideWhenIdle;
    if (d.demo) return true;
    if (!d.isPlaying && g.hideWhenPaused && pausedSince !== null && now - pausedSince >= g.pauseHideDelay * 1000) return false;
    if (g.autoHide && now - lastActivity > g.autoHideAfter * 1000) return false;
    return true;
  }

  function tick() {
    const now = Date.now();
    const d = current && current.demo ? currentDisplay() : current;
    if (!d) return;
    if (d.kind === 'track') {
      const dur = d.track.durationMs || 0;
      let pos = d.isPlaying ? d.progressMs + (now - d.receivedAt) : d.progressMs;
      pos = dur > 0 ? clamp(pos, 0, dur) : Math.max(0, pos);
      el.fill.style.width = dur > 0 ? ((pos / dur) * 100).toFixed(2) + '%' : '0%';
      el.cur.textContent = fmtTime(pos);
      el.dur.textContent = fmtTime(dur);
    }
    el.scaler.classList.toggle('is-hidden', !computeVisible(d, now));
  }
  setInterval(tick, 250);

  viz.onFrame = (energy) => {
    const on = settings.art.pulse && current && current.kind === 'track' && current.isPlaying;
    el.art.style.setProperty('--art-energy', on ? (1 + clamp(energy, 0, 1) * 0.07).toFixed(4) : '1');
  };

  /* ---------------------------------------------------------------- events */

  function handlePlayback(p) {
    const now = Date.now();
    const prevId = playback.track ? playback.track.id : null;
    const nextId = p.track ? p.track.id : null;
    if (p.isPlaying !== playback.isPlaying || prevId !== nextId) lastActivity = now;
    if (p.isPlaying) pausedSince = null;
    else if (pausedSince === null || prevId !== nextId) pausedSince = now;
    playback = p;
    render();
  }

  api.onSettings((s) => {
    const prevUseAlbum = theme.useAlbumColors;
    settings = s;
    applySettings();
    if (theme.useAlbumColors && !prevUseAlbum && currentArtUrl) {
      const url = currentArtUrl;
      extractColors(url).then((colors) => {
        if (currentArtUrl !== url) return;
        albumColors = colors;
        applyColors();
      });
    }
    render();
  });
  api.onPlayback(handlePlayback);
  api.onAuth((a) => {
    auth = a;
    render();
  });
  api.onPreview((v) => {
    preview = Boolean(v);
    render();
  });

  Promise.all([api.getSettings(), api.getPlayback(), api.getAuthStatus(), api.getPreview()])
    .then(([s, p, a, pv]) => {
      settings = s;
      auth = a || auth;
      preview = Boolean(pv);
      applySettings();
      handlePlayback(p || playback);
    })
    .catch((err) => console.error('[overlay] init failed', err));
})();
