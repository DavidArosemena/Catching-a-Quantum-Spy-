/*
 * bloch.js — a small dependency-free 3D Bloch sphere renderer (Canvas 2D).
 *
 * Uses an orthographic camera with yaw (around the z axis) and pitch.
 * Back-facing geometry is drawn first and dimmed, then a translucent sphere,
 * then front geometry, which gives a clear depth cue without WebGL.
 *
 * Bloch axes: x toward the viewer (|+>), y to the right (|+i>), z up (|0>).
 */
(function (root) {
  "use strict";

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const TAU = Math.PI * 2;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function slerp(a, b, t) {
    const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    if (dot > 0.9995) {
      const v = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      const n = Math.hypot(v.x, v.y, v.z) || 1;
      return { x: v.x / n, y: v.y / n, z: v.z / n };
    }
    let om = Math.acos(dot);
    if (dot < -0.9995) {
      // antipodal: go through a perpendicular point so the path is well defined
      const perp = Math.abs(a.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
      const mid = t < 0.5 ? slerp(a, perp, t * 2) : slerp(perp, b, (t - 0.5) * 2);
      return mid;
    }
    const s = Math.sin(om);
    const wa = Math.sin((1 - t) * om) / s, wb = Math.sin(t * om) / s;
    return { x: wa * a.x + wb * b.x, y: wa * a.y + wb * b.y, z: wa * a.z + wb * b.z };
  }

  class BlochSphere {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.opts = Object.assign(
        { orbit: true, draggableTip: false, onTipDrag: null, autoRotate: 0, labels: true,
          showAngles: false, showProjection: false, yaw: -0.95, pitch: 0.3, scale: 0.34,
          color: null, compact: false },
        opts
      );
      this.vec = { x: 0, y: 0, z: 1 };
      this.ghost = null;     // { v, color, label }
      this.axis = null;      // rotation axis to show during a gate
      this.trail = [];
      this.yaw = this.opts.yaw;
      this.pitch = this.opts.pitch;
      this.vyaw = 0; this.vpitch = 0;
      this.tween = null;
      this.visible = true;
      this.dirty = true;
      this._raf = null;
      this._readColors();
      this._bind();
      this._resize();
      new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
      new IntersectionObserver((es) => { this.visible = es[es.length - 1].isIntersecting; if (this.visible) this.request(); }, { rootMargin: "120px" })
        .observe(canvas);
    }

    _readColors() {
      this.c = {
        text: css("--text") || "#e6eaf5", muted: css("--muted") || "#9aa4c3", faint: css("--faint") || "#6b7596",
        line: css("--sphere-line") || "rgba(160,170,210,.5)", accent: this.opts.color || css("--accent") || "#a78bfa",
        fill: css("--sphere-fill") || "rgba(120,110,255,.08)", pred: css("--pred") || "#fbbf24",
      };
    }

    /* ---------- public API ---------- */
    setVector(v, animate = false, ms = 450) {
      if (!animate) { this.tween = null; this.vec = v; this.request(); return; }
      this.tween = { from: this.vec, to: v, t0: performance.now(), ms };
      this.request();
    }
    setGhost(g) { this.ghost = g; this.request(); }
    setAxis(a) { this.axis = a; this.request(); }
    setColor(c) { this.c.accent = c; this.request(); }
    addTrail(v) { this.trail.push(v); if (this.trail.length > 400) this.trail.shift(); this.request(); }
    clearTrail() { this.trail = []; this.request(); }
    resetView() { this.tweenView = { y0: this.yaw, p0: this.pitch, t0: performance.now() }; this.request(); }

    /* ---------- projection ---------- */
    project(p) {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const x1 = p.x * cy - p.y * sy, y1 = p.x * sy + p.y * cy;
      const u = y1, v = p.z * cp - x1 * sp, d = x1 * cp + p.z * sp;
      return { sx: this.cx + u * this.R, sy: this.cy - v * this.R, d };
    }
    unproject(px, py) {
      let u = (px - this.cx) / this.R, v = -(py - this.cy) / this.R;
      const r2 = u * u + v * v;
      if (r2 > 1) { const r = Math.sqrt(r2); u /= r; v /= r; }
      const d = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const x1 = d * cp - v * sp, z = v * cp + d * sp, y1 = u;
      return { x: x1 * cy + y1 * sy, y: -x1 * sy + y1 * cy, z };
    }

    /* ---------- events ---------- */
    _bind() {
      const cv = this.canvas;
      cv.style.touchAction = "none";
      let mode = null, lx = 0, ly = 0, lt = 0;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const nearTip = (p) => {
        const t = this.project(this.vec);
        return Math.hypot(p.x - t.sx, p.y - t.sy) < (this.opts.compact ? 14 : 20) && t.d > -0.15;
      };
      cv.addEventListener("pointerdown", (e) => {
        const p = pos(e);
        if (this.opts.draggableTip && nearTip(p)) mode = "tip";
        else if (this.opts.orbit) mode = "orbit";
        else return;
        cv.setPointerCapture(e.pointerId);
        lx = p.x; ly = p.y; lt = performance.now(); this.vyaw = this.vpitch = 0;
        cv.classList.add("dragging");
      });
      cv.addEventListener("pointermove", (e) => {
        const p = pos(e);
        if (!mode) {
          cv.style.cursor = this.opts.draggableTip && nearTip(p) ? "pointer" : this.opts.orbit ? "grab" : "default";
          return;
        }
        if (mode === "orbit") {
          const now = performance.now(), dt = Math.max(1, now - lt);
          const dyaw = (p.x - lx) * 0.009, dp = (p.y - ly) * 0.009;
          this.yaw += dyaw; this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + dp));
          this.vyaw = (dyaw / dt) * 16; this.vpitch = (dp / dt) * 16;
          lt = now;
        } else if (mode === "tip") {
          const v = this.unproject(p.x, p.y);
          if (this.opts.onTipDrag) this.opts.onTipDrag(v); else this.setVector(v);
        }
        lx = p.x; ly = p.y;
        this.request();
      });
      const end = () => { mode = null; cv.classList.remove("dragging"); this.request(); };
      cv.addEventListener("pointerup", end);
      cv.addEventListener("pointercancel", end);
      cv.addEventListener("dblclick", () => this.resetView());
    }

    _resize() {
      const par = this.canvas.parentElement;
      const w = Math.max(80, par.clientWidth), h = Math.max(80, par.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px";
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w; this.h = h; this.cx = w / 2; this.cy = h / 2 + (this.opts.compact ? 2 : 6);
      this.R = Math.min(w, h) * this.opts.scale;
      this.request();
    }

    request() {
      if (this._raf) return;
      this._raf = requestAnimationFrame((t) => { this._raf = null; this._frame(t); });
    }

    _frame(now) {
      let again = false;
      if (this.tween) {
        const k = Math.min(1, (now - this.tween.t0) / this.tween.ms);
        this.vec = slerp(this.tween.from, this.tween.to, ease(k));
        if (k >= 1) this.tween = null; else again = true;
      }
      if (this.tweenView) {
        const k = Math.min(1, (now - this.tweenView.t0) / 600), e = ease(k);
        this.yaw = this.tweenView.y0 + (this.opts.yaw - this.tweenView.y0) * e;
        this.pitch = this.tweenView.p0 + (this.opts.pitch - this.tweenView.p0) * e;
        if (k >= 1) this.tweenView = null; else again = true;
      }
      if (Math.abs(this.vyaw) > 1e-4 || Math.abs(this.vpitch) > 1e-4) {
        this.yaw += this.vyaw; this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + this.vpitch));
        this.vyaw *= 0.92; this.vpitch *= 0.92; again = true;
      }
      if (this.opts.autoRotate && this.visible) { this.yaw += this.opts.autoRotate; again = true; }
      if (this.visible) this.draw();
      if (again && this.visible) this.request();
    }

    /* ---------- drawing ---------- */
    _circle(fn, n = 120) {
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push(this.project(fn((i / n) * TAU)));
      return pts;
    }
    _strokeByDepth(pts, front, style) {
      const g = this.ctx;
      g.beginPath();
      let pen = false;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const isFront = (a.d + b.d) / 2 >= 0;
        if (isFront === front) {
          if (!pen) { g.moveTo(a.sx, a.sy); pen = true; }
          g.lineTo(b.sx, b.sy);
        } else pen = false;
      }
      g.strokeStyle = style.color; g.lineWidth = style.width; g.setLineDash(style.dash || []);
      g.globalAlpha = style.alpha ?? 1; g.stroke(); g.globalAlpha = 1; g.setLineDash([]);
    }
    _line(a, b, color, width, alpha = 1, dash = null) {
      const g = this.ctx, A = this.project(a), B = this.project(b);
      g.beginPath(); g.moveTo(A.sx, A.sy); g.lineTo(B.sx, B.sy);
      g.strokeStyle = color; g.lineWidth = width; g.globalAlpha = alpha; g.setLineDash(dash || []);
      g.stroke(); g.globalAlpha = 1; g.setLineDash([]);
    }
    _label(p, text, color, size, alpha = 1, weight = 500) {
      const g = this.ctx, P = this.project(p);
      g.font = `${weight} ${size}px "IBM Plex Mono", ui-monospace, monospace`;
      g.fillStyle = color; g.globalAlpha = alpha * (P.d < 0 ? 0.55 : 1);
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, P.sx, P.sy); g.globalAlpha = 1;
    }
    _arrow(v, color, width, alpha = 1, dashed = false) {
      const g = this.ctx, O = this.project({ x: 0, y: 0, z: 0 }), T = this.project(v);
      const back = T.d < -0.05;
      const a = alpha * (back ? 0.6 : 1);
      const dx = T.sx - O.sx, dy = T.sy - O.sy, L = Math.hypot(dx, dy);
      const head = this.opts.compact ? 8 : 12;
      g.globalAlpha = a;
      if (L < 4) {
        g.beginPath(); g.arc(T.sx, T.sy, 6, 0, TAU); g.fillStyle = color; g.fill(); g.globalAlpha = 1; return;
      }
      const ux = dx / L, uy = dy / L, hl = Math.min(head, L * 0.45);
      g.beginPath(); g.moveTo(O.sx, O.sy); g.lineTo(T.sx - ux * hl * 0.8, T.sy - uy * hl * 0.8);
      g.strokeStyle = color; g.lineWidth = width; g.lineCap = "round"; g.setLineDash(dashed ? [5, 5] : []); g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.moveTo(T.sx, T.sy);
      g.lineTo(T.sx - ux * hl - uy * hl * 0.5, T.sy - uy * hl + ux * hl * 0.5);
      g.lineTo(T.sx - ux * hl + uy * hl * 0.5, T.sy - uy * hl - ux * hl * 0.5);
      g.closePath(); g.fillStyle = color; g.fill();
      g.globalAlpha = 1;
    }

    draw() {
      const g = this.ctx, c = this.c, R = this.R;
      g.clearRect(0, 0, this.w, this.h);
      const eq = this._circle((t) => ({ x: Math.cos(t), y: Math.sin(t), z: 0 }));
      const mxz = this._circle((t) => ({ x: Math.sin(t), y: 0, z: Math.cos(t) }));
      const myz = this._circle((t) => ({ x: 0, y: Math.sin(t), z: Math.cos(t) }));
      const back = { color: c.line, width: 1, dash: [3, 4], alpha: 0.45 };
      const front = { color: c.line, width: 1.2, alpha: 0.95 };
      const axes = [
        [{ x: 0, y: 0, z: 1.18 }, { x: 0, y: 0, z: -1.18 }],
        [{ x: 1.18, y: 0, z: 0 }, { x: -1.18, y: 0, z: 0 }],
        [{ x: 0, y: 1.18, z: 0 }, { x: 0, y: -1.18, z: 0 }],
      ];
      const O = { x: 0, y: 0, z: 0 };

      // back layer
      [eq, mxz, myz].forEach((pts) => this._strokeByDepth(pts, false, back));
      axes.forEach(([a, b]) => [a, b].forEach((e) => { if (this.project(e).d < 0) this._line(O, e, c.faint, 1, 0.55, [2, 4]); }));
      this._drawTrail(false);
      if (this.ghost && this.project(this.ghost.v).d < 0) this._arrow(this.ghost.v, this.ghost.color, 2, 0.75, true);
      if (this.project(this.vec).d < -0.05) this._arrow(this.vec, c.accent, 3.2);

      // sphere body
      const grd = g.createRadialGradient(this.cx - R * 0.35, this.cy - R * 0.4, R * 0.1, this.cx, this.cy, R);
      grd.addColorStop(0, "rgba(255,255,255,0.10)");
      grd.addColorStop(0.55, c.fill);
      grd.addColorStop(1, "rgba(10,14,35,0.35)");
      g.beginPath(); g.arc(this.cx, this.cy, R, 0, TAU); g.fillStyle = grd; g.fill();
      g.strokeStyle = c.line; g.lineWidth = 1.4; g.stroke();

      // front layer
      [eq, mxz, myz].forEach((pts) => this._strokeByDepth(pts, true, front));
      axes.forEach(([a, b]) => [a, b].forEach((e) => { if (this.project(e).d >= 0) this._line(O, e, c.muted, 1.1, 0.8); }));

      if (this.axis) {
        const k = this.axis, s = 1.3;
        this._line({ x: -k.x * s, y: -k.y * s, z: -k.z * s }, { x: k.x * s, y: k.y * s, z: k.z * s }, c.pred, 1.6, 0.9, [6, 4]);
      }
      if (this.opts.showProjection) this._drawProjection();
      if (this.opts.showAngles) this._drawAngles();
      this._drawTrail(true);
      if (this.ghost && this.project(this.ghost.v).d >= 0) this._arrow(this.ghost.v, this.ghost.color, 2, 0.85, true);
      if (this.project(this.vec).d >= -0.05) this._arrow(this.vec, c.accent, 3.2);

      // tip glow
      const T = this.project(this.vec);
      const glow = g.createRadialGradient(T.sx, T.sy, 0, T.sx, T.sy, this.opts.compact ? 10 : 16);
      glow.addColorStop(0, c.accent); glow.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = T.d < 0 ? 0.35 : 0.7; g.fillStyle = glow;
      g.beginPath(); g.arc(T.sx, T.sy, this.opts.compact ? 10 : 16, 0, TAU); g.fill(); g.globalAlpha = 1;
      if (this.opts.draggableTip) {
        g.beginPath(); g.arc(T.sx, T.sy, 6, 0, TAU); g.fillStyle = "#fff"; g.globalAlpha = T.d < 0 ? 0.5 : 1; g.fill();
        g.globalAlpha = 1;
      }

      if (this.opts.labels) {
        const fs = this.opts.compact ? 10 : 13;
        this._label({ x: 0, y: 0, z: 1.36 }, "|0⟩", c.text, fs, 1, 600);
        this._label({ x: 0, y: 0, z: -1.36 }, "|1⟩", c.text, fs, 1, 600);
        this._label({ x: 1.42, y: 0, z: 0 }, "|+⟩", c.muted, fs);
        this._label({ x: -1.42, y: 0, z: 0 }, "|−⟩", c.muted, fs);
        if (!this.opts.compact) {
          this._label({ x: 0, y: 1.42, z: 0 }, "|+i⟩", c.faint, fs - 1);
          this._label({ x: 0, y: -1.42, z: 0 }, "|−i⟩", c.faint, fs - 1);
        }
      }
      if (this.ghost && this.ghost.label) {
        const v = this.ghost.v;
        this._label({ x: v.x * 1.2, y: v.y * 1.2, z: v.z * 1.2 + 0.12 }, this.ghost.label, this.ghost.color, 11);
      }
    }

    _drawTrail(front) {
      if (this.trail.length < 2) return;
      const g = this.ctx, n = this.trail.length;
      for (let i = 1; i < n; i++) {
        const a = this.project(this.trail[i - 1]), b = this.project(this.trail[i]);
        if (((a.d + b.d) / 2 >= 0) !== front) continue;
        g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy);
        g.strokeStyle = this.c.pred; g.globalAlpha = (front ? 0.95 : 0.4) * (0.25 + 0.75 * (i / n));
        g.lineWidth = 2.2; g.stroke();
      }
      g.globalAlpha = 1;
    }

    _drawProjection() {
      const v = this.vec, foot = { x: v.x, y: v.y, z: 0 };
      if (Math.hypot(v.x, v.y) < 0.02) return;
      this._line(v, foot, this.c.faint, 1, 0.9, [3, 3]);
      this._line({ x: 0, y: 0, z: 0 }, foot, this.c.faint, 1, 0.9, [3, 3]);
    }

    _drawAngles() {
      const v = this.vec, g = this.ctx, r = 0.32;
      const th = Math.acos(Math.max(-1, Math.min(1, v.z)));
      const ph = Math.atan2(v.y, v.x);
      // theta arc from +z toward v (in the plane of z and the vector's azimuth)
      if (th > 0.03) {
        const pts = [];
        for (let i = 0; i <= 30; i++) {
          const t = (i / 30) * th;
          pts.push(this.project({ x: r * Math.sin(t) * Math.cos(ph), y: r * Math.sin(t) * Math.sin(ph), z: r * Math.cos(t) }));
        }
        g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.sx, p.sy) : g.moveTo(p.sx, p.sy)));
        g.strokeStyle = this.c.pred; g.lineWidth = 1.6; g.stroke();
        const m = th / 2;
        this._label({ x: (r + 0.13) * Math.sin(m) * Math.cos(ph), y: (r + 0.13) * Math.sin(m) * Math.sin(ph), z: (r + 0.13) * Math.cos(m) }, "θ", this.c.pred, 13, 1, 600);
      }
      if (Math.hypot(v.x, v.y) > 0.05) {
        let end = ph < 0 ? ph + TAU : ph;
        const pts = [];
        for (let i = 0; i <= 40; i++) { const t = (i / 40) * end; pts.push(this.project({ x: r * Math.cos(t), y: r * Math.sin(t), z: 0 })); }
        g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.sx, p.sy) : g.moveTo(p.sx, p.sy)));
        g.strokeStyle = "#5eead4"; g.lineWidth = 1.6; g.stroke();
        const m = end / 2;
        this._label({ x: (r + 0.14) * Math.cos(m), y: (r + 0.14) * Math.sin(m), z: 0 }, "φ", "#5eead4", 13, 1, 600);
      }
    }
  }

  root.BlochSphere = BlochSphere;
  root.slerp = slerp;
})(window);
