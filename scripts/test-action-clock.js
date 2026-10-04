// Action clock unit test. Usage: node scripts/test-action-clock.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${got}, want ${want}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;

  // 1. fresh clock
  eq('dayTicks starts 0', s.dayTicks, 0);
  eq('dayPart starts 0', Game.dayPart, 0);

  // 2. 31 ticks: no batch yet
  let batches = 0;
  const origBatch = Game.npcBatchTurn.bind(Game);
  Game.npcBatchTurn = () => { batches++; return origBatch(); };
  Game.tickAction(31);
  eq('31 ticks: no batch', batches, 0);
  eq('31 ticks: actionClock=31', s.actionClock, 31);
  eq('31 ticks: dayTicks=31', s.dayTicks, 31);

  // 3. 1 more tick: batch fires
  Game.tickAction(1);
  eq('32 ticks: 1 batch', batches, 1);
  eq('batch resets clock', s.actionClock, 0);
  eq('dayTicks=32', s.dayTicks, 32);

  // 4. 96 ticks: 3 batches, crosses 128 -> part turns
  const partBefore = Game.dayPart;
  Game.tickAction(96);
  eq('96 ticks: 3 more batches', batches, 4);
  eq('dayTicks=128', s.dayTicks, 128);
  eq('part advanced', Game.dayPart, partBefore + 1);

  // 5. engagement: engaged NPC doesn't wander
  Game.ensureVillagerPositions();
  const v = Game.state.village;
  const rid = (v.roster || []).find(id => id !== Game.villagerId && v.positions && v.positions[id]);
  if (rid) {
    const px = v.positions[rid].mx, py = v.positions[rid].my;
    Game.setEngaged(rid, 10);
    // run 3 batches (fewer than the engagement duration)
    for (let i = 0; i < 3; i++) Game.npcBatchTurn();
    eq('engaged NPC stayed put', v.positions[rid].mx === px && v.positions[rid].my === py, true);
    eq('still engaged after 3 batches', Game.isEngaged(rid), true);
    for (let i = 0; i < 8; i++) Game.npcBatchTurn();
    eq('engagement lapsed after batches', Game.isEngaged(rid), false);
  } else console.log('SKIP engagement test: no NPC with position');

  // 6. day budget: fill to 512 -> day ends
  Game.npcBatchTurn = origBatch; // restore (avoid double counting)
  const dayBefore = s.day;
  s.dayTicks = 500; s.actionClock = 0; Game.dayPart = 3;
  Game.tickAction(12); // 512 -> day end
  eq('day advanced at 512 ticks', s.day, dayBefore + 1);
  eq('dayTicks reset', s.dayTicks, 0);

  // 7. combat suppresses the clock
  Game.tbfight = { dummy: true };
  const dt = s.dayTicks;
  Game.tickAction(10);
  eq('combat suppresses ticks', s.dayTicks, dt);
  Game.tbfight = null;

  // 8. travel = 32 ticks (pick an unblocked target; blocked travel rightly costs nothing)
  s.dayTicks = 0; s.actionClock = 0;
  const targets = Game.travelTargets().filter(t => !Game.travelBlockage(t.x, t.y));
  if (targets.length) {
    Game.travelTo(targets[0].x, targets[0].y);
    eq('travel ticked 32', s.dayTicks, 32);
  } else console.log('SKIP travel test: all targets blocked');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
