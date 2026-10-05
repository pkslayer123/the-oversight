// Monster-name discipline: the true name must never leak pre-naming — not in
// log text, not in the pending-encounter panel. Regression test for the
// hardcoded "BULLDOZER" header in the pendingEncounter panel (app.js).
// Usage: node scripts/test-monster-name-leak.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // move to a wild tile (haven tiles are safe — no encounters there)
  let wild = null;
  for (let y = 0; y < 7 && !wild; y++) for (let x = 0; x < 7 && !wild; x++) {
    if (!Game.isSafeTile(x, y)) wild = { x, y };
  }
  if (!wild) throw new Error('no wild tile found');
  Game.map.px = wild.x; Game.map.py = wild.y;

  // 1. pre-naming, the display name is the strange descriptor — never the true name
  const mdef = Game.data.monsters.find(m => m.id === 'thornback_boar');
  const disp = Game.monsterDisplayName('thornback_boar');
  ok('pre-naming display is not the true name', disp !== mdef.name && !/bulldozer/i.test(disp));
  ok('pre-naming display is the strange descriptor', disp === (mdef.unknown || 'something moving'));
  console.log(`  info: pre-naming display = "${disp}" (true name = "${mdef.name}")`);

  // 2. wanderer contact sets pendingEncounter AND remembers which beast (for the panel)
  Game.state.scholar.day = 5;
  Game.encounterDone = false; Game.pendingEncounter = false; Game.pendingMonsterId = null;
  Game.wanderer = { x: Game.map.px - 1, y: Game.map.py, dir: 1, monsterId: 'thornback_boar' };
  if (Game.wanderer.x < 0) Game.wanderer = { x: Game.map.px + 1, y: Game.map.py, dir: -1, monsterId: 'thornback_boar' };
  Game.moveWanderer(); // walks onto the player's node
  ok('wanderer contact raises pendingEncounter', Game.pendingEncounter === true);
  ok('pendingMonsterId remembers the beast', Game.pendingMonsterId === 'thornback_boar');

  // 3. the pendingEncounter panel must not hardcode any monster's true name.
  //    It must route through monsterDisplayName (descriptor / village name).
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const panelIdx = appSrc.indexOf('st.pendingEncounter');
  const panelBlock = appSrc.slice(panelIdx, panelIdx + 900);
  const trueNames = Game.data.monsters.map(m => m.name).filter(Boolean);
  const leaked = trueNames.filter(n => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(panelBlock));
  ok('panel has no hardcoded true monster name', leaked.length === 0);
  if (leaked.length) console.log(`  info: leaked names: ${leaked.join(', ')}`);
  ok('panel routes through monsterDisplayName', /monsterDisplayName/.test(panelBlock));

  // 4. post-naming, the village-agreed name shows (and still not the true name,
  //    unless the village happened to agree on it)
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  Game.state.codex.monsters['thornback_boar'] = { villageName: 'Crashpig', stage: 'observed' };
  ok('post-naming display is the village name', Game.monsterDisplayName('thornback_boar') === 'Crashpig');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
