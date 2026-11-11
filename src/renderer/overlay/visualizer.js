/*
 * Audio visualizer for the overlay.
 *
 * Sources:
 *   - "system":    real system audio via WASAPI loopback (Windows). Captures what you hear.
 *   - "simulated": a music-like animation that runs only while Spotify is playing.
 *                  Used on macOS/Linux, in OBS browser-source mode, and as a fallback.
 *
 * Note: Spotify's Web API audio-analysis endpoints are not available to new apps,
 * so real-time spectrum data has to come from the local audio output.
 */
(function () {
  'use strict';

  const F_MIN = 40;
  const F_MAX = 14000;

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  class Visualizer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = {
        style: 'bars', bars: 48, sensitivity: 1.2, smoothing: 0.7, colorMode: 'gradient',
        glow: true, fps: 60, accent: '#1ed760', accent2: '#1db954', text: '#ffffff', enabled: true
      };
      this.values = new Float32Array(this.opts.bars);
      this.phases = [];
      this.playing = false;
      this.energy = 0;
      this.onFrame = null;
      this.sourceWanted = 'simulated';
      this.sourceActive = 'simulated';
      this.audio = null;
      this.lastFrame = 0;
      this.running = false;
      this.width = 0;
      this.height = 0;
      this.loop = this.loop.bind(this);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
      this.reseed();
    }

    reseed() {
      const n = this.opts.bars;
      this.phases = Array.from({ length: n }, () => ({
        a: Math.random() * Math.PI * 2,
        b: Math.random() * Math.PI * 2,
        sa: 1.3 + Math.random() * 2.4,
        sb: 0.4 + Math.random() * 1.1
      }));
      const old = this.values;
      this.values = new Float32Array(n);
      for (let i = 0; i < Math.min(n, old.length); i++) this.values[i] = old[i];
    }

    setOptions(opts) {
      const barsChanged = opts.bars !== undefined && opts.bars !== this.opts.bars;
      Object.assign(this.opts, opts);
      if (barsChanged) this.reseed();
      if (!this.opts.enabled) this.clear();
    }

    setPlaying(playing) {
      this.playing = Boolean(playing);
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      this.width = w;
      this.height = h;
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw;
        this.canvas.height = ph;
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** Request a source. Falls back to simulated if system audio is unavailable. */
    async setSource(source) {
      if (source === this.sourceWanted && (this.pending || this.audio || this.failedSystem)) {
        return this.pending || this.sourceActive;
      }
      this.sourceWanted = source;
      if (source !== 'system') {
        this.failedSystem = false;
        this.stopAudio();
        this.sourceActive = 'simulated';
        return this.sourceActive;
      }
      this.pending = this.startAudio()
        .then(() => {
          // The user may have switched back to simulated while we were starting.
          if (this.sourceWanted !== 'system') this.stopAudio();
          else this.sourceActive = 'system';
        })
        .catch((err) => {
          console.warn('[visualizer] System audio unavailable, using simulated mode:', err && err.message);
          this.failedSystem = true;
          this.stopAudio();
          this.sourceActive = 'simulated';
        })
        .then(() => {
          this.pending = null;
          return this.sourceActive;
        });
      return this.pending;
    }

    async startAudio() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('getDisplayMedia not supported');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      stream.getVideoTracks().forEach((t) => t.stop());
      const tracks = stream.getAudioTracks();
      if (!tracks.length) throw new Error('No loopback audio track');
      const context = new AudioContext();
      const source = context.createMediaStreamSource(new MediaStream(tracks));
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.55;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -20;
      source.connect(analyser);
      if (context.state === 'suspended') await context.resume().catch(() => {});
      const bins = new Uint8Array(analyser.frequencyBinCount);
      tracks.forEach((t) => t.addEventListener('ended', () => {
        this.stopAudio();
        this.sourceActive = 'simulated';
      }));
      this.audio = { stream, tracks, context, source, analyser, bins };
    }

    stopAudio() {
      if (!this.audio) return;
      try {
        this.audio.tracks.forEach((t) => t.stop());
        this.audio.source.disconnect();
        this.audio.context.close();
      } catch (_) { /* ignore */ }
      this.audio = null;
    }

    start() {
      if (this.running) return;
      this.running = true;
      requestAnimationFrame(this.loop);
    }

    stop() {
      this.running = false;
    }

    loop(now) {
      if (!this.running) return;
      requestAnimationFrame(this.loop);
      const minDelta = 1000 / clamp(this.opts.fps, 15, 144) - 1;
      if (now - this.lastFrame < minDelta) return;
      this.lastFrame = now;
      this.update(now / 1000);
      if (this.opts.enabled) this.draw(now / 1000);
      if (this.onFrame) this.onFrame(this.energy);
    }

    computeTargets(t, out) {
      const n = out.length;
      const sens = this.opts.sensitivity;
      if (this.audio && this.sourceActive === 'system') {
        const { analyser, bins, context } = this.audio;
        analyser.getByteFrequencyData(bins);
        const binHz = context.sampleRate / analyser.fftSize;
        const ratio = F_MAX / F_MIN;
        for (let i = 0; i < n; i++) {
          const lo = F_MIN * Math.pow(ratio, i / n);
          const hi = F_MIN * Math.pow(ratio, (i + 1) / n);
          let a = Math.floor(lo / binHz);
          let b = Math.max(a, Math.ceil(hi / binHz) - 1);
          a = clamp(a, 0, bins.length - 1);
          b = clamp(b, 0, bins.length - 1);
          let sum = 0;
          for (let k = a; k <= b; k++) sum += bins[k];
          const v = sum / (b - a + 1) / 255;
          out[i] = clamp(Math.pow(v, 1.35) * sens * (1 + (i / n) * 0.5), 0, 1);
        }
        return;
      }
      // Simulated spectrum: bass-heavy envelope, a steady ~120 BPM pulse and per-band motion.
      if (!this.playing) {
        out.fill(0);
        return;
      }
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 6);
      for (let i = 0; i < n; i++) {
        const p = this.phases[i];
        const x = i / n;
        const env = 0.95 - x * 0.55;
        const motion = 0.5 + 0.3 * Math.sin(t * p.sa + p.a) + 0.2 * Math.sin(t * p.sb * 3.1 + p.b);
        out[i] = clamp((env * motion * 0.75 + beat * (1 - x) * 0.45) * sens * 0.85, 0, 1);
      }
    }

    update(t) {
      const n = this.values.length;
      if (!this.targets || this.targets.length !== n) this.targets = new Float32Array(n);
      this.computeTargets(t, this.targets);
      const s = clamp(this.opts.smoothing, 0, 0.95);
      const up = 1 - s * 0.5;
      const down = 1 - s;
      let bass = 0;
      const bassCount = Math.max(2, Math.floor(n / 8));
      for (let i = 0; i < n; i++) {
        const target = this.targets[i];
        const cur = this.values[i];
        this.values[i] = cur + (target - cur) * (target > cur ? up : down);
        if (i < bassCount) bass += this.values[i];
      }
      this.energy = bass / bassCount;
    }

    clear() {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }

    paint(t) {
      const { colorMode, accent, accent2, text } = this.opts;
      const ctx = this.ctx;
      if (colorMode === 'accent') return accent;
      if (colorMode === 'text') return text;
      const g = ctx.createLinearGradient(0, 0, this.width || 1, 0);
      if (colorMode === 'rainbow') {
        const shift = (t * 40) % 360;
        for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, `hsl(${(shift + k * 60) % 360}, 90%, 62%)`);
      } else {
        g.addColorStop(0, accent);
        g.addColorStop(1, accent2);
      }
      return g;
    }

    smoothPath(points) {
      const ctx = this.ctx;
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i][0] + points[i + 1][0]) / 2;
        const yc = (points[i][1] + points[i + 1][1]) / 2;
        ctx.quadraticCurveTo(points[i][0], points[i][1], xc, yc);
      }
      const last = points[points.length - 1];
      ctx.lineTo(last[0], last[1]);
    }

    draw(t) {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;
      if (w < 2 || h < 2) return;
      ctx.clearRect(0, 0, w, h);
      const v = this.values;
      const n = v.length;
      const paint = this.paint(t);
      ctx.save();
      ctx.fillStyle = paint;
      ctx.strokeStyle = paint;
      if (this.opts.glow) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.opts.colorMode === 'text' ? this.opts.text : this.opts.accent;
      }
      const slot = w / n;
      const barW = Math.max(1, slot * 0.72);
      const rainbow = this.opts.colorMode === 'rainbow';
      const colorAt = (i) => `hsl(${((t * 40) % 360 + (i / n) * 360) % 360}, 90%, 62%)`;

      switch (this.opts.style) {
        case 'mirror': {
          for (let i = 0; i < n; i++) {
            const bh = Math.max(2, v[i] * h);
            if (rainbow) ctx.fillStyle = colorAt(i);
            ctx.beginPath();
            ctx.roundRect(i * slot + (slot - barW) / 2, (h - bh) / 2, barW, bh, Math.min(barW / 2, 3));
            ctx.fill();
          }
          break;
        }
        case 'blocks': {
          const seg = 4;
          const gap = 2;
          const total = Math.max(1, Math.floor((h + gap) / (seg + gap)));
          for (let i = 0; i < n; i++) {
            const lit = Math.round(v[i] * total);
            if (rainbow) ctx.fillStyle = colorAt(i);
            for (let k = 0; k < lit; k++) {
              ctx.globalAlpha = 0.55 + 0.45 * (k / total);
              ctx.fillRect(i * slot + (slot - barW) / 2, h - (k + 1) * (seg + gap) + gap, barW, seg);
            }
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'dots': {
          const r = Math.max(1.5, Math.min(slot * 0.35, 4));
          for (let i = 0; i < n; i++) {
            if (rainbow) ctx.fillStyle = colorAt(i);
            const y = h - r - v[i] * (h - r * 2);
            ctx.beginPath();
            ctx.arc(i * slot + slot / 2, y, r, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'wave': {
          const pts = [[0, h]];
          for (let i = 0; i < n; i++) pts.push([i * slot + slot / 2, h - Math.max(1, v[i] * h * 0.95)]);
          pts.push([w, h]);
          ctx.beginPath();
          this.smoothPath(pts);
          ctx.closePath();
          ctx.globalAlpha = 0.35;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          this.smoothPath(pts.slice(1, -1));
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        }
        case 'line': {
          const mid = h / 2;
          const top = [[0, mid]];
          const bottom = [[0, mid]];
          for (let i = 0; i < n; i++) {
            const a = (v[i] * h) / 2;
            top.push([i * slot + slot / 2, mid - a]);
            bottom.push([i * slot + slot / 2, mid + a]);
          }
          top.push([w, mid]);
          bottom.push([w, mid]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          this.smoothPath(top);
          ctx.stroke();
          ctx.beginPath();
          this.smoothPath(bottom);
          ctx.stroke();
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          this.smoothPath(top);
          for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'circle': {
          const cx = w / 2;
          const cy = h / 2;
          const size = Math.min(w, h);
          const radius = size * 0.26;
          const len = size * 0.22;
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(1.5, ((Math.PI * 2 * radius) / n) * 0.5);
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
            const l = 2 + v[i] * len;
            if (rainbow) ctx.strokeStyle = colorAt(i);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius);
            ctx.lineTo(cx + Math.cos(ang) * (radius + l), cy + Math.sin(ang) * (radius + l));
            ctx.stroke();
          }
          break;
        }
        case 'peaks': {
          // Bars with a cap that hangs at the highest recent level and falls slowly.
          if (!this.peaks || this.peaks.length !== n) this.peaks = new Float32Array(n);
          for (let i = 0; i < n; i++) {
            const bh = Math.max(2, v[i] * h);
            this.peaks[i] = Math.max(v[i], this.peaks[i] - 0.012);
            if (rainbow) ctx.fillStyle = colorAt(i);
            const x = i * slot + (slot - barW) / 2;
            ctx.beginPath();
            ctx.roundRect(x, h - bh, barW, bh, [Math.min(barW / 2, 3), Math.min(barW / 2, 3), 0, 0]);
            ctx.fill();
            ctx.fillRect(x, h - Math.max(2, this.peaks[i] * h) - 3, barW, 2);
          }
          break;
        }
        case 'orbit': {
          // Dots circle the center; each dot's distance follows its band.
          const cx = w / 2;
          const cy = h / 2;
          const size = Math.min(w, h);
          const base = size * 0.2;
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2 + t * 0.4;
            const r = base + v[i] * size * 0.22;
            if (rainbow) ctx.fillStyle = colorAt(i);
            ctx.beginPath();
            ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 1.2 + v[i] * 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'pulse': {
          // Rings expand from the center on every beat of the overall energy.
          const cx = w / 2;
          const cy = h / 2;
          const size = Math.min(w, h);
          let avg = 0;
          for (let i = 0; i < n; i++) avg += v[i];
          avg /= Math.max(1, n);
          ctx.lineWidth = 2;
          for (let k = 0; k < 3; k++) {
            const phase = (t * 0.6 + k / 3) % 1;
            ctx.globalAlpha = (1 - phase) * (0.25 + avg * 0.75);
            ctx.beginPath();
            ctx.arc(cx, cy, size * (0.1 + phase * 0.42), 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'bars':
        default: {
          for (let i = 0; i < n; i++) {
            const bh = Math.max(2, v[i] * h);
            if (rainbow) ctx.fillStyle = colorAt(i);
            ctx.beginPath();
            ctx.roundRect(i * slot + (slot - barW) / 2, h - bh, barW, bh, [Math.min(barW / 2, 3), Math.min(barW / 2, 3), 0, 0]);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }
  }

  window.Visualizer = Visualizer;
})();
