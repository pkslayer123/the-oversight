// Day/night cycle + sleep + night ecology tests. Usage: node scripts/test-day-night.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const T = Game.TIME;

  // --- 1. dayProgress / lightLevel math ---
  s.dayTicks = 0; Game.dayPart = 0;
  eq('progress at dawn start', Game.dayProgress(), 0);
  ok('light ramps at dawn start (>=0.2)', Game.lightLevel() >= 0.2 && Game.lightLevel() <= 0.35);
  s.dayTicks = T.TICKS_PER_PART; Game.dayPart = 1; // midday
  eq('progress at midday', Game.dayProgress(), 0.25);
  eq('light full at midday', Game.lightLevel(), 1);
  s.dayTicks = T.TICKS_PER_PART * 2; Game.dayPart = 2; // dusk
  eq('progress at dusk', Game.dayProgress(), 0.5);
  eq('light full at dusk start', Game.lightLevel(), 1);
  s.dayTicks = T.TICKS_PER_PART * 2 + 64; Game.dayPart = 2; // mid-dusk
  ok('light falling mid-dusk', Game.lightLevel() > 0.3 && Game.lightLevel() < 0.8);
  s.dayTicks = T.TICKS_PER_PART * 3; Game.dayPart = 3; // night
  eq('progress at night', Game.dayProgress(), 0.75);
  eq('light moonlight at night', Game.lightLevel(), 0.15);
  eq('isNight true', Game.isNight(), true);
  Game.dayPart = 1; eq('isNight false at midday', Game.isNight(), false);

  // --- 2. status carries dial fields ---
  s.dayTicks = 100; Game.dayPart = 0;
  const st = Game.status();
  ok('status.dayProgress', typeof st.dayProgress === 'number' && st.dayProgress > 0);
  ok('status.lightLevel', typeof st.lightLevel === 'number');
  eq('status.isNight', st.isNight, false);
  eq('status.systemArrived bool', typeof st.systemArrived, 'boolean');

  // --- 3. creature weights shift with time ---
  Game.dayPart = 3; // night
  eq('nocturnal weight at night', Game.creatureWeight({ activity: 'nocturnal' }), 3);
  eq('diurnal weight at night', Game.creatureWeight({ activity: 'diurnal' }), 0.25);
  Game.dayPart = 1; // midday
  eq('diurnal weight at midday', Game.creatureWeight({ activity: 'diurnal' }), 3);
  eq('nocturnal weight at midday', Game.creatureWeight({ activity: 'nocturnal' }), 0.15);
  Game.dayPart = 0; // dawn
  eq('crepuscular weight at dawn', Game.creatureWeight({ activity: 'crepuscular' }), 3);
  eq('nocturnal at dawn', Game.creatureWeight({ activity: 'nocturnal' }), 0.5);

  // --- 4. pickByActivity: night cast is nocturnal ---
  Game.dayPart = 3;
  const mdefs = Game.data.monsters;
  const picks = {};
  for (let i = 0; i < 300; i++) {
    const m = Game.pickByActivity(mdefs);
    const act = (mdefs.find(x => x.id === m.id) || {}).activity || '?';
    picks[act] = (picks[act] || 0) + 1;
  }
  ok('night picks mostly nocturnal', (picks.nocturnal || 0) > 150);
  console.log('   night pick distribution:', JSON.stringify(picks));
  Game.dayPart = 1;
  const dpicks = {};
  for (let i = 0; i < 300; i++) {
    const m = Game.pickByActivity(mdefs);
    const act = (mdefs.find(x => x.id === m.id) || {}).activity || '?';
    dpicks[act] = (dpicks[act] || 0) + 1;
  }
  ok('day picks favor diurnal+crepuscular', (dpicks.diurnal || 0) + (dpicks.crepuscular || 0) > 150);
  console.log('   day pick distribution:', JSON.stringify(dpicks));

  // --- 5. data: every monster and animal has an activity ---
  ok('all monsters have activity', mdefs.every(m => m.activity));
  ok('all animals have activity', (Game.data.animals || []).every(a => a.activity));

  // --- 6. NPCs settle at night ---
  Game.dayPart = 3;
  const v = Game.state.village;
  // ensure positions exist (normally only placed at Haven; set up directly)
  v.positions = v.positions || {};
  for (const id of (v.roster || []).slice(0, 4)) {
    if (id === Game.villagerId) continue;
    v.positions[id] = v.positions[id] || { mx: 4, my: 4 };
  }
  const rid = (v.roster || []).find(id => id !== Game.villagerId && v.positions && v.positions[id]);
  if (rid) {
    const before = JSON.stringify(v.positions[rid]);
    let moved = 0;
    for (let i = 0; i < 10; i++) {
      const b = JSON.stringify(v.positions[rid]);
      Game.npcBatchTurn();
      if (JSON.stringify(v.positions[rid]) !== b) moved++;
    }
    ok('NPCs barely move at night (<=3 moves in 10 batches)', moved <= 3);
    console.log(`   night movement: ${moved}/10 batches moved (should be small)`);
  } else console.log('SKIP night settle: no NPC with position');

  // --- 7. sleep: advances to dawn, heals, restores ---
  Game.dayPart = 3; s.dayTicks = T.TICKS_PER_PART * 3 + 10;
  const dayBefore = s.day;
  s.health = 40; s.energy = 20; s.kcal = 2000;
  // make sure no encounter interrupts: clear wanderer/monster
  Game.wanderer = null; s.monster = null; Game.pendingEncounter = false;
  Game.sleep();
  eq('sleep advances to next day', s.day, dayBefore + 1);
  eq('sleep ends at dawn', Game.dayPart, 0);
  ok('sleep healed', s.health > 40);
  eq('sleep restored energy', s.energy, 100);
  ok('sleeping flag cleared', !Game._sleeping);

  // --- 8. sleep interrupted by danger ---
  Game.dayPart = 2; s.dayTicks = T.TICKS_PER_PART * 2 + 10;
  const d2 = s.day;
  s.health = 80;
  Game.pendingEncounter = true; // danger strikes mid-night
  Game.sleep();
  eq('danger wakes you (no full sleep)', s.day, d2); // didn't reach dawn
  ok('sleeping flag cleared on wake', !Game._sleeping);
  Game.pendingEncounter = false;

  // --- 9. sleep refuses at dawn ---
  Game.dayPart = 0; s.dayTicks = 5;
  const d3 = s.day;
  Game.sleep();
  eq('no sleep at dawn', s.day, d3);

  // --- 10. system arrival upgrades the dial ---
  s.day = 7;
  Game.checkSystemArrival();
  eq('systemArrived', Game.state.systemArrived, true);
  eq('dialGlitch set', Game.state.dialGlitch, true);
  const st2 = Game.status();
  eq('status.systemArrived true', st2.systemArrived, true);
  eq('status.dialGlitch true', st2.dialGlitch, true);
  Game.clearDialGlitch();
  eq('dialGlitch cleared', Game.status().dialGlitch, false);

  // --- 11. knowledge + ability data ---
  const k = Game.data.knowledge || [];
  ok('nocturnal_patterns knowledge exists', k.some(x => x.id === 'nocturnal_patterns'));
  ok('night_hunting knowledge exists', k.some(x => x.id === 'night_hunting'));
  ok('night_eyes ability exists', (Game.data.abilities || []).some(x => x.id === 'night_eyes'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
