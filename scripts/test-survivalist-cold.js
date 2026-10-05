// Survivalist cold-night test: cold snaps bite, fires must last the night,
// tents close the shelter loop.
// Usage: node scripts/test-survivalist-cold.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const s = () => Game.state.scholar;
const T = () => Game.TIME;
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};

function goWild() {
  let best = null, bd = 99;
  for (const t of Game.travelTargets()) {
    const tile = Game.tileAt(t.x, t.y);
    if (tile.type === 'haven') continue;
    if (t.d < bd) { bd = t.d; best = t; }
  }
  Game.travelTo(best.x, best.y);
}
// late day (60%) so sleep is legal; pin cold. Hydrate: the needs system is
// not what we're testing — dehydration damage would confound the numbers.
function toLateDayCold() {
  const need = T().TICKS_PER_DAY * 0.6 - (s().dayTicks || 0);
  if (need > 0) Game.tickAction(Math.ceil(need));
  Game.state.weather = 'cold';
  s().kcal = 3000; s().hydration = 100; s().trauma = 0;
}
function lightFireHere() {
  const px = s().mx ?? 4, py = s().my ?? 4;
  const d = Game.genDetail(Game.map.px, Game.map.py);
  d[py][px + 1] = 'dirt';
  Game.addMaterial('branch', 10);
  Game.addWood(4);
  s().firecraft = { attempts: 3, successes: 3, knack: true }; // skip practice curve
  Game.makeFire(px + 1, py);
  return { px, py };
}
// DANGER WAKES YOU: a night encounter interrupts sleep (design working as
// intended). Retry the next night so the test measures sleep, not monsters.
function sleepNight(weather) {
  let last = null;
  for (let a = 0; a < 4; a++) {
    const hp0 = Math.round(s().health), en0 = Math.round(s().energy), day0 = s().day;
    Game.sleep();
    const msgs = Game.log.join(' | ');
    last = { hp0, en0, day0, day1: s().day, msgs, slept: s().day !== day0, tries: a + 1 };
    if (last.slept || Game.over) return last;
    Game.tickAction(T().TICKS_PER_DAY); // next day
    const need = T().TICKS_PER_DAY * 0.6 - (s().dayTicks || 0);
    if (need > 0) Game.tickAction(Math.ceil(need));
    Game.state.weather = weather;
    s().kcal = 3000; s().hydration = 100; s().trauma = 0;
  }
  return last;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  console.log('1. cold snap + bare ground = exposure');
  goWild(); toLateDayCold();
  s().health = 100; s().energy = 100;
  check('quality is ground', Game.sleepQuality() === 'ground', Game.sleepQuality());
  check('preview warns', /hurt you/.test(Game.sleepPreview().warn || ''), JSON.stringify(Game.sleepPreview().warn));
  const r1 = sleepNight('cold');
  check('slept through', r1.slept, `day ${r1.day0} -> ${r1.day1}; ${r1.msgs.slice(-160)}`);
  check('no healing + damage (-18)', Math.round(s().health) === 82, `hp ${r1.hp0} -> ${Math.round(s().health)}`);
  check('energy only to 60', Math.round(s().energy) === 60, `en -> ${Math.round(s().energy)}`);
  check('honest message', /cold got in/i.test(r1.msgs), r1.msgs.slice(-200));

  console.log('2. cold snap + fire that dies mid-night = exposure, fire-died message');
  goWild(); toLateDayCold();
  const f2 = lightFireHere(); // lit now: alive at sleep, dead before dawn
  s().health = 100; s().energy = 100;
  check('quality is fireside', Game.sleepQuality() === 'fireside', Game.sleepQuality());
  check('fire does not last till dawn', Game.fireLastsTillDawn() === false);
  check('preview warns to feed', /dies before dawn/.test(Game.sleepPreview().warn || ''), JSON.stringify(Game.sleepPreview().warn));
  const r2 = sleepNight('cold');
  check('slept through', r2.slept, `day ${r2.day0} -> ${r2.day1}; ${r2.msgs.slice(-160)}`);
  check('exposure applied', Math.round(s().health) === 82, `hp ${r2.hp0} -> ${Math.round(s().health)}`);
  check('fire-died message', /fire died in the night/i.test(r2.msgs), r2.msgs.slice(-220));

  console.log('3. cold snap + fire fed to last = protected');
  goWild(); toLateDayCold();
  const f3 = lightFireHere();
  s().health = 82; s().energy = 100;
  let fed = 0;
  while (!Game.fireLastsTillDawn() && fed < 10) { Game.feedFire(f3.px + 1, f3.py); fed++; }
  check('fire now lasts till dawn', Game.fireLastsTillDawn() === true, `fed ${fed}x`);
  check('no cold warning', !(Game.sleepPreview().warn || ''), JSON.stringify(Game.sleepPreview().warn));
  const r3 = sleepNight('cold');
  check('slept through', r3.slept, `day ${r3.day0} -> ${r3.day1}; ${r3.msgs.slice(-160)}`);
  check('healed (+18)', Math.round(s().health) === 100, `hp ${r3.hp0} -> ${Math.round(s().health)}`);
  check('energy full', Math.round(s().energy) === 100, `en -> ${Math.round(s().energy)}`);

  console.log('4. cold snap + pitched tent = sheltered');
  goWild(); toLateDayCold();
  s().health = 82; s().energy = 60;
  s().inventory.push({ kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent', prep: '' });
  const px4 = s().mx ?? 4, py4 = s().my ?? 4;
  const d4 = Game.genDetail(Game.map.px, Game.map.py);
  d4[py4][px4 + 1] = 'dirt';
  const acts = Game.cellActions(px4 + 1, py4);
  check("'Pitch tent' action offered", acts.includes('Pitch tent'), acts.join(','));
  Game.pitchTent(px4 + 1, py4);
  check('cell is tent', d4[py4][px4 + 1] === 'tent');
  check('quality is tent', Game.sleepQuality() === 'tent', Game.sleepQuality());
  const r4 = sleepNight('cold');
  check('slept through', r4.slept, `day ${r4.day0} -> ${r4.day1}; ${r4.msgs.slice(-160)}`);
  check('healed (+25)', Math.round(s().health) === 100, `hp ${r4.hp0} -> ${Math.round(s().health)}`);
  check('energy full', Math.round(s().energy) === 100, `en -> ${Math.round(s().energy)}`);
  const acts2 = Game.cellActions(px4 + 1, py4);
  check("'Pack up tent' offered", acts2.includes('Pack up tent'), acts2.join(','));
  Game.packTent(px4 + 1, py4);
  check('cell back to dirt', d4[py4][px4 + 1] === 'dirt');
  check('tent item back in pack', (s().inventory || []).some(i => i.kind === 'tent' && i.units > 0));

  console.log('5. clear night + bare ground = normal (no exposure)');
  goWild();
  const need5 = T().TICKS_PER_DAY * 0.6 - (s().dayTicks || 0);
  if (need5 > 0) Game.tickAction(Math.ceil(need5));
  Game.state.weather = 'clear';
  s().kcal = 3000; s().hydration = 100; s().trauma = 0;
  s().health = 80; s().energy = 60;
  check('no cold warning', !(Game.sleepPreview().warn || ''), JSON.stringify(Game.sleepPreview().warn));
  const r5 = sleepNight('clear');
  check('slept through', r5.slept, `day ${r5.day0} -> ${r5.day1}; ${r5.msgs.slice(-160)}`);
  check('healed normally (+12)', Math.round(s().health) === 92, `hp ${r5.hp0} -> ${Math.round(s().health)}`);
  check('energy full', Math.round(s().energy) === 100, `en -> ${Math.round(s().energy)}`);

  console.log('6. packable wild tent grants a real tent item');
  goWild();
  s().inventory = []; // light pack: canCarry must pass
  const px6 = s().mx ?? 4, py6 = s().my ?? 4;
  const d6 = Game.genDetail(Game.map.px, Game.map.py);
  d6[py6][px6 + 1] = 'tent';
  const t6 = Game.playerTile();
  t6.secrets = t6.secrets || {};
  t6.secrets[(px6 + 1) + ',' + py6] = { condition: 'packable', known: false };
  Game._cellInteract(px6 + 1, py6);
  const got = (s().inventory || []).filter(i => i.kind === 'tent').reduce((a, i) => a + (i.units || 0), 0);
  const said = Game.log[Game.log.length - 1] || '';
  check('tent item gained', got === 1, `got=${got}; said: ${said.slice(0, 110)}`);
  check('cell cleared', d6[py6][px6 + 1] === 'dirt', `cell=${d6[py6][px6 + 1]}`);

  console.log('7. no tent in pack = no pitch action');
  s().inventory = (s().inventory || []).filter(i => i.kind !== 'tent');
  const px7 = s().mx ?? 4, py7 = s().my ?? 4;
  const d7 = Game.genDetail(Game.map.px, Game.map.py);
  d7[py7][px7 + 1] = 'dirt';
  check('no Pitch tent without one', !Game.cellActions(px7 + 1, py7).includes('Pitch tent'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST FAILED:', e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); });
