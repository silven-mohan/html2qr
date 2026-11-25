/*!
 * <qr-burst> — a QR code whose black squares burst outward in all directions
 * and fade away. Plays once, then fires a 'burstend' event; replay() runs it again.
 *
 * Requires the qrcode-generator library loaded BEFORE this file:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
 *   <script src="qr-burst.js"></script>
 *
 * Usage:
 *   <qr-burst data="https://example.com" style="height:420px"></qr-burst>
 *
 * Attribute:  data       text or URL to encode
 * Events:     burst, burstend
 * Methods:    burst()    burst now (if the code is showing)
 *             replay()   reset and run the sequence again
 * CSS var:    --qr-burst-bg   background of the element (default #f3f1ee).
 *             Keep it light: the squares are black.
 */
(() => {
  if (customElements.get('qr-burst')) return;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = t => 1 - Math.pow(1 - t, 3);
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const K = 2.4;   // drag
  const T = 2.2;   // burst duration (seconds)

  function makeMatrix(text) {
    try {
      const q = qrcode(0, 'M');
      q.addData(text); q.make();
      const n = q.getModuleCount();
      return Array.from({ length: n }, (_, r) =>
        Array.from({ length: n }, (_, c) => q.isDark(r, c)));
    } catch (e) {
      // Placeholder pattern if the generator library is missing (will not scan)
      const n = 29;
      const m = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.random() < .5));
      const finder = (r0, c0) => {
        for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
          const edge = r === 0 || c === 0 || r === 6 || c === 6;
          const core = r > 1 && r < 5 && c > 1 && c < 5;
          m[r0 + r][c0 + c] = edge || core;
        }
      };
      finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
      return m;
    }
  }

  class QRBurst extends HTMLElement {
    static get observedAttributes() { return ['data']; }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' +
        ':host{display:block;position:relative;min-height:300px;cursor:pointer;background:var(--qr-burst-bg,#f3f1ee)}' +
        'canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
        '</style><canvas></canvas>';
      this.cv = root.querySelector('canvas');
      this.ctx = this.cv.getContext('2d');
      this.parts = [];
      this.phase = 'hold'; this.timer = 1; this.t = 0; this.r = 0;
      this.addEventListener('click', () => this.burst());
    }

    connectedCallback() {
      this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.ro = new ResizeObserver(() => this.layout());
      this.ro.observe(this);
      this.build();
      let last = performance.now();
      const loop = now => {
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        this.step(dt); this.draw();
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }

    disconnectedCallback() {
      cancelAnimationFrame(this.raf);
      if (this.ro) this.ro.disconnect();
    }

    attributeChangedCallback() {
      if (this.isConnected) { this.build(); this.replay(); }
    }

    // ---- public API ----
    burst() {
      if (this.phase === 'hold') {
        this.phase = 'burst'; this.t = 0;
        this.dispatchEvent(new Event('burst'));
      }
    }
    replay() { this.phase = 'hold'; this.timer = .9; this.t = 0; this.r = 0; }

    // ---- internals ----
    build() {
      this.matrix = makeMatrix(this.getAttribute('data') || 'https://example.com');
      this.n = this.matrix.length;
      this.parts = [];
      for (let r = 0; r < this.n; r++) for (let c = 0; c < this.n; c++) {
        if (this.matrix[r][c]) {
          this.parts.push({ r, c, rnd: Math.random(), rnd2: Math.random(), rnd3: Math.random() });
        }
      }
      this.layout();
    }

    layout() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.W = this.clientWidth; this.H = this.clientHeight;
      this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!this.n) return;
      const S = Math.min(this.W, this.H) * .5;
      this.S = S; this.m = S / this.n;
      this.ox = (this.W - S) / 2; this.oy = (this.H - S) / 2;
      const cx = this.W / 2, cy = this.H / 2, reach = Math.max(this.W, this.H);
      for (const p of this.parts) {
        p.hx = this.ox + (p.c + .5) * this.m;
        p.hy = this.oy + (p.r + .5) * this.m;
        const dx = p.hx - cx, dy = p.hy - cy, dist = Math.hypot(dx, dy);
        p.ang = (dist < 1 ? p.rnd * 6.283 : Math.atan2(dy, dx)) + (p.rnd2 - .5) * .7;
        p.sp = K * reach * (.18 + p.rnd * .6);
        p.rv = (p.rnd3 - .5) * 16;
        p.delay = dist / S * .18;
        p.stagger = p.rnd2 * .35;
      }
    }

    step(dt) {
      if (this.phase === 'hold') {
        this.timer -= dt;
        if (this.timer <= 0 && !this.reduce) this.burst();
      } else if (this.phase === 'burst') {
        this.t += dt;
        if (this.t >= T) { this.phase = 'gone'; this.dispatchEvent(new Event('burstend')); }
      }
    }

    burstState(p, t) {
      const tt = Math.max(0, t - p.delay);
      const d = p.sp * (1 - Math.exp(-K * tt)) / K;
      return {
        x: p.hx + Math.cos(p.ang) * d,
        y: p.hy + Math.sin(p.ang) * d,
        rot: p.rv * tt,
        a: 1 - smooth((tt - .6) / 1.3)
      };
    }

    draw() {
      const g = this.ctx, m = this.m, ph = this.phase;
      g.clearRect(0, 0, this.W, this.H);
      if (!this.n) return;

      let cardA = 1;
      if (ph === 'burst') cardA = 1 - clamp(this.t / .3);
      else if (ph === 'gone') cardA = 0;

      if (cardA > 0.001) {
        const pad = m * 2.5, x = this.ox - pad, y = this.oy - pad, s = this.S + pad * 2;
        g.globalAlpha = cardA;
        g.fillStyle = '#ffffff';
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, s, s, m * 1.6); else g.rect(x, y, s, s);
        g.fill();
      }

      g.fillStyle = '#000';
      for (const p of this.parts) {
        let x = p.hx, y = p.hy, rot = 0, a = 1;
        if (ph === 'burst') {
          const s = this.burstState(p, this.t);
          x = s.x; y = s.y; rot = s.rot; a = s.a;
        } else if (ph === 'gone') {
          continue;
        }
        if (a <= 0.003) continue;
        const size = m * (ph === 'hold' ? 1.02 : .98);
        g.globalAlpha = a;
        g.save();
        g.translate(x, y); g.rotate(rot);
        g.fillRect(-size / 2, -size / 2, size, size);
        g.restore();
      }
      g.globalAlpha = 1;
    }
  }

  customElements.define('qr-burst', QRBurst);
})();