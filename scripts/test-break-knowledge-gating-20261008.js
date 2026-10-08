// BREAK-IT knowledge: EXPLOIT + HONESTY — the level-0 codex leak.
// BEFORE: eating an unknown plant creates a level-0 codex.plants entry, and
// codexEntries() maps EVERY key with `lvl = e.level || 1` — so a plant you
// never identified shows up in the Codex with its TRUE NAME, L1 badge, and
// full codex text. "If you don't know, it doesn't show" — broken by one bite.
// AFTER: codexEntries() filters to level >= 1; the prep knowledge stays in
// the honest eat-time say-line where it belongs.
'use strict';
const h = require('./break-monsters-harness.js');

async function main() {
  const G = await h.freshGame(1101);
  const s = G.state.scholar;
  const sayLog = [];
  G.say = m => sayLog.push(String(m));
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };

  const p = G.data.plants.find(x => !G.plantKnown(x.id) && !(G.state.codex.plants || {})[x.id]);
  const pid = p.id;
  check('G0 test plant starts unknown', !G.plantKnown(pid), pid);

  s.kcal = 500;
  s.inventory.push({ name: 'Unknown greens', units: 3, kcalEach: 60, plantId: pid, unit: 'handful', spoilDay: 99 });
  G.eatOne(s.inventory.length - 1);

  const entry = (G.state.codex.plants || {})[pid] || {};
  check('G1 eating creates a level-0 entry (not identified)', entry.level === 0, `level=${entry.level}`);
  check('G2 plantKnown still false', G.plantKnown(pid) === false);

  const leaked = (G.codexEntries() || []).find(e => e && e.pid === pid);
  check('G3 codexEntries does NOT list the unidentified plant', !leaked,
    leaked ? `LEAKED as "${leaked.name}" [L${leaked.level}]` : 'absent, honest');
  if (leaked) {
    check('G3b leaked card must not show the true name', leaked.name !== p.name, `shows "${leaked.name}"`);
  }

  // the prep knowledge IS delivered honestly at eat time (not via the codex)
  check('G4 eat-time say-line is honest about not knowing',
    sayLog.some(m => /don't know what it is/i.test(m)), sayLog.slice(-3).join(' | ').slice(0, 120));

  // trade payment pool: a level-0 "knowledge" must not be spendable
  const yourPlants = Object.keys(G.state.codex.plants || {}).filter(k => G.plantKnown(k));
  check('G5 level-0 entry excluded from tradeable knowledge', !yourPlants.includes(pid),
    `tradeable=${yourPlants.length}`);

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
