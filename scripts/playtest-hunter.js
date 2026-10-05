// Hunter archetype playtest: traps, active hunting, night play, monster encounters.
// Usage: node scripts/playtest-hunter.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function note(s) { console.log(s); }
function section(s) { console.log('\n=== ' + s + ' ==='); }
function sayText() { return Game.log.join(' | '); }
function clearLog() { Game.log.length = 0; }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const villager = Game.data.villagers.find(v => v.id === Game.villagerId) || {};
  note(`Player: ${villager.name || Game.villagerId} (${villager.formerOccupation || 'unknown occupation'})`);

  // ---------------------------------------------------------------
  section('1. TRAP CRAFTING — knowledge gating');
  clearLog();
  note(`craft blind: ${Game.craft('snare') === null ? 'blocked (good)' : 'ALLOWED — BUG'}`);
  Game.learnRecipe('snare', 2);
  s.inventory.push({ material: 'vine', units: 2 }, { material: 'stick', units: 2 });
  note(`craft at L2: ${Game.craft('snare') ? 'made (L3 via practice)' : 'FAILED — BUG'}`);

  // ---------------------------------------------------------------
  section('2. TRAPLINE — traps on two tiles, 12 dawns sleeping at home');
  const home = { x: Game.map.px, y: Game.map.py };
  Game.setTrap('snare');
  s.inventory.push({ material: 'vine', units: 1 }, { material: 'stick', units: 1 });
  Game.craft('snare');
  const far = Game.travelTargets().find(t => t.d >= 2 && Game.tileAt(t.x, t.y).type !== 'haven') || Game.travelTargets()[0];
  Game.travelTo(far.x, far.y);
  Game.setTrap('snare');
  note(`trap A on home tile (${home.x},${home.y}); trap B on far tile (${far.x},${far.y})`);
  const DAYS = 12;
  for (let d = 0; d < DAYS; d++) {
    Game.map.px = home.x; Game.map.py = home.y; // sleep at home every night
    Game.endDay();
    s.kcal = 2400; s.hydration = 100; s.health = 100; // keep the tester alive
    if (Game.over || Game.villageLost) break;
  }
  const usesA = (Game.tileAt(home.x, home.y).traps || [])[0]?.uses ?? -1;
  const usesB = (Game.tileAt(far.x, far.y).traps || [])[0]?.uses ?? -1;
  note(`after ${DAYS} dawns: HOME trap uses left ${usesA}/10 (catches: ${10 - usesA}), AWAY trap uses left ${usesB}/10 (catches: ${10 - usesB})`);
  if (usesB === 10 && usesA < 10) note('FIND: away-tile traps NEVER check. Trapline away from camp is dead weight.');
  else if (usesB < 10) note('away traps catch — trapline works while you sleep elsewhere.');

  // ---------------------------------------------------------------
  section('3. ACTIVE HUNTING — 60 stalks each');
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  function huntTrials(animalId, n, label) {
    let success = 0, bolted = 0, missed = 0, other = 0;
    for (let i = 0; i < n; i++) {
      s.mx = 4; s.my = 4; s.kcal = 2400;
      s.animal = { id: animalId, mx: 5, my: 4 }; // adjacent
      clearLog();
      Game.huntAnimal();
      const said = sayText();
      if (/Got it/.test(said)) success++;
      else if (/explodes away|catches your move/.test(said)) bolted++;
      else if (/Missed/.test(said)) missed++;
      else { other++; if (other === 1) note(`  (sample "other": ${said.slice(0, 160)})`); }
      s.animal = null;
    }
    note(`${label}: got ${success} | bolted ${bolted} | missed ${missed} | other ${other} (n=${n})`);
    return { success, bolted, missed };
  }
  huntTrials('cottontail_rabbit', 60, 'rabbit (easy) ');
  huntTrials('wild_turkey', 60, 'turkey (medium)');
  huntTrials('white_tailed_deer', 60, 'deer (hard)   ');

  // ---------------------------------------------------------------
  section('4. NIGHT HUNTING — prepared hunter bonus');
  Game.dayPart = 3;
  note(`isNight: ${Game.isNight()}`);
  Game.state.codex.skills = Game.state.codex.skills || {};
  Game.state.codex.skills.night_hunting = { level: 2 };
  note(`night_hunting L2 granted: skillKnown → ${Game.skillKnown('night_hunting', 2)}`);
  huntTrials('gray_fox', 60, 'fox at NIGHT, L2 night_hunting');
  Game.dayPart = 1;

  // ---------------------------------------------------------------
  section('5. WILD MONSTER — wanderer patrol → contact → grid spawn');
  Game.state.scholar.day = 5; // wanderer active from day 3
  Game.map.px = 3; Game.map.py = 3;
  Game.encounterDone = false;
  Game.wanderer = { x: 2, y: 3, dir: 1, monsterId: 'thornback_boar' };
  clearLog();
  Game.moveWanderer(); // (2,3)->(3,3): walks onto the player's node
  note(`after patrol step: pendingEncounter=${Game.pendingEncounter}, said: "${sayText().slice(0, 160)}"`);
  // now the player walks onto the wanderer's node path → checkEncounter contact branch.
  // simulate directly: put wanderer on player node and call checkEncounter
  Game.wanderer = { x: 3, y: 3, dir: 1, monsterId: 'thornback_boar' };
  Game.encounterDone = false; Game.pendingEncounter = false;
  clearLog();
  Game.checkEncounter();
  const said = sayText();
  note(`on contact: monster in grid=${JSON.stringify(s.monster || null)}`);
  note(`telegraph leaks true name: ${/thornback|bulldozer/i.test(said) ? 'CHECK TEXT: ' + said.slice(0, 120) : 'no leak (good)'}`);

  // ---------------------------------------------------------------
  section('6. RNG ENCOUNTER RATE — 200 tile entries per type');
  for (const [type, label] of [['thicket', 'thicket'], ['meadow', 'meadow'], ['ruin', 'ruin']]) {
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      Game.map.px = 3; Game.map.py = 3;
      const t = Game.tileAt(3, 3); const origType = t.type; t.type = type;
      s.monster = null; Game.wanderer = null;
      Game.checkEncounter();
      if (s.monster) hits++;
      t.type = origType; s.monster = null;
    }
    note(`${label}: ${hits}/200 entries spawned a monster`);
  }
  console.log('\nDone.');
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
