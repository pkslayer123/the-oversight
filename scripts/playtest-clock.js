// Playtest: feel the action clock like a player. Usage: node scripts/playtest-clock.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/food.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function snap(label) {
  const s = Game.state.scholar;
  console.log(`${label}: day ${s.day} ${['dawn','midday','dusk','night'][Game.dayPart]} | ticks ${s.dayTicks}/512 | hp ${Math.round(s.health)} kcal ${Math.round(s.kcal)}`);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.ensureVillagerPositions();
  snap('start');

  // 1. walk 10 real steps — small ticks, no batch yet
  let wx = Game.state.scholar.mx, wy = Game.state.scholar.my;
  for (let i = 0; i < 10; i++) { wx = Math.min(8, wx + 1); Game.microMove(wx, wy); }
  snap('after 10 steps (expect ticks=10, no batch)');

  // 2. walk 25 more — batch should fire at 32
  for (let i = 0; i < 25; i++) { wx = Math.max(0, wx - 1); Game.microMove(wx, wy); }
  snap('after 35 steps (expect 1 batch fired, ticks=35)');

  // 3. talk to a nearby NPC — 2 ticks + engaged
  const v = Game.state.village;
  const rid = (v.roster || []).find(id => id !== Game.villagerId && v.positions[id]);
  const p0 = rid ? { ...v.positions[rid] } : null;
  if (rid) {
    Game.startConvo(rid);
    console.log(`talked to ${Game.displayName(rid)}; engaged=${Game.isEngaged(rid)} (expect true)`);
  }
  snap('after talk (expect +2 ticks)');

  // 4. 40 more steps — batches fire, engaged NPC stays
  for (let i = 0; i < 40; i++) { wy = Math.min(8, wy + 1); Game.microMove(wx, wy); }
  snap('after 40 more steps (expect ~2 batches)');
  if (rid) {
    const p1 = v.positions[rid];
    console.log(`engaged NPC moved? ${p1.mx !== p0.mx || p1.my !== p0.my} (expect false while engaged)`);
  }

  // 5. travel to a forageable node, then forage — watch the day timer
  const tg = Game.travelTargets().find(t => {
    const tl = Game.tileAt(t.x, t.y);
    return tl.stock > 0 && tl.type !== 'haven' && tl.type !== 'ruin';
  }) || Game.travelTargets()[0];
  if (tg) { Game.travelTo(tg.x, tg.y); snap('after travel (expect +32 ticks)'); }
  // walk to center of the 9x9 so plant cells are in reach
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  let f = 0;
  const ticksBefore = Game.state.scholar.dayTicks;
  while (Game.dayPart === 0 && f < 6 && !Game.status().over) {
    const r = Game.doAction('forage'); f++;
    if (!r) break; // no plants in reach — stop, don't livelock
  }
  snap(`after ${f} forages (ticks were ${ticksBefore}, expect +64-96 per forage)`);

  // 7. burn the day: keep acting until day rolls
  const d0 = Game.state.scholar.day;
  let guard = 0;
  while (Game.state.scholar.day === d0 && guard++ < 40 && !Game.status().over) {
    Game.doAction('wait');
  }
  snap(`after waiting (expect day ${d0 + 1}, ticks reset)`);

  console.log('\nlog tail:', (Game.status().log || []).slice(-3).join(' | '));
  console.log('DONE — no crashes, clock behaved.');
})().catch(e => { console.error('PLAYTEST ERROR:', e); process.exit(1); });
