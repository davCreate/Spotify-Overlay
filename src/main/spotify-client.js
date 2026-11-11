'use strict';

/*
 * Polls the Spotify Web API for the current playback state and emits normalized updates.
 *
 * Events:
 *   'playback' (state)     normalized playback state (see normalizePlayback)
 *   'auth' (status)        { connected, user, error }
 */

const { EventEmitter } = require('events');
const auth = require('./spotify-auth');

const API = 'https://api.spotify.com/v1';

/** Pick the image closest to (but not smaller than) `target` pixels, else the largest. */
function pickImage(images, target = 300) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const sorted = images.filter((i) => i && i.url).slice().sort((a, b) => (a.width || 0) - (b.width || 0));
  if (sorted.length === 0) return null;
  return (sorted.find((i) => (i.width || 0) >= target) || sorted[sorted.length - 1]).url;
}

/** Human-readable duration for a wait given in seconds, e.g. "45s", "3m 20s", "16h 9m". */
function formatWait(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/**
 * Convert a WindowsMediaSource line into the same shape as normalizePlayback.
 * `artUrl` is passed in because the source only sends art when the track changes.
 */
function normalizeLocal(raw, artUrl) {
  const key = [raw.title, raw.artist, raw.album].join('|');
  return {
    active: true,
    isPlaying: Boolean(raw.playing),
    track: {
      id: 'local:' + key,
      type: 'track',
      title: raw.title || 'Unknown',
      artists: raw.artist || '',
      album: raw.album || '',
      artUrl: artUrl || null,
      durationMs: Number(raw.durationMs) || 0,
      url: null
    },
    progressMs: Number(raw.positionMs) || 0,
    receivedAt: Date.now(),
    device: null,
    source: 'local'
  };
}

/** Convert a /me/player response into the shape the overlay understands. */
function normalizePlayback(body) {
  if (!body || !body.item) {
    return { active: false, isPlaying: false, track: null, progressMs: 0, receivedAt: Date.now(), device: body && body.device ? body.device.name : null };
  }
  const item = body.item;
  const isEpisode = item.type === 'episode';
  const track = {
    id: item.id || item.uri || item.name,
    type: isEpisode ? 'episode' : 'track',
    title: item.name || 'Unknown',
    artists: isEpisode
      ? (item.show && item.show.name) || ''
      : (item.artists || []).map((a) => a.name).filter(Boolean).join(', '),
    album: isEpisode ? (item.show && item.show.publisher) || '' : (item.album && item.album.name) || '',
    artUrl: isEpisode
      ? pickImage(item.images) || pickImage(item.show && item.show.images)
      : pickImage(item.album && item.album.images),
    durationMs: Number(item.duration_ms) || 0,
    url: (item.external_urls && item.external_urls.spotify) || null
  };
  return {
    active: true,
    isPlaying: Boolean(body.is_playing),
    track,
    progressMs: Number(body.progress_ms) || 0,
    receivedAt: Date.now(),
    device: body.device ? body.device.name : null
  };
}

class SpotifyClient extends EventEmitter {
  /**
   * @param {{tokenStore:any, getClientId:()=>string, getPollInterval:()=>number, localSource?:any}} opts
   *   localSource: optional WindowsMediaSource. While it sees the Spotify desktop app, its data is
   *   used and the Web API is not polled at all (no rate limits, works without logging in).
   */
  constructor({ tokenStore, getClientId, getPollInterval, localSource }) {
    super();
    this.tokenStore = tokenStore;
    this.getClientId = getClientId;
    this.getPollInterval = getPollInterval;
    this.tokens = tokenStore.load();
    this.timer = null;
    this.running = false;
    this.refreshing = null;
    this.user = null;
    this.lastError = null;
    this.lastState = normalizePlayback(null);
    this.backoffUntil = 0;
    this.localSource = localSource || null;
    this.localArt = { key: null, url: null };
    if (this.localSource) this.localSource.on('state', (raw) => this.onLocalState(raw));
  }

  /** True while the local source currently sees Spotify playing something. */
  usingLocal() {
    const raw = this.localSource && this.localSource.current();
    return Boolean(raw && raw.found && raw.title);
  }

  onLocalState(raw) {
    const prev = this.lastState;
    if (!raw.found || !raw.title) {
      // Spotify desktop went away (closed, or playing on another device): let the Web API take over.
      if (prev.source === 'local') {
        this.lastState = normalizePlayback(null);
        this.emit('playback', this.lastState);
        this.pollNow();
      }
      return;
    }
    const key = [raw.title, raw.artist, raw.album].join('|');
    if (Object.prototype.hasOwnProperty.call(raw, 'art') || key !== this.localArt.key) {
      this.localArt = { key, url: raw.art || null };
    }
    const next = normalizeLocal(raw, this.localArt.url);
    // Only push an update when something visible changed; the overlay interpolates progress itself.
    const expected = prev.isPlaying ? prev.progressMs + (next.receivedAt - prev.receivedAt) : prev.progressMs;
    const changed = prev.source !== 'local' ||
      !prev.track || prev.track.id !== next.track.id ||
      prev.track.artUrl !== next.track.artUrl ||
      prev.isPlaying !== next.isPlaying ||
      prev.track.durationMs !== next.track.durationMs ||
      Math.abs(expected - next.progressMs) > 2000;
    if (this.lastError) {
      // The Web API is not needed while the desktop app is visible, so its error no longer applies.
      this.lastError = null;
      this.emitStatus();
    }
    if (!changed) return;
    this.lastState = next;
    this.emit('playback', next);
  }

  isConnected() {
    return Boolean(this.tokens && this.tokens.refreshToken);
  }

  status() {
    return { connected: this.isConnected(), user: this.user, error: this.lastError };
  }

  emitStatus() {
    this.emit('auth', this.status());
  }

  async login(openUrl, port, translate) {
    this.lastError = null;
    const tokens = await auth.login({ clientId: this.getClientId(), port, openUrl, translate });
    this.setTokens(tokens);
    await this.fetchUser();
    this.emitStatus();
    this.start();
    this.pollNow();
  }

  logout() {
    this.stop();
    this.tokens = null;
    this.user = null;
    this.lastError = null;
    this.tokenStore.clear();
    this.lastState = normalizePlayback(null);
    this.emit('playback', this.lastState);
    this.emitStatus();
  }

  setTokens(tokens) {
    this.tokens = tokens;
    try {
      this.tokenStore.save(tokens);
    } catch (err) {
      console.error('[spotify] Could not persist tokens:', err.message);
    }
  }

  async getAccessToken() {
    if (!this.isConnected()) throw Object.assign(new Error('Not connected'), { notConnected: true });
    if (this.tokens.accessToken && Date.now() < this.tokens.expiresAt - 60 * 1000) return this.tokens.accessToken;
    if (!this.refreshing) {
      this.refreshing = auth
        .refresh({ clientId: this.getClientId(), refreshToken: this.tokens.refreshToken })
        .then((t) => this.setTokens(t))
        .finally(() => { this.refreshing = null; });
    }
    try {
      await this.refreshing;
    } catch (err) {
      // invalid_grant = refresh token revoked/expired (or Client ID changed): user must log in again.
      if (err.code === 'invalid_grant' || err.code === 'invalid_client') {
        this.tokens = null;
        this.tokenStore.clear();
        this.lastError = 'Your Spotify session expired. Please connect again.';
        this.emitStatus();
      }
      throw err;
    }
    return this.tokens.accessToken;
  }

  async api(pathname, retried = false) {
    const token = await this.getAccessToken();
    const res = await fetch(API + pathname, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 && !retried) {
      this.tokens.expiresAt = 0; // force refresh
      return this.api(pathname, true);
    }
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 5;
      this.backoffUntil = Date.now() + wait * 1000;
      throw Object.assign(new Error(`Rate limited by Spotify, retrying in ${formatWait(wait)}`), { rateLimited: true });
    }
    if (res.status === 204) return null;
    if (!res.ok) {
      let msg = `Spotify API error ${res.status}`;
      try {
        const b = await res.json();
        if (b && b.error && b.error.message) msg += `: ${b.error.message}`;
      } catch (_) { /* ignore */ }
      throw Object.assign(new Error(msg), { status: res.status });
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async fetchUser() {
    try {
      const me = await this.api('/me');
      this.user = me ? { name: me.display_name || me.id, image: pickImage(me.images, 64), product: me.product || null } : null;
    } catch (err) {
      this.user = null;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.isConnected() && !this.user) this.fetchUser().then(() => this.emitStatus());
    this.schedule(0);
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(ms) {
    clearTimeout(this.timer);
    if (!this.running) return;
    this.timer = setTimeout(() => this.tick(), ms);
  }

  pollNow() {
    if (this.running) this.schedule(0);
  }

  async tick() {
    if (!this.running) return;
    const interval = this.getPollInterval();
    if (this.usingLocal()) {
      // The desktop app is the source; check back later in case it goes away.
      this.schedule(Math.max(interval, 2000));
      return;
    }
    if (!this.isConnected()) {
      this.schedule(Math.max(interval, 2000));
      return;
    }
    const wait = this.backoffUntil - Date.now();
    if (wait > 0) {
      this.schedule(wait);
      return;
    }
    try {
      const body = await this.api('/me/player?additional_types=track,episode');
      this.lastState = normalizePlayback(body);
      if (this.lastError) {
        this.lastError = null;
        this.emitStatus();
      }
      this.emit('playback', this.lastState);
      this.schedule(this.nextDelay(interval));
    } catch (err) {
      if (!err.notConnected) {
        const msg = err.message || String(err);
        if (msg !== this.lastError) {
          this.lastError = msg;
          console.warn('[spotify]', msg);
          this.emitStatus();
        }
      }
      // Rate limited: wait exactly as long as Spotify asked. Network problems: back off a bit so we don't spam.
      if (err.rateLimited) this.schedule(Math.max(this.backoffUntil - Date.now(), 1000));
      else this.schedule(Math.max(interval * 3, 3000));
    }
  }

  /**
   * Delay before the next poll. While playing, use the configured interval but poll right after
   * the track should end so the next song shows up quickly. While paused or idle nothing changes
   * on its own, so poll much less often to stay well under Spotify's rate limits.
   */
  nextDelay(interval) {
    const s = this.lastState;
    if (!s.active || !s.isPlaying) return Math.max(interval * 3, 5000);
    const remaining = s.track && s.track.durationMs ? s.track.durationMs - s.progressMs : Infinity;
    return Math.max(1000, Math.min(interval, remaining + 500));
  }
}

module.exports = { SpotifyClient, normalizePlayback, normalizeLocal, pickImage };
