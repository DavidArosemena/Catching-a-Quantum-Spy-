// cross_check.mjs -- confirms the browser model (js/model.js) gives exactly the
// same counts as the Python reference (sim/bb84_sim.py) for the same seeds.
// Usage: node tests/cross_check.mjs
import { createRequire } from "module";
import { execFileSync } from "child_process";
const require = createRequire(import.meta.url);
const M = require("../js/model.js");

const cases = [
  { N: 10000, f: 1.0, p: 0.0, seed: 42 },
  { N: 10000, f: 0.5, p: 0.0, seed: 7 },
  { N: 5000, f: 0.3, p: 0.02, seed: 2026 },
  { N: 24, f: 0.5, p: 0.0, seed: 42 },
];
const py = `
import json,sys
sys.path.insert(0,'sim')
from bb84_sim import simulate_bb84, summarize
cases=json.loads(sys.argv[1])
print(json.dumps([summarize(simulate_bb84(c['N'],c['f'],c['p'],c['seed'])) for c in cases]))`;
const pyOut = JSON.parse(execFileSync("python3", ["-c", py, JSON.stringify(cases)]).toString());
let ok = true;
cases.forEach((c, i) => {
  const js = M.simulateBB84(c);
  const same = js.sifted === pyOut[i].sifted && js.errors === pyOut[i].errors;
  ok = ok && same;
  console.log(`${same ? "MATCH" : "DIFF "} N=${c.N} f=${c.f} p=${c.p} seed=${c.seed}  JS ${js.sifted}/${js.errors}  PY ${pyOut[i].sifted}/${pyOut[i].errors}`);
});
process.exit(ok ? 0 : 1);
