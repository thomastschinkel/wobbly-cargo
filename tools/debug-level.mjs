// Dev helper: run one level with the autopilot and print what went wrong.
// Usage: node tools/debug-level.mjs <id> [speedMul]
import { Sim } from '../src/game/sim.js';
import { Bot } from '../src/game/bot.js';
import { LEVELS } from '../src/game/levels.js';
import { dailyLevel } from '../src/game/daily.js';

const id = process.argv[2];
const mul = Number(process.argv[3] || 1);
const lvl = id.includes('-') ? dailyLevel(id) : LEVELS[Number(id) - 1];
const sim = new Sim(lvl);
const bot = new Bot(sim, mul);
// op x positions
{
  let s = '';
  for (const o of sim.track.objects) s += `${o.type}@${(o.x ?? o.x0 ?? o.ax ?? o.trigger).toFixed(0)} `;
  for (const p of sim.track.pits) s += `pit[${p.x0.toFixed(0)}-${p.x1.toFixed(0)}] `;
  console.log('finishX', sim.track.finishX.toFixed(0), s);
}
let lastLog = 0;
while (sim.state === 'play' && sim.time < 200) {
  sim.step(bot.input());
  for (const e of sim.events) {
    if (['lost', 'break', 'fail', 'finish', 'explode', 'bonk'].includes(e.type)) {
      const p = sim.truck.chassis.getPosition();
      console.log(sim.time.toFixed(2), e.type, e.cargo || '', e.reason || '', 'truckX', p.x.toFixed(1), 'v', sim.fwdSpeed().toFixed(1), 'ang', sim.truck.chassis.getAngle().toFixed(2));
    }
  }
  sim.events.length = 0;
  if (process.argv.includes('--trace') && sim.time - lastLog > 0.5) {
    lastLog = sim.time;
    const p = sim.truck.chassis.getPosition();
    console.log('  t', sim.time.toFixed(1), 'x', p.x.toFixed(1), 'y', p.y.toFixed(1), 'v', sim.fwdSpeed().toFixed(1), 'a', sim.truck.chassis.getAngle().toFixed(2), 'g', sim.grounded ? 1 : 0);
  }
}
console.log('end', sim.state, sim.failReason, 'time', sim.time.toFixed(1));
