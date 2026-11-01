# Catching a Quantum Spy

**Can a spy read a quantum message without getting caught?**
An interactive scientific story about qubits, the Bloch sphere, and BB84 quantum key distribution.

CPS 5745 Interactive Information Visualization, Midterm Project. David Arosemena, Kean University, Fall 2026.

> **Simulation.** Every value comes from an idealized, documented model of single qubits and the BB84 protocol (Bennett & Brassard, 1984), not from real quantum hardware.

## The seven views

| # | Act | View | Main variables | Key interactions |
|---|-----|------|----------------|------------------|
| 1 | Beginning | A qubit is a point on a sphere (3D) | θ, φ | drag the arrow tip, sliders, named states, orbit, reset |
| 2 | Beginning | Measuring turns an arrow into odds | θ, shots S, basis | measure ×1 / ×100 / ×1000, basis toggle, hover bars, reset |
| 3 | Middle | Gates rotate the qubit (3D animation) | gate sequence, basis | build a circuit, play / pause / step, reset |
| 4 | Middle | The BB84 key exchange | N, seed | play / pause / step / finish, speed, click a row to inspect, reset |
| 5 | Middle | Enter Eve: intercept and resend | f, N | f slider, filter rows (errors only, etc.), click a row for side-by-side spheres |
| 6 | Ending | The error rate reveals the spy | f, p, N, R | noise and sample sliders, scenario toggles, hover points, class question |
| 7 | Ending | How many bits until we're sure? | f, m | f and m sliders, compare curves, play m, Monte Carlo dots, reset |

The views share model parameters: the qubit (θ, φ) links Views 1–3, the BB84 run (seed, N) links Views 4–5, and Eve's interception rate f links Views 5–7.

## How to launch

The visualization is a static website with no build step and no install.

**Option A: open the live site.** See the link in the report.

**Option B: run it locally** (any computer with Python 3):

```bash
cd catching-a-quantum-spy
python3 -m http.server 8000
# then open http://localhost:8000 in Chrome, Edge, Firefox or Safari
```

You can also just double click `index.html`. Everything works offline except the IBM Plex web fonts, which fall back to system fonts.

**Option C: deploy on Vercel.** Push this folder to GitHub, import the repo in Vercel, choose "Other" as the framework, leave the build command empty, and set the output directory to the folder that contains `index.html`.

## Reproduce the data and checks

Requires Python 3.9+ (standard library only) and, for the cross check, Node 18+.

```bash
python3 sim/bb84_sim.py     # writes sim/output/qubit_events_sweep.csv (220,000 rows) and a sample run
python3 sim/aggregate.py    # loads the CSV into SQLite, runs sim/aggregate.sql -> sim/output/qber_by_scenario.csv
python3 sim/verify.py       # numerical and boundary-case checks -> sim/output/verification.txt
node tests/cross_check.mjs  # confirms the browser model gives identical counts to Python
```

The same checks also run inside the page: scroll to **Model, data, and verification** and press **Run all checks**.

## Project structure

```
index.html              the story (7 views + model appendix)
css/style.css           design
js/model.js             the scientific model (shared by browser and Node)
js/bloch.js             dependency-free 3D Bloch sphere renderer (Canvas 2D)
js/app.js               views, interactions, shared state
vendor/d3.min.js        D3 v7.9.0 (ISC license)
sim/bb84_sim.py         Python reference simulator (same RNG and draw order as model.js)
sim/aggregate.sql/.py   SQLite aggregation: pooled QBER with 95% intervals
sim/verify.py           numerical + boundary checks
sim/output/             generated CSVs and verification log
tests/cross_check.mjs   JS vs Python identical-count check
tests/smoke.py          browser test that also captures the report screenshots (Playwright)
screenshots/            labeled screenshots of every view
```

## Model summary

* Qubit: |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩, Bloch vector r = (sinθ cosφ, sinθ sinφ, cosθ), P(0) = cos²(θ/2).
* Gates H, X, Z are 180° rotations of r about (x+z)/√2, x, and z.
* BB84: per qubit, 8 seeded draws (Alice bit, Alice basis, Eve on?, Eve basis, Eve coin, Bob basis, Bob coin, noise flip).
* QBER = e + p − 2ep with e = f/4. Detection after m check bits (p = 0): 1 − (1 − f/4)^m.
* Assumptions: ideal single photons, no loss, intercept-and-resend attacker only, independent bit-flip noise, authenticated classical channel.

## References

* C. H. Bennett and G. Brassard, "Quantum cryptography: Public key distribution and coin tossing," 1984. Reprint: https://doi.org/10.1016/j.tcs.2014.05.025
* P. W. Shor and J. Preskill, "Simple proof of security of the BB84 quantum key distribution protocol," Phys. Rev. Lett. 85, 441, 2000.
* M. A. Nielsen and I. L. Chuang, *Quantum Computation and Quantum Information*, Cambridge, 2010.
* NIST FIPS 203, 2024. https://doi.org/10.6028/NIST.FIPS.203
* IBM Quantum Learning. https://learning.quantum.ibm.com

AI assistance (Claude, Anthropic) was used to draft code and text. The author verified the model with the checks above.
