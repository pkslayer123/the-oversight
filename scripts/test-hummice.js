// Hummice fight tests (Steve 2026-10-04: "completely broken, no way to fight them").
//  - the fight TEACHES the deal at open (humNoticed patter)
//  - hum stacks build once per ROUND, not per mouse (keep-moving works)
//  - SHOUT breaks the hum (noise is the counterplay)
//  - damage is survivable: a moving player lives through the opening rounds
//  - killing a mouse drops stacks (the choir stutters)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}

function flatGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
}

function newMouseGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) {
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  return s;
}

(async () => {
  await Game.init();
  const realGen = Game.genDetail.bind(Game);
  Game.genDetail = () => flatGrid();

  // --- 1. opening: first contact is dread, not a lecture (Steve 2026-10-05) ---
  newMouseGame();
  Game.debugScenario('hummice');
  {
    const s = Game.state.scholar;
    s.mx = s.monster.mx + 1; s.my = s.monster.my;
    Game.canSee = () => true;
    for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
    ok('fight starts', !!Game.tbfight);
    ok('humNoticed set', !!Game.tbfight.humNoticed);
    ok('opening has dread line', Game.log.some(l => /fifty throats, one note/i.test(l)));
    ok('first contact: no tactical lecture', !Game.log.some(l => /STACKS while you stand in it/i.test(l)));
    ok('first contact: no shout coaching', !Game.log.some(l => /Or SHOUT/i.test(l)));
    ok('first contact: admits ignorance', Game.log.some(l => /You don't know what it wants/i.test(l)));
  }

  // --- 1b. opening: earned knowledge gets the tactical read ---
  newMouseGame();
  Game.debugScenario('hummice');
  {
    Game.ensureMonsterEntry('hummice').stage = 'observed';
    const s = Game.state.scholar;
    s.mx = s.monster.mx + 1; s.my = s.monster.my;
    Game.canSee = () => true;
    for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
    ok('observed: tactical lecture present', Game.log.some(l => /STACKS while you stand in it/i.test(l)));
    ok('observed: teaches shout', Game.log.some(l => /SHOUT/i.test(l)));
    ok('observed: teaches killing', Game.log.some(l => /Kill one and the choir stutters/i.test(l)));
  }

  // --- 2. round-gated stacks + survivable opening ---
  newMouseGame();
  Game.debugScenario('hummice');
  {
    const s = Game.state.scholar;
    s.mx = s.monster.mx + 1; s.my = s.monster.my;
    Game.canSee = () => true;
    for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
    const f = Game.tbfight;
    // player keeps moving: walk 2+ squares each turn, never attacks
    let rounds = 0;
    for (let i = 0; i < 60 && !f.over; i++) {
      Game.tbAdvance();
      if (f.over) break;
      const c = Game.tbCurrent();
      if (c && c.kind === 'player') {
        rounds = Math.max(rounds, f.round);
        const p = Game.tbFighter('p');
        // step away from the nearest mouse
        const mice = f.fighters.filter(m => m.kind === 'monster' && m.alive);
        if (!mice.length) break;
        let best = null;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = Math.max(0, Math.min(8, p.mx + dx)), ny = Math.max(0, Math.min(8, p.my + dy));
          const d = Math.min(...mice.map(m => Math.abs(m.mx - nx) + Math.abs(m.my - ny)));
          if (!best || d > best.d) best = { nx, ny, d };
        }
        if (best && p.moveLeft > 0) { p.mx = best.nx; p.my = best.ny; p.moveLeft -= 1; }
        p.moveLeft = 0; p.acted = true;
        Game.tbAfterPlayerAction();
      }
    }
    const p = Game.tbFighter('p'); // may be null if the kiting player finally died — assertions use rounds
    ok('moving player survives 3+ rounds', rounds >= 3);
    ok('moving keeps max stacks below the wall', (f.humStacks || 0) <= 4); // sanity
    ok('moving outlasts standing (12 vs 6 rounds)', rounds >= 6);
  }

  // --- 3. standing still lets it build to a wall ---
  // (fast monsters act in startCombat's opening pass, so the player takes the
  // full swarm's opening — bump HP to isolate the stacking mechanic from survival)
  newMouseGame();
  Game.debugScenario('hummice');
  {
    const s = Game.state.scholar;
    s.health = 300;
    s.mx = s.monster.mx + 1; s.my = s.monster.my;
    Game.canSee = () => true;
    for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
    const f = Game.tbfight;
    let maxStacks = 0;
    for (let i = 0; i < 60 && !f.over; i++) {
      Game.tbAdvance();
      if (f.over) break;
      const c = Game.tbCurrent();
      if (c && c.kind === 'player') {
        maxStacks = Math.max(maxStacks, f.humStacks || 0);
        const p = Game.tbFighter('p');
        p.moveLeft = 0; p.acted = true; // stand still, take it
        Game.tbAfterPlayerAction();
      }
    }
    ok('standing still builds the hum', maxStacks >= 3);
  }

  // --- 4. SHOUT breaks the hum ---
  newMouseGame();
  Game.debugScenario('hummice');
  {
    const s = Game.state.scholar;
    s.mx = s.monster.mx + 1; s.my = s.monster.my;
    Game.canSee = () => true;
    for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
    const f = Game.tbfight;
    // advance to player turn
    for (let i = 0; i < 10 && !Game.tbIsPlayerTurn() && !f.over; i++) Game.tbAdvance();
    ok('player gets a turn', Game.tbIsPlayerTurn());
    const before = f.fighters.filter(m => m.kind === 'monster' && m.alive).length;
    ok('shout affects hummice (not "nothing cares")', Game.tbPlayerShout() === true && !Game.log.slice(-3).some(l => /Nothing out there cares/i.test(l)));
    const cooled = f.fighters.filter(m => m.kind === 'monster' && (m.encCooldown || 0) > 0).length;
    ok(`shout cools the mice (${cooled}/${before})`, cooled === before);
  }

  // --- 5. killing a mouse stutters the choir ---
  newMouseGame();
  Game.debugScenario('hummice');
  {
    const s = Game.state.scholar;
    s.mx = s.monster.mx + 1; s.my = s.monster.my;
    Game.canSee = () => true;
    for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
    const f = Game.tbfight;
    f.humStacks = 3;
    const live = f.fighters.find(x => x.kind === 'monster' && x.alive);
    Game.tbHumSwarmCheck(live); // baseline: 4 voices
    const m = f.fighters.find(x => x.kind === 'monster' && x.alive);
    // simulate a kill: drive through the swarm check path
    m.hp = 0; m.alive = false;
    Game.tbHumSwarmCheck(f.fighters.find(x => x.kind === 'monster' && x.alive) || m);
    ok('kill drops stacks', (f.humStacks || 0) <= 1);
    ok('choir stutter said', Game.log.some(l => /drops out of the choir/i.test(l)));
  }

  // --- 6. fast monster opens: the player still gets a turn (no soft-lock) ---
  // Steve 2026-10-04: hummice (speed 6 > player 4) opened and the fight sat
  // on "Not your turn" forever — startCombat never ran the opening AI turns.
  // Direct startCombat: the opening AI turns must resolve to the player.
  for (const mid of ['hummice', 'hushwolf', 'lockpick_raccoon', 'camera_swarm']) {
    newMouseGame();
    const s = Game.state.scholar;
    Game.startCombat(mid);
    ok(`${mid}: fight starts`, !!Game.tbfight);
    if (Game.tbfight) {
      ok(`${mid}: player gets a turn after opening AI turns`, Game.tbIsPlayerTurn());
      try { Game.tbEnd('fled'); } catch (e) {}
    }
  }

  Game.genDetail = realGen;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
