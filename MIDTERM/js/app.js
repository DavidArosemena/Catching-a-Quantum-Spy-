/*
 * app.js — the seven connected views.
 * Shared model parameters: the qubit (θ, φ) links Views 1–3; the BB84 run
 * (seed, N, f) links Views 4–5; Eve's interception f links Views 5–7.
 */
(function () {
  "use strict";
  const M = window.QModel;
  const $ = (id) => document.getElementById(id);
  const PI = Math.PI;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const COL = {
    alice: css("--alice"), bob: css("--bob"), eve: css("--eve"), pred: css("--pred"), accent: css("--accent"),
    muted: css("--muted"), faint: css("--faint"), text: css("--text"), teal: css("--teal"),
  };
  const deg = (r) => (r * 180) / PI;
  const pct = (x, d = 1) => (x === null || x === undefined || !isFinite(x) ? "n/a" : (100 * x).toFixed(d) + "%");
  const f3 = (x) => (Math.abs(x) < 5e-4 ? "0.000" : x.toFixed(3));
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const BASIS = ["Z", "X"];

  /* ---------- small UI helpers ---------- */
  function fillRange(inp) {
    const p = ((+inp.value - +inp.min) / (+inp.max - +inp.min)) * 100;
    inp.style.setProperty("--fill", p + "%");
  }
  document.querySelectorAll('input[type="range"]').forEach((r) => { fillRange(r); r.addEventListener("input", () => fillRange(r)); });
  function setRange(inp, v) { inp.value = v; fillRange(inp); }

  const tip = $("tip");
  function showTip(html, ev) {
    tip.innerHTML = html; tip.classList.add("show");
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.classList.remove("show"); }
  function stat(label, value, sub = "", bar = null) {
    let b = "";
    if (bar) b = `<div class="pbar">${bar.map((s) => `<span style="width:${(100 * s.v).toFixed(2)}%;background:${s.c}"></span>`).join("")}</div>`;
    return `<div class="stat"><div class="l">${label}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ""}${b}</div>`;
  }
  function svgBox(el, w, h) {
    return d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("preserveAspectRatio", "xMidYMid meet");
  }
  function segOn(group, btn) { group.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn)); }

  /* =========================================================
   * Shared state
   * ======================================================= */
  const qubit = { theta: PI / 4, phi: 0 };
  const qListeners = [];
  function setQubit(theta, phi, opts = {}) {
    qubit.theta = Math.max(0, Math.min(PI, theta));
    if (phi !== null && phi !== undefined) qubit.phi = ((phi % (2 * PI)) + 2 * PI) % (2 * PI);
    qListeners.forEach((fn) => fn(opts));
  }
  const qvec = () => M.blochVector(qubit.theta, qubit.phi);

  const bb = { seed: 42, N: 24, f: 0.5, speed: 1.5 };
  const fListeners = [];
  function setF(f, source) { bb.f = Math.max(0, Math.min(1, f)); fListeners.forEach((fn) => fn(source)); }

  /* =========================================================
   * Hero
   * ======================================================= */
  const hero = new BlochSphere($("heroSphere"), { orbit: true, autoRotate: 0.0035, scale: 0.33 });
  const heroStates = [[1.0, 2.4], [PI / 2, 5.68], [0.45, 4.0], [2.3, 2.6], [PI / 2, PI], [1.2, 5.9]];
  let hi = 0;
  hero.setVector(M.blochVector(...heroStates[0]));
  setInterval(() => { hi = (hi + 1) % heroStates.length; hero.setVector(M.blochVector(...heroStates[hi]), true, 1400); }, 2600);

  /* =========================================================
   * View 1 — the qubit
   * ======================================================= */
  const s1 = new BlochSphere($("s1"), {
    draggableTip: true, showAngles: true, showProjection: true, scale: 0.33,
    onTipDrag: (v) => { const a = M.anglesFromVector(v); setQubit(a.theta, a.phi, { source: "drag" }); },
  });
  const PRESETS = { "0": [0, 0], "1": [PI, 0], "+": [PI / 2, 0], "-": [PI / 2, PI], "+i": [PI / 2, PI / 2], "-i": [PI / 2, 1.5 * PI] };
  const PRESET_NAMES = { "0": "|0⟩", "1": "|1⟩", "+": "|+⟩", "-": "|−⟩", "+i": "|+i⟩", "-i": "|−i⟩" };
  function namedState(v) {
    for (const k in PRESETS) {
      const w = M.blochVector(...PRESETS[k]);
      if (v.x * w.x + v.y * w.y + v.z * w.z > 0.9995) return PRESET_NAMES[k];
    }
    return null;
  }
  $("v1theta").addEventListener("input", (e) => setQubit(+e.target.value, qubit.phi, { source: "slider" }));
  $("v1phi").addEventListener("input", (e) => setQubit(qubit.theta, +e.target.value, { source: "slider" }));
  $("v1presets").addEventListener("click", (e) => {
    const k = e.target.dataset && e.target.dataset.s; if (!k) return;
    setQubit(PRESETS[k][0], PRESETS[k][1], { animate: true });
  });
  $("v1reset").addEventListener("click", () => { setQubit(PI / 4, 0, { animate: true }); s1.resetView(); });

  function renderV1(opts) {
    const v = qvec();
    s1.setVector(v, !!opts.animate, 500);
    if (opts.source !== "slider") { setRange($("v1theta"), qubit.theta); setRange($("v1phi"), qubit.phi); }
    const atPole = Math.abs(Math.sin(qubit.theta)) < 1e-6;
    $("v1thetaOut").textContent = `${qubit.theta.toFixed(3)} rad (${deg(qubit.theta).toFixed(1)}°)`;
    $("v1phiOut").textContent = atPole ? "n/a at a pole" : `${qubit.phi.toFixed(3)} rad (${deg(qubit.phi).toFixed(1)}°)`;
    const a = Math.cos(qubit.theta / 2), b = Math.sin(qubit.theta / 2), p0 = a * a;
    const name = namedState(v);
    document.querySelectorAll("#v1presets button").forEach((bt) => bt.classList.toggle("on", PRESET_NAMES[bt.dataset.s] === name));
    $("v1read").innerHTML =
      stat("θ (tilt)", `${qubit.theta.toFixed(3)} rad`, `${deg(qubit.theta).toFixed(1)}°`) +
      stat("φ (turn)", atPole ? "n/a" : `${qubit.phi.toFixed(3)} rad`, atPole ? "undefined at a pole" : `${deg(qubit.phi).toFixed(1)}°`) +
      stat("Bloch vector r", `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`, name ? `this is ${name}` : "unitless, length 1") +
      stat("amplitude of |0⟩", f3(a), "cos(θ/2)") +
      stat("amplitude of |1⟩", `${f3(b)}·e<sup>i${atPole ? "φ" : qubit.phi.toFixed(2)}</sup>`, "e<sup>iφ</sup>·sin(θ/2)") +
      stat("P(0) · P(1)", `${pct(p0)} · ${pct(1 - p0)}`, "if measured in Z", [{ v: p0, c: COL.alice }, { v: 1 - p0, c: "rgba(255,255,255,.12)" }]);
  }
  qListeners.push(renderV1);

  /* =========================================================
   * View 2 — measurement
   * ======================================================= */
  const s2 = new BlochSphere($("s2"), { scale: 0.31, labels: true });
  const v2 = { basis: "Z", n0: 0, n1: 0, conv: [], rng: M.mulberry32(2026), busy: null };
  const v2chart = (() => {
    const W = 360, H = 270, m = { l: 44, r: 12, t: 26, b: 34 };
    const svg = svgBox($("v2chart"), W, H);
    const x = d3.scaleBand().domain([0, 1]).range([m.l, W - m.r]).padding(0.35);
    const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));
    const xa = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`);
    svg.append("text").attr("class", "axis-title").attr("x", m.l).attr("y", 14).text("observed (bars) vs predicted (dashes)");
    const bars = svg.append("g"), preds = svg.append("g"), labels = svg.append("g");
    function update(obs, pred, names, counts) {
      xa.call(d3.axisBottom(x).tickFormat((d) => `outcome ${names[d]}`));
      const data = [0, 1].map((i) => ({ i, obs: obs[i], pred: pred[i], name: names[i], count: counts[i] }));
      bars.selectAll("rect").data(data).join("rect")
        .attr("x", (d) => x(d.i)).attr("width", x.bandwidth()).attr("rx", 6)
        .attr("fill", (d) => (d.i === 0 ? COL.alice : COL.bob)).attr("fill-opacity", 0.85)
        .on("mousemove", (ev, d) => showTip(`<b>outcome ${d.name}</b><br>count ${d.count}<br>observed ${pct(d.obs)}<br><span class="t">predicted ${pct(d.pred)}</span>`, ev))
        .on("mouseleave", hideTip)
        .transition().duration(380).ease(d3.easeCubicOut)
        .attr("y", (d) => y(d.obs)).attr("height", (d) => y(0) - y(d.obs));
      preds.selectAll("line").data(data).join("line")
        .attr("stroke", COL.pred).attr("stroke-width", 2.5).attr("stroke-dasharray", "6 4")
        .transition().duration(380)
        .attr("x1", (d) => x(d.i) - 8).attr("x2", (d) => x(d.i) + x.bandwidth() + 8)
        .attr("y1", (d) => y(d.pred)).attr("y2", (d) => y(d.pred));
      labels.selectAll("text").data(data).join("text")
        .attr("text-anchor", "middle").attr("fill", COL.text).attr("font-family", "IBM Plex Mono, monospace").attr("font-size", 12)
        .attr("x", (d) => x(d.i) + x.bandwidth() / 2)
        .text((d) => (d.count ? `${pct(d.obs)} (${d.count})` : ""))
        .transition().duration(380).attr("y", (d) => Math.min(y(d.obs), y(d.pred)) - 8);
    }
    return { update };
  })();
  const v2conv = (() => {
    const W = 560, H = 120, m = { l: 44, r: 14, t: 20, b: 26 };
    const svg = svgBox($("v2conv"), W, H);
    const x = d3.scaleLog().domain([1, 10]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickFormat(d3.format(".0%")));
    const xa = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`);
    const title = svg.append("text").attr("class", "axis-title").attr("x", m.l).attr("y", 12);
    const band = svg.append("path").attr("fill", COL.pred).attr("fill-opacity", 0.1);
    const predL = svg.append("line").attr("stroke", COL.pred).attr("stroke-dasharray", "5 4").attr("stroke-width", 1.5);
    const path = svg.append("path").attr("fill", "none").attr("stroke", COL.alice).attr("stroke-width", 2);
    function update(conv, pred, name) {
      const n = conv.length ? conv[conv.length - 1].n : 1;
      x.domain([1, Math.max(10, n)]);
      xa.call(d3.axisBottom(x).ticks(5, "~s"));
      title.text(`running estimate of P(${name}) as shots add up (x: shots, log scale; band: expected 95% noise)`);
      predL.attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(pred)).attr("y2", y(pred));
      const ns = d3.range(0, 61).map((i) => Math.pow(10, (i / 60) * Math.log10(Math.max(10, n))));
      band.attr("d", d3.area().x((k) => x(k))
        .y0((k) => y(Math.max(0, pred - 1.96 * Math.sqrt((pred * (1 - pred)) / k))))
        .y1((k) => y(Math.min(1, pred + 1.96 * Math.sqrt((pred * (1 - pred)) / k))))(ns));
      path.attr("d", conv.length ? d3.line().x((d) => x(d.n)).y((d) => y(d.est))(conv) : null);
    }
    return { update };
  })();
  function v2pred() { const v = qvec(); return v2.basis === "Z" ? M.probZ0(v) : M.probXplus(v); }
  function v2names() { return v2.basis === "Z" ? ["0", "1"] : ["+", "−"]; }
  function v2clear(msg) { v2.n0 = v2.n1 = 0; v2.conv = []; v2.rng = M.mulberry32(2026); if (msg) flash2(msg); renderV2(); }
  let flashT = null;
  function flash2(txt) {
    const el = $("v2flash"); el.textContent = txt; el.classList.add("hot");
    clearTimeout(flashT); flashT = setTimeout(() => { el.classList.remove("hot"); }, 900);
  }
  function measure(k) {
    const p = v2pred();
    let last = 0;
    for (let i = 0; i < k; i++) {
      last = v2.rng() < p ? 0 : 1;
      if (last === 0) v2.n0++; else v2.n1++;
      const n = v2.n0 + v2.n1;
      if (n <= 50 || n % Math.ceil(n / 60) === 0 || i === k - 1) v2.conv.push({ n, est: v2.n0 / n });
    }
    if (v2.conv.length > 700) v2.conv = v2.conv.filter((_, i) => i % 2 === 0 || i === v2.conv.length - 1);
    const names = v2names();
    if (k === 1) {
      const pole = v2.basis === "Z" ? { x: 0, y: 0, z: last === 0 ? 1 : -1 } : { x: last === 0 ? 1 : -1, y: 0, z: 0 };
      clearTimeout(v2.busy);
      s2.setVector(pole, true, 260);
      flash2(`measured ${names[last]} → collapsed`);
      v2.busy = setTimeout(() => { s2.setVector(qvec(), true, 420); $("v2flash").textContent = "fresh copy prepared"; }, 750);
    } else flash2(`measured ${k} fresh copies`);
    renderV2();
  }
  $("v2m1").addEventListener("click", () => measure(1));
  $("v2m100").addEventListener("click", () => measure(100));
  $("v2m1000").addEventListener("click", () => measure(1000));
  $("v2reset").addEventListener("click", () => { segOn($("v2basis"), $("v2basis").children[0]); v2.basis = "Z"; v2clear("reset"); });
  $("v2basis").addEventListener("click", (e) => {
    const b = e.target.dataset && e.target.dataset.b; if (!b) return;
    segOn($("v2basis"), e.target); v2.basis = b; v2clear(`basis ${b}: counts cleared`);
  });
  $("v2theta").addEventListener("input", (e) => setQubit(+e.target.value, qubit.phi, { source: "v2" }));
  function renderV2() {
    const p = v2pred(), n = v2.n0 + v2.n1, names = v2names();
    const obs = n ? [v2.n0 / n, v2.n1 / n] : [0, 0];
    v2chart.update(obs, [p, 1 - p], names, [v2.n0, v2.n1]);
    v2conv.update(v2.conv, p, names[0]);
    const ci = n ? 1.96 * Math.sqrt((p * (1 - p)) / n) : null;
    const diff = n ? obs[0] - p : null;
    const ok = n ? Math.abs(diff) <= ci + 1e-12 : null;
    $("v2read").innerHTML =
      stat("shots measured", n.toLocaleString(), `basis ${v2.basis}`) +
      stat(`observed vs predicted P(${names[0]})`, n ? `${pct(obs[0])} vs ${pct(p)}` : `— vs ${pct(p)}`, "predicted = " + (v2.basis === "Z" ? "cos²(θ/2)" : "(1 + r<sub>x</sub>)/2")) +
      stat("difference", n ? `${diff >= 0 ? "+" : ""}${(100 * diff).toFixed(1)} pts` : "—",
        n ? (ok ? `✓ inside expected noise (±${(100 * ci).toFixed(1)} pts)` : `outside ±${(100 * ci).toFixed(1)} pts (happens 5% of the time)`) : "measure to compare");
  }
  qListeners.push((opts) => {
    if (opts.source !== "v2") setRange($("v2theta"), qubit.theta);
    $("v2thetaOut").textContent = `${qubit.theta.toFixed(3)} rad (${deg(qubit.theta).toFixed(1)}°)`;
    clearTimeout(v2.busy);
    s2.setVector(qvec(), !!opts.animate, 450);
    if (v2.n0 + v2.n1 > 0) v2clear("qubit changed: counts cleared"); else renderV2();
  });

  /* =========================================================
   * View 3 — gates
   * ======================================================= */
  const s3 = new BlochSphere($("s3"), { scale: 0.33 });
  const v3 = { start: "0", circuit: ["H"], pos: 0, playing: false, animating: false, raf: null, vec: { x: 0, y: 0, z: 1 } };
  function v3startVec() { return v3.start === "0" ? { x: 0, y: 0, z: 1 } : v3.start === "1" ? { x: 0, y: 0, z: -1 } : qvec(); }
  function v3restart() {
    cancelAnimationFrame(v3.raf); v3.animating = false; v3.pos = 0;
    v3.vec = v3startVec(); s3.clearTrail(); s3.setAxis(null); s3.setVector(v3.vec, true, 350);
  }
  function v3renderCircuit() {
    const w = $("v3circuit");
    w.innerHTML = v3.circuit.length ? "" : '<span class="empty">empty: add a gate below</span>';
    v3.circuit.forEach((g, i) => {
      const b = document.createElement("button");
      b.className = "g" + (i < v3.pos ? " done" : "") + (v3.animating && i === v3.pos ? " now" : "");
      b.textContent = g; b.title = `${M.GATES[g].label}, click to remove`;
      b.addEventListener("click", () => { if (v3.animating) return; v3.circuit.splice(i, 1); v3restart(); v3render(); });
      w.appendChild(b);
    });
    const sv = v3startVec(), nm = namedState(sv);
    $("v3wire").textContent = nm || "ψ (View 1)";
  }
  function v3render() {
    v3renderCircuit();
    const v = v3.vec, pz = M.probZ0(v), px = M.probXplus(v), nm = namedState(v);
    $("v3play").textContent = v3.playing ? "⏸ Pause" : v3.pos >= v3.circuit.length && v3.circuit.length ? "▶ Replay" : "▶ Play";
    if (!v3.animating) $("v3status").textContent = nm ? `state: ${nm}` : `state: (${f3(v.x)}, ${f3(v.y)}, ${f3(v.z)})`;
    const coin = (q) => Math.abs(q - 0.5) < 0.01 ? " · coin flip!" : Math.abs(q - 0.5) > 0.49 ? " · certain" : "";
    $("v3read").innerHTML =
      stat("read in Z basis (0 / 1)", `${pct(pz)} / ${pct(1 - pz)}`, "P(0) = (1 + r<sub>z</sub>)/2" + coin(pz), [{ v: pz, c: COL.alice }, { v: 1 - pz, c: COL.bob }]) +
      stat("read in X basis (+ / −)", `${pct(px)} / ${pct(1 - px)}`, "P(+) = (1 + r<sub>x</sub>)/2" + coin(px), [{ v: px, c: COL.alice }, { v: 1 - px, c: COL.bob }]);
  }
  function v3animateGate() {
    if (v3.pos >= v3.circuit.length) { v3.playing = false; v3render(); return; }
    const g = v3.circuit[v3.pos], ax = M.GATES[g].axis, from = v3.vec, t0 = performance.now(), dur = 1150;
    v3.animating = true; s3.setAxis(ax);
    $("v3status").textContent = `applying ${g}: half turn about the dashed axis`;
    v3renderCircuit();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const v = M.rotate(from, ax, PI * easeIO(k));
      v3.vec = v; s3.setVector(v); s3.addTrail(v);
      if (k < 1) { v3.raf = requestAnimationFrame(tick); return; }
      v3.vec = M.applyGate(from, g);
      v3.pos++; v3.animating = false;
      setTimeout(() => { if (!v3.animating) s3.setAxis(null); }, 350);
      v3render();
      if (v3.playing) setTimeout(() => { if (v3.playing) v3animateGate(); }, 380);
    };
    v3.raf = requestAnimationFrame(tick);
  }
  $("v3play").addEventListener("click", () => {
    if (v3.playing) { v3.playing = false; v3render(); return; }
    if (!v3.circuit.length) return;
    if (v3.pos >= v3.circuit.length) v3restart();
    v3.playing = true; v3render();
    if (!v3.animating) v3animateGate();
  });
  $("v3step").addEventListener("click", () => {
    v3.playing = false;
    if (v3.animating) return;
    if (v3.pos >= v3.circuit.length) { v3restart(); v3render(); return; }
    v3animateGate();
  });
  $("v3reset").addEventListener("click", () => {
    v3.playing = false; v3.start = "0"; v3.circuit = ["H"];
    segOn($("v3start"), $("v3start").children[0]); v3restart(); v3render(); s3.resetView();
  });
  document.querySelectorAll("#v3 .gate").forEach((b) => b.addEventListener("click", () => {
    if (v3.circuit.length >= 8) return;
    v3.circuit.push(b.dataset.g); v3render();
  }));
  $("v3start").addEventListener("click", (e) => {
    const s = e.target.dataset && e.target.dataset.s; if (!s) return;
    segOn($("v3start"), e.target); v3.start = s; v3.playing = false; v3restart(); v3render();
  });
  qListeners.push(() => { if (v3.start === "v1" && !v3.animating && v3.pos === 0) { v3.vec = qvec(); s3.setVector(v3.vec); v3render(); } });

  /* =========================================================
   * Views 4 and 5 — BB84 exchange
   * ======================================================= */
  const ANG = [[90, 0], [45, 135]]; // polarization angle by [basis][bit]
  function polSVG(bit, basis, color) {
    const a = (ANG[basis][bit] * PI) / 180, r = 7, cx = 9, cy = 9;
    const dx = Math.cos(a) * r, dy = -Math.sin(a) * r;
    return `<svg class="pol" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="none" stroke="${color}" stroke-opacity=".35"/>` +
      `<line x1="${cx - dx}" y1="${cy - dy}" x2="${cx + dx}" y2="${cy + dy}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  }
  const stateName = (bit, basis) => M.STATE_NAMES[basis][bit];

  class Exchange {
    constructor(id, withEve) {
      this.id = id; this.withEve = withEve; this.progress = 0; this.playing = false; this.anim = null;
      this.filter = "all"; this.sel = null; this.sim = null;
      this._buildLane();
    }
    get f() { return this.withEve ? bb.f : 0; }
    recompute() { this.sim = M.simulateBB84({ N: bb.N, f: this.f, p: 0, seed: bb.seed }); this.progress = Math.min(this.progress, bb.N); }
    _buildLane() {
      const W = 760, H = 132, y = 62;
      const svg = svgBox($(this.id + "lane"), W, H);
      this.lane = { svg, W, H, y };
      const nodes = [{ k: "alice", x: 70, name: "Alice", c: COL.alice }, { k: "bob", x: 690, name: "Bob", c: COL.bob }];
      if (this.withEve) nodes.splice(1, 0, { k: "eve", x: 380, name: "Eve", c: COL.eve });
      svg.append("line").attr("x1", 70).attr("x2", 690).attr("y1", y).attr("y2", y).attr("stroke", COL.faint).attr("stroke-dasharray", "2 6").attr("stroke-width", 2);
      svg.append("text").attr("x", 380).attr("y", y - (this.withEve ? 34 : 14)).attr("text-anchor", "middle").attr("fill", COL.faint)
        .attr("font-size", 11).attr("font-family", "IBM Plex Mono, monospace").text(this.withEve ? "" : "quantum channel (one photon at a time)");
      this.cap = {};
      nodes.forEach((n) => {
        const g = svg.append("g").attr("transform", `translate(${n.x},${y})`);
        g.append("circle").attr("r", 24).attr("fill", n.c).attr("fill-opacity", 0.14).attr("stroke", n.c).attr("stroke-width", 1.5);
        g.append("text").attr("text-anchor", "middle").attr("dy", 5).attr("fill", n.c).attr("font-weight", 600).attr("font-size", 13).text(n.name);
        const anchor = n.k === "alice" ? "start" : n.k === "bob" ? "end" : "middle";
        const cx = n.k === "alice" ? 46 : n.k === "bob" ? 714 : n.x;
        this.cap[n.k] = svg.append("text").attr("x", cx).attr("y", y + 46).attr("text-anchor", anchor).attr("fill", COL.muted)
          .attr("font-size", 11.5).attr("font-family", "IBM Plex Mono, monospace");
      });
      this.photon = svg.append("g").attr("opacity", 0);
      this.photon.append("circle").attr("r", 15).attr("class", "ph-ring").attr("fill", "rgba(9,13,28,.9)").attr("stroke-width", 2);
      this.photon.append("line").attr("class", "ph-pol").attr("stroke-width", 3).attr("stroke-linecap", "round");
      this.counter = svg.append("text").attr("x", W - 12).attr("y", 18).attr("text-anchor", "end").attr("fill", COL.muted)
        .attr("font-size", 12).attr("font-family", "IBM Plex Mono, monospace");
    }
    _setPhoton(x, bit, basis, color, op = 1) {
      const a = (ANG[basis][bit] * PI) / 180, r = 10;
      this.photon.attr("transform", `translate(${x},${this.lane.y})`).attr("opacity", op);
      this.photon.select(".ph-ring").attr("stroke", color);
      this.photon.select(".ph-pol").attr("stroke", color)
        .attr("x1", -Math.cos(a) * r).attr("y1", Math.sin(a) * r).attr("x2", Math.cos(a) * r).attr("y2", -Math.sin(a) * r);
    }
    _captions(i, stage) {
      const r = i !== null && i >= 0 ? this.sim.rows[i] : null;
      if (!r) { Object.values(this.cap).forEach((c) => c.text("")); return; }
      this.cap.alice.text(`bit ${r.aBit} · basis ${BASIS[r.aBasis]} → ${stateName(r.aBit, r.aBasis)}`);
      if (this.cap.eve) this.cap.eve.text(stage < 1 ? "" : r.eveOn ? `guess ${BASIS[r.eBasis]} → saw ${r.eBit}` : "not intercepted");
      this.cap.bob.text(stage < 2 ? "" : `basis ${BASIS[r.bBasis]} → got ${r.bBit}`);
    }
    stop() { this.playing = false; cancelAnimationFrame(this.anim); this.anim = null; }
    animateNext() {
      if (this.progress >= bb.N) { this.playing = false; this.renderButtons(); return; }
      const i = this.progress, r = this.sim.rows[i];
      const dur = 1300 / bb.speed, hold = this.withEve && r.eveOn ? 380 / bb.speed : 0;
      const t0 = performance.now();
      const x0 = 70, x1 = 690, xe = 380;
      const tick = (now) => {
        const el = now - t0;
        let x, bit = r.aBit, basis = r.aBasis, col = COL.alice, stage = 0;
        const half = dur / 2;
        if (!this.withEve) {
          const k = Math.min(1, el / dur); x = x0 + (x1 - x0) * easeIO(k); stage = k >= 1 ? 2 : 0;
        } else if (el < half) { x = x0 + (xe - x0) * easeIO(el / half); }
        else if (el < half + hold) { x = xe; stage = 1; bit = r.eBit; basis = r.eBasis; col = COL.eve; }
        else {
          const k = Math.min(1, (el - half - hold) / half); x = xe + (x1 - xe) * easeIO(k); stage = k >= 1 ? 2 : 1;
          if (r.eveOn) { bit = r.eBit; basis = r.eBasis; col = COL.eve; }
        }
        this._setPhoton(x, bit, basis, col);
        this._captions(i, stage);
        if (el < dur + hold) { this.anim = requestAnimationFrame(tick); return; }
        this.progress++; this.anim = null;
        this.render(i);
        this.photon.transition().duration(250).attr("opacity", 0);
        if (this.playing) setTimeout(() => { if (this.playing && !this.anim) this.animateNext(); }, 160 / bb.speed);
        else this.renderButtons();
      };
      this.anim = requestAnimationFrame(tick);
    }
    play() {
      if (this.playing) { this.stop(); this.renderButtons(); return; }
      if (this.progress >= bb.N) { this.progress = 0; this.render(); }
      this.playing = true; this.renderButtons(); this.animateNext();
    }
    step() { if (this.anim) return; this.playing = false; if (this.progress >= bb.N) { this.progress = 0; this.render(); } this.animateNext(); this.renderButtons(); }
    finish() { this.stop(); this.progress = bb.N; this.photon.attr("opacity", 0); this.render(); }
    renderButtons() {
      const b = $(this.id + "play");
      b.textContent = this.playing ? "⏸ Pause" : this.progress >= bb.N ? "▶ Replay" : this.progress > 0 ? "▶ Resume" : "▶ Play";
    }
    rowsShown() {
      const rows = this.sim.rows.slice(0, this.progress);
      const f = this.filter;
      return rows.filter((r) => f === "all" || (f === "sifted" && r.sifted) || (f === "eve" && r.eveOn) ||
        (f === "evewrong" && r.eveOn && r.eBasis !== r.aBasis) || (f === "errors" && r.error));
    }
    render(newIdx = null) {
      const E = this.withEve, rows = this.sim.rows.slice(0, this.progress);
      // table
      const head = `<thead><tr><th>#</th><th>Alice bit</th><th>Alice basis</th><th>photon</th>` +
        (E ? `<th>Eve basis</th><th>Eve saw</th>` : "") + `<th>Bob basis</th><th>Bob bit</th><th>same basis?</th><th>result</th></tr></thead>`;
      const shown = this.rowsShown();
      const body = shown.map((r) => {
        const cls = [r.sifted ? "" : "disc", r.error ? "err" : "", r.idx === newIdx ? "newrow" : "", r.idx === this.sel ? "sel" : ""].join(" ");
        const res = !r.sifted ? '<span class="no">discarded</span>' : r.error ? "ERROR ✗" : '<span class="yes">match ✓</span>';
        return `<tr class="${cls}" data-i="${r.idx}"><td>${r.idx + 1}</td><td class="A">${r.aBit}</td><td class="A">${BASIS[r.aBasis]}</td>` +
          `<td>${polSVG(r.aBit, r.aBasis, COL.alice)}</td>` +
          (E ? `<td class="E">${r.eveOn ? BASIS[r.eBasis] : '<span class="no">NULL</span>'}</td><td class="E">${r.eveOn ? r.eBit : '<span class="no">NULL</span>'}</td>` : "") +
          `<td class="B">${BASIS[r.bBasis]}</td><td class="B">${r.bBit}</td><td>${r.sifted ? '<span class="yes">yes</span>' : '<span class="no">no</span>'}</td><td>${res}</td></tr>`;
      }).join("");
      const empty = `<tr><td colspan="${E ? 10 : 8}" class="no" style="padding:18px">${this.progress ? "no rows match this filter" : "press Play to send qubits"}</td></tr>`;
      $(this.id + "table").innerHTML = head + "<tbody>" + (body || empty) + "</tbody>";
      if (newIdx !== null) { const wrap = $(this.id + "tableWrap"); wrap.scrollTop = wrap.scrollHeight; }
      // key bar
      const sifted = rows.filter((r) => r.sifted), errs = sifted.filter((r) => r.error).length;
      const K = sifted.length;
      const bits = (who) => sifted.map((r) => `<span class="${r.error ? "bad" : ""}">${who === "a" ? r.aBit : r.bBit}</span>`).join("");
      $(this.id + "key").innerHTML =
        `<span class="k">Alice key</span><div class="bits a">${bits("a")}</div><span class="k">Bob key</span><div class="bits b">${bits("b")}</div>` +
        `<div class="sum"><span>sent <b>${this.progress}/${bb.N}</b></span><span>sifted K <b>${K}</b> (${this.progress ? pct(K / this.progress, 0) : "n/a"})</span>` +
        `<span>errors <b>${errs}</b></span><span>QBER <b>${K ? pct(errs / K) : "n/a (no sifted bits yet)"}</b></span>` +
        (E ? `<span>Eve tapped <b>${rows.filter((r) => r.eveOn).length}</b></span>` : "") + `</div>` +
        (E && K ? `<div class="sum note">theory expects QBER ≈ f/4 = ${pct(bb.f / 4)}. With only K = ${K} sifted bits, one run is very noisy (±${(196 * Math.sqrt(Math.max(bb.f / 4 * (1 - bb.f / 4), 0.0001) / K)).toFixed(0)} pts), so View 6 pools thousands of bits.</div>` : "");
      this.counter.text(`${this.progress}/${bb.N} sent`);
      if (!this.anim) this._captions(this.progress - 1, 2);
      this.renderButtons();
      if (this.onRender) this.onRender();
    }
    bindTable() {
      $(this.id + "table").addEventListener("click", (e) => {
        const tr = e.target.closest("tr[data-i]"); if (!tr) return;
        this.sel = +tr.dataset.i; this.render(); this.detail();
      });
    }
  }

  const ex4 = new Exchange("v4", false), ex5 = new Exchange("v5", true);
  ex4.progress = 8;
  ex4.recompute(); ex5.recompute(); ex5.progress = bb.N;
  ex4.bindTable(); ex5.bindTable();
  document.querySelectorAll(".seedOut").forEach((s) => (s.textContent = bb.seed));

  ex4.detail = function () {
    const r = this.sim.rows[this.sel]; if (!r) return;
    const same = r.sifted;
    $("v4detail").innerHTML =
      `<div><b>Qubit #${r.idx + 1}</b> ${polSVG(r.aBit, r.aBasis, COL.alice)}</div>` +
      `<p class="small" style="margin:6px 0 0"><span class="c-alice">Alice</span> encoded bit <b>${r.aBit}</b> in basis <b>${BASIS[r.aBasis]}</b> as ${stateName(r.aBit, r.aBasis)}. ` +
      `<span class="c-bob">Bob</span> measured in <b>${BASIS[r.bBasis]}</b>` +
      (same ? ` (same basis), so his result is certain: <b>${r.bBit}</b>. Kept in the key.` :
        ` (different basis), so his result was a coin flip: <b>${r.bBit}</b>. Discarded when they compare bases.`) + `</p>`;
  };
  const s5a = new BlochSphere($("s5a"), { compact: true, scale: 0.3, color: COL.alice });
  const s5b = new BlochSphere($("s5b"), { compact: true, scale: 0.3, color: COL.eve });
  ex5.detail = function () {
    const r = this.sim.rows[this.sel]; if (!r) return;
    s5a.setVector(M.encodedState(r.aBit, r.aBasis), true);
    const recv = r.eveOn ? M.encodedState(r.eBit, r.eBasis) : M.encodedState(r.aBit, r.aBasis);
    s5b.setColor(r.eveOn ? COL.eve : COL.alice);
    s5b.setVector(recv, true);
    s5b.setAxis(r.bBasis === 0 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 });
    let t = `<b>Qubit #${r.idx + 1}.</b> Alice sent ${stateName(r.aBit, r.aBasis)} (bit ${r.aBit}, basis ${BASIS[r.aBasis]}). `;
    if (!r.eveOn) t += `Eve did not touch it, so Bob received it unchanged. `;
    else if (r.eBasis === r.aBasis) t += `Eve guessed the <b>right</b> basis (${BASIS[r.eBasis]}), saw ${r.eBit}, and resent the same state: invisible. `;
    else t += `Eve guessed the <b class="c-eve">wrong</b> basis (${BASIS[r.eBasis]}): her result ${r.eBit} was a coin flip, and she resent ${stateName(r.eBit, r.eBasis)}. `;
    t += `Bob measured along the <span class="c-pred">dashed ${BASIS[r.bBasis]} axis</span> and got ${r.bBit}. `;
    t += !r.sifted ? "Bases differ: discarded." : r.error ? `<b class="c-eve">Same basis but different bits: this error exposes Eve.</b>` : "Same basis and same bit: kept.";
    $("v5detailText").innerHTML = t;
  };

  $("v4play").addEventListener("click", () => ex4.play());
  $("v4step").addEventListener("click", () => ex4.step());
  $("v4finish").addEventListener("click", () => ex4.finish());
  $("v4reset").addEventListener("click", () => {
    ex4.stop(); bb.N = 24; bb.speed = 1.5; bb.seed = 42; setRange($("v4n"), 24); setRange($("v4speed"), 1.5);
    ex4.progress = 0; ex4.sel = null; $("v4detail").innerHTML = '<div class="muted small">Click any row to inspect that qubit.</div>';
    syncBB();
  });
  $("v4seed").addEventListener("click", () => { ex4.stop(); ex5.stop(); bb.seed = 1 + Math.floor(Math.random() * 99999); ex4.progress = 0; syncBB(); });
  $("v4n").addEventListener("input", (e) => { bb.N = +e.target.value; syncBB(); });
  $("v4speed").addEventListener("input", (e) => { bb.speed = +e.target.value; $("v4spOut").textContent = bb.speed + "×"; });
  function syncBB() {
    $("v4nOut").textContent = bb.N + " qubits";
    $("v4spOut").textContent = bb.speed + "×";
    document.querySelectorAll(".seedOut").forEach((s) => (s.textContent = bb.seed));
    const full5 = ex5.progress >= ex5.sim.N;
    ex4.recompute(); ex5.recompute();
    if (full5) ex5.progress = bb.N;
    ex4.render(); ex5.render();
    if (ex5.sel !== null && ex5.sel < bb.N) ex5.detail(); else ex5.pickDefault();
  }
  ex5.pickDefault = function () {
    const rows = this.sim.rows.slice(0, this.progress);
    const e = rows.find((r) => r.error) || rows.find((r) => r.eveOn) || rows[0];
    this.sel = e ? e.idx : null; this.render(); if (e) this.detail();
  };

  $("v5play").addEventListener("click", () => ex5.play());
  $("v5step").addEventListener("click", () => ex5.step());
  $("v5finish").addEventListener("click", () => ex5.finish());
  $("v5reset").addEventListener("click", () => {
    ex5.stop(); $("v5filter").value = "all"; ex5.filter = "all"; ex5.progress = bb.N; setF(0.5, "v5");
    ex5.pickDefault();
  });
  $("v5f").addEventListener("input", (e) => setF(+e.target.value / 100, "v5"));
  $("v5filter").addEventListener("change", (e) => { ex5.filter = e.target.value; ex5.render(); });
  fListeners.push((src) => {
    if (src !== "v5") setRange($("v5f"), Math.round(bb.f * 100));
    $("v5fOut").textContent = Math.round(bb.f * 100) + "% of qubits";
    ex5.recompute(); ex5.render();
    if (ex5.sel !== null) ex5.detail();
  });
  ex5.onRender = () => renderSample();

  /* =========================================================
   * View 6 — QBER evidence
   * ======================================================= */
  const NSTEPS = [100, 300, 1000, 2000, 5000, 10000];
  const v6 = { p: 0.03, nIdx: 3, R: 3, show: { clean: true, noisy: true, theory: true }, salt: 0, highlight: null };
  const v6chart = (() => {
    const W = 660, H = 410, m = { l: 58, r: 22, t: 22, b: 52 };
    const svg = svgBox($("v6chart"), W, H);
    const x = d3.scaleLinear().domain([0, 100]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, 0.4]).range([H - m.b, m.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(8).tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(8).tickFormat(d3.format(".0%")));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(10).tickFormat((d) => d + "%"));
    svg.append("text").attr("class", "axis-title").attr("x", (m.l + W - m.r) / 2).attr("y", H - 12).attr("text-anchor", "middle").text("f: share of qubits Eve intercepts (%)");
    svg.append("text").attr("class", "axis-title").attr("transform", `translate(16,${(m.t + H - m.b) / 2}) rotate(-90)`).attr("text-anchor", "middle").text("QBER: errors ÷ sifted bits (%)");
    // threshold
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0.11)).attr("y2", y(0.11)).attr("stroke", COL.eve).attr("stroke-dasharray", "7 5").attr("stroke-width", 1.6);
    svg.append("text").attr("x", W - m.r - 4).attr("y", y(0.11) - 6).attr("text-anchor", "end").attr("fill", COL.eve).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono, monospace").text("≈11% threshold: above it, abort");
    const marker = svg.append("g");
    marker.append("line").attr("class", "mk").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", COL.accent).attr("stroke-width", 1.5).attr("stroke-dasharray", "3 4");
    marker.append("text").attr("class", "mkt").attr("y", m.t + 12).attr("fill", COL.accent).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono, monospace");
    const theoryG = svg.append("g"), barsG = svg.append("g"), dotsG = svg.append("g");
    const legend = svg.append("g").attr("transform", `translate(${m.l + 14},${m.t + 8})`);
    function update(data) {
      const line = d3.line().x((d) => x(d.f)).y((d) => y(d.q));
      const th = [];
      if (v6.show.theory) {
        if (v6.show.clean) th.push({ k: "clean", c: COL.alice, pts: d3.range(0, 101, 2).map((f) => ({ f, q: M.theoryQBER(f / 100, 0) })) });
        if (v6.show.noisy) th.push({ k: "noisy", c: COL.pred, pts: d3.range(0, 101, 2).map((f) => ({ f, q: M.theoryQBER(f / 100, v6.p) })) });
      }
      theoryG.selectAll("path").data(th, (d) => d.k).join(
        (en) => en.append("path").attr("fill", "none").attr("stroke-width", 1.8).attr("stroke-dasharray", "6 4").attr("opacity", 0).attr("d", (d) => line(d.pts)),
      ).attr("stroke", (d) => d.c).transition().duration(500).attr("opacity", 0.75).attr("d", (d) => line(d.pts));
      const pts = data.filter((d) => v6.show[d.k] && d.qber !== null);
      barsG.selectAll("line").data(pts, (d) => d.k + d.f).join((en) => en.append("line").attr("x1", (d) => x(d.f)).attr("x2", (d) => x(d.f)).attr("y1", y(0)).attr("y2", y(0)))
        .attr("stroke", (d) => (d.k === "clean" ? COL.alice : COL.pred)).attr("stroke-width", 2).attr("stroke-linecap", "round")
        .transition().duration(550).ease(d3.easeCubicOut)
        .attr("x1", (d) => x(d.f)).attr("x2", (d) => x(d.f))
        .attr("y1", (d) => y(Math.max(0, d.qber - 1.96 * d.se))).attr("y2", (d) => y(Math.min(0.4, d.qber + 1.96 * d.se)));
      dotsG.selectAll("circle").data(pts, (d) => d.k + d.f).join((en) => en.append("circle").attr("cx", (d) => x(d.f)).attr("cy", y(0)).attr("r", 0))
        .attr("fill", (d) => (d.k === "clean" ? COL.alice : COL.pred)).attr("stroke", "#090d1c").attr("stroke-width", 2)
        .on("mousemove", (ev, d) => showTip(`<b>${d.k === "clean" ? "Clean channel" : "Noisy channel"}</b><br>f = ${d.f}% · p = ${(d.p * 100).toFixed(1)}%<br>` +
          `${d.R} runs × ${d.N.toLocaleString()} qubits<br>sifted ${d.sifted.toLocaleString()} · errors ${d.errors.toLocaleString()}<br>` +
          `<b>QBER ${pct(d.qber, 2)}</b> ± ${(196 * d.se).toFixed(2)} pts<br><span class="t">theory ${pct(M.theoryQBER(d.f / 100, d.p), 2)}</span>`, ev))
        .on("mouseleave", hideTip)
        .transition().duration(550).ease(d3.easeCubicOut)
        .attr("cx", (d) => x(d.f)).attr("cy", (d) => y(d.qber)).attr("r", (d) => (v6.highlight === d.f && d.k === "clean" ? 9 : 5.5));
      const fx = x(bb.f * 100);
      marker.select(".mk").transition().duration(300).attr("x1", fx).attr("x2", fx);
      marker.select(".mkt").text(`your Eve (View 5): f = ${Math.round(bb.f * 100)}%`).transition().duration(300)
        .attr("x", fx > W - 220 ? fx - 6 : fx + 6).attr("text-anchor", fx > W - 220 ? "end" : "start");
      const items = [];
      if (v6.show.clean) items.push({ t: "clean channel, p = 0", c: COL.alice });
      if (v6.show.noisy) items.push({ t: `noisy channel, p = ${(v6.p * 100).toFixed(1)}%`, c: COL.pred });
      legend.selectAll("g").data(items).join((en) => { const g = en.append("g"); g.append("circle").attr("r", 5); g.append("text").attr("x", 10).attr("dy", 4).attr("font-size", 12).attr("fill", COL.text); return g; })
        .attr("transform", (d, i) => `translate(0,${i * 20})`)
        .call((g) => { g.select("circle").attr("fill", (d) => d.c); g.select("text").text((d) => d.t); });
    }
    return { update };
  })();
  function computeV6() {
    const N = NSTEPS[v6.nIdx], out = [];
    [["clean", 0], ["noisy", v6.p]].forEach(([k, p], si) => {
      for (let f = 0; f <= 100; f += 10) {
        const runs = [];
        for (let r = 0; r < v6.R; r++) runs.push(M.simulateBB84({ N, f: f / 100, p, seed: 5000 + si * 100000 + f * 1000 + r + v6.salt * 7919 }));
        const pool = M.pooledQBER(runs);
        out.push({ k, f, p, N, R: v6.R, ...pool });
      }
    });
    return out;
  }
  let v6data = [];
  function renderV6() {
    $("v6pOut").textContent = (v6.p * 100).toFixed(1) + "%";
    $("v6nOut").textContent = NSTEPS[v6.nIdx].toLocaleString();
    $("v6rOut").textContent = v6.R + (v6.R === 1 ? " run" : " runs");
    v6data = computeV6();
    v6chart.update(v6data);
    const p = v6.p, eStar = (0.11 - p) / (1 - 2 * p), fStar = Math.max(0, Math.min(1, 4 * eStar));
    $("v6hide").innerHTML = stat("noise alone (f = 0)", pct(M.theoryQBER(0, p)), "errors with no spy at all") +
      stat("largest f still under 11%", p >= 0.11 ? "none" : fStar >= 1 ? "100%" : pct(fStar, 0),
        p >= 0.11 ? "noise alone is already over the threshold: abort" : "Alice and Bob cannot tell these errors from noise, so they blame Eve for all of them and shorten the key (privacy amplification)");
  }
  $("v6p").addEventListener("input", (e) => { v6.p = +e.target.value / 100; renderV6(); });
  $("v6n").addEventListener("input", (e) => { v6.nIdx = +e.target.value; renderV6(); });
  $("v6r").addEventListener("input", (e) => { v6.R = +e.target.value; renderV6(); });
  $("v6toggles").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    v6.show[b.dataset.k] = !v6.show[b.dataset.k]; b.classList.toggle("on", v6.show[b.dataset.k]); renderV6();
  });
  $("v6rerun").addEventListener("click", () => { v6.salt++; renderV6(); });
  $("v6reset").addEventListener("click", () => {
    Object.assign(v6, { p: 0.03, nIdx: 3, R: 3, salt: 0, highlight: null, show: { clean: true, noisy: true, theory: true } });
    setRange($("v6p"), 3); setRange($("v6n"), 3); setRange($("v6r"), 3);
    document.querySelectorAll("#v6toggles button").forEach((b) => b.classList.add("on"));
    document.querySelectorAll("#poll button").forEach((b) => b.classList.remove("right", "wrong"));
    $("pollOut").textContent = "";
    renderV6();
  });
  $("poll").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    const right = b.dataset.a === "12.5";
    document.querySelectorAll("#poll button").forEach((x) => x.classList.remove("right", "wrong"));
    b.classList.add(right ? "right" : "wrong");
    document.querySelector('#poll button[data-a="12.5"]').classList.add("right");
    v6.highlight = 50; setF(0.5, "poll");
    renderV6();
    const pt = v6data.find((d) => d.k === "clean" && d.f === 50);
    $("pollOut").innerHTML = `${right ? "✓ Correct!" : "Not quite."} Answer: <b>12.5%</b>. Eve picks the wrong basis half the time (½), and then Bob's bit is wrong half the time (½): ½ × ½ × 50% = 12.5%. The simulation (big blue dot) shows <b>${pct(pt.qber, 2)}</b>.`;
  });
  fListeners.push(() => { if (v6data.length) v6chart.update(v6data); });

  /* =========================================================
   * View 7 — detection confidence
   * ======================================================= */
  const v7 = { m: 17, compare: new Set([25, 100]), mc: true, playing: false, raf: null, mcPts: [], mcTimer: null };
  const MC_M = [1, 2, 4, 8, 12, 17, 25, 35, 50, 70, 95, 120];
  const CMP_COL = { 10: "#94a3b8", 25: COL.teal, 100: COL.pred };
  const v7chart = (() => {
    const W = 660, H = 390, m = { l: 58, r: 22, t: 20, b: 52 };
    const svg = svgBox($("v7chart"), W, H);
    const MMAX = 120;
    const x = d3.scaleLinear().domain([0, MMAX]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(10).tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(10).tickFormat(d3.format(".0%")));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(10));
    svg.append("text").attr("class", "axis-title").attr("x", (m.l + W - m.r) / 2).attr("y", H - 12).attr("text-anchor", "middle").text("m: sifted bits Alice and Bob reveal and compare (bits)");
    svg.append("text").attr("class", "axis-title").attr("transform", `translate(16,${(m.t + H - m.b) / 2}) rotate(-90)`).attr("text-anchor", "middle").text("P(detect Eve)");
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0.99)).attr("y2", y(0.99)).attr("stroke", COL.bob).attr("stroke-dasharray", "7 5").attr("stroke-width", 1.4);
    svg.append("text").attr("x", W - m.r - 4).attr("y", y(0.99) + 15).attr("text-anchor", "end").attr("fill", COL.bob).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono, monospace").text("99% confidence");
    const curves = svg.append("g"), dots = svg.append("g"), mk = svg.append("g"), marks = svg.append("g");
    mk.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", COL.text).attr("stroke-opacity", 0.5).attr("stroke-dasharray", "3 4");
    mk.append("text").attr("y", H - m.b - 8).attr("fill", COL.text).attr("font-size", 12).attr("font-family", "IBM Plex Mono, monospace");
    const lbl = svg.append("g");
    function update(anim = true) {
      const fs = [{ f: Math.round(bb.f * 100), c: COL.eve, main: true }];
      [...v7.compare].sort((a, b) => a - b).forEach((f) => { if (f !== fs[0].f) fs.push({ f, c: CMP_COL[f] || COL.muted, main: false }); });
      const ms = d3.range(0, MMAX + 1, 1);
      const line = d3.line().x((d) => x(d.m)).y((d) => y(d.p)).curve(d3.curveMonotoneX);
      const data = fs.map((s) => ({ ...s, pts: ms.map((mm) => ({ m: mm, p: M.detectProb(s.f / 100, mm) })) }));
      const sel = curves.selectAll("path").data(data, (d) => (d.main ? "main" : "c" + d.f))
        .join((en) => en.append("path").attr("fill", "none").attr("d", (d) => line(d.pts)));
      sel.attr("stroke", (d) => d.c).attr("stroke-width", (d) => (d.main ? 3.2 : 1.8)).attr("opacity", (d) => (d.main ? 1 : 0.8));
      (anim ? sel.transition().duration(400) : sel).attr("d", (d) => line(d.pts));
      lbl.selectAll("text").data(data, (d) => (d.main ? "main" : "c" + d.f)).join("text")
        .attr("font-size", 11.5).attr("font-family", "IBM Plex Mono, monospace").attr("fill", (d) => d.c)
        .attr("x", (d) => { const m99 = M.bitsFor(d.f / 100, 0.99); return x(Math.min(isFinite(m99) ? m99 : MMAX, MMAX - 12)) + 4; })
        .attr("y", (d) => { const m99 = M.bitsFor(d.f / 100, 0.99); const mm = Math.min(isFinite(m99) ? m99 : MMAX, MMAX - 12); return y(M.detectProb(d.f / 100, mm)) + (d.main ? 16 : 30); })
        .text((d) => `f=${d.f}%`);
      dots.selectAll("circle").data(v7.mc ? v7.mcPts : [], (d) => d.m).join((en) => en.append("circle").attr("r", 0).attr("cx", (d) => x(d.m)).attr("cy", (d) => y(d.p)))
        .attr("fill", "none").attr("stroke", COL.text).attr("stroke-width", 1.6)
        .on("mousemove", (ev, d) => showTip(`<b>Monte Carlo</b><br>f = ${d.f}% · m = ${d.m}<br>caught Eve in ${Math.round(d.p * d.trials)} of ${d.trials} trials<br><b>${pct(d.p)}</b><br><span class="t">formula ${pct(M.detectProb(d.f / 100, d.m))}</span>`, ev))
        .on("mouseleave", hideTip)
        .transition().duration(400).attr("r", 5).attr("cx", (d) => x(d.m)).attr("cy", (d) => y(d.p));
      mk.select("line").attr("x1", x(v7.m)).attr("x2", x(v7.m));
      mk.select("text").attr("x", x(v7.m) + (v7.m > 90 ? -6 : 6)).attr("text-anchor", v7.m > 90 ? "end" : "start").text(`m = ${v7.m}`);
      marks.selectAll("circle").data(data, (d) => (d.main ? "main" : "c" + d.f)).join("circle")
        .attr("r", (d) => (d.main ? 6 : 4.5)).attr("fill", (d) => d.c).attr("stroke", "#090d1c").attr("stroke-width", 2)
        .attr("cx", x(v7.m)).attr("cy", (d) => y(M.detectProb(d.f / 100, v7.m)))
        .on("mousemove", (ev, d) => showTip(`f = ${d.f}% · m = ${v7.m}<br><b>P(detect) ${pct(M.detectProb(d.f / 100, v7.m), 2)}</b><br><span class="t">Eve survives ${pct(1 - M.detectProb(d.f / 100, v7.m), 2)}</span>`, ev))
        .on("mouseleave", hideTip);
    }
    return { update };
  })();
  function scheduleMC() {
    clearTimeout(v7.mcTimer);
    if (!v7.mc) { v7.mcPts = []; v7chart.update(false); return; }
    v7.mcTimer = setTimeout(() => {
      const f = bb.f;
      v7.mcPts = f <= 0 ? MC_M.map((m) => ({ m, p: 0, f: 0, trials: 400 })) :
        MC_M.map((m, i) => ({ m, f: Math.round(f * 100), trials: 400, p: M.detectMonteCarlo({ f, m, trials: 400, seed: 777 + i }) }));
      v7chart.update();
    }, 140);
  }
  function renderV7(anim = true) {
    const f = bb.f, F = Math.round(f * 100);
    $("v7fOut").textContent = F + "%";
    $("v7mOut").textContent = v7.m + " bits";
    const pd = M.detectProb(f, v7.m), m99 = M.bitsFor(f, 0.99);
    v7chart.update(anim);
    $("v7read").innerHTML =
      stat(`P(detect) at m = ${v7.m}`, pct(pd, 2), `f = ${F}%`, [{ v: pd, c: COL.bob }, { v: 1 - pd, c: "rgba(255,255,255,.1)" }]) +
      stat("Eve survives every check", pct(1 - pd, 2), `(1 − f/4)^m = ${(1 - f / 4).toFixed(3)}^${v7.m}`) +
      stat("bits needed for 99%", isFinite(m99) ? `${m99} bits` : "never", isFinite(m99) ? `≈ ${2 * m99} qubits sent, since about half are sifted` : "no spy, nothing to detect");
    $("v7answer").innerHTML = f <= 0
      ? `<span class="n">no spy</span>With f = 0 there is nothing to catch: P(detect) stays 0 for every m. This is a boundary case of the formula.`
      : `<span class="n">${m99} check bits</span>are enough to catch an Eve who taps <b>${F}%</b> of qubits with 99% confidence.` +
        (F === 100 ? " That matches the proposal's planned check: 1 − 0.75¹⁷ = 99.2%." : "");
  }
  $("v7f").addEventListener("input", (e) => setF(+e.target.value / 100, "v7"));
  $("v7m").addEventListener("input", (e) => { v7.m = +e.target.value; renderV7(false); });
  $("v7compare").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-f]"); if (!b) return;
    const f = +b.dataset.f;
    if (v7.compare.has(f)) v7.compare.delete(f); else v7.compare.add(f);
    b.classList.toggle("on", v7.compare.has(f)); renderV7();
  });
  $("v7mc").addEventListener("change", (e) => { v7.mc = e.target.checked; scheduleMC(); });
  $("v7play").addEventListener("click", () => {
    if (v7.playing) { v7.playing = false; cancelAnimationFrame(v7.raf); $("v7play").textContent = "▶ Play m"; return; }
    v7.playing = true; $("v7play").textContent = "⏸ Pause";
    const start = v7.m >= 120 ? 0 : v7.m, t0 = performance.now(), dur = ((120 - start) / 120) * 4500;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      v7.m = Math.round(start + (120 - start) * k); setRange($("v7m"), v7.m); renderV7(false);
      if (k < 1 && v7.playing) v7.raf = requestAnimationFrame(tick);
      else { v7.playing = false; $("v7play").textContent = "▶ Play m"; }
    };
    v7.raf = requestAnimationFrame(tick);
  });
  $("v7reset").addEventListener("click", () => {
    v7.playing = false; cancelAnimationFrame(v7.raf); $("v7play").textContent = "▶ Play m";
    v7.m = 17; setRange($("v7m"), 17); v7.compare = new Set([25, 100]);
    document.querySelectorAll("#v7compare button").forEach((b) => b.classList.toggle("on", v7.compare.has(+b.dataset.f)));
    setF(0.5, "v7");
  });
  fListeners.push((src) => {
    if (src !== "v7") setRange($("v7f"), Math.round(bb.f * 100));
    renderV7(); scheduleMC();
  });

  /* =========================================================
   * Model & data appendix
   * ======================================================= */
  function renderSample() {
    const rows = ex5.sim.rows.slice(0, 12);
    const B = (b) => (b === null ? '<span class="no">NULL</span>' : BASIS[b]);
    $("sampleTable").innerHTML = `<thead><tr><th>run_seed</th><th>idx</th><th>alice_bit</th><th>alice_basis</th><th>eve_on</th><th>eve_basis</th><th>eve_bit</th><th>bob_basis</th><th>bob_bit</th><th>noise_flip</th><th>sifted</th><th>error</th></tr></thead><tbody>` +
      rows.map((r) => `<tr><td>${bb.seed}</td><td>${r.idx}</td><td>${r.aBit}</td><td>${BASIS[r.aBasis]}</td><td>${+r.eveOn}</td><td>${B(r.eBasis)}</td><td>${r.eBit === null ? '<span class="no">NULL</span>' : r.eBit}</td><td>${BASIS[r.bBasis]}</td><td>${r.bBit}</td><td>${+r.flip}</td><td>${+r.sifted}</td><td>${+r.error}</td></tr>`).join("") + "</tbody>";
  }
  $("dlcsv").addEventListener("click", () => {
    const blob = new Blob([M.toCSV(ex5.sim, { seed: bb.seed })], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `qubit_events_seed${bb.seed}_N${bb.N}_f${Math.round(bb.f * 100)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("cpcsv").addEventListener("click", async () => {
    const txt = M.toCSV(ex5.sim, { seed: bb.seed });
    try { await navigator.clipboard.writeText(txt); $("csvMsg").textContent = `copied ${ex5.sim.N} rows`; }
    catch (e) { $("csvMsg").textContent = "copy blocked here; use Download instead"; }
  });
  $("runChecks").addEventListener("click", () => {
    const list = $("checks"); list.innerHTML = '<li><span class="badge info">…</span><span>running 2 million simulated qubits…</span></li>';
    setTimeout(() => {
      const t0 = performance.now(), out = [];
      const add = (status, name, d) => out.push({ status, name, d });
      // numerical: 200 seeds at full interception
      let inside = 0, S = 0, E = 0;
      for (let s = 1; s <= 200; s++) {
        const r = M.simulateBB84({ N: 10000, f: 1, p: 0, seed: s }), se = Math.sqrt((0.25 * 0.75) / r.sifted);
        inside += Math.abs(r.qber - 0.25) <= 1.96 * se; S += r.sifted; E += r.errors;
      }
      const pooled = E / S, sep = Math.sqrt((0.25 * 0.75) / S);
      add(Math.abs(pooled - 0.25) <= 1.96 * sep && inside >= 180 ? "pass" : "fail", "Full interception gives QBER ≈ 25% (200 seeds × 10,000 qubits)",
        `pooled ${pct(pooled, 2)} (expected 25% ± ${(196 * sep).toFixed(2)} pts); ${inside}/200 single runs inside their own 95% interval (expected ≈ 190)`);
      const r42 = M.simulateBB84({ N: 10000, f: 1, p: 0, seed: 42 });
      add(r42.sifted === 4995 && r42.errors === 1185 ? "pass" : "fail", "Browser matches the Python reference exactly (seed 42)",
        `JS sifted ${r42.sifted}, errors ${r42.errors}; Python sim/bb84_sim.py gives 4995 and 1185`);
      const r7 = M.simulateBB84({ N: 10000, f: 0.5, p: 0, seed: 7 });
      add(r7.sifted === 4988 && r7.errors === 619 ? "pass" : "fail", "Browser matches Python (seed 7, f = 50%)", `JS ${r7.sifted} / ${r7.errors}; Python 4988 / 619 · QBER ${pct(r7.qber, 2)} vs theory 12.5%`);
      add(Math.abs(M.probZ0(M.blochVector(PI / 3, 0)) - 0.75) < 1e-12 ? "pass" : "fail", "P(0) at θ = π/3 is 75%", `cos²(π/6) = ${M.probZ0(M.blochVector(PI / 3, 0)).toFixed(6)}`);
      const h2 = M.applyGate(M.applyGate({ x: 0.3, y: 0.5, z: Math.sqrt(1 - 0.34) }, "H"), "H");
      add(Math.abs(h2.x - 0.3) < 1e-12 && Math.abs(h2.y - 0.5) < 1e-12 ? "pass" : "fail", "H applied twice returns the original state", `(${h2.x.toFixed(6)}, ${h2.y.toFixed(6)}, ${h2.z.toFixed(6)})`);
      const h0 = M.applyGate({ x: 0, y: 0, z: 1 }, "H");
      add(Math.abs(h0.x - 1) < 1e-12 ? "pass" : "fail", "H|0⟩ = |+⟩ with Bloch vector (1, 0, 0)", `(${f3(h0.x)}, ${f3(h0.y)}, ${f3(h0.z)})`);
      add(Math.abs(M.detectProb(1, 17) - 0.99248) < 1e-4 ? "pass" : "fail", "Detection with m = 17 at f = 100%", `1 − 0.75¹⁷ = ${pct(M.detectProb(1, 17), 2)} · bits for 99% = ${M.bitsFor(1, 0.99)}`);
      // boundary cases
      const z = M.simulateBB84({ N: 10000, f: 0, p: 0, seed: 123 });
      add(z.errors === 0 ? "pass" : "fail", "BOUNDARY f = 0, p = 0 → exactly 0 errors", `${z.errors} errors in ${z.sifted} sifted bits`);
      const one = M.simulateBB84({ N: 1, f: 0, p: 0, seed: 2 });
      add(one.sifted === 0 && one.qber === null ? "pass" : "fail", "BOUNDARY N = 1 with an empty sifted key → QBER shown as n/a", `sifted ${one.sifted}, QBER ${pct(one.qber)}`);
      add(M.probZ0(M.blochVector(0, 0)) === 1 && M.probZ0(M.blochVector(PI, 0)) < 1e-15 ? "pass" : "fail", "BOUNDARY θ = 0 and θ = π → P(0) = 100% and 0%; φ undefined", `φ at the pole: ${M.anglesFromVector({ x: 0, y: 0, z: 1 }).phi === null ? "null (shown as n/a)" : "defined"}`);
      add(M.detectProb(1, 0) === 0 && M.detectProb(0, 200) === 0 ? "pass" : "fail", "BOUNDARY m = 0 or f = 0 → P(detect) = 0", "both give 0%");
      const t = performance.now() - t0;
      list.innerHTML = out.map((o, i) => `<li style="animation-delay:${i * 45}ms"><span class="badge ${o.status}">${o.status.toUpperCase()}</span><span>${o.name}<span class="d">${o.d}</span></span></li>`).join("");
      $("checkTime").textContent = `${out.filter((o) => o.status === "pass").length}/${out.length} passed in ${t.toFixed(0)} ms`;
    }, 30);
  });

  /* =========================================================
   * Nav, reveal, progress
   * ======================================================= */
  const links = [...document.querySelectorAll(".steps a")];
  const secs = links.map((a) => $(a.dataset.v));
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); });
  }, { threshold: 0.06 });
  document.querySelectorAll(".view, .model").forEach((s) => io.observe(s));
  function onScroll() {
    const mid = innerHeight * 0.35;
    let cur = null;
    secs.forEach((s, i) => { const r = s.getBoundingClientRect(); if (r.top < mid && r.bottom > mid) cur = i; });
    links.forEach((a, i) => a.classList.toggle("active", i === cur));
    const h = document.documentElement;
    $("progressBar").style.width = (100 * h.scrollTop) / Math.max(1, h.scrollHeight - h.clientHeight) + "%";
  }
  addEventListener("scroll", onScroll, { passive: true });

  /* ---------- initial render ---------- */
  setQubit(PI / 4, 0);
  v3restart(); v3render();
  syncBB();
  ex5.pickDefault();
  setF(0.5, "init");
  renderV6();
  onScroll();
  window.__app = { qubit, bb, setQubit, setF, ex4, ex5, v6, v7 };
})();
