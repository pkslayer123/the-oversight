// Item-use audit fixes: every ordinary tool must have a real mechanic.
// Tests the wiring, not the text.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  const v = Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, v.id, v.items.slice(0, 5));
  Game.depart();
  const s = Game.state.scholar;

  // hasItem / consumeItem helpers
  s.inventory.push({ itemId: 'lighter', name: 'Lighter', units: 1, kg: 0.1 });
  ok('hasItem finds lighter', Game.hasItem('lighter'));
  ok('hasItem false for missing', !Game.hasItem('nope_nothing'));

  // clothing has armor now
  const def = id => Game.data.items.find(i => i.id === id);
  for (const id of ['good_boots','camo_jacket','wool_socks','rain_poncho','work_gloves','canvas_pants','flannel_shirt','knit_cap','denim_jacket','running_shoes','rain_shell']) {
    ok(`${id} wearable`, !!(def(id) && def(id).armor && def(id).armor.protection > 0));
  }
  // mislabeled armor fixed
  for (const id of ['bark_armor','leather_jacket','riot_gear','military_vest','padded_cloth','hide_armor','swat_vest']) {
    ok(`${id} class fixed`, def(id).class === 'clothing');
  }
  // alien weapons equippable
  ok('phase_blade has weapon', !!(def('phase_blade').weapon && def('phase_blade').weapon.bonus === 60));
  ok('phase_blade ignoresArmor', !!def('phase_blade').weapon.ignoresArmor);
  ok('starfall_lance has weapon', !!(def('starfall_lance').weapon && def('starfall_lance').weapon.bonus === 80));
  // food edible
  ok('protein_bar edible', def('protein_bar').kcalEach === 250);
  ok('trail_mix edible', def('trail_mix').kcalEach === 150);
  ok('energy_drink edible', def('energy_drink').kcalEach === 120);
  // medical heals
  ok('field_sutures heals', def('field_sutures').healAmount === 40);
  ok('field_dressing_kit heals', def('field_dressing_kit').healAmount === 30);
  ok('nanite_swarm heals', def('nanite_swarm').healAmount === 50);
  ok('bandana heals', def('bandana').healAmount === 10);
  // cut items gone
  for (const id of ['phone_charger','calculator','pen_set','chopsticks','soy_packets','rope_coil','sewing_kit']) {
    ok(`${id} cut`, !def(id));
  }
  // reclassified as sentimental
  for (const id of ['rope_50ft','bus_map','thermos','tasting_spoon','whetstone','tin_cup','contract_quill']) {
    ok(`${id} sentimental`, def(id) && def(id).class === 'sentimental');
  }
  // keepsake personalization
  const v2 = Game.generatedRoster[1];
  const kinItems = v2.items.filter(id => { const d = def(id); return d && d.class === 'sentimental' && d.kin && d.kin !== 'none'; });
  const allPersonal = kinItems.every(id => (v2.itemPersonal || {})[id]);
  ok('kin keepsakes personalized', allPersonal);
  // age gate: no grandchildren keepsake for young chars
  const young = Game.generatedRoster.find(x => x.age < 38);
  if (young) {
    const bad = young.items.some(id => { const d = def(id); return d && (d.kin === 'grandchildren' || d.kin === 'grandmother' || d.kin === 'grandfather'); });
    ok('age gate holds', !bad);
  }
  // weights: all starters have kg
  const missing = Game.data.items.filter(i => ['tool','weapon','clothing','sentimental'].includes(i.class) && i.kg == null);
  ok('all starters have kg', missing.length === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
