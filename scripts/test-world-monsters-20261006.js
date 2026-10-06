#!/usr/bin/env node
// PROOF (Steve 2026-10-06): monsters live in the WORLD, not on the player.
// Before: scholar.monster — a single monster tethered to the player. Only one
// existed at a time; leaving a tile deleted it; villagers never met one.
// After: state.worldMonsters — monsters live on tiles (tx,ty). They persist
// when you leave (continuity), wander between tiles, spawn across the map up
// to a population cap, and villagers on their tile fight/flee/die.
// Usage: node scripts/test-world-monsters-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}${extra ? ' | ' + extra : ''}`); }
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
}

(async () => {
  await Game.init();

  // ---------- 1. worldMonsters store ----------
  freshGame();
  ok('worldMonsters() returns array', Array.isArray(Game.worldMonsters()));
  ok('starts empty', Game.worldMonsters().length === 0);

  // ---------- 2. spawn + lookup ----------
  const m1 = Game.spawnWorldMonster('bulldozer', 2, 2, { mx: 4, my: 4 });
  ok('spawn returns monster', m1 && m1.id === 'bulldozer');
  ok('spawn sets tile', m1.tx === 2 && m1.ty === 2);
  ok('monsterAt finds it', Game.monsterAt(2, 2) === m1);
  ok('monsterAt misses elsewhere', Game.monsterAt(0, 0) === null);

  // ---------- 3. playerMonster + alias ----------
  Game.map.px = 2; Game.map.py = 2;
  ok('playerMonster on tile', Game.playerMonster() === m1);
  Game.syncMonsterAlias();
  ok('alias mirrors', Game.state.scholar.monster === m1);
  Game.map.px = 0; Game.map.py = 0;
  Game.syncMonsterAlias();
  ok('alias null off tile', Game.state.scholar.monster === null);
  ok('monster persists off tile (continuity)', Game.monsterAt(2, 2) === m1);

  // ---------- 4. remove ----------
  Game.removeWorldMonster(m1);
  ok('removed from world', Game.monsterAt(2, 2) === null);
  ok('world empty again', Game.worldMonsters().length === 0);

  // ---------- 5. debug alias adoption ----------
  Game.map.px = 3; Game.map.py = 3;
  Game.state.scholar.monster = { id: 'hushwolf', mx: 5, my: 5 }; // direct set, like debug scenarios
  const adopted = Game.playerMonster();
  ok('debug-set monster adopted', adopted && adopted.id === 'hushwolf');
  ok('adopted into world', Game.worldMonsters().includes(adopted));
  ok('adopted on player tile', adopted.tx === 3 && adopted.ty === 3);
  Game.removeWorldMonster(adopted);

  // ---------- 6. population maintenance ----------
  freshGame();
  const cap = Game.worldMonsterCap();
  ok('cap sane', cap >= 3 && cap <= 9, 'cap=' + cap);
  for (let i = 0; i < 20; i++) Game.maintainWorldMonsters();
  const pop = Game.worldMonsters().length;
  ok('population reaches cap', pop === cap, `pop=${pop} cap=${cap}`);
  for (let i = 0; i < 10; i++) Game.maintainWorldMonsters();
  ok('population capped', Game.worldMonsters().length === cap);
  // none on safe tiles, none on player tile
  let badSpawn = false;
  for (const m of Game.worldMonsters()) {
    if (Game.isSafeTile(m.tx, m.ty)) badSpawn = true;
    if (m.tx === Game.map.px && m.ty === Game.map.py) badSpawn = true;
  }
  ok('no spawns on safe/player tiles', !badSpawn);

  // ---------- 7. wandering ----------
  const before = Game.worldMonsters().map(m => m.tx + ',' + m.ty).join('|');
  for (let i = 0; i < 10; i++) Game.wanderWorldMonsters();
  const after = Game.worldMonsters().map(m => m.tx + ',' + m.ty).join('|');
  ok('monsters wander (positions change)', before !== after);
  let badWander = false;
  for (const m of Game.worldMonsters()) {
    if (m.tx < 0 || m.tx > 6 || m.ty < 0 || m.ty > 6) badWander = true;
    if (Game.isSafeTile(m.tx, m.ty)) badWander = true;
  }
  ok('wander stays in bounds, off safe tiles', !badWander);

  // ---------- 8. villager encounters ----------
  freshGame();
  // put a villager on a non-safe node with a monster
  const v = Game.state.village;
  const vid = (v.roster || []).find(id => id !== Game.villagerId);
  ok('have a villager', !!vid);
  // find a non-safe tile
  let tx = -1, ty = -1;
  outer: for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (!Game.isSafeTile(x, y) && !(x === Game.map.px && y === Game.map.py)) { tx = x; ty = y; break outer; }
  }
  ok('found wild tile', tx >= 0);
  Game.npcSetNode(vid, tx, ty);
  const wm = Game.spawnWorldMonster('bulldozer', tx, ty, {});
  const newsBefore = (Game.state.scholar.awayNews || []).length;
  // force several ticks; at 50% encounter chance each, one should resolve
  let resolved = false;
  for (let i = 0; i < 12 && !resolved; i++) {
    const wBefore = Game.worldMonsters().length;
    const rBefore = (v.roster || []).length;
    Game.villagerMonsterTick();
    const newsAfter = (Game.state.scholar.awayNews || []).length;
    if (newsAfter > newsBefore || Game.worldMonsters().length !== wBefore || (v.roster || []).length !== rBefore) resolved = true;
  }
  ok('villager-monster encounter resolves', resolved);
  const news = (Game.state.scholar.awayNews || []).join(' ');
  ok('encounter logged to awayNews', /killed|drove|mauled/i.test(news), news.slice(0, 80));

  // ---------- 9. travelTo continuity: monster left behind stays ----------
  freshGame();
  Game.map.px = 1; Game.map.py = 1;
  const left = Game.spawnWorldMonster('gallowdeer', 1, 1, { mx: 3, my: 3 }); // gallowdeer doesn't follow
  // travel to adjacent tile (2,1) — need it to be a valid target
  const targets = Game.travelTargets().map(t => t.x + ',' + t.y);
  if (targets.includes('2,1')) {
    const origRand = Math.random;
    Math.random = () => 0.9; // no wander (35%), no villager tick (50%), no encounter spawn
    Game.travelTo(2, 1);
    Math.random = origRand;
    ok('left-behind monster persists', Game.monsterAt(1, 1) === left);
    ok('alias follows player tile', Game.state.scholar.monster === Game.monsterAt(2, 1));
  } else {
    ok('travel target available', false, 'no 2,1 target; targets=' + targets.slice(0, 5).join('|'));
  }

  // ---------- 10. worldTick runs inside checkEncounter ----------
  freshGame();
  const popBefore = Game.worldMonsters().length;
  Game.map.px = 1; Game.map.py = 1;
  // force non-safe tile for the roll section; worldTick runs regardless
  Game.checkEncounter();
  ok('worldTick populated world', Game.worldMonsters().length >= popBefore);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
