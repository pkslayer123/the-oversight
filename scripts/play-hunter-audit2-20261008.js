#!/usr/bin/env node
// HUNTER AUDIT follow-up (2026-10-08): knowledge-gate retest with a NON-common
// animal (spotted_owl — region rule must NOT mark it known), full-capture of
// the turkey strike outcome, and the complete (untruncated) deer kill line.
// Same harness discipline as play-hunter-audit-20261008.js.
// Run: node scripts/play-hunter-audit2-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/alienPlayers.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js'];
_SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const note = t => console.log(t);
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function flush(tag, max = 40) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 220)}`); }
function clearSays() { says.splice(0); }
function grant(id, level) {
  const s = Game.state.scholar; s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 2, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 2;
  return e;
}
function setDetail() {
  Game.genDetail = () => {
    const g = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
    g[2][6] = 'tree'; g[6][2] = 'tree';
    for (let x = 0; x <= 3; x++) g[8][x] = 'water';
    return g;
  };
}
function freshHunter() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const tiles = Game.map.tiles;
  let best = null;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = tiles[y][x];
    if (!t || t.type === 'haven' || t.type === 'ruin') continue;
    const d = Math.abs(x - 3) + Math.abs(y - 3);
    if (d < 2) continue;
    if (!best || d > best.d) best = { x, y, d };
  }
  if (best) { Game.map.px = best.x; Game.map.py = best.y; }
  const s = Game.state.scholar;
  s.insideHaven = false; s.mx = 4; s.my = 4;
  s.health = 500; s.kcal = 9000; s.hydration = 100; s.energy = 100; s.trauma = 0;
  Game.dayPart = 0;
  setDetail();
  return s;
}
function spawnAnimal(id, mx, my, opts) {
  const s = Game.state.scholar;
  const cfg = Game.encPreyCfg(id);
  s.animal = Object.assign({ id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 }, opts || {});
}
function giveWeapon(itemId, ammoId, ammoN) {
  const s = Game.state.scholar;
  const def = (Game.data.items || []).find(i => i.id === itemId) || {};
  s.inventory = s.inventory || [];
  s.inventory.push({ itemId, units: 1, kcalEach: 0, kg: 0.5, name: def.name || itemId });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId, name: def.name || itemId };
  if (ammoId && ammoN) {
    const adef = (Game.data.items || []).find(i => i.id === ammoId) || {};
    s.inventory.push({ itemId: ammoId, material: ammoId, units: ammoN, kcalEach: 0, kg: 0.05, name: adef.name || ammoId });
  }
}
function dist() { const s = Game.state.scholar, a = s.animal; return a ? Math.max(Math.abs(a.mx - (s.mx ?? 4)), Math.abs(a.my - (s.my ?? 4))) : -1; }

(async () => {
await Game.init();
note('== HUNTER AUDIT 2 | SEED ' + SEED + ' ==');
const s = freshHunter();
giveWeapon('crude_bow', 'arrow', 12);

// ---- KNOWLEDGE GATE with non-common animal ----
note('\n=== KNOWLEDGE GATE (spotted_owl, non-common) ===');
clearSays();
note(`encAnimalKnown(spotted_owl): ${Game.encAnimalKnown('spotted_owl')}`);
note(`encAnimalCue(spotted_owl): ${JSON.stringify(Game.encAnimalCue('spotted_owl'))}`);
spawnAnimal('spotted_owl', 4, 5);
const adef = (Game.data.animals || []).find(a => a.id === 'spotted_owl');
note(`describe: "${Game.encDescribeAnimal(adef)}"`);
note(`flee text (unknown): "${Game.encFleeText(s.animal, 'It bolts!')}"`);
grant('game_sense', 2);
clearSays();
try { Game.useAbility('game_sense', 'read_sign'); } catch (e) { note('read_sign err: ' + e.message); }
flush('read_sign-unknown', 12);
Game.state.codex.animalEncounters = Game.state.codex.animalEncounters || {};
Game.state.codex.animalEncounters.spotted_owl = 3;
note(`encAnimalKnown(spotted_owl) after 3 encounters: ${Game.encAnimalKnown('spotted_owl')}`);
note(`encAnimalCue(spotted_owl): "${(Game.encAnimalCue('spotted_owl') || '').slice(0, 90)}..."`);
note(`flee text (known): "${Game.encFleeText(s.animal, 'It bolts!').slice(0, 90)}..."`);
note(`describe (known): "${Game.encDescribeAnimal(adef).slice(0, 60)}..."`);
s.animal = null;

// ---- TURKEY: full capture of the strike ----
note('\n=== TURKEY — full capture of the dist-3 strike ===');
clearSays();
spawnAnimal('wild_turkey', 4, 6);
Game.say('Movement — a wild turkey, iridescent feathers.');
note(`before: dist=${dist()}`);
Game.huntAnimal();
flush('strike', 40);
note(`after: ${s.animal ? `pstate=${s.animal.pstate} aware=${(s.animal.aware || 0).toFixed(2)} dist=${dist()}` : 'NO ANIMAL'}`);
const carc = s.inventory.find(it => it && it.foodState === 'carcass');
if (carc) note(`carcass: ${carc.name}`);
s.animal = null;

// ---- DEER KILL LINE: full, untruncated ----
note('\n=== DEER KILL LINE — full text ===');
clearSays();
grant('tracker', 2);
grant('field_dressing', 2);
spawnAnimal('white_tailed_deer', 4, 4);
s.animal.pstate = 'winded'; s.animal.stamina = 0; s.animal.aware = 0.2;
for (let i = 0; i < 12 && s.animal; i++) Game.huntAnimal();
flush('kill', 40);
note('\n== AUDIT 2 COMPLETE ==');
})();
