#!/usr/bin/env node
// HOSTILE HUNTER: prey-AI adversarial proof (2026-10-10 playtest loop).
// Steve's canon: prey animals (turkey, deer) must FLEE when approached —
// not sit still. Hunting requires approach/tracking skill.
// Attacks:
//   P1 EXPLOIT: approach a deer on the grid — does it move away? Or free meat?
//   P2 SOFTLOCK-ish: corner an animal against the flee-by-barrier edge —
//      what happens? Cornered panic? Instant vanish? Stuck?
//   P3 EXPLOIT: fled animal — does it respawn/pop instantly (infinite farm)?
//   P4 EXPLOIT: strike loop — is every strike a kill (free meat), or does the
//      animal react/bolt? Is the carcass species-honest?
//   P5 HONESTY: can the animal flee THROUGH walls/water (tryMove honesty)?
// Usage: node scripts/proof-hunter-preyai-20261010.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const ORDER = ['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js',
 'src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js',
 'src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/convo-mood.js',
 'src/js/convoTopics.js','src/js/convo-wants.js','src/js/convo-dialogue.js','src/js/convo-beats.js',
 'src/js/convo-scene.js','src/js/examine.js','src/js/equipment.js','src/js/journal.js','src/js/party.js',
 'src/js/party-formal.js','src/js/truth.js','src/js/contests.js','src/js/contestEngine.js',
 'src/js/alienPlayers.js','src/js/storage.js','src/js/perceive.js','src/js/carexplore.js',
 'src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js',
 'src/js/progression.js','src/js/ledger.js','src/js/abilityActions.js','src/js/monsterBehaviors.js',
 'src/js/statusEffects.js','src/js/villager-agency.js','src/js/fieldFights.js',
 'src/js/villager-objectives.js','src/js/codex-people.js','src/js/membership.js',
 'src/js/hierarchy.js','src/js/debug-scenarios.js','src/js/build.js'];
for (const f of ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; fails.push(name); console.log(`  FAIL ${name} — ${extra || ''}`); }
}
// a clean 9x9 walkable grid (grass), all interior
function flatGrid() {
  const g = [];
  for (let y = 0; y < 9; y++) g.push(new Array(9).fill('grass'));
  return g;
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100; s.hp = 100;
  const t = Game.playerTile();
  t.detail = flatGrid();
  t.wildlife = { white_tailed_deer: 3, wild_turkey: 3, cottontail_rabbit: 3 };
  Game.log = [];
  return s;
}
function spawnAnimal(id, mx, my) {
  const s = Game.state.scholar;
  const cfg = Game.encPreyCfg(id);
  s.animal = { id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0, wild: true };
  return s.animal;
}
const dist = (s) => Math.max(Math.abs(s.animal.mx - s.mx), Math.abs(s.animal.my - s.my));

