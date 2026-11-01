/*
 * model.js — the scientific model behind every view.
 *
 * SIMULATION: values come from an idealized model of single qubits and the
 * BB84 protocol, not from real quantum hardware.
 *
 * The same algorithm (same random generator, same draw order) is implemented
 * in sim/bb84_sim.py, so a given seed gives identical counts in Python and JS.
 * Works in the browser (window.QModel) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.QModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- seeded random numbers (mulberry32) ---------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- single qubit ---------- */
  // |psi> = cos(theta/2)|0> + e^{i phi} sin(theta/2)|1>
  function blochVector(theta, phi) {
    return {
      x: Math.sin(theta) * Math.cos(phi),
      y: Math.sin(theta) * Math.sin(phi),
      z: Math.cos(theta),
    };
  }
  function anglesFromVector(v) {
    const n = Math.hypot(v.x, v.y, v.z) || 1;
    const z = Math.max(-1, Math.min(1, v.z / n));
    const theta = Math.acos(z);
    let phi = Math.atan2(v.y, v.x);
    if (phi < 0) phi += 2 * Math.PI;
    const atPole = Math.abs(Math.sin(theta)) < 1e-9;
    return { theta, phi: atPole ? null : phi }; // phi undefined at the poles
  }
  // P(0) in the Z basis and P(+) in the X basis
  function probZ0(v) { return (1 + v.z) / 2; }       // = cos^2(theta/2)
  function probXplus(v) { return (1 + v.x) / 2; }

  // Gates act on the Bloch vector as 180 degree rotations about an axis.
  const GATES = {
    H: { axis: { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 }, angle: Math.PI, label: "Hadamard" },
    X: { axis: { x: 1, y: 0, z: 0 }, angle: Math.PI, label: "Bit flip" },
    Z: { axis: { x: 0, y: 0, z: 1 }, angle: Math.PI, label: "Phase flip" },
  };
  // Rodrigues rotation of v about unit axis k by angle a
  function rotate(v, k, a) {
    const c = Math.cos(a), s = Math.sin(a);
    const dot = k.x * v.x + k.y * v.y + k.z * v.z;
    const cx = k.y * v.z - k.z * v.y, cy = k.z * v.x - k.x * v.z, cz = k.x * v.y - k.y * v.x;
    return {
      x: v.x * c + cx * s + k.x * dot * (1 - c),
      y: v.y * c + cy * s + k.y * dot * (1 - c),
      z: v.z * c + cz * s + k.z * dot * (1 - c),
    };
  }
  function applyGate(v, g) { return rotate(v, GATES[g].axis, GATES[g].angle); }

  // BB84 encoding: basis 0 = Z (rectilinear "+"), 1 = X (diagonal "x")
  function encodedState(bit, basis) {
    if (basis === 0) return bit === 0 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 0, z: -1 };
    return bit === 0 ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 };
  }
  const STATE_NAMES = [["|0⟩", "|1⟩"], ["|+⟩", "|−⟩"]];

  /* ---------- BB84 simulation ---------- */
  // Exactly 8 random draws per qubit, in a fixed order, regardless of branch.
  function simulateBB84({ N, f, p, seed }) {
    const r = mulberry32(seed);
    const rows = new Array(N);
    let sifted = 0, errors = 0;
    for (let i = 0; i < N; i++) {
      const aBit = r() < 0.5 ? 1 : 0;
      const aBasis = r() < 0.5 ? 1 : 0;
      const eveOn = r() < f;
      const eBasisDraw = r() < 0.5 ? 1 : 0;
      const eRand = r() < 0.5 ? 1 : 0;
      const bBasis = r() < 0.5 ? 1 : 0;
      const bRand = r() < 0.5 ? 1 : 0;
      const flip = r() < p;

      let sentBit = aBit, sentBasis = aBasis, eBit = null, eBasis = null;
      if (eveOn) {
        eBasis = eBasisDraw;
        eBit = eBasis === aBasis ? aBit : eRand; // wrong basis -> random result
        sentBit = eBit; sentBasis = eBasis;     // Eve resends what she saw
      }
      let bBit = bBasis === sentBasis ? sentBit : bRand;
      if (flip) bBit ^= 1;                       // channel noise
      const isSifted = aBasis === bBasis;
      const isError = isSifted && aBit !== bBit;
      if (isSifted) sifted++;
      if (isError) errors++;
      rows[i] = { idx: i, aBit, aBasis, eveOn, eBasis, eBit, bBasis, bBit, flip, sifted: isSifted, error: isError };
    }
    return { rows, N, sifted, errors, qber: sifted > 0 ? errors / sifted : null };
  }

  // Expected QBER: Eve's error e = f/4, then independent noise p flips the bit.
  // An error remains if exactly one of (Eve error, noise flip) happens.
  function theoryQBER(f, p) { const e = f / 4; return e + p - 2 * e * p; }

  // Probability of detecting Eve after checking m sifted bits (p = 0)
  function detectProb(f, m) { return m <= 0 ? 0 : 1 - Math.pow(1 - f / 4, m); }
  function bitsFor(f, target) {
    const e = f / 4;
    if (e <= 0) return Infinity;
    if (e >= 1) return 1;
    return Math.ceil(Math.log(1 - target) / Math.log(1 - e));
  }

  // Monte Carlo: how often does checking m sifted bits reveal Eve (p = 0)?
  function detectMonteCarlo({ f, m, trials, seed }) {
    const r = mulberry32(seed);
    let hits = 0;
    for (let t = 0; t < trials; t++) {
      let checked = 0, caught = false;
      while (checked < m) {
        const aBit = r() < 0.5 ? 1 : 0, aBasis = r() < 0.5 ? 1 : 0, eveOn = r() < f;
        const eBasis = r() < 0.5 ? 1 : 0, eRand = r() < 0.5 ? 1 : 0;
        const bBasis = r() < 0.5 ? 1 : 0, bRand = r() < 0.5 ? 1 : 0; r(); // keep 8 draws
        if (aBasis !== bBasis) continue;
        let sb = aBit, sbas = aBasis;
        if (eveOn) { sb = eBasis === aBasis ? aBit : eRand; sbas = eBasis; }
        const bBit = bBasis === sbas ? sb : bRand;
        checked++;
        if (bBit !== aBit) { caught = true; break; }
      }
      if (caught) hits++;
    }
    return hits / trials;
  }

  // Pool counts across runs (never average percentages of unequal runs)
  function pooledQBER(runs) {
    let s = 0, e = 0;
    for (const r of runs) { s += r.sifted; e += r.errors; }
    if (s === 0) return { sifted: 0, errors: 0, qber: null, se: null };
    const q = e / s;
    return { sifted: s, errors: e, qber: q, se: Math.sqrt((q * (1 - q)) / s) };
  }

  function toCSV(result, meta) {
    const head = "run_seed,idx,alice_bit,alice_basis,eve_on,eve_basis,eve_bit,bob_basis,bob_bit,noise_flip,sifted,error";
    const B = (b) => (b === null ? "NULL" : b === 0 ? "Z" : "X");
    const lines = result.rows.map((r) =>
      [meta.seed, r.idx, r.aBit, B(r.aBasis), +r.eveOn, B(r.eBasis), r.eBit === null ? "NULL" : r.eBit,
        B(r.bBasis), r.bBit, +r.flip, +r.sifted, +r.error].join(","));
    return head + "\n" + lines.join("\n") + "\n";
  }

  return {
    mulberry32, blochVector, anglesFromVector, probZ0, probXplus, GATES, rotate, applyGate,
    encodedState, STATE_NAMES, simulateBB84, theoryQBER, detectProb, bitsFor,
    detectMonteCarlo, pooledQBER, toCSV,
  };
});
