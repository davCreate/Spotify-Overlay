'use strict';

/*
 * Synced lyrics from LRCLIB (https://lrclib.net, free, no account). Only the track title, artist,
 * album and length are sent, and only while lyrics are switched on in Settings.
 */

const API = 'https://lrclib.net/api/get';
const CACHE_MAX = 50;
const cache = new Map();

/** Parse LRC text ("[mm:ss.xx] line") into [{ t, text }] sorted by time (ms). */
function parseLrc(text) {
  const lines = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (!m) continue;
    const t = Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000);
    const line = m[3].trim();
    if (line) lines.push({ t, text: line.slice(0, 200) });
  }
  return lines.sort((a, b) => a.t - b.t);
}

/** Lyrics for one track: [{ t, text }], or [] when none are published. Results are cached. */
async function fetchLyrics({ id, title, artist, album, durationMs }) {
  if (!id || !title || !artist) return [];
  if (cache.has(id)) return cache.get(id);
  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist,
    album_name: album || '',
    duration: String(Math.round((durationMs || 0) / 1000))
  });
  let lines = [];
  try {
    const res = await fetch(`${API}?${params}`, {
      headers: { 'User-Agent': 'SpotifyOverlay (https://github.com/davCreate/Spotify-Overlay)' }
    });
    if (res.ok) {
      const body = await res.json();
      lines = parseLrc(body && body.syncedLyrics);
    }
  } catch (_) {
    return []; // offline or LRCLIB down: show no lyrics, do not cache the failure
  }
  cache.set(id, lines);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return lines;
}

module.exports = { parseLrc, fetchLyrics };
