#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06): the SURVIVALIST loop — water, fire,
// shelter, rest, needs management. Played as a player, judged like a player.
// Run: node scripts/play-feel-20261006-survivalist.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const says = [];
function note(t) { console.log(t); }
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function flushSays(tag, max = 8) {
  const take = says.splice(0).slice(0, max);
  for (const t of take) note(`   | ${tag} ${String(t).slice(0, 160)}`);
}
function vstate(label) {
  const s = Game.state.scholar, m = Game.map;
  note(`   [${label}] day=${s.day} part=${s.dayPart||s.part||'?'} @node(${m.px},${m.py}) hp=${Math.round(s.health||0)} kcal=${Math.round(s.kcal||0)} hyd=${Math.round(s.hydration||0)} energy=${Math.round(s.energy||0)} water=${JSON.stringify(s.water||[]).slice(0,90)}`);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;

  note('=== SURVIVALIST RUN: one day of water, fire, rest ===');

  // --- ACT 1: morning at haven ---
  note('\n=== ACT 1: morning at haven — thirst ===');
  vstate('wake');
  flushSays('morning');
  says.length = 0;
  Game.fillWater();
  flushSays('fill', 4);
  Game.drinkWater();
  flushSays('drink', 4);
  vstate('after-drink');
  note(`   water bottles: ${JSON.stringify(s.water)}`);

  // --- ACT 2: walk to a creek ---
  note('\n=== ACT 2: the creek ===');
  const home = { x: Game.map.px, y: Game.map.py };
  const tiles = Game.map.tiles;
  let creek = null;
  outer: for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = home.x + dx, y = home.y + dy;
    if (x < 0 || y < 0 || x >= 7 || y >= 7) continue;
    const t = tiles[y][x];
    if (/creek|wetland|river|lake|spring/.test(t.type || '')) {
      if (t.type === 'creek' && t.needsBridge && !t.bridged) { if (!creek) creek = { x, y, type: t.type, hard: true }; continue; }
      creek = { x, y, type: t.type }; break outer;
    }
  }
  if (!creek) { note('   NO water tile found within 4 rings — survival loop fails without water access. CHECK MAP GEN.'); }
  else {
    note(`   walking to ${creek.type} @(${creek.x},${creek.y})${creek.hard ? ' (HARD — needsBridge, testing bridge path)' : ''}`);
    if (creek.hard) {
      note('   hard creek: adding 4 wood (earned) and bridging — testing the real path');
      Game.addWood(4);
      says.length = 0;
      Game.buildBridge(creek.x, creek.y);
      flushSays('bridge', 4);
      note(`   bridged: ${!!Game.tileAt(creek.x, creek.y).bridged}`);
    }
    let guard = 12;
    while (guard-- > 0 && (Game.map.px !== creek.x || Game.map.py !== creek.y)) {
      const nx = Game.map.px + Math.sign(creek.x - Game.map.px);
      const ny = Game.map.py + Math.sign(creek.y - Game.map.py);
      says.length = 0;
      if (nx !== Game.map.px) Game.travelTo(nx, Game.map.py); else Game.travelTo(Game.map.px, ny);
      flushSays('walk', 3);
    }
    vstate('creekside');
    says.length = 0;
    // drink from the creek: stand on it (detail cell may matter)
    Game.drinkWild();
    flushSays('drinkWild', 5);
    vstate('after-wild-drink');
    says.length = 0;
    Game.fillWater();
    flushSays('fillRisky', 5);
    note(`   bottles now: ${JSON.stringify(s.water)}`);
  }

  // --- ACT 3: firecraft at a wilderness camp ---
  note('\n=== ACT 3: firecraft (wilderness camp) ===');
  // scan for a non-haven tile with tree cells; a real player keeps looking for a good camp spot
  let camp = null;
  outer2: for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = tiles[y][x];
    if (t.type === 'haven') continue;
    const d = Game.genDetail(x, y);
    if (d.flat().some(c => c === 'tree' || c === 'bigtree')) { camp = { x, y, type: t.type, detail: d }; break outer2; }
  }
  if (!camp) { note('   NO tree tile on the whole map — cannot play fire loop. ABORT.'); }
  else {
    Game.map.px = camp.x; Game.map.py = camp.y;
    note(`   camp at (${camp.x},${camp.y}) ${camp.type}`);
    let detail = camp.detail;
  let target = null;
  // deadfall branches come from foraging tree/bigtree cells (deadfall concept)
  for (let y = 0; y < detail.length && !target; y++) for (let x = 0; x < (detail[y]||[]).length && !target; x++) {
    if (['tree','bigtree'].includes(detail[y][x])) target = { x, y, cell: detail[y][x] };
  }
  if (!target) {
    for (let y = 0; y < detail.length && !target; y++) for (let x = 0; x < (detail[y]||[]).length && !target; x++) {
      if (['plant','bush'].includes(detail[y][x])) target = { x, y, cell: detail[y][x] };
    }
    note('   no tree cells — foraging a plant/bush cell instead (branches unlikely)');
  }
  if (target) {
    note(`   moving next to cell ${target.x},${target.y} (${target.cell}) and gathering fallen branches`);
    s.mx = Math.min(8, Math.max(0, target.x - 1)); s.my = target.y;
    let gg = 4;
    while (gg-- > 0 && Game.materialCount('branch') < 2) {
      says.length = 0;
      Game.gatherFallen(target.x, target.y);
      flushSays('gatherFallen', 3);
    }
    note(`   branches: ${Game.materialCount('branch')} fiber: ${Game.materialCount('fiber')}`);
  }
  // build fire on an adjacent ground cell
  s.mx = 4; s.my = 4;
  let fireAt = null;
  for (let dy = -1; dy <= 1 && !fireAt; dy++) for (let dx = -1; dx <= 1 && !fireAt; dx++) {
    const cell = detail[4+dy] && detail[4+dy][4+dx];
    if (Game.fireGroundOK(cell)) fireAt = { x: 4+dx, y: 4+dy };
  }
  if (fireAt) {
    let tries = 3;
    while (tries-- > 0 && !Game.nearFire()) {
      if (Game.materialCount('branch') < 2 && target) { says.length = 0; Game.gatherFallen(target.x, target.y); }
      says.length = 0;
      Game.makeFire(fireAt.x, fireAt.y);
      flushSays('makeFire', 5);
    }
    note(`   nearFire: ${Game.nearFire()}`);
  } else note('   no valid fire ground adjacent — cannot play fire loop here');
  // boil risky water into clean
  if (Game.nearFire()) {
    says.length = 0;
    Game.boilWater();
    flushSays('boil', 6);
    note(`   bottles after boil: ${JSON.stringify(s.water)}`);
    says.length = 0;
    Game.drinkWater();
    flushSays('drinkClean', 4);
  }
  // feed the fire so it lasts till dawn (branch fires die fast)
  says.length = 0;
  if (fireAt) { Game.feedFire(fireAt.x, fireAt.y); flushSays('feedFire', 4); }
  if (Game.nearFire() && target && Game.materialCount('branch') >= 1) { Game.feedFire(fireAt.x, fireAt.y); }
  else if (Game.nearFire()) { note('   no branches left to feed the fire — it may die before dawn'); }
  let prev = Game.sleepPreview();
  note(`   sleepPreview: quality=${prev.quality} heal=${prev.heal} "${prev.name}" warn=${prev.warn ? JSON.stringify(prev.warn).slice(0,180) : 'none'}`);
  note(`   fireLastsTillDawn: ${Game.fireLastsTillDawn ? Game.fireLastsTillDawn() : 'n/a'}`);
  vstate('campfire-evening');

  // advance honestly to night (dayPart 3), stopping if something interrupts
  says.length = 0;
  let burnGuard = 30;
  while (burnGuard-- > 0 && Game.dayPart !== 3 && !Game.tbfight && !Game.over) {
    try { Game.tickAction(32); } catch (e) { note('TICK ERROR: ' + e.message); break; }
  }
  note(`   reached dayPart=${Game.dayPart} tbfight=${!!Game.tbfight}`);

  // --- ACT 4: sleep by the fire ---
  note('\n=== ACT 4: sleep by the fire ===');
  says.length = 0;
  if (Game.tbfight) { note('   night encounter broke out — fleeing to sleep'); try { Game.tbFlee(); } catch (e) { note('   tbFlee: ' + e.message); } flushSays('flee', 5); }
  const prevNight = Game.sleepPreview();
  note(`   sleepPreview(night): quality=${prevNight.quality} heal=${prevNight.heal} warn=${prevNight.warn ? JSON.stringify(prevNight.warn).slice(0,180) : 'none'}`);
  Game.sleep();
  flushSays('sleep', 10);
  vstate('dawn');
  note(`   over=${!!Game.over}`);
  }

  // --- ACT 5: three idle days — what does the spiral cost? ---
  note('\n=== ACT 5: three days idle at the creek (do nothing) ===');
  for (let d = 1; d <= 3; d++) {
    says.length = 0;
    try { Game.endDay(); } catch (e) { note('ENDDAY ERROR: ' + e.message); }
    const s2 = Game.state.scholar;
    note(`   day ${s2.day}: hp=${Math.round(s2.health||0)} kcal=${Math.round(s2.kcal||0)} hyd=${Math.round(s2.hydration||0)} over=${!!Game.over}`);
    if (Game.over) break;
  }
  note('\n=== SURVIVALIST RUN COMPLETE ===');
})().catch(e => { console.error('PLAYTEST ERROR:', e.message); process.exit(1); });
