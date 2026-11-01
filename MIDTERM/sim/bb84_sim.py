"""
bb84_sim.py  --  reference simulation of single qubits and the BB84 protocol.

SIMULATION: an idealized model (ideal single photons, no loss, intercept and
resend eavesdropper, independent bit flip noise). Not real hardware data.

Uses the same seeded generator (mulberry32) and the same 8 draws per qubit as
js/model.js, so the browser and Python produce identical counts for a seed.

Usage:
    python3 sim/bb84_sim.py            # writes CSV files into sim/output/
"""
from __future__ import annotations

import csv
import math
import os
from dataclasses import dataclass

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
MASK = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & MASK


def mulberry32(seed: int):
    """Port of the JavaScript mulberry32 generator (32 bit unsigned math)."""
    state = seed & MASK

    def rnd() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & MASK
        a = state
        t = _imul(a ^ (a >> 15), a | 1)
        t = ((t + _imul(t ^ (t >> 7), t | 61)) & MASK) ^ t
        return ((t ^ (t >> 14)) & MASK) / 4294967296

    return rnd


@dataclass
class Row:
    run_seed: int
    idx: int
    alice_bit: int
    alice_basis: str
    eve_on: int
    eve_basis: str | None
    eve_bit: int | None
    bob_basis: str
    bob_bit: int
    noise_flip: int
    sifted: int
    error: int


def simulate_bb84(N: int, f: float, p: float, seed: int) -> list[Row]:
    r = mulberry32(seed)
    B = "ZX"
    rows: list[Row] = []
    for i in range(N):
        a_bit = 1 if r() < 0.5 else 0
        a_basis = 1 if r() < 0.5 else 0
        eve_on = r() < f
        e_basis_draw = 1 if r() < 0.5 else 0
        e_rand = 1 if r() < 0.5 else 0
        b_basis = 1 if r() < 0.5 else 0
        b_rand = 1 if r() < 0.5 else 0
        flip = r() < p

        sent_bit, sent_basis, e_bit, e_basis = a_bit, a_basis, None, None
        if eve_on:
            e_basis = e_basis_draw
            e_bit = a_bit if e_basis == a_basis else e_rand
            sent_bit, sent_basis = e_bit, e_basis
        b_bit = sent_bit if b_basis == sent_basis else b_rand
        if flip:
            b_bit ^= 1
        sifted = a_basis == b_basis
        error = sifted and a_bit != b_bit
        rows.append(Row(seed, i, a_bit, B[a_basis], int(eve_on),
                        None if e_basis is None else B[e_basis], e_bit,
                        B[b_basis], b_bit, int(flip), int(sifted), int(error)))
    return rows


def summarize(rows: list[Row]) -> dict:
    s = sum(r.sifted for r in rows)
    e = sum(r.error for r in rows)
    return {"N": len(rows), "sifted": s, "errors": e, "qber": (e / s) if s else None}


def theory_qber(f: float, p: float) -> float:
    e = f / 4
    return e + p - 2 * e * p


def write_rows(path: str, rows: list[Row], scenario: str | None = None) -> None:
    cols = list(Row.__dataclass_fields__)
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow((["scenario"] if scenario else []) + cols)
        for row in rows:
            vals = ["NULL" if getattr(row, c) is None else getattr(row, c) for c in cols]
            w.writerow(([scenario] if scenario else []) + vals)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)

    # 1) One full run used for sample records (View 5 default: N=24, f=50%, seed 42)
    write_rows(os.path.join(OUT, "sample_run_seed42.csv"), simulate_bb84(24, 0.5, 0.0, 42))

    # 2) Scenario sweep used for the QBER chart and the SQL aggregation
    #    4 scenarios x 11 interception levels x 5 repeated runs x N = 2000
    scenarios = {"clean_channel": 0.0, "noisy_channel_2pct": 0.02}
    path = os.path.join(OUT, "qubit_events_sweep.csv")
    first = True
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        for name, p in scenarios.items():
            for k, f_pct in enumerate(range(0, 101, 10)):
                for rep in range(5):
                    seed = 1000 + 100 * k + rep + (0 if p == 0 else 50)
                    rows = simulate_bb84(2000, f_pct / 100, p, seed)
                    cols = list(Row.__dataclass_fields__)
                    if first:
                        w.writerow(["scenario", "f_pct", "p_pct"] + cols)
                        first = False
                    for row in rows:
                        vals = ["NULL" if getattr(row, c) is None else getattr(row, c) for c in cols]
                        w.writerow([name, f_pct, round(p * 100, 1)] + vals)
    print("wrote", path)


if __name__ == "__main__":
    main()
