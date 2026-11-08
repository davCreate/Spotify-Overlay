'use strict';

/*
 * Optional local HTTP server that serves the overlay as a web page, so it can be added
 * to OBS / Streamlabs as a "Browser Source": http://127.0.0.1:<port>/
 * Live data is pushed with Server-Sent Events on /events. Binds to 127.0.0.1 only.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MOUNTS = {
  '/overlay/': path.join(ROOT, 'renderer', 'overlay'),
  '/shared/': path.join(ROOT, 'shared')
};
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

class ObsServer {
  constructor({ getSnapshot }) {
    this.getSnapshot = getSnapshot;
    this.server = null;
    this.port = null;
    this.clients = new Set();
  }

  isRunning() {
    return Boolean(this.server);
  }

  start(port) {
    if (this.server && this.port === port) return Promise.resolve();
    return this.stop().then(() => new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      server.on('error', (err) => {
        this.server = null;
        reject(err.code === 'EADDRINUSE' ? new Error(`Port ${port} is already in use`) : err);
      });
      server.listen(port, '127.0.0.1', () => {
        this.server = server;
        this.port = port;
        resolve();
      });
    }));
  }

  stop() {
    for (const res of this.clients) res.end();
    this.clients.clear();
    if (!this.server) return Promise.resolve();
    const s = this.server;
    this.server = null;
    return new Promise((resolve) => s.close(() => resolve()));
  }

  broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) res.write(payload);
  }

  handle(req, res) {
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/' || url.pathname === '/obs') {
      res.writeHead(302, { Location: '/overlay/index.html' }).end();
      return;
    }
    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write('retry: 2000\n\n');
      this.clients.add(res);
      const snap = this.getSnapshot();
      res.write(`event: settings\ndata: ${JSON.stringify(snap.settings)}\n\n`);
      res.write(`event: playback\ndata: ${JSON.stringify(snap.playback)}\n\n`);
      res.write(`event: auth\ndata: ${JSON.stringify(snap.auth)}\n\n`);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(ping);
        this.clients.delete(res);
      });
      return;
    }
    for (const [prefix, dir] of Object.entries(MOUNTS)) {
      if (!url.pathname.startsWith(prefix)) continue;
      let rel;
      try {
        rel = decodeURIComponent(url.pathname.slice(prefix.length));
      } catch (_) {
        break; // malformed URL encoding
      }
      const file = path.normalize(path.join(dir, rel));
      if (!file.startsWith(dir + path.sep)) break; // path traversal attempt
      const type = TYPES[path.extname(file).toLowerCase()];
      if (!type) break;
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404).end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        res.end(data);
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

module.exports = { ObsServer };
