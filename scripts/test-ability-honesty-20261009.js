// Proof: ability/synergy honesty fixes (Steve 2026-10-09 "keep looking")
// - stormcall deleted (dead mods, island, trap)
// - dead ability modifiers stripped (water_breathing, evidence_board, gossip_network, peacemaker)
// - synergy modifiers now collected (were ALL dead)
// - fishing.yield/rare_chance wired to gill nets
// - forage.find_chance -> forage.rare_find_chance in synergies
// - 3 farming synergies deleted (vapor system)
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = '/home/hatch/workspace/the-scattering';
let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); pass++; console.log('  ok -', name); } catch (e) { fail++; console.log('  FAIL -', name, '::', e.message); } };

console.log('== ability/synergy honesty proof ==');

const abilities = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
const byId = Object.fromEntries(abilities.map(a => [a.id, a]));
const syns = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/synergies.json'), 'utf8'));

// 1. stormcall is gone
check('stormcall deleted', () => {
  assert.ok(!byId['stormcall'], 'stormcall still exists');
});

// 2. Dead ability modifiers stripped
check('dead ability modifiers stripped', () => {
  for (const aid of ['water_breathing', 'evidence_board', 'gossip_network', 'peacemaker']) {
    assert.deepStrictEqual(byId[aid].modifiers, [], `${aid} still has modifiers`);
  }
});

// 3. adrenaline_surge description honest
check('adrenaline_surge description honest', () => {
  const d = byId['adrenaline_surge'].description;
  assert.ok(!d.includes('act twice'), 'still promises act twice');
  assert.ok(d.includes('harder to hit') || d.includes('dodge'), 'does not describe dodge');
});

// 4. No farming synergies (vapor system)
check('farming synergies deleted', () => {
  const ids = syns.map(s => s.id);
  for (const bad of ['granary_heart', 'seedkeeper', 'story_sold']) {
    assert.ok(!ids.includes(bad), `${bad} still exists`);
  }
});

// 5. No forage.find_chance in synergies (dead target)
check('no dead forage.find_chance in synergies', () => {
  const txt = JSON.stringify(syns);
  assert.ok(!txt.includes('forage.find_chance'), 'still references dead target');
});

// 6. Synergy modifiers are collected (code check)
check('collectModifiers includes synergies', () => {
  const modJs = fs.readFileSync(path.join(ROOT, 'src/js/engine/modifiers.js'), 'utf8');
  assert.ok(modJs.includes('synergiesData'), 'no synergiesData param');
  assert.ok(modJs.includes('scholar.synergies'), 'does not read scholar.synergies');
});

// 7. Fishing wired (code check)
check('fishing modifiers wired to nets', () => {
  const gameJs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  assert.ok(gameJs.includes("'fishing.yield'"), 'fishing.yield not wired');
  assert.ok(gameJs.includes("'fishing.rare_chance'"), 'fishing.rare_chance not wired');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
