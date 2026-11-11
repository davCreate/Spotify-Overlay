/*
 * Spotify Overlay - overlay renderer.
 * Runs inside the transparent Electron window, and also as an OBS browser source
 * (served by the app's local server, fed by Server-Sent Events).
 */
(function () {
  'use strict';

  const { getEffectiveTheme, FONTS, EFFECTS } = window.SO_THEMES;
  const I18N = window.SO_I18N;
  /** Translates overlay text into the language chosen in Settings (see src/shared/i18n.js). */
  const tr = (text, vars) => I18N.translate(I18N.resolveLanguage(settings && settings.general.language, navigator.language), text, vars);
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
    carry: $('#carry'),
    pet: $('#pet'),
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
    album: 'Preview track · nothing is playing', // translated when shown
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
    // https: from the Spotify Web API; data:image from the Windows desktop-app source.
    return typeof url === 'string' && (/^https:\/\//i.test(url) || /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=]+$/i.test(url));
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
    el.hint.textContent = lockKey
      ? tr('Drag to move · lock it from the tray or {key}', { key: lockKey })
      : tr('Drag to move · lock it from the tray');
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
      return { kind: 'track', demo: true, track: DEMO_TRACK, isPlaying: true, progressMs: (Date.now() - DEMO_START) % DEMO_TRACK.durationMs, receivedAt: Date.now(), device: tr('Preview') };
    }
    if (!auth.connected) {
      return { kind: 'message', title: tr('Spotify not connected'), subtitle: tr(IS_WEB ? 'Connect your account in the Spotify Overlay app' : 'Open Settings from the tray icon to connect') };
    }
    return { kind: 'message', title: tr('Nothing playing'), subtitle: tr('Start a song in Spotify') };
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
      setText(el.album, d.demo ? tr(d.track.album) : d.track.album);
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
    if (petWanted(d)) {
      const hadCard = shownKey !== null && !petRun && !el.scaler.classList.contains('is-hidden') && !el.scaler.classList.contains('pet-hiding');
      ++transitionToken;
      petEntrance(d, hadCard);
      return;
    }
    abortPet();
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

  /* ---------------------------------------------------------------- pet entrance */

  /*
   * With a pet enabled, every new song is delivered by the pet: it walks in from the screen
   * edge carrying the card, lifts it up to show it, sets it down in place, hops, waves and
   * walks back out. In the app the overlay window is stretched to the screen edge for the
   * duration (main.js stagePet); in OBS the pet walks in from the edge of the browser source.
   */
  const PETS = window.SO_PETS;
  const PET_FADE_MS = 240; // card fade while the window is resized after a pet run
  let petRun = null;
  let petSvgFor = null;

  function petWanted(d) {
    const p = settings.pet;
    return Boolean(p && p.enabled && d.kind === 'track' && !d.demo && !isUnlocked() && computeVisible(d, Date.now()));
  }

  function petSleep(run, ms) {
    return new Promise((resolve) => run.timers.push(setTimeout(resolve, ms)));
  }

  function petAnimate(run, node, frames, opts) {
    const a = node.animate(frames, opts);
    run.anims.push(a);
    return a;
  }

  function ensurePetSvg() {
    const type = settings.pet.type;
    if (petSvgFor === type) return;
    el.pet.innerHTML = PETS.findPet(type).svg();
    petSvgFor = type;
  }

  function resetPetDom() {
    el.pet.hidden = true;
    el.pet.className = 'pet';
    el.scaler.classList.remove('pet-hiding');
    el.scaler.querySelectorAll('.pet-sparkle, .pet-note').forEach((n) => n.remove());
    setVar('--stage-offset', '0px');
  }

  /*
   * Leaving the pet animation. Shrinking the window back to the card would shift the card for
   * a frame (the "blink"). So the card fades out first, the window shrinks while the card is
   * invisible, then the card fades back in at its real place.
   */
  function finishPet(run) {
    el.pet.hidden = true;
    run.anims.forEach((a) => a.cancel());
    run.timers.forEach(clearTimeout);
    const staged = run.staged;
    run.staged = false;
    if (!staged || !api.petUnstage) {
      if (!petRun) resetPetDom();
      requestResize();
      return;
    }
    el.scaler.classList.add('pet-hiding');
    setTimeout(() => {
      if (petRun) return; // a new pet animation took over the window
      api.petUnstage().catch(() => {}).then(() => {
        if (petRun) return;
        resetPetDom();
        requestResize();
      });
    }, PET_FADE_MS);
  }

  function abortPet() {
    if (!petRun) return;
    const run = petRun;
    petRun = null;
    finishPet(run);
  }

  function petSparkles(run) {
    const w = el.card.offsetWidth;
    const h = el.card.offsetHeight;
    const c = activeColors();
    const colors = [c.accent, c.accent2, '#ffd9a8', '#ffffff'];
    for (let i = 0; i < 14; i++) {
      const sp = document.createElement('div');
      sp.className = 'pet-sparkle';
      const ang = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      sp.style.left = (w / 2 + Math.cos(ang) * w * 0.42 - 7) + 'px';
      sp.style.top = (h / 2 + Math.sin(ang) * h * 0.42 - 7) + 'px';
      sp.style.setProperty('--spark', colors[i % colors.length]);
      el.scaler.appendChild(sp);
      const dx = Math.cos(ang) * (28 + Math.random() * 26);
      const dy = Math.sin(ang) * (22 + Math.random() * 20);
      const a = petAnimate(run, sp, [
        { translate: '0px 0px', scale: 0.2, opacity: 0, rotate: '0deg' },
        { translate: (dx * 0.6) + 'px ' + (dy * 0.6) + 'px', scale: 1.1, opacity: 1, offset: 0.35 },
        { translate: dx + 'px ' + dy + 'px', scale: 0.4, opacity: 0, rotate: '160deg' }
      ], { duration: 900 + Math.random() * 300, delay: Math.random() * 160, easing: 'ease-out', fill: 'forwards' });
      a.finished.then(() => sp.remove(), () => sp.remove());
    }
  }

  /* Music notes that float up from the pet while it dances. */
  function petNotes(run) {
    const glyphs = ['♪', '♫', '♬'];
    for (let i = 0; i < glyphs.length; i++) {
      const n = document.createElement('div');
      n.className = 'pet-note';
      n.textContent = glyphs[i];
      n.style.left = (el.pet.offsetLeft + el.pet.offsetWidth * 0.55 + i * 10) + 'px';
      n.style.top = (el.pet.offsetTop + el.pet.offsetHeight * 0.1) + 'px';
      el.scaler.appendChild(n);
      const a = petAnimate(run, n, [
        { transform: 'translate(0px, 0px)', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: 'translate(14px, -34px)', opacity: 0 }
      ], { duration: 1100, delay: i * 260, easing: 'ease-out', fill: 'forwards' });
      a.finished.then(() => n.remove(), () => n.remove());
    }
  }

  /*
   * Pet sequence for a track. If a card is already on screen, the pet walks in, takes it and
   * carries it off screen; the new song is put on the card while it is out of sight; the pet
   * brings it back, lifts it up to show it, sets it down, dances, waves and walks away.
   * Without a card on screen the pet simply walks in with the new one.
   */
  async function petEntrance(d, hadCard) {
    abortPet();
    const run = { anims: [], timers: [], staged: false };
    petRun = run;
    const alive = () => petRun === run;
    const p = settings.pet;
    const pet = PETS.findPet(p.type);
    const scale = settings.layout.scale;
    const speed = p.speed || 1;
    const reach = pet.armReach;
    const url = d.kind === 'track' && isSafeImageUrl(d.track.artUrl) ? d.track.artUrl : null;
    let stride = 1; // ground covered per gait cycle, in px
    const stepFor = (px, ms) => clamp(stride / (px / ms), 190, 520).toFixed(0) + 'ms';
    let st = null;
    let fromLeft = true;
    let facing = '';

    // Stretch the window to the screen edge; the card stays where it is.
    const stage = async () => {
      let s = null;
      if (api.petStage) {
        run.staged = true;
        s = await api.petStage(p.side).catch(() => null);
        if (!alive()) return;
        if (!s) run.staged = false;
      }
      if (!s) {
        const r = el.scaler.getBoundingClientRect();
        const side = p.side === 'left' || p.side === 'right' ? p.side : (r.left + r.width / 2 <= window.innerWidth / 2 ? 'left' : 'right');
        s = { side, offset: 0, distance: side === 'left' ? r.left : window.innerWidth - r.right };
      }
      st = s;
      setVar('--stage-offset', s.offset + 'px');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    };

    // Pet markup and facing for the side it comes from.
    const setup = () => {
      fromLeft = st.side === 'left';
      facing = fromLeft ? '' : ' facing-left';
      ensurePetSvg();
      el.pet.style.setProperty('--pet-size', p.size);
      el.pet.style.translate = '';
      el.pet.hidden = false;
      el.pet.className = 'pet';
      stride = el.pet.offsetWidth * scale * 0.46;
    };
    // Pet beside the card, on the side it comes from, holding the card's edge.
    const place = () => {
      const petW = el.pet.offsetWidth;
      const cardW = el.card.offsetWidth;
      el.pet.style.left = (fromLeft ? -petW * reach : cardW - petW * (1 - reach)) + 'px';
      el.pet.style.top = (el.card.offsetHeight - el.pet.offsetHeight) + 'px';
    };
    // #scaler offset that puts the card (and the pet) just beyond the screen edge.
    const offscreenX = () => {
      const petW = el.pet.offsetWidth;
      const cardLeft = margin + st.offset;
      return fromLeft
        ? -(cardLeft + el.card.offsetWidth * scale + 12)
        : window.innerWidth - cardLeft + petW * scale * (1 - reach) + 12;
    };
    // Walk the card (and the pet inside #scaler) from fromX to toX.
    const glide = (fromX, toX, easing, fill) => {
      const dist = Math.abs(toX - fromX);
      const dur = clamp(dist / (290 * speed), 0.9, 4.6) * 1000;
      el.pet.style.setProperty('--pet-step', stepFor(dist, dur));
      const anim = petAnimate(run, el.scaler, [{ translate: fromX + 'px 0px' }, { translate: toX + 'px 0px' }], { duration: dur, easing, fill });
      const bob = petAnimate(run, el.carry, [{ translate: '0px 0px' }, { translate: '0px -4px' }, { translate: '0px 0px' }], { duration: parseFloat(stepFor(dist, dur)) / 2, iterations: Infinity });
      return { anim, bob, done: anim.finished.catch(() => {}) };
    };

    if (hadCard) {
      // The old card is still up: the pet walks in, takes it and carries it off screen.
      await stage();
      if (!alive()) return;
      setup();
      place();
      el.pet.className = 'pet walking carrying backing' + facing;
      const exit = glide(0, offscreenX(), 'cubic-bezier(.4,0,.7,1)', 'forwards');
      await exit.done;
      if (!alive()) return;
      // Out of sight: put the new song on the card and wait for the cover.
      fillContent(d);
      if (url) await loadImage(url, 1500);
      if (!alive()) return;
      place();
      el.pet.className = 'pet walking carrying' + facing;
      // Start the return walk before the exit is cancelled, so the card never flashes back.
      const enter = glide(offscreenX(), 0, 'cubic-bezier(.3,.05,.45,1)', 'none');
      exit.anim.cancel();
      exit.bob.cancel();
      await enter.done;
      if (!alive()) return;
      enter.bob.cancel();
    } else {
      // Hide the card, put the new song on it and wait for the cover.
      el.content.getAnimations().forEach((a) => a.cancel());
      el.scaler.classList.add('pet-hiding');
      fillContent(d);
      if (url) await loadImage(url, 1500);
      if (!alive()) return;
      await stage();
      if (!alive()) return;
      setup();
      place();
      el.pet.className = 'pet walking carrying' + facing;
      el.scaler.classList.remove('pet-hiding');
      const enter = glide(offscreenX(), 0, 'cubic-bezier(.3,.05,.45,1)', 'none');
      await enter.done;
      if (!alive()) return;
      enter.bob.cancel();
    }

    // Show it off: lift the card with both arms up, sparkles around it.
    el.pet.className = 'pet showing' + facing;
    const lift = petAnimate(run, el.carry, [{ translate: '0px 0px', scale: 1 }, { translate: '0px -12px', scale: 1.04 }], { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1.2)', fill: 'forwards' });
    petSparkles(run);
    await petSleep(run, 950);
    if (!alive()) return;

    // Put it down where it belongs, with a small bounce.
    el.pet.className = 'pet happy' + facing;
    petAnimate(run, el.carry, [
      { translate: '0px -12px', scale: 1.04 },
      { translate: '0px 2px', scale: 0.99, offset: 0.7 },
      { translate: '0px 0px', scale: 1 }
    ], { duration: 380, easing: 'ease-in' });
    lift.cancel();
    await petSleep(run, 860);
    if (!alive()) return;

    // Dance to the song.
    el.pet.className = 'pet dancing' + facing;
    petNotes(run);
    await petSleep(run, 1500);
    if (!alive()) return;

    // Wave goodbye, turn around and walk back out.
    el.pet.className = 'pet waving' + facing;
    await petSleep(run, 900);
    if (!alive()) return;
    const pr = el.pet.getBoundingClientRect();
    const dx = fromLeft ? -(pr.right + 12) : window.innerWidth - pr.left + 12;
    const outDur = clamp(Math.abs(dx) / (320 * speed), 0.7, 4) * 1000;
    el.pet.style.setProperty('--pet-step', stepFor(Math.abs(dx), outDur));
    el.pet.className = 'pet walking' + (fromLeft ? ' facing-left' : '');
    const walkOut = petAnimate(run, el.pet, [{ translate: '0px 0px' }, { translate: (dx / scale) + 'px 0px' }], { duration: outDur, easing: 'cubic-bezier(.5,0,.8,.8)', fill: 'forwards' });
    await walkOut.finished.catch(() => {});
    if (!alive()) return;
    petRun = null;
    finishPet(run);
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
    if (theme.effect === 'beat3d') el.card.style.setProperty('--beat', on ? clamp(energy, 0, 1).toFixed(3) : '0');
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
  if (api.onPetPlay) {
    // "Play the animation" button in Settings → Pets.
    api.onPetPlay(() => {
      ++transitionToken;
      const hadCard = shownKey !== null && !petRun && !el.scaler.classList.contains('is-hidden');
      petEntrance(current || currentDisplay(), hadCard);
    });
  }
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
