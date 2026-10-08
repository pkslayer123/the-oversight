#!/usr/bin/env node
// HUNTER AUDIT (flesh-out loop 2026-10-08): play a FULL HUNT as a player.
// ACT 1: approach a deer on foot — does it flee? is stalking quieter?
// ACT 2: run it down — chase narration, winded = catchable?
// ACT 3: the take-down — strike honesty, kill line, carcass handling.
// ACT 4: butchering flow — knife gate, clean yields, legibility.
// ACT 5: rot — left-behind meat rots, visibly.
// ACT 6: knowledge gating — unknown vs known text, game-sense vs blind.
// ACT 7: turkey — flock behavior, regroup window.
// RNG: seeded mulberry32 (SEED env override), deterministic.
// INFRA LESSONS: seed BEFORE eval (modules capture Math.random at load);
// equipment.js needs global.window=global for eval, deleted before play;
// stalkAnimal/wait hygiene; interior tiles 1..7 only.
// Run: node scripts/play-hunter-audit-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // BEFORE eval — modules capture const R = Math.random at load
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
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
delete global.window; // drop the stub: tbAfterPlayerAction takes the SYNC path
const Game = globalThis.Scattering.Game;
const note = t => console.log(t);
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function flush(tag, max = 6) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 190)}`); }
function clearSays() { says.splice(0); }
function dist() { const s = Game.state.scholar, a = s.animal; return a ? Math.max(Math.abs(a.mx - (s.mx ?? 4)), Math.abs(a.my - (s.my ?? 4))) : -1; }
function astate() { const a = Game.state.scholar.animal; return a ? `${a.id} pstate=${a.pstate} aware=${(a.aware || 0).toFixed(2)} stamina=${a.stamina} dist=${dist()}` : 'NO ANIMAL'; }
function grant(id, level) {
  const s = Game.state.scholar; s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 2, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 2;
  return e;
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
// Deterministic handcrafted detail: grass interior, a tree (arboreal tests),
// water along the bottom edge (dive tests), everything else passable.
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
  // wild node: pick a non-haven tile
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
  Game.dayPart = 0; // dawn
  setDetail();
  return s;
}
function spawnAnimal(id, mx, my, opts) {
  const s = Game.state.scholar;
  const cfg = Game.encPreyCfg(id);
  s.animal = Object.assign({ id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 }, opts || {});
  Game.say('Movement — ' + Game.encDescribeAnimal((Game.data.animals || []).find(a => a.id === id) || null) + '.');
}
// Walk one tile toward the animal, player-style (microMove = step + animalTurn).
function stepToward() {
  const s = Game.state.scholar, a = s.animal;
  if (!a) return false;
  const px = s.mx ?? 4, py = s.my ?? 4;
  const dx = Math.sign(a.mx - px), dy = Math.sign(a.my - py);
  const cands = [[dx, dy], [dx, 0], [0, dy], [dx, 1], [dx, -1], [1, dy], [-1, dy], [0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [ox, oy] of cands) {
    if (!ox && !oy) continue;
    const nx = Math.min(7, Math.max(1, px + ox)), ny = Math.min(7, Math.max(1, py + oy));
    if (nx === px && ny === py) continue;
    if (Game.microMove(nx, ny)) return true;
  }
  return false;
}

(async () => {
await Game.init();
note('== HUNTER AUDIT | SEED ' + SEED + ' ==');
const s = freshHunter();
note(`player: ${(Game.data.villagers.find(v => v.id === Game.villagerId) || {}).name || Game.villagerId}, tile type=${Game.playerTile().type}`);

// ---------------- ACT 1: the approach ----------------
note('\n=== ACT 1: APPROACH — walk at a deer (does it flee?) ===');
giveWeapon('crude_bow', 'arrow', 12);
clearSays();
spawnAnimal('white_tailed_deer', 4, 7); // dist 3, calm, grazing
flush('spawn', 2);
let waryAt = -1, boltAt = -1, silentTurns = 0;
for (let t = 0; t < 8 && s.animal; t++) {
  const before = says.length;
  const ok = stepToward();
  if (!ok) { note('   [player blocked — no step]'); break; }
  const saidCount = says.length - before;
  const a = s.animal;
  if (saidCount === 0 && a && a.pstate === 'bolt') silentTurns++;
  if (waryAt < 0 && a && (a.aware || 0) >= 0.5) waryAt = t;
  if (boltAt < 0 && a && a.pstate === 'bolt') boltAt = t;
  note(`   turn ${t}: ${astate()}${saidCount ? '' : ' (SILENT)'}`);
  flush('  ', 3);
  if (!s.animal) note('   encounter over (escaped or gone)');
}
note(`   RESULT: wary at step ${waryAt}, bolt at step ${boltAt}, silent bolt-turns: ${silentTurns}`);

// ---------------- ACT 2: the stalk ----------------
note('\n=== ACT 2: STALK — is it quieter than walking? ===');
s.mx = 4; s.my = 3; clearSays();
spawnAnimal('white_tailed_deer', 4, 7); // dist 4
flush('spawn', 2);
let stalkTurns = 0;
for (let t = 0; t < 6 && s.animal && dist() > 1; t++) {
  const r = Game.stalkAnimal();
  stalkTurns++;
  note(`   stalk ${t}: ${astate()} (r=${r})`);
  flush('  ', 3);
}
note(`   RESULT: ${stalkTurns} stalks to reach dist=${dist()}, aware=${s.animal ? (s.animal.aware || 0).toFixed(2) : 'n/a'}`);

// ---------------- ACT 3: run it down ----------------
note('\n=== ACT 3: RUN IT DOWN — chase to winded ===');
s.mx = 4; s.my = 3; clearSays();
spawnAnimal('white_tailed_deer', 4, 4); // dist 1, calm
flush('spawn', 2);
note('   [player] strike from 1 tile, bow — calm animal');
Game.huntAnimal();
flush('strike', 4);
let chaseTurns = 0;
for (let t = 0; t < 14 && s.animal && s.animal.pstate !== 'winded'; t++) {
  const before = says.length;
  if (dist() > 1) stepToward();
  else { note(`   turn ${t}: adjacent but not winded — ${astate()}`); Game.animalTurn(); }
  chaseTurns++;
  const saidCount = says.length - before;
  note(`   chase ${t}: ${astate()}${saidCount ? '' : ' (SILENT)'}`);
  flush('  ', 3);
  if (!s.animal) { note('   it got away'); break; }
}
note(`   RESULT: winded after ${chaseTurns} chase turns: ${s.animal ? astate() : 'escaped'}`);

// ---------------- ACT 4: the take-down ----------------
note('\n=== ACT 4: TAKE-DOWN — strikes until the kill (seeded) ===');
grant('tracker', 2); // knowledge matters: +0.5
s.mx = 4; s.my = 3; s.animal = null; clearSays();
spawnAnimal('white_tailed_deer', 4, 4);
s.animal.pstate = 'winded'; s.animal.stamina = 0; s.animal.aware = 0.9; // earned: ran it down
note('   winded deer, 1 tile, tracker L2 — strike');
let kills = 0, strikes = 0;
for (let i = 0; i < 12 && s.animal; i++) {
  strikes++;
  const beforeInv = s.inventory.length;
  Game.huntAnimal();
  if (s.inventory.length > beforeInv) kills++;
  flush('strike', 3);
  if (kills) break;
}
note(`   RESULT: kill after ${strikes} strike(s)`);
const carcass = s.inventory.find(it => it && it.foodState === 'carcass');
if (carcass) {
  note(`   carcass: "${carcass.name}" spoilDay=${carcass.spoilDay} (day=${s.day}) edible=${carcass.edible} kg=${carcass.kg} prep="${(carcass.prep || '').slice(0, 80)}"`);
} else note('   !!! NO CARCASS IN INVENTORY');
note(`   known after kill: ${Game.encAnimalKnown('white_tailed_deer')}`);

// ---------------- ACT 5: butchering ----------------
note('\n=== ACT 5: BUTCHERING — knife gate, clean, legibility ===');
clearSays();
if (carcass) {
  const idx = s.inventory.indexOf(carcass);
  note('   [player] clean without a knife:');
  Game.cleanCarcass(idx);
  flush('  ', 3);
  note(`   carcass still there: ${s.inventory.indexOf(carcass) >= 0}`);
  note('   [player] knap stone knife, clean again:');
  s.inventory.push({ itemId: 'stone_knife', name: 'Stone knife', units: 1, kcalEach: 0, kg: 0.3 });
  Game.cleanCarcass(idx);
  flush('  ', 4);
  const meat = s.inventory.find(it => it && it.foodState === 'cleaned');
  if (meat) note(`   meat: "${meat.name}" units=${meat.units} kcalEach=${meat.kcalEach} spoilDay=${meat.spoilDay} risk=${!!meat.diseaseRisk} prep="${(meat.prep || '').slice(0, 70)}"`);
  else note('   !!! NO CLEANED MEAT');
  note(`   spoil clock text: "${Game.spoilClockShort ? Game.spoilClockShort(meat) : 'n/a'}"`);
} else note('   skipped — no carcass');

// ---------------- ACT 6: rot ----------------
note('\n=== ACT 6: ROT — leave meat, does it rot? ===');
clearSays();
s.inventory.push(Game.foodCarcass((Game.data.animals || []).find(a => a.id === 'cottontail_rabbit'), 800, s.day, 'hunted'));
const rotIdx = s.inventory.findIndex(it => it && it.foodState === 'carcass');
note(`   fresh rabbit carcass spoilDay=${s.inventory[rotIdx].spoilDay}, day=${s.day}`);
s.day += 3; // neglect
note(`   [3 days pass] day=${s.day} — try to clean:`);
Game.cleanCarcass(rotIdx);
flush('  ', 3);
note(`   carcass gone (rotted): ${s.inventory.every(it => !(it && it.foodState === 'carcass'))}`);

// ---------------- ACT 7: knowledge gating ----------------
note('\n=== ACT 7: KNOWLEDGE — unknown vs known, game-sense vs blind ===');
clearSays();
note(`   encAnimalKnown(opossum) pre-encounter: ${Game.encAnimalKnown('opossum')}`);
note(`   encAnimalCue(opossum) pre-knowledge: ${JSON.stringify(Game.encAnimalCue('opossum'))}`);
Game.state.codex.animalEncounters = Game.state.codex.animalEncounters || {};
Game.state.codex.animalEncounters.opossum = 1; // seen once — not learned
const READ_SIGN = (globalThis.Scattering || {}).Game ? null : null;
try {
  const impls = null;
} catch (e) {}
// game_sense read_sign: needs the ability-action impl; call via useAbility path if present
grant('game_sense', 2);
let readSignSaid = '';
try {
  // abilityActions are invoked through useAbility(abilityId, actionId) in game.js
  const r = Game.useAbility ? Game.useAbility('game_sense', 'read_sign') : null;
  readSignSaid = says.splice(0).join(' | ').slice(0, 200);
  note(`   read_sign (1 encounter, unknown): "${readSignSaid}"`);
} catch (e) { note('   read_sign error: ' + e.message); }
Game.state.codex.animalEncounters.opossum = 3; // learned
clearSays();
try {
  if (Game.useAbility) Game.useAbility('game_sense', 'read_sign');
  readSignSaid = says.splice(0).join(' | ').slice(0, 200);
  note(`   read_sign (learned): "${readSignSaid}"`);
} catch (e) { note('   read_sign error: ' + e.message); }
note(`   encAnimalCue(opossum) post-knowledge: ${(Game.encAnimalCue('opossum') || '').slice(0, 80)}...`);

// ---------------- ACT 8: turkey ----------------
note('\n=== ACT 8: TURKEY — flock burst, regroup window ===');
s.mx = 4; s.my = 3; s.day = Game.state.scholar.day; clearSays();
spawnAnimal('wild_turkey', 4, 6); // dist 3
flush('spawn', 2);
note('   [player] strike from 3 tiles with bow (range?)');
Game.huntAnimal(); // probably too far — honesty check
flush('  ', 3);
note(`   [player] stalk in, then strike: dist=${dist()}`);
for (let t = 0; t < 3 && s.animal && dist() > 1; t++) { Game.stalkAnimal(); flush('  ', 2); }
if (s.animal) { Game.huntAnimal(); flush('strike', 4); }
note(`   after: ${astate()}`);
note('\n== AUDIT COMPLETE ==');
})();
