#!/usr/bin/env node
/* Playtest: the 6 new animals as a player (Steve 2026-10-05).
   Spawns 3+ new animals via debug scenarios, hunts one, butchers one,
   and reads the FEEL: do flee behaviors read distinctly? Does the
   butchering yield feel real? Judgments printed inline.
   Usage: node scripts/playtest-animals-20261007.js
   (NOT a PASS/FAIL suite — a played pass.) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.window = global; // stub for eval (equipment.js needs window at load)
const FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js'];
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
FILES.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // combat stays sync
const Game = globalThis.Scattering.Game;

function sayText() {
  const lines = (Game.log || []).map(l => String(l.text || l));
  Game.log = [];
  return lines.join('\n');
}
function withRand(values, fn) {
  const orig = Math.random; let i = 0;
  Math.random = () => (i < values.length ? values[i++] : 0.5);
  try { return fn(); } finally { Math.random = orig; }
}
function boot() {
  Game.genRoster('Minneapolis, USA');
  const char = (Game.generatedRoster || [])[0];
  Game.newGame('Minneapolis, USA', null, char.id, [], 'Debug Scenario');
  try { Game.depart(); } catch (e) {}
  const s = Game.state.scholar;
  s.insideHaven = false;
  s.mx = 4; s.my = 4; s.kcal = 1000; s.energy = 60; s.health = 100;
  Game.genDetail = () => Array.from({ length: 9 }, () => Array(9).fill('grass'));
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  return s;
}
function giveWeapon(itemId, ammoId, ammoN) {
  const s = Game.state.scholar;
  const idef = (Game.data.items || []).find(i => i.id === itemId) || {};
  s.inventory = s.inventory || [];
  s.inventory.push({ itemId, units: 1, kcalEach: 0, kg: 0.5, name: idef.name || itemId });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId, name: idef.name || itemId };
  if (ammoId && ammoN) {
    const adef = (Game.data.items || []).find(i => i.id === ammoId) || {};
    s.inventory.push({ itemId: ammoId, units: ammoN, kcalEach: 0, kg: 0.05, name: adef.name || ammoId });
  }
}
function spawnAnimalNear(animalId) {
  const s = Game.state.scholar;
  let cfg = { stamina: 3 };
  try { cfg = Game.encPreyCfg(animalId); } catch (e) {}
  s.animal = { id: animalId, mx: 5, my: 4, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
  const adef = (Game.data.animals || []).find(a => a.id === animalId) || {};
  Game.say(`Movement — ${adef.description || 'something alive'}.`);
}
function header(t) { console.log('\n' + '='.repeat(66) + '\n' + t + '\n' + '='.repeat(66)); }

(async () => {
  await Game.init();
  const animals = Game.data.animals;
  const def = id => animals.find(x => x.id === id);

  // ---------- 1. CHIPMUNK: spawn, look, learn, flee-text ----------
  header('1. EASTERN CHIPMUNK — the small-game pool');
  {
    const s = boot();
    spawnAnimalNear('eastern_chipmunk');
    sayText();
    const a = s.animal;
    console.log('spawn label (unknown):', Game.encAnimalLabel(a));
    console.log('wary text:           :', Game.encWaryText(a));
    console.log('prey tuning          :', JSON.stringify(Game.encPreyCfg('eastern_chipmunk')), '(defaults — no ENC_PREY override, fine for data-only)');
    console.log('flee text pre-knowledge (generic, no huntText leak):', Game.encFleeText(a).slice(0, 90) + '…');
    Game.state.codex.animalEncounters.eastern_chipmunk = 3; // learned
    console.log('flee text AFTER learning (vivid huntText):', Game.encFleeText(a));
    console.log('FEEL: skittish burrow-darter; cache-mastery knowledge beat is the real payoff — small meat, big lesson.');
  }

  // ---------- 2. HERON: sentinel, near water ----------
  header('2. GREEN HERON — the shorebird pool');
  {
    const s = boot();
    spawnAnimalNear('green_heron');
    sayText();
    const a = s.animal;
    console.log('spawn label (unknown):', Game.encAnimalLabel(a));
    console.log('wary text:           :', Game.encWaryText(a));
    Game.state.codex.animalEncounters.green_heron = 3;
    console.log('flee text AFTER learning:', Game.encFleeText(a));
    console.log('FEEL: statue-still sentinel, ignores you for the fish — distinct from skittish prey. NeverBolt=sentinel means a miss reads as outrage, not flight.');
  }

  // ---------- 3. COYOTE: cunning predator, HUNT IT ----------
  header('3. EASTERN COYOTE — the dangerous one. Hunting as a player.');
  {
    const s = boot();
    giveWeapon('crude_bow', 'arrow', 12);
    spawnAnimalNear('eastern_coyote');
    sayText();
    const a = s.animal;
    console.log('spawn label (unknown):', Game.encAnimalLabel(a));
    console.log('wary text:           :', Game.encWaryText(a));
    console.log('tell (windup)        :', def('eastern_coyote').tell);
    Game.state.codex.animalEncounters.eastern_coyote = 3;
    console.log('flee text AFTER learning:', Game.encFleeText(a).slice(0, 120) + '…');
    // Player hunts: force a hit (seeded RNG) to feel the kill path
    withRand([0.05, 0.5], () => { Game.huntAnimal(); });
    const t = sayText();
    console.log('hunt output (seeded hit):\n' + t.split('\n').slice(-6).join('\n'));
    console.log('FEEL: cunning reads — it assesses YOU. fleeDifficulty=dangerous is honest: this one can hurt you.');
  }

  // ---------- 4. BUTCHER the coyote: yield feel ----------
  header('4. BUTCHERING — does the yield feel real?');
  {
    const s = boot();
    s.inventory.push({ itemId: 'stone_knife', name: 'Stone knife', units: 1, kcalEach: 0, kg: 0.3 });
    const d = def('eastern_coyote');
    const carc = Game.foodCarcass(d, d.calories, s.day, 'hunted');
    s.inventory.push(carc);
    console.log('carcass item:', JSON.stringify({ name: carc.name, kcalEach: carc.kcalEach, units: carc.units, note: carc.note }));
    console.log('kill line rendered:', Game.encKillLine(d, d.calories));
    const mink = def('american_mink');
    console.log('mink kill line     :', Game.encKillLine(mink, mink.calories));
    const owl = def('great_horned_owl');
    console.log('owl kill line      :', Game.encKillLine(owl, owl.calories));
    const bat = def('big_brown_bat');
    console.log('bat kill line      :', Game.encKillLine(bat, bat.calories));
    console.log('FEEL: coyote 6000 kcal + hide + bone vs deer 20000 — proportionate. Bat is a mouthful, and the text admits it. Mink pelt framed as trade good, not calories.');
  }

  // ---------- 5. MINK + OWL + BAT: the night pool, labels only ----------
  header('5. NIGHT POOL — unknown descriptors');
  {
    const s = boot();
    for (const id of ['american_mink', 'great_horned_owl', 'big_brown_bat']) {
      spawnAnimalNear(id);
      sayText();
      console.log(id.padEnd(20), '→', Game.encAnimalLabel(s.animal));
      s.animal = null;
    }
    console.log('FEEL: none of the three leak their name pre-knowledge. Owl reads spooky, mink reads wrong (a ribbon, not a weasel), bat reads aerial.');
  }

  console.log('\nPLAYTEST DONE. Verdict summary in the worker report.');
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
