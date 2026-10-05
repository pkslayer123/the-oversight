// Lifeseed foundation audit. Usage: node scripts/test-lifeseed.js
// Steve's rule: procedural depth before more systems. This guards the foundation:
// generate N characters, assert no repeats, seed completeness, keepsake<->kin
// coherence, region consistency, and placeholder resolution.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/lifeseed.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  Game.say = () => {};

  // 1. The audit itself: 50 characters, depth + coherence.
  const res = Game.auditLifeseeds(50);
  ok('audit runs', res && res.checked === 50);
  ok('audit clean (no repeats, no contradictions)', res.total === 0, res.errors.slice(0, 5).join(' | '));

  // 2. Lifeseed texture is real: backstory grew, mentions seed content.
  const ch = Game.genCharacter({ origin: 'Portland, Oregon', forceCultureMatch: false, candidate: true, usedNames: new Set(), usedOccs: new Set() });
  ok('lifeseed attached', !!ch.lifeseed);
  ok('region anchor matches origin tags', ch.lifeseed.regionId === 'pacific_northwest', ch.lifeseed.regionId);
  ok('hometown is a real PNW town', ['Bend', 'Eugene', 'Olympia', 'Spokane', 'Boise', 'Missoula'].includes(ch.lifeseed.hometown), ch.lifeseed.hometown);
  ok('backstory has texture (long)', (ch.backstory || '').length > 300, String((ch.backstory || '').length));
  ok('backstory names the hometown', (ch.backstory || '').includes(ch.lifeseed.hometown));
  ok('seed has named people', (ch.lifeseed.people || []).length >= 2);
  ok('seed has a wound and a want', !!ch.lifeseed.wound && !!ch.lifeseed.want);

  // 3. Far-away origin still coherent.
  const ch2 = Game.genCharacter({ origin: 'Lagos, Nigeria', forceCultureMatch: false, candidate: true, usedNames: new Set(), usedOccs: new Set() });
  ok('foreign origin gets far_away seed', ch2.lifeseed && ch2.lifeseed.regionId === 'far_away', ch2.lifeseed && ch2.lifeseed.regionId);
  ok('no placeholders leak', !/\{[a-z]+\}/.test(ch2.backstory || ''));

  // 4. Item pool: every sentimental item has memory + reveals + kin.
  const items = Game.data.items || [];
  const sent = items.filter(i => i.class === 'sentimental');
  ok('sentimental pool non-empty', sent.length >= 10, String(sent.length));
  for (const it of sent) {
    ok(`memory: ${it.id}`, !!it.memory);
    ok(`reveals: ${it.id}`, !!it.reveals && !!it.reveals.type);
    ok(`kin: ${it.id}`, typeof it.kin === 'string');
    ok(`flavor: ${it.id}`, !!it.flavor && !/\b(Ruth|Theo)\b/.test(it.flavor), it.flavor);
  }

  // 5. Semantic trace: every gear-class item is occupation-linked or universal.
  const cg = Game.data.characterGen || {};
  const biased = new Set();
  for (const o of (cg.occupations || [])) for (const ids of Object.values(o.itemBias || {})) for (const id of ids) biased.add(id);
  for (const it of items) {
    if (['tool', 'weapon', 'clothing', 'sentimental'].includes(it.class)) {
      ok(`semantic link: ${it.id}`, biased.has(it.id) || it.universal === true);
    }
  }

  // 6. Keepsake text resolves against a real seed — no placeholders survive.
  const keeper = Game.genCharacter({ origin: 'Bath, Maine', forceCultureMatch: false, candidate: true, usedNames: new Set(), usedOccs: new Set() });
  for (const it of sent) {
    const resolved = Game.resolveKeepsakeText(keeper, it, it.memory);
    ok(`resolve ${it.id}`, !/\{[a-z]+\}/.test(resolved), resolved.slice(0, 80));
    if (it.reveals.note) {
      ok(`resolve note ${it.id}`, !/\{[a-z]+\}/.test(Game.resolveKeepsakeText(keeper, it, it.reveals.note)));
    }
  }

  // 7. NPC keepsake observation line.
  Game.data.villagers = Game.data.villagers || [];
  const line = Game.npcKeepsakeLine('nonexistent');
  ok('keepsake line safe on unknown vid', line === '');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW', e); process.exit(1); });
