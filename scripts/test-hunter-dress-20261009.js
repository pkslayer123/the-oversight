#!/usr/bin/env node
// HOSTILE HUNTER: Field Dress (field_dressing.dress_game) adversarial proof.
// 2026-10-09 playtest loop, archetype: hunter.
//
// THE BREAKS (engine vs the ability card "Break down a carcass into usable
// meat plus hide, sinew, bone"):
//   D1 EXPLOIT: dress a ROTTEN carcass -> instant +kcal. Canon: rot is past
//      saving; cleanCarcass/preserveFood/cookFood all refuse rot honestly.
//      dress_game never checked isSpoiled.
//   D2 EXPLOIT: dress a BEAR carcass -> instant +kcal with NO trichinosis
//      risk, no knife, no cooking, no spoilage pressure. Canon (BEAR.md):
//      bear/boar/javelina carry parasiteRisk; only 'cooked' clears it.
//      The whole food-reality pipeline is skipped by one tap.
//   D3 HONESTY: the card promises "plus hide, sinew, bone" — the impl grants
//      NO parts at all. Copy vs engine.
//   D4 HONESTY: the card promises "usable meat" — the impl grants instant
//      safe kcal on the scholar's bar, bypassing cleaning/cooking/disease.
// POST-FIX: dress_game shares cleanCarcass's conversion (carcassToMeat):
//   same yields/risks/parts, rotten refused at the gate (no cost), no knife
//   needed (that is the ability's value), card text honored.
// Usage: node scripts/test-hunter-dress-20261009.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const ORDER = ['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js',
 'src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js',
 'src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/convo-mood.js',
 'src/js/convoTopics.js','src/js/convo-wants.js','src/js/convo-dialogue.js','src/js/convo-beats.js',
 'src/js/convo-scene.js','src/js/examine.js','src/js/equipment.js','src/js/journal.js','src/js/party.js',
 'src/js/party-formal.js','src/js/truth.js','src/js/contests.js','src/js/contestEngine.js',
 'src/js/alienPlayers.js','src/js/storage.js','src/js/perceive.js','src/js/carexplore.js',
 'src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js',
 'src/js/progression.js','src/js/ledger.js','src/js/abilityActions.js','src/js/monsterBehaviors.js',
 'src/js/statusEffects.js','src/js/villager-agency.js','src/js/fieldFights.js',
 'src/js/villager-objectives.js','src/js/codex-people.js','src/js/membership.js',
 'src/js/hierarchy.js','src/js/debug-scenarios.js','src/js/build.js'];
for (const f of ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; fails.push(name); console.log(`  FAIL ${name} — ${extra || ''}`); }
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 1000; s.energy = 60; s.health = 100; s.hp = 100;
  s.abilities = [{ id: 'field_dressing', level: 1 }];
  Game.state.codex.techniques = Game.state.codex.techniques || {};
  Game.state.codex.techniques.clean = true;
  Game.log = [];
  return s;
}
function mkCarcass(s, id, kcal, spoilOffset) {
  const a = Game.data.animals.find(x => x.id === id);
  const c = Game.foodCarcass(a, kcal, s.day + spoilOffset - 2, 'hunted');
  c.spoilDay = s.day + spoilOffset; // explicit: spoilOffset<=0 => rotten
  s.inventory.push(c);
  return c;
}
function dress(s) { return Game.useAbility('field_dressing', 'dress_game'); }

