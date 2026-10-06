// TEST: unknown-villager descriptor disambiguation (unique-person law).
// 1. No two villagers in one village share a personDescriptor pre-System.
// 2. Descriptors are stable across repeated calls.
// 3. Disambiguating traits are observable-only (no names, no occupations leaked).
// 4. Known names still win: displayName returns the name after revealName.
// 5. Traits are unique within the village.
// Usage: node scripts/test-brawler-descriptor-dedup.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js', 'src/js/game.js',
 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let failures = 0;
function check(cond, label) {
  if (cond) { console.log('  ok: ' + label); }
  else { failures++; console.log('  FAIL: ' + label); }
}

(async () => {
  await Game.init();
  const N = 25;
  let totalDupes = 0, totalChecked = 0;
  let traitDupes = 0;
  console.log('runs: ' + N);
  for (let i = 0; i < N; i++) {
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const ids = Game.state.village.roster.filter(id => id !== Game.villagerId);
    const labels = ids.map(id => Game.personDescriptor(id));
    totalChecked += ids.length;
    const uniq = new Set(labels);
    if (uniq.size !== labels.length) totalDupes += labels.length - uniq.size;
    // stability: second call returns identical strings
    const again = ids.map(id => Game.personDescriptor(id));
    check(labels.every((l, k) => l === again[k]), `seed ${i}: descriptors stable`);
    // traits unique within village
    const traits = ids.filter(id => Game.descriptorCollides(id)).map(id => Game.personVisibleTrait(id));
    const tuniq = new Set(traits);
    if (tuniq.size !== traits.length) traitDupes += traits.length - tuniq.size;
    // no collision: plain form kept (no trait suffix)
    const plain = ids.filter(id => !Game.descriptorCollides(id));
    check(plain.every(id => Game.personDescriptor(id) === 'A ' + Game.descriptorBase(id)), `seed ${i}: no false disambiguation`);
  }
  check(totalDupes === 0, `zero duplicate descriptors across ${totalChecked} villagers`);
  check(traitDupes === 0, 'traits unique within each village');

  // trait pool is observable-only: no names/occupations in it
  const pool = Game.visibleTraitPool();
  check(pool.length >= 12, `trait pool has ${pool.length} options`);
  check(!/surgeon|carpenter|doctor|medic|teacher|engineer/i.test(pool.join(' ')), 'no occupations in trait pool');
  check(pool.every(t => /^[a-z',\- ]+$/.test(t)), 'trait pool grammar is lowercase phrase fragments');

  // names still win after revealName
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const ids = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const colliding = ids.find(id => Game.descriptorCollides(id));
  if (colliding) {
    const before = Game.displayName(colliding);
    check(before.startsWith('A '), 'pre-reveal displayName is a descriptor');
    Game.revealName(colliding, 'intro');
    const after = Game.displayName(colliding);
    check(after !== before && !after.startsWith('A '), `post-reveal displayName is a name (${after})`);
    const rec = Game.personRecord(colliding);
    check(rec && after.includes(rec.name.split(' ')[0]), 'name matches the villager record');
  } else {
    console.log('  (no colliding villager this seed — name check skipped)');
  }

  console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
