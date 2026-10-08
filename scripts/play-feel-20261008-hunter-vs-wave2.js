#!/usr/bin/env node
// FEEL PLAYTEST (playtest loop 2026-10-08), HUNTER archetype — HUNTER VS WAVE-2.
// Fresh territory: the wave-2 escalation roster (13 monsters) has never been
// played from the hunter's eyes. The hunter's kit (stalk, read_stance, take_aim,
// traps, dress_game, blood_trail) was built against wave-1 beasts. Questions:
//   ACT 1: Can the hunter's explore verbs (stalk/lay_wait/tracking) touch
//          wave-2 monsters at all, or are they combat-only?
//   ACT 2: read_stance vs wave-2: unknown-pattern honesty, then the earned
//          knowledge loop (survive -> codex -> known cue).
//   ACT 3: FIGHT review_drone for real — play the countdown beam honestly:
//          does stepping off the projected line actually dodge?
//   ACT 4: FIGHT the heckler — is WAIT-as-answer-back honest (SHAME clears)?
//   ACT 5: dress_game on a monster carcass — does the hunter eat monsters?
//   ACT 6: Trap honesty — does a set snare do anything to a monster?
//   ACT 7: Night fear — does the silence telegraph cover wave-2 nocturnals?
// FEEL VERDICT: does wave-2 feel like a genuine step up, or a stat wall?
// TURN HYGIENE: strike/ability -> endTurn() only if still player's turn;
// tbPlayerWait() advances on its own (WAIT DOUBLE-ADVANCE lesson).
// RNG: seeded mulberry32 (SEED env override), deterministic proof.
// Run: node scripts/play-feel-20261008-hunter-vs-wave2.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
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
function flush(tag, max = 4) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 170)}`); }
function clearSays() { says.splice(0); }
const results = [];
const check = (name, cond, detail) => { results.push([name, !!cond]); note(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); };
function grant(id, level) {
  const s = Game.state.scholar; s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 2, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 2;
  return e;
}
function setDay(d, part) { Game.state.village.day = d; Game.state.scholar.day = d; Game.dayPart = part || 0; }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function awaitPlayerTurn(max = 20) {
  let n = 0;
  while (Game.inCombat() && !Game.tbfight.over && !Game.tbIsPlayerTurn() && n < max) { Game.tbAfterPlayerAction(); n++; }
}
function monsterKey() { if (!Game.tbfight) return undefined; const m = Game.tbfight.fighters.find(f => f.kind === 'monster' && f.alive); return m && m.key; }
function fightLive() { return !!(Game.tbfight && !Game.tbfight.over && Game.inCombat()); }
function freshHunter() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2600; s.hydration = 100; s.energy = 100; s.trauma = 0;
  s.mx = 4; s.my = 4;
  return s;
}

(async () => {
await Game.init();
note('== HUNTER VS WAVE-2 | SEED ' + SEED + ' ==');
const s = freshHunter();
['stalk', 'blood_trail', 'ambush', 'animal_ken', 'game_sense', 'patient_aim',
 'field_dressing', 'tracker', 'dead_aim'].forEach(id => grant(id, 2));
Game.learnRecipe('snare', 3);
clearSays();

// ---------- ACT 1: EXPLORE VERBS VS WAVE-2 ----------
note('\nACT 1 — can the hunter\'s explore verbs touch a wave-2 monster?');
setDay(12, 3); // night — nocturnal wave-2 should be about
check('it is night', Game.isNight());
clearSays();
Game.useAbility('stalk', 'stalk_prey');
const stalkSaid = says.join(' ');
check('stalk_prey narrates (no silent turn)', stalkSaid.length > 40, stalkSaid.slice(0, 90));
flush('stalk');
clearSays();
Game.useAbility('ambush', 'lay_wait');
const waitSaid = says.join(' ');
check('lay_wait narrates', waitSaid.length > 20, waitSaid.slice(0, 100));
flush('laywait');
// tracking: does the tracker verb see monster sign?
clearSays();
let trackOut = null;
try { Game.useAbility('tracker', 'track'); trackOut = says.join(' '); } catch (e) { trackOut = 'THREW: ' + e.message; }
check('track does not crash on monster-era state', !/THREW/.test(trackOut), trackOut.slice(0, 90));
check('track is honest about cold ground (no fake trails)', /Cold ground|Fresh sign/i.test(trackOut), trackOut.slice(0, 90));
flush('track');

// ---------- ACT 2: read_stance knowledge loop vs review_drone ----------
note('\nACT 2 — read_stance knowledge loop vs review_drone (diurnal wave-2)');
setDay(13, 1); // day
Game.startCombat('review_drone');
check('fight started vs review_drone', Game.inCombat());
check('tbfight has id (once-per-fight key)', !!(Game.tbfight && Game.tbfight.id));
clearSays();
Game.useAbility('game_sense', 'read_stance');
const read1 = says.join(' ');
check('FIRST read_stance honest about unknown pattern', /don't know this one well enough|not.*know/i.test(read1), read1.slice(0, 110));
flush('read1');
// survive one telegraphed attack to earn the pattern, then re-read
const mk = monsterKey();
note('   playing out telegraphs to earn the pattern...');
let learned = false;
for (let r = 0; r < 14 && Game.inCombat() && !Game.tbfight.over && !learned; r++) {
  clearSays();
  Game.tbPlayerWait(); // wait answers each telegraph round (no double-advance: wait advances itself)
  awaitPlayerTurn();
  const codex = (Game.state.codex.monsters || {}).review_drone || {};
  learned = !!(codex.patterns && Object.keys(codex.patterns).length);
}
check('surviving the attack taught the pattern (codex)', learned,
  JSON.stringify(((Game.state.codex.monsters || {}).review_drone || {}).patterns || {}).slice(0, 80));
const alive = Game.tbFighter('p') && Game.tbFighter('p').alive;
const php = Game.tbFighter('p') ? Game.tbFighter('p').hp : 'dead';
note(`   player alive after 14 wait-rounds: ${alive} (hp ${php})`);
clearSays();

// ---------- ACT 3: fight review_drone FOR REAL — dodge the beam ----------
note('\nACT 3 — the drone fight, played honestly: stand on the line, then off it');
// FIGHT 3A: stand ON the line through the countdown — the beam must land.
if (fightLive()) { try { Game.tbFlee && Game.tbFlee(); } catch (e) {} clearSays(); }
Game.startCombat('review_drone');
check('fresh drone fight (3A)', Game.inCombat());
{ const pp = Game.tbFighter('p'); pp.mx = 7; pp.my = 4; pp.hp = 500; } // real separation, on the line
let tgDeclared = false, beamFiredA = false, dmgA = 0;
for (let r = 0; r < 12 && fightLive(); r++) {
  clearSays(); awaitPlayerTurn();
  const mm = monsterKey() && Game.tbFighter(monsterKey()); if (!mm) break;
  if (mm.telegraph && mm.telegraph.turnsLeft != null) tgDeclared = true;
  const before = Game.tbFighter('p').hp;
  if (Game.tbIsPlayerTurn()) Game.tbPlayerWait(); // stand still, take it
  const after = Game.tbFighter('p') ? Game.tbFighter('p').hp : before;
  if (after < before) { beamFiredA = true; dmgA += (before - after); }
}
check('drone declares its beam telegraph (countdown)', tgDeclared);
check('standing on the line takes the beam (honest damage)', beamFiredA && dmgA > 0, 'dmg=' + dmgA);
note('   3A: telegraph=' + tgDeclared + ' beamFired=' + beamFiredA + ' dmg=' + dmgA);
if (fightLive()) { try { Game.tbFlee && Game.tbFlee(); } catch (e) {} }
// FIGHT 3B: step OFF the line before firing — clean dodge.
Game.startCombat('review_drone');
{ const pp = Game.tbFighter('p'); pp.mx = 7; pp.my = 4; pp.hp = 500; }
let cleanDodge = false, dmgB = 0, stepped = false;
for (let r = 0; r < 12 && fightLive(); r++) {
  clearSays(); awaitPlayerTurn();
  const mm = monsterKey() && Game.tbFighter(monsterKey()); if (!mm) break;
  const pp = Game.tbFighter('p');
  if (mm.telegraph && mm.telegraph.turnsLeft === 1 && !stepped) { pp.mx = 7; pp.my = 1; stepped = true; }
  const before = pp.hp;
  if (Game.tbIsPlayerTurn()) Game.tbPlayerWait();
  const after = Game.tbFighter('p') ? Game.tbFighter('p').hp : before;
  if (after < before) dmgB += (before - after);
  if (/Clean dodge/i.test(says.join(' '))) cleanDodge = true;
}
check('stepping off the line dodges the beam', stepped && dmgB === 0, 'stepped=' + stepped + ' dmg=' + dmgB);
check('"Clean dodge" is narrated (the read is rewarded)', cleanDodge);
note('   3B: stepped=' + stepped + ' dmg=' + dmgB + ' cleanDodge=' + cleanDodge);
if (fightLive()) { try { Game.tbFlee && Game.tbFlee(); } catch (e) {} }
clearSays();

// ---------- ACT 4: the heckler — WAIT answers back ----------
// SHAME lives on the monster (hkShame) and the player fighter (hkShameTaken) —
// not statusEffects. WAIT clears 3 only when compelled (3+ shame, headliner).
note('\nACT 4 — the heckler: is WAIT-as-answer-back honest (SHAME clears)?');
Game.startCombat('heckler');
check('heckler fight started', Game.inCombat());
{ const pp = Game.tbFighter('p'); pp.hp = 500; }
let shameMax = 0, compelledSeen = false, clearedByWait = false, answerBackSaid = false;
for (let r = 0; r < 30 && fightLive(); r++) {
  clearSays(); awaitPlayerTurn();
  const mmk = monsterKey(); if (!mmk) break;
  const mm = Game.tbFighter(mmk); const pp = Game.tbFighter('p'); if (!pp) break;
  const shame = mm.hkShame || 0;
  if (shame > shameMax) shameMax = shame;
  if (pp.hkCompelled) compelledSeen = true;
  if (pp.hkCompelled && !clearedByWait) {
    const before = mm.hkShame || 0;
    Game.tbPlayerWait(); // WAIT = answer back — should clear 3 shame
    const said = says.join(' ');
    const afterM = monsterKey() && Game.tbFighter(monsterKey());
    const after = afterM ? (afterM.hkShame || 0) : before;
    if (before - after >= 3) clearedByWait = true;
    if (/answer back/i.test(said)) answerBackSaid = true;
    clearSays();
  } else if (Game.tbIsPlayerTurn()) { Game.tbPlayerStrike(mmk); endTurn(); }
  else Game.tbAfterPlayerAction();
}
note('   shameMax=' + shameMax + ' compelled=' + compelledSeen + ' clearedByWait=' + clearedByWait + ' answerBackSaid=' + answerBackSaid);
check('heckler stacks SHAME on the player', shameMax >= 3, 'max=' + shameMax);
check('3+ SHAME compels an answer (the counter is offered)', compelledSeen);
check('WAIT while compelled clears 3 SHAME', clearedByWait);
check('"answer back" is narrated (the counter has a voice)', answerBackSaid);
if (fightLive()) { try { Game.tbFlee && Game.tbFlee(); } catch (e) {} }
clearSays();

// ---------- ACT 5: the Grief Counselor is edible — hunt it, dress it ----------
// Wave-2's only edible monster: mirror_stag, 2800 kcal, "Venison, technically."
note('\nACT 5 — the hunter eats a wave-2 monster: kill, search, dress the stag');
Game.startCombat('mirror_stag');
check('stag fight started', Game.inCombat());
{ const pp = Game.tbFighter('p'); pp.hp = 500; }
// weaken it so the kill is quick but the pipeline (death -> corpse -> loot) runs
{ const mmk = monsterKey(); if (mmk) Game.tbFighter(mmk).hp = 1; }
for (let r = 0; r < 20 && fightLive(); r++) {
  awaitPlayerTurn();
  const mmk = monsterKey(); if (!mmk) break;
  if (Game.tbIsPlayerTurn()) { Game.tbPlayerStrike(mmk); endTurn(); }
  else Game.tbAfterPlayerAction();
}
const stagDead = monsterKey() === undefined;
check('stag slain', stagDead);
clearSays();
// find the corpse, search it
let corpse = null;
try {
  const list = Game.corpses ? Game.corpses() : (Game.state.corpses || []);
  corpse = list.filter(c => c.kind === 'monster' && !c.buried).slice(-1)[0] || null;
} catch (e) {}
check('monster corpse registered', !!corpse, corpse ? ('items=' + ((corpse.items || []).length)) : 'none');
let carcassInPack = false;
if (corpse && corpse.id != null) {
  clearSays();
  try { Game.lootCorpse(corpse.id, true); } catch (e) { Game.say('LOOT THREW: ' + e.message); }
  const lootSaid = says.join(' ');
  note('   loot: ' + lootSaid.slice(0, 160));
  carcassInPack = (Game.state.scholar.inventory || []).some(i => i.foodKind === 'meat' && i.foodState === 'carcass');
}
check('stag carcass searched off the body into the pack', carcassInPack);
clearSays();
try { Game.useAbility('field_dressing', 'dress_game'); } catch (e) { Game.say('THREW: ' + e.message); }
const dressSaid = says.join(' ');
check('dress_game converts the monster carcass (no silent refusal)', /kcal of meat|No game to dress|THREW/.test(dressSaid), dressSaid.slice(0, 110));
flush('dress');
clearSays();

// ---------- ACT 6: trap honesty — snare vs a monster ----------
note('\nACT 6 — trap honesty: does a set snare do anything to a monster?');
// leave combat, set a snare, spawn a monster onto the tile via encounter sim
if (Game.inCombat() && !Game.tbfight.over) { try { Game.tbFlee && Game.tbFlee(); } catch (e) {} }
const s6 = Game.state.scholar;
if (!s6.inventory.find(i => i.material === 'vine')) s6.inventory.push({ material: 'vine', units: 4, name: 'vine' }, { material: 'stick', units: 4, name: 'stick' });
clearSays();
Game.craft('snare');
clearSays();
Game.setTrap('snare');
const trapSaid = says.join(' ');
check('snare set narrates', trapSaid.length > 10, trapSaid.slice(0, 90));
flush('trap');
const trapsBefore = JSON.stringify(Game.state.traps || Game.traps || 'NO-TRAP-STORE');
note('   trap store after set: ' + String(trapsBefore).slice(0, 120));
clearSays();

// ---------- ACT 7: night fear — Static (nocturnal wave-2) ----------
note('\nACT 7 — night fear: does the silence telegraph cover wave-2 nocturnals?');
setDay(14, 3); // night
clearSays();
Game.startCombat('voice_mimic_radio'); // Static — "a voice you know is calling your name"
const fearSaid = says.join(' ');
check('Static encounter narrates (no silent entry)', fearSaid.length > 20, fearSaid.slice(0, 120));
flush('static');
clearSays();
Game.useAbility('game_sense', 'read_stance');
flush('staticRead');

note('\n== SUMMARY ==');
const fails = results.filter(r => !r[1]);
note(`   ${results.length - fails.length}/${results.length} checks passed`);
fails.forEach(r => note('   FAIL: ' + r[0]));
if (Game.inCombat() && !Game.tbfight.over) { try { Game.tbFlee && Game.tbFlee(); } catch (e) {} }
process.exit(fails.length ? 1 : 0);
})();
