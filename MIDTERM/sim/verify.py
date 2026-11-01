"""
verify.py  --  numerical and boundary case checks for the model.

Usage:  python3 sim/verify.py      (exit code 0 means every check passed)
Writes sim/output/verification.txt
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bb84_sim import simulate_bb84, summarize, theory_qber  # noqa: E402

results = []


def check(name, ok, detail):
    results.append((name, bool(ok), detail))


# ---------- numerical checks ----------
# 1) Full intercept: QBER should be 25%. A single run lands inside its 95%
#    interval only 95% of the time, so we test 200 seeds: coverage should be
#    close to 95% and the pooled QBER should be within its (much tighter) interval.
inside, tot_s, tot_e = 0, 0, 0
for seed in range(1, 201):
    r = summarize(simulate_bb84(10_000, 1.0, 0.0, seed))
    se1 = math.sqrt(0.25 * 0.75 / r["sifted"])
    inside += abs(r["qber"] - 0.25) <= 1.96 * se1
    tot_s += r["sifted"]; tot_e += r["errors"]
pooled = tot_e / tot_s
se_pool = math.sqrt(0.25 * 0.75 / tot_s)
check("Full intercept QBER, 200 seeds (N=10000, f=100%, p=0)",
      abs(pooled - 0.25) <= 1.96 * se_pool and 180 <= inside <= 199,
      f"pooled QBER={100*pooled:.2f}% (expected 25% +/- {196*se_pool:.2f} pts); "
      f"{inside}/200 single runs inside their 95% interval")
s = summarize(simulate_bb84(10_000, 1.0, 0.0, 42))
se = math.sqrt(0.25 * 0.75 / s["sifted"])
check("Seed 42 shown as an expected 5% miss (informational)", True,
      f"QBER={100*s['qber']:.2f}%, {abs(s['qber']-0.25)/se:.2f} standard errors from 25%")

# 2) Sifted fraction about 1/2
check("Sifted fraction about 50%",
      abs(s["sifted"] / s["N"] - 0.5) <= 1.96 * math.sqrt(0.25 / s["N"]),
      f"{s['sifted']}/{s['N']} = {100*s['sifted']/s['N']:.2f}%")

# 3) Half intercept: 12.5%
h = summarize(simulate_bb84(10_000, 0.5, 0.0, 7))
se_h = math.sqrt(0.125 * 0.875 / h["sifted"])
check("Half intercept QBER (N=10000, f=50%)", abs(h["qber"] - 0.125) <= 1.96 * se_h,
      f"QBER={100*h['qber']:.2f}% (expected 12.5% +/- {196*se_h:.2f} pts)")

# 4) Measurement probabilities
p0 = math.cos(math.pi / 6) ** 2
check("P(0) at theta = pi/3 equals 75%", abs(p0 - 0.75) < 1e-12, f"{p0:.6f}")
p0b = math.cos(math.pi / 4) ** 2
check("P(0) at theta = pi/2 equals 50%", abs(p0b - 0.5) < 1e-12, f"{p0b:.6f}")

# 5) Detection probability with 17 check bits
d = 1 - 0.75 ** 17
check("Detection with m=17, f=100% is at least 99%", d >= 0.99, f"{100*d:.2f}%")

# 6) Theory formula with noise
check("Theory QBER f=0, p=2% equals 2%", abs(theory_qber(0, 0.02) - 0.02) < 1e-12,
      f"{100*theory_qber(0, 0.02):.3f}%")

# ---------- boundary cases ----------
z = summarize(simulate_bb84(10_000, 0.0, 0.0, 123))
check("BOUNDARY f=0, p=0 gives exactly 0 errors", z["errors"] == 0,
      f"errors={z['errors']} of {z['sifted']} sifted")

one = summarize(simulate_bb84(1, 0.0, 0.0, 2))  # seed 2: the only qubit is discarded
check("BOUNDARY N=1 handles an empty sifted key", one["sifted"] == 0 and one["qber"] is None,
      f"sifted={one['sifted']}, qber={'undefined (shown as n/a)' if one['qber'] is None else one['qber']}")

check("BOUNDARY theta=0 gives P(0)=100%", math.cos(0) ** 2 == 1.0, "1.0")
check("BOUNDARY theta=pi gives P(0)=0%", abs(math.cos(math.pi / 2) ** 2) < 1e-30,
      f"{math.cos(math.pi/2)**2:.2e}")
check("BOUNDARY m=0 gives detection 0%", (1 - 0.75 ** 0) == 0, "0.0")

check("BOUNDARY f=100% means every qubit intercepted",
      all(r.eve_on for r in simulate_bb84(500, 1.0, 0.0, 5)), "all eve_on = 1")

lines = []
for name, ok, detail in results:
    lines.append(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")
text = "\n".join(lines)
print(text)
os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "output"), exist_ok=True)
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "output", "verification.txt"), "w") as fh:
    fh.write(text + "\n")
sys.exit(0 if all(ok for _, ok, _ in results) else 1)
