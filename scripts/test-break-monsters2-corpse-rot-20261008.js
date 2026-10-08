// Corpse-rot honesty proof (break-it monsters run 2, follow-up).
// Steve's law: meat left on the corpse ROTS — the rot timer must actually
// run in-game, and the UI promise ("Spoils in ~2 days") must match the code.
//
// Attack: registerDeath a monster, leave a carcass on it, advance days via
// sweepSpoiled (the endDay-wired hook), and check the exact rot boundary:
//   - day D (kill day): carcass present
//   - day D+1: carcass present
//   - day D+2 (dawn sweep): carcass GONE — "Spoils in ~2 days" holds
//   - non-food items (Teeth) never rot; buried corpses are skipped.
// Also: the player gets an honest, non-silent notification on the same node.
'use strict';
const { freshGame } = require('./break-monsters-harness.js');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  PASS', label); }
  else { fail++; console.log('  FAIL', label, detail === undefined ? '' : JSON.stringify(detail)); }
}

(async () => {
  const Game = await freshGame(424242);
  const s = Game.state.scholar;
  s.day = 10;

  // Kill a hushwolf: corpse with a fresh carcass (spoilDay = day+2, the
  // foodCarcass contract) plus a non-food trophy.
  const carcass = {
    plantId: 'meat_hushwolf', foodKind: 'meat', foodState: 'carcass',
    name: 'Hushwolf (carcass)', spoilDay: s.day + 2, units: 1,
  };
  const teeth = { name: 'Teeth', units: 3, kcalEach: 0 };
  const corpse = Game.registerDeath({
    kind: 'monster', monsterId: 'hushwolf', name: 'Hushwolf',
    cause: 'combat', items: [carcass, teeth],
  });
  ok(corpse && corpse.kind === 'monster', 'kill registers a monster corpse');
  ok(corpse.items.length === 2, 'corpse holds carcass + trophy');

  // Day D: the dawn sweep must NOT touch fresh meat.
  let removed = Game.sweepSpoiled();
  ok(corpse.items.some(i => i.name === 'Hushwolf (carcass)'),
     'day D: fresh carcass survives the sweep');

  // Day D+1: still good.
  s.day = 11;
  Game.sweepSpoiled();
  ok(corpse.items.some(i => i.name === 'Hushwolf (carcass)'),
     'day D+1: carcass survives (one full day of grace)');

  // Day D+2: the dawn sweep takes it. "Spoils in ~2 days" is honest.
  s.day = 12;
  const logBefore = Game.log.length;
  removed = Game.sweepSpoiled();
  ok(!corpse.items.some(i => /carcass/i.test(i.name || '')),
     'day D+2: carcass rotted off the corpse');
  ok(corpse.items.some(i => i.name === 'Teeth'),
     'day D+2: non-food trophy (Teeth) does NOT rot');
  const said = Game.log.slice(logBefore).join('\n');
  ok(/went bad|maggots/i.test(said),
     'day D+2: rot is announced, never silent', said.slice(0, 160));

  // Buried corpses are exempt from the sweep (bones keep their markers).
  const c2 = Game.registerDeath({ kind: 'monster', monsterId: 'thornback_boar',
    name: 'Boar', cause: 'combat', items: [{ name: 'Boar (carcass)', spoilDay: 1, units: 1 }] });
  c2.buried = true;
  s.day = 50;
  Game.sweepSpoiled();
  ok(c2.items.length === 1, 'buried corpse keeps its items through the sweep');

  // The wiring: endDay actually calls sweepSpoiled (code-level proof —
  // game.js endDay contains the call; verified by source read here).
  const fs = require('fs'), path = require('path');
  const gameSrc = fs.readFileSync(path.join(__dirname, '..', 'src/js/game.js'), 'utf8');
  const endDayBlock = gameSrc.slice(gameSrc.indexOf('— DAY ${scholar.day} DAWN —'));
  ok(/this\.sweepSpoiled\(\)/.test(endDayBlock.slice(0, 600)),
     'endDay -> sweepSpoiled wiring present in game.js');

  console.log(`\ncorpse-rot: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