(async () => {
  await Game.init();

  console.log('== D1. ROTTEN CARCASS (spoilage bypass) ==');
  {
    const s = freshGame();
    mkCarcass(s, 'white_tailed_deer', 4000, -1); // rotten
    const k0 = s.kcal;
    const r = dress(s);
    const kGain = s.kcal - k0;
    check('rotten carcass: no kcal granted', kGain <= 0, `gained ${kGain} kcal from rot`);
    check('rotten carcass: refused before payment (no kcal cost)', s.kcal === k0, `kcal ${k0} -> ${s.kcal}`);
    check('rotten carcass: refusal is honest (not "no game")',
      (Game.log || []).join('\n').toLowerCase().includes('turned') || (Game.log || []).join('\n').toLowerCase().includes('beyond dressing'),
      Game.log.join(' | ').slice(0, 120));
    // the rot stays for the pack's Clean path, which sweeps rot honestly
    const rot = s.inventory.find(i => i.foodState === 'carcass');
    check('rotten carcass: rot still visible (not silently eaten)', !!rot && Game.isSpoiled(rot), 'rot gone or not flagged');
    Game.cleanCarcass(undefined);
    check('rotten carcass: pack Clean discards it honestly', !s.inventory.some(i => i.foodState === 'carcass'), 'carcass still there');
    console.log(`    useAbility returned ${r}`);
  }

  console.log('== D2. BEAR CARCASS (disease bypass) ==');
  {
    const s = freshGame();
    mkCarcass(s, 'black_bear', 30000, 2); // fresh
    const k0 = s.kcal;
    dress(s);
    const kGain = s.kcal - k0;
    check('bear: no instant safe kcal (goes through the food pipeline)', kGain <= 0, `gained ${kGain} kcal`);
    const meat = s.inventory.find(i => i.foodKind === 'meat' && i.foodState === 'cleaned');
    check('bear: becomes cleaned meat, not instant food', !!meat, 'no cleaned meat');
    if (meat) {
      check('bear: trichinosis risk attached (canon: only cooked clears it)',
        meat.parasiteRisk && meat.parasiteRisk.id === 'trichinosis',
        `parasiteRisk=${JSON.stringify(meat.parasiteRisk)}`);
      check('bear: raw disease risk attached', !!meat.diseaseRisk, 'no diseaseRisk');
      check('bear: portion law (24 x ~500 kcal at 40% of 30000)', meat.units === 24 && meat.kcalEach === 500,
        `units=${meat.units} kcalEach=${meat.kcalEach}`);
    }
    const fat = s.inventory.filter(i => i.foodKind === 'fat' && i.foodState === 'raw');
    check('bear: 6 raw fat slabs (canon BEAR.md)', fat.reduce((a, i) => a + (i.units || 1), 0) === 6, `fat units=${fat.reduce((a, i) => a + (i.units || 1), 0)}`);
  }

  console.log('== D3. PARTS HONESTY (card promises hide, sinew, bone) ==');
  {
    const s = freshGame();
    mkCarcass(s, 'white_tailed_deer', 4000, 2);
    dress(s);
    const parts = s.inventory.filter(i => i.material && ['hide', 'bone', 'feather', 'antler', 'shell', 'quill', 'tusk'].includes(i.material));
    check('deer: byproduct parts granted (card promise)', parts.length > 0, `parts=${parts.length}`);
  }

  console.log('== D4. NO-KNIFE PATH (the ability\'s value) ==');
  {
    const s = freshGame(); // no knife in inventory
    const hasKnife = Game.hasCuttingTool();
    mkCarcass(s, 'cottontail_rabbit', 1200, 2);
    const k0 = s.kcal;
    const r = dress(s);
    check('no knife in pack (precondition)', !hasKnife, 'knife present');
    const meat = s.inventory.find(i => i.foodKind === 'meat' && i.foodState === 'cleaned');
    check('knifeless: ability still dresses (its value), as cleaned meat', r !== false && !!meat, `returned ${r}`);
    check('knifeless: no instant kcal', s.kcal <= k0, `gained ${s.kcal - k0}`);
  }

  console.log('== D5/D6. REGRESSION: no carcass / charred carcass ==');
  {
    const s = freshGame();
    const k0 = s.kcal;
    const r = dress(s);
    check('no carcass: refused', r === false, `returned ${r}`);
    check('no carcass: no cost paid', s.kcal === k0, `kcal ${k0} -> ${s.kcal}`);
  }
  {
    const s = freshGame();
    const a = Game.data.animals.find(x => x.id === 'white_tailed_deer');
    s.inventory.push(Game.foodCarcass(a, 4000, s.day, 'charred'));
    const k0 = s.kcal;
    const r = dress(s);
    check('charred: refused (charred excluded)', r === false, `returned ${r}`);
    check('charred: no cost paid', s.kcal === k0, `kcal ${k0} -> ${s.kcal}`);
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join(', ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
