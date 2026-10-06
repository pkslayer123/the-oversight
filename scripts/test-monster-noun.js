#!/usr/bin/env node
// TEST (drifter loop 2026-10-06): monsterNoun must return a sentence-safe noun
// phrase for every monster's knowledge-gated unknown — never a prose clause
// composed into "The <clause> is here."
// Run: node scripts/test-monster-noun.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const FINITE = /\b(am|is|are|was|were|has|have|had|do|does|did|will|would|shall|should|can|could|may|might|must)\b/i;
let fails = 0;
function check(cond, label) {
  if (!cond) { fails++; console.log('FAIL: ' + label); }
  else console.log('ok: ' + label);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const mdefs = Game.data.monsters || [];
  check(mdefs.length > 10, `loaded ${mdefs.length} monster defs`);
  for (const m of mdefs) {
    const noun = Game.monsterNoun(m.id);
    // never a prose clause ("The grass is humming in harmony is here")
    check(!FINITE.test(noun), `${m.id}: no finite verb in "${noun}"`);
    // the composed sentence must read as a sentence about a thing
    const sent = `The ${noun} is here.`;
    check(!/The the /i.test(sent), `${m.id}: no doubled article in "${sent}"`);
    // "The something <modifiers> is here" is allowed dread-vagueness —
    // only full finite-verb clauses break the noun contract.
  }
  // the two fixed offenders, pinned
  check(Game.monsterNoun('hummice') === 'humming in the grass',
    `hummice noun is "${Game.monsterNoun('hummice')}"`);
  check(Game.monsterNoun('hype_horn') === 'shape in the dusk, shouting encouragement',
    `hype_horn noun is "${Game.monsterNoun('hype_horn')}"`);
  // prose sites still get the full evocative string (monsterDisplayName untouched)
  check(Game.monsterDisplayName('hummice') === 'the humming in the grass',
    `hummice display "${Game.monsterDisplayName('hummice')}"`);
  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
