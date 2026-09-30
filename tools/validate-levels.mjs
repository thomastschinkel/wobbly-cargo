// Headless validation: the autopilot must be able to deliver every level
// (and a large sample of daily challenges). Prints a compact table.
// Usage: node tools/validate-levels.mjs [--levels 1,2,3] [--daily N] [--verbose]
import { Sim } from '../src/game/sim.js';
import { runBot } from '../src/game/bot.js';
import { LEVELS } from '../src/game/levels.js';
import { dailyLevel } from '../src/game/daily.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const only = opt('--levels', null);
const dailyN = Number(opt('--daily', 40));
const verbose = args.includes('--verbose');
const MULS = [0.8, 0.9, 1.0, 1.1];

function evalLevel(lvl) {
  const res = MULS.map((m) => runBot(new Sim(lvl), m, 200));
  const full = res.filter((r) => r.state === 'finished' && r.delivered === r.total);
  const ok = res.filter((r) => r.state === 'finished');
  const best = ok.length ? Math.min(...ok.map((r) => r.time)) : null;
  return { res, full: full.length, ok: ok.length, best };
}

let failures = 0;
const ids = only ? only.split(',').map(Number) : LEVELS.map((l) => l.id);
const t0 = Date.now();
for (const id of ids) {
  const lvl = LEVELS[id - 1];
  const e = evalLevel(lvl);
  const bad = e.ok < 2 || e.full < 1;
  if (bad) failures++;
  const cols = e.res.map((r) => (r.state === 'finished' ? `${r.delivered}/${r.total} ${r.time.toFixed(1)}s` : `${r.reason}@${Math.round((r.x / r.finishX) * 100)}%`).padEnd(14)).join(' ');
  const parNote = e.best != null ? `par ${lvl.par} best ${e.best.toFixed(1)}` : '';
  console.log(`${bad ? 'FAIL' : ' ok '} ${String(id).padStart(2)} ${lvl.name.padEnd(18)} ${cols} ${parNote}`);
  if (verbose && bad) console.log('   ', JSON.stringify(e.res));
}

if (dailyN > 0 && !only) {
  let dFail = 0;
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < dailyN; i++) {
    const d = new Date(start + i * 86400000 * 7.3);
    const key = d.toISOString().slice(0, 10);
    const lvl = dailyLevel(key);
    const res = [0.9, 1.0].map((m) => runBot(new Sim(lvl), m, 220));
    const ok = res.some((r) => r.state === 'finished');
    if (!ok) {
      dFail++;
      console.log(`FAIL daily ${key}`, res.map((r) => `${r.state}/${r.reason}@${Math.round((r.x / r.finishX) * 100)}%`).join(' '), JSON.stringify(lvl.ops));
    }
  }
  console.log(`daily: ${dailyN - dFail}/${dailyN} deliverable`);
  if (dFail) failures++;
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${failures ? failures + ' problem(s)' : 'all good'}`);
process.exit(failures ? 1 : 0);
