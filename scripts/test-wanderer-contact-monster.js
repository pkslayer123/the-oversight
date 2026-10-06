// Wanderer contact spawns the RIGHT monster (forager loop 2026-10-05).
// The "Face it" button calls Game.startCombat() with no id; the monster that
// walked into you is pendingMonsterId. Before the fix, every wanderer fight
// spawned a bulldozer regardless of what the encounter panel named.
// Usage: node scripts/test-wanderer-contact-monster.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js', 'src/js/justice.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}
function fightMonsterIds() {
  return (Game.tbfight ? Game.tbfight.fighters : [])
    .filter(f => f.kind === 'monster' && f.alive)
    .map(f => f.monsterId);
}
function endFightQuietly() {
  // resolve without playing: mark the monster fled so state is clean for the next case
  if (Game.tbfight) {
    try { Game.tbEnd('fled'); } catch (e) {}
  }
  Game.pendingEncounter = false;
  Game.pendingMonsterId = null;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2400;

  // case 1: a hushwolf walks into you — "Face it" must spawn the wolf
  Game.pendingEncounter = true;
  Game.pendingMonsterId = 'hushwolf';
  Game.startCombat(); // exactly what the UI's p-face button calls
  ok('wanderer contact spawns pendingMonsterId (wolf, not bulldozer)',
    fightMonsterIds().includes('hushwolf'),
    `fighters=${fightMonsterIds().join(',')}`);
  ok('pendingEncounter cleared on fight start', Game.pendingEncounter === false);
  endFightQuietly();

  // case 2: explicit id still wins (direct monster contact path)
  Game.startCombat('hummice');
  ok('explicit monsterId still respected', fightMonsterIds().includes('hummice'),
    `fighters=${fightMonsterIds().join(',')}`);
  endFightQuietly();

  // case 3: no encounter, no id — the old default survives
  Game.startCombat();
  ok('default bulldozer when nothing pending',
    fightMonsterIds().includes('bulldozer'),
    `fighters=${fightMonsterIds().join(',')}`);
  endFightQuietly();

  // case 4: the real contact path — wanderer patrol walks onto the player
  const wx = Game.map.px, wy = Game.map.py;
  Game.wanderer = { x: wx, y: wy, dir: 1, monsterId: 'hushwolf' };
  Game.encounterDone = false;
  Game.pendingEncounter = false;
  Game.pendingMonsterId = null;
  Game.moveWanderer(); // patrol step — contact check happens when it moves onto you
  // (if the patrol stepped away, put it adjacent and step again)
  if (!Game.pendingEncounter) {
    Game.wanderer = { x: wx - 1 >= 0 ? wx - 1 : wx + 1, y: wy, dir: wx - 1 >= 0 ? 1 : -1, monsterId: 'hushwolf' };
    Game.encounterDone = false;
    Game.moveWanderer();
  }
  ok('contact sets pendingEncounter', Game.pendingEncounter === true);
  ok('contact records pendingMonsterId', Game.pendingMonsterId === 'hushwolf',
    `got ${Game.pendingMonsterId}`);
  if (Game.pendingEncounter) {
    Game.startCombat();
    ok('full contact path spawns the wolf', fightMonsterIds().includes('hushwolf'),
      `fighters=${fightMonsterIds().join(',')}`);
    endFightQuietly();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
