'use strict';

/*
 * Spotify OAuth 2.0 Authorization Code flow with PKCE.
 * No client secret is needed: each user supplies their own Client ID from the
 * Spotify Developer Dashboard. A temporary loopback HTTP server receives the redirect.
 *
 * Docs: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
 */

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPES = ['user-read-currently-playing', 'user-read-playback-state'];
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createPkcePair() {
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function redirectUri(port) {
  // Spotify requires loopback redirect URIs to use an explicit IP (127.0.0.1), not "localhost".
  return `http://127.0.0.1:${port}/callback`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function resultPage(title, message, ok) {
  const color = ok ? '#1ed760' : '#ff5c5c';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#121212;color:#fff;font-family:'Segoe UI',system-ui,sans-serif}
.card{text-align:center;padding:40px 48px;border-radius:16px;background:#1e1e1e;box-shadow:0 10px 40px #0008}
h1{color:${color};margin:0 0 12px;font-size:24px}p{color:#bbb;margin:0}</style></head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></body></html>`;
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  let body = {};
  try {
    body = await res.json();
  } catch (_) { /* non-JSON error */ }
  if (!res.ok) {
    const err = new Error(body.error_description || body.error || `Token request failed (${res.status})`);
    err.status = res.status;
    err.code = body.error;
    throw err;
  }
  return body;
}

function toTokens(body, previousRefresh) {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || previousRefresh,
    expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    scope: body.scope || ''
  };
}

/**
 * Runs the interactive login. Resolves with tokens.
 * @param {{clientId:string, port:number, openUrl:(url:string)=>void}} opts
 */
function login({ clientId, port, openUrl }) {
  return new Promise((resolve, reject) => {
    if (!clientId || !/^[0-9a-zA-Z]{16,64}$/.test(clientId)) {
      reject(new Error('Enter a valid Spotify Client ID in Settings → Account first.'));
      return;
    }
    const { verifier, challenge } = createPkcePair();
    const state = base64url(crypto.randomBytes(16));
    const uri = redirectUri(port);
    let finished = false;

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, uri);
      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const send = (status, title, msg, ok) => {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(resultPage(title, msg, ok));
      };
      if (finished) {
        send(400, 'Already handled', 'You can close this tab.', false);
        return;
      }
      if (url.searchParams.get('state') !== state) {
        send(400, 'Login failed', 'State mismatch. Please try again from the app.', false);
        return;
      }
      const error = url.searchParams.get('error');
      if (error) {
        send(400, 'Login cancelled', `Spotify returned: ${error}. You can close this tab.`, false);
        done(new Error(error === 'access_denied' ? 'Login was cancelled.' : `Spotify error: ${error}`));
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        send(400, 'Login failed', 'No authorization code received.', false);
        return;
      }
      try {
        const body = await tokenRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: uri,
          client_id: clientId,
          code_verifier: verifier
        });
        send(200, 'Connected!', 'Spotify Overlay is now connected. You can close this tab.', true);
        done(null, toTokens(body));
      } catch (err) {
        send(500, 'Login failed', err.message, false);
        done(err);
      }
    });

    const timer = setTimeout(() => done(new Error('Login timed out. Please try again.')), LOGIN_TIMEOUT_MS);

    function done(err, tokens) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      // Give the response time to flush before closing.
      setTimeout(() => server.close(), 500);
      if (err) reject(err);
      else resolve(tokens);
    }

    server.on('error', (err) => {
      const msg = err.code === 'EADDRINUSE'
        ? `Port ${port} is already in use. Pick another redirect port in Settings → Account (and update it in your Spotify app).`
        : err.message;
      done(new Error(msg));
    });

    server.listen(port, '127.0.0.1', () => {
      const authUrl = new URL(AUTH_URL);
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: uri,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        scope: SCOPES.join(' '),
        state
      }).toString();
      openUrl(authUrl.toString());
    });
  });
}

async function refresh({ clientId, refreshToken }) {
  const body = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });
  return toTokens(body, refreshToken);
}

module.exports = { login, refresh, redirectUri, createPkcePair, SCOPES };
