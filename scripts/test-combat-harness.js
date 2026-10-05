// Combat sweep harness regression test (hunter loop 2026-10-05).
// The sweep's bot used to soft-lock: it re-struck on a spent turn forever
// ("Already acted this turn." x200 -> GUARD, result=null), fought unarmed
// (understating the hunter build ~3x and hiding fleeAt/routed dynamics), and
// could spawn monsters in walled-off pockets (fake 101-round stalemates).
// This test runs the real sweep core once per monster and asserts every
// fight actually resolves.
const sim = require('./simulate-combat.js');
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  const ids = Game.data.monsters.map(m => m.id);
  ok('20 monsters in sweep', ids.length === 20, `got ${ids.length}`);

  const bad = [];
  for (const id of ids) {
    let st;
    try {
      st = sim.runCombat(id);
    } catch (e) {
      fail++;
      console.log(`FAIL ${id} threw: ${e.message}`);
      continue;
    }
    // the fight must RESOLVE — the old bot left result=null via the
    // "Already acted this turn" GUARD loop
    const resolved = ['won', 'lost', 'routed', 'fled'].includes(st.result);
    if (!resolved || st.guard) bad.push(`${id}: result=${st.result} rounds=${st.rounds} guard=${!!st.guard}`);
    else pass++;
  }
  if (bad.length) { fail++; console.log('FAIL unresolved fights:\n  ' + bad.join('\n  ')); }

  // the sweep models the hunter build: spear equipped (range 2, +25), so
  // fleeAt/routed dynamics and real TTK show up in the numbers
  sim.setup();
  const w = Game.equippedWeapon();
  ok('sweep equips the hunter spear', w && w.range === 2 && w.bonus === 25,
    `got range=${w && w.range} bonus=${w && w.bonus}`);

  // spawns must be path-connected (unreachable pockets fake stalemates)
  sim.setup();
  const s = Game.state.scholar;
  let connected = 0;
  for (let t = 0; t < 10; t++) {
    const c = sim.freeCell();
    if (Game.findPath(s.mx, s.my, c.x, c.y)) connected++;
  }
  ok('freeCell usually yields connected cells', connected >= 7, `${connected}/10 connected`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
