#!/usr/bin/env node
// PROOF TEST (explorer loop 2026-10-06): double-name + grammar-wart bugs found
// by the explorer feel-playtest (scripts/play-feel-20261006-explorer.js).
// These asserts document the bugs; they FAIL on the current tree and go
// green once a fixer run applies the fixes. SKIP IN CI until green.
// Bug 1a: game.js identifyPlant — case-sensitive name-strip on
//   knowledgeLevels['1'] fails on case variants ("Lamb's Quarters" vs
//   "Lamb's quarters.") → "★ IDENTIFIED: Lamb's Quarters. Lamb's quarters. …"
// Bug 1b: examine.js examineDescription known path prefixes p.name onto
//   knowledgeLevels['1'] with NO strip at all → "Yarrow. Yarrow. Feathery…"
// Bug 2: game.js travel follow message composes "The something huge,
//   rooting in the underbrush is here." (monsterNoun fallback + hard "The").
// Bug 3 (comment/code): game.js comment above travelTo's travelTimeStep call
//   says "travelTimeStep ticks 32" while travelTimeStep is cost-free by
//   Steve's rule — comment will lure someone into "fixing" it back.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/examine.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('  ok: ' + label); }
  else { fail++; console.log('  FAIL: ' + label); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const says = [];
  Game.say = (t) => { says.push(String(t)); };

  // Bug 1a: identifyPlant on a case-variant knowledgeLevels['1']
  const lq = Game.data.plants.find(p => p.id === 'lambs_quarters');
  check('lambs_quarters fixture has case-variant kl1', !!lq && lq.name === "Lamb's Quarters" && lq.knowledgeLevels['1'].startsWith("Lamb's quarters."));
  says.length = 0;
  Game.identifyPlant('lambs_quarters', 'taught', 'Mara');
  const idLine = says.find(s => s.includes('IDENTIFIED'));
  console.log('    actual: ' + JSON.stringify(idLine));
  check('1a identifyPlant no double name', !!idLine && !idLine.includes("Lamb's Quarters. Lamb's quarters."));

  // Bug 1b: examineDescription known path on "Yarrow. Yarrow. …"
  const yw = Game.data.plants.find(p => p.id === 'yarrow');
  check('yarrow fixture has name-prefixed kl1', !!yw && yw.name === 'Yarrow' && yw.knowledgeLevels['1'].startsWith('Yarrow.'));
  Game.identifyPlant('yarrow', 'taught', 'Mara'); // make known
  const Ex = Game.examinePlantCell ? null : globalThis.Scattering.Examine;
  const desc = Ex.examineDescription('yarrow', 2);
  console.log('    actual: ' + JSON.stringify(desc));
  check('1b examineDescription(known) no double name', !desc.includes('Yarrow. Yarrow.'));

  // Bug 2: follow-through-boundary message grammar
  // monsterNoun for an unknown prose descriptor falls back to a bare
  // participle phrase; call site composes "The <noun>". Assert the composed
  // line never contains "The something".
  const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const followLine = src.split('\n').find(l => l.includes('It followed you'));
  check('2 follow message avoids "The something" composition', !!followLine && !/The \$\{/.test(followLine));

  // Bug 3: stale "ticks 32" comment near travelTimeStep call
  const stale = src.split('\n').filter(l => /travelTimeStep ticks 32/i.test(l));
  check('3 no stale "ticks 32" comment on cost-free travelTimeStep', stale.length === 0);

  console.log(`\nexplorer-fixes: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