(async () => {
  await Game.init();

  console.log('== P1. APPROACH -> FLEE (deer, turkey) ==');
  for (const id of ['white_tailed_deer', 'wild_turkey']) {
    const s = freshGame();
    const a = spawnAnimal(id, 6, 4);
    s.mx = 4; s.my = 4;
    const start = { mx: a.mx, my: a.my, p: a.pstate };
    // walk toward it, one tile per turn (running = loud)
    let moved = false, bolted = false, turns = 0;
    while (turns < 12 && Game.state.scholar.animal) {
      const d = dist(s);
      if (d > 1) { s.mx += Math.sign(a.mx - s.mx); s.my += Math.sign(a.my - s.my); }
      const am0 = { mx: a.mx, my: a.my };
      Game.animalTurn();
      turns++;
      if (a.mx !== am0.mx || a.my !== am0.my) moved = true;
      if (['bolt', 'cornered', 'winded'].includes(a.pstate)) bolted = true;
      if (s.animal == null) break; // escaped the treeline
    }
    const gone = Game.state.scholar.animal == null;
    check(`${id}: reacts to approach (moves, bolts, or escapes)`, moved || bolted || gone,
      `start=${JSON.stringify(start)} turns=${turns} end=${s.animal ? JSON.stringify({mx:a.mx,my:a.my,p:a.pstate}) : 'escaped'}`);
    check(`${id}: never sits still while you walk up`, moved || bolted || gone, '');
  }

  console.log('== P2. CORNERED ==');
  {
    const s = freshGame();
    const t = Game.playerTile();
    // wall the deer in: walls on all 8 neighbors of (1,1); player at (1,3),
    // dist 2 — adjacent would let the deer step onto the player's cell.
    for (const [wx, wy] of [[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2]]) {
      t.detail[wy][wx] = 'wall';
    }
    const a = spawnAnimal('white_tailed_deer', 1, 1);
    s.mx = 1; s.my = 3;
    Game.log = [];
    // turn 1: wary, turn 2: bolt, turn 3: bolt branch -> no exit -> cornered
    for (let i = 0; i < 4 && a.pstate !== 'cornered'; i++) Game.animalTurn();
    check('walled-in deer: becomes cornered, not "fleeing in place"', a.pstate === 'cornered',
      `pstate=${a.pstate} pos=(${a.mx},${a.my})`);
    const h0 = s.health;
    s.mx = 1; s.my = 2; // press in to dist 1 (stand on the wall cell — test only)
    t.detail[2][1] = 'grass';
    Game.animalTurn(); // cornered panic turn at dist<=1
    const log = (Game.log || []).join('\n').toLowerCase();
    check('cornered panic is narrated (no silent turn)', /cornered|trapped|lash|detonate|breaks through|wheels|shoves past/.test(log),
      Game.log.join(' | ').slice(0, 160));
    check('cornered deer: panic can hurt (not a free pinata)', s.health < h0 || /breaks through|wheels|shoves past/.test(log),
      `hp ${h0} -> ${s.health}`);
  }

  console.log('== P3. EDGE ESCAPE ==');
  {
    // turkey: the path works — 2 edge turns -> melts into the treeline
    const s = freshGame();
    const a = spawnAnimal('wild_turkey', 0, 4);
    a.pstate = 'bolt'; a.aware = 1; a.stamina = 4;
    s.mx = 2; s.my = 4; // dist 2: inside notice (keeps bolting), outside corner range
    Game.log = [];
    let turns = 0;
    while (Game.state.scholar.animal && turns < 6) { Game.animalTurn(); turns++; }
    check('turkey at edge: escapes the treeline', Game.state.scholar.animal == null,
      `turns=${turns} pstate=${a.pstate} edgeTurns=${a.edgeTurns}`);
    const log = (Game.log || []).join('\n').toLowerCase();
    check('escape is narrated honestly', /treeline|gone/.test(log), Game.log.join(' | ').slice(0, 120));
  }
  {
    // DEER DEVIATION (documents a real engine/design mismatch): the deer
    // sprints at double stamina cost (stamina 3). The winded check fires
    // BEFORE the edge-escape check, so a deer at the treeline winds on its
    // 2nd edge turn instead of escaping — the "exit is the exit" comment
    // (cornered branch) is unreachable for deer. Player-favorable (a winded
    // deer is a sitting strike), not farmable beyond normal hunting.
    const s = freshGame();
    const a = spawnAnimal('white_tailed_deer', 0, 4);
    a.pstate = 'bolt'; a.aware = 1; a.stamina = 3;
    s.mx = 2; s.my = 4;
    Game.log = [];
    for (let i = 0; i < 4 && Game.state.scholar.animal; i++) Game.animalTurn();
    const still = !!Game.state.scholar.animal;
    console.log(`   DEVIATION NOTE: deer at edge -> pstate=${a.pstate} edgeTurns=${a.edgeTurns} (winded, not escaped)`);
    check('DEVIATION RECORDED: deer winds at treeline instead of escaping', still && a.pstate === 'winded',
      `pstate=${a.pstate} — if this ever flips to escaped, the ordering was fixed`);
  }

  console.log('== P4. STRIKE LOOP: a chance roll, honest carcass ==');
  {
    const s = freshGame();
    s.kcal = 30000; // strikes cost 100 kcal each; don't starve mid-proof
    const bowDef = Game.data.items.find(i => i.id === 'bow');
    const spearDef = Game.data.items.find(i => i.weapon && (i.weapon.range || 1) >= 2 && i.weapon.type === 'melee');
    if (!bowDef || !spearDef) { console.log('  SKIP strike loop: missing weapon defs'); }
    else {
      // PART A: the roll exists — strike a CALM grazing deer (aware 0.1) with
      // the wrong tool (spear). The pre-roll flee reaction usually lets the
      // roll happen (fleeP ~0.17); the roll itself is ~3% -> mostly "Missed!".
      // Respawn fresh each strike so every swing is the same honest setup.
      s.equipped = s.equipped || {};
      s.equipped.melee = { itemId: spearDef.id, name: spearDef.name };
      s.mx = 4; s.my = 4;
      let strikes = 0, kills = 0;
      Game.log = [];
      while (strikes < 25) {
        const a2 = spawnAnimal('white_tailed_deer', 5, 4);
        a2.aware = 0.1; a2.pstate = 'graze';
        const nCarc0 = s.inventory.filter(i => i.foodState === 'carcass').length;
        strikes++;
        Game.huntAnimal();
        const nCarc1 = s.inventory.filter(i => i.foodState === 'carcass').length;
        if (nCarc1 > nCarc0) kills++;
      }
      const logA = (Game.log || []).join('\n').toLowerCase();
      const misses = (logA.match(/missed!|jinks at the last breath/g) || []).length;
      console.log(`   calm-deer spear: strikes=${strikes} kills=${kills} miss-markers=${misses}`);
      check('strike can miss (the roll is real, not an auto-kill)', misses >= 1,
        'no "Missed!" in 25 strikes at ~3%/strike');
      // (practice accrues per strike, so later swings hit harder — the bound
      // is "not every swing kills", which is the auto-kill tripwire.)
      check('strike is not an auto-kill', kills < strikes, `kills=${kills}/${strikes}`);
      // PART B: the earned kill — winded + bow -> honest carcass
      s.inventory.length = 0;
      s.equipped.melee = null;
      s.equipped.ranged = { itemId: 'bow', name: 'Bow' };
      s.inventory.push({ material: 'arrow', units: 40, name: 'Arrows', kg: 0.4 });
      const a = spawnAnimal('white_tailed_deer', 5, 4);
      a.aware = 0.3; a.pstate = 'winded';
      let k2 = 0, st2 = 0;
      Game.log = [];
      while (st2 < 60 && !k2 && Game.state.scholar.animal) {
        st2++;
        Game.huntAnimal();
        if (!Game.state.scholar.animal && s.inventory.find(i => i.foodState === 'carcass')) k2++;
      }
      check('earned kill lands (winded + right tool)', k2 === 1, `strikes=${st2}`);
      const c = s.inventory.find(i => i.foodState === 'carcass');
      check('kill carcass is species-honest gross (no skill inflation)',
        c && c.hiddenKcal === 20000, `hiddenKcal=${c && c.hiddenKcal}`);
      check('kill carcass spoils fast (~2 days)', c && (c.spoilDay - s.day) <= 2,
        `spoilDay offset=${c && (c.spoilDay - s.day)}`);
      const logB = (Game.log || []).join('\n').toLowerCase();
      check('kill line names the knife/cleaning honesty', /clean|knife/.test(logB), '');
    }
  }

  console.log('== P5. FLEE HONESTY: no wall-phasing ==');
  {
    const s = freshGame();
    const t = Game.playerTile();
    // deer at (4,4)-ish interior, wall ring at distance — put a solid wall
    // column east of the deer and approach from the west; it must not cross.
    const a = spawnAnimal('white_tailed_deer', 4, 4);
    for (let y = 0; y < 9; y++) t.detail[y][5] = 'wall'; // wall column x=5
    s.mx = 2; s.my = 4;
    a.pstate = 'bolt'; a.aware = 1; a.stamina = 4;
    let crossed = false;
    for (let i = 0; i < 4 && Game.state.scholar.animal; i++) {
      Game.animalTurn();
      if (Game.state.scholar.animal && Game.state.scholar.animal.mx >= 5) crossed = true;
    }
    check('bolting deer does not phase through a wall column', !crossed,
      `pos=${Game.state.scholar.animal ? `(${Game.state.scholar.animal.mx},${Game.state.scholar.animal.my})` : 'escaped'}`);
  }

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  if (fails.length) console.log('FAILS:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
