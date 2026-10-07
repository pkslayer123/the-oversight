#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07), HUNTER archetype — the tracker & the night hunter.
// Fresh territory NOT covered by hunter1/2/3, playtest-hunter-week, or the
// trapline run (those did: snare craft/set + dawns, night stalk practice,
// night strikes, monster kill arc, loot-as-action, corpse rot, trapline dawn
// honesty, skunk regret, pit self-harm, deadfall bait economy):
//   ACT 1: THE APPROACH GAME — walk toward a rabbit turn by turn. Does the
//          wary/freeze/bolt narration read well? Does the `tracker` ability
//          visibly change outcomes? Tension or tedium?
//   ACT 2: PREY FIGHTS BACK — aggressive animals (snapping turtle). Strike at
//          grab range: bites, fumbles, the cost of capture. Dangerous-fun?
//   ACT 3: NIGHT HUSHWOLF MID-HUNT — the silence telegraph in the log, a few
//          combat rounds, night_hunting knowledge bonus, the wound-the-lead
//          counter. Undertale-wacky or stat check?
//   ACT 4: MEAT ECONOMY LEDGER — full kill->gut->cook->eat kcal ledger. Is a
//          hunt-day a real food vector vs a forage day?
// TURN HYGIENE: after the player action, advance ONLY if still player's turn.
// RNG: seeded mulberry32 for a reproducible play (SEED env override).
// Run: node scripts/play-feel-20261007-hunter-tracker.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
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
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
// drama.js excluded: DOM at load (document.getElementById). All Game.drama
// calls in game.js are try/caught, so the harness runs fine without it.
_SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // drop the stub: tbAfterPlayerAction takes the SYNC advance path without window
const Game = globalThis.Scattering.Game;
const note = t => console.log(t);
function say() { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; }
function scene(t) { note('\n==== ' + t + ' ===='); }
const results = [];
const ok = (name, cond) => { results.push([name, !!cond]); note(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}`); };
function freshHunter() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.hp = 100;
  s.mx = 4; s.my = 4;
  say();
  return s;
}
function giveSpear(s) {
  // fire-hardened spear: range 2, +30 hunt. Equip like the game would.
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear' };
  s.inventory.push({ name: 'Fire-hardened spear', recipeId: 'fire_hardened_spear' });
}
function grantTracker(s, lvl) {
  s.abilities = s.abilities || [];
  s.abilities = s.abilities.filter(a => a.id !== 'tracker');
  s.abilities.push({ id: 'tracker', name: 'Tracker', desc: 'the System\'s gift', level: lvl, xp: 0 });
}

(async () => {
await Game.init();
note('== SEED ' + SEED + ' ==');

// ================= ACT 1: the approach game =================
// NOTE: the operative animalTurn lives in encounters.js (it overwrites
// game.js's older graze/wary/bolt version at load). Instrument the real
// state machine: pstate, aware, s.animal null (bolted/despawned), and the
// actual narration. The honest player verbs: walk 1 tile/turn, or stalkAnimal
// (crouch-quiet, -15 kcal).
scene('ACT 1 — the approach game: rabbit at (7,6), player at (4,4)');
function approachRun(s, label, useStalk, trials) {
  let reaches = 0, bolts = 0, waryNotes = 0, strikes = 0, kills = 0;
  for (let t = 0; t < trials; t++) {
    s.mx = 4; s.my = 4;
    s.animal = { id: 'cottontail_rabbit', mx: 7, my: 6, aware: 0, pstate: 'graze' };
    s.stalked = false; say();
    for (let turn = 0; turn < 10; turn++) {
      const a = s.animal;
      if (!a) { bolts++; break; }
      const dist0 = Math.max(Math.abs(a.mx - s.mx), Math.abs(a.my - s.my));
      Game.log.length = 0;
      if (dist0 <= 2) {
        // strike range (spear). Strike, then stop.
        strikes++;
        Game.huntAnimal(); say();
        if (!s.animal) kills++;
        break;
      }
      if (useStalk) { Game.stalkAnimal(); }
      else {
        s.mx += Math.sign(a.mx - s.mx); s.my += Math.sign(a.my - s.my);
        Game.animalTurn();
      }
      const txt = say();
      if (/still|deciding|wary|freezing/i.test(txt)) waryNotes++;
      const a2 = s.animal;
      if (!a2) break;
      const dist1 = Math.max(Math.abs(a2.mx - s.mx), Math.abs(a2.my - s.my));
      if (dist1 <= 2) reaches++;
    }
  }
  note(`   ${label}: reached strike range ${reaches}/${trials}, gone/bolted ${bolts}/${trials}, wary narrations ${waryNotes}, strikes ${strikes}, kills ${kills}`);
  return { reaches, bolts, kills };
}
const s1 = freshHunter();
giveSpear(s1);
note('   one walk-in, turn by turn (no tracker):');
s1.mx = 4; s1.my = 4;
s1.animal = { id: 'cottontail_rabbit', mx: 7, my: 6, aware: 0, pstate: 'graze' };
say();
for (let turn = 0; turn < 6; turn++) {
  const a = s1.animal;
  if (!a) { note(`   turn ${turn}: gone.`); break; }
  s1.mx += Math.sign(a.mx - s1.mx); s1.my += Math.sign(a.my - s1.my);
  Game.log.length = 0; Game.animalTurn();
  const txt = say();
  note(`   turn ${turn}: dist=${Math.max(Math.abs(a.mx - s1.mx), Math.abs(a.my - s1.my))} aware=${(a.aware || 0).toFixed(2)} pstate=${a.pstate} | ${txt.slice(0, 110) || '(silent)'}`);
}
const walkNoTrack = approachRun(s1, 'walk, no tracker   ', false, 20);
grantTracker(s1, 2);
note('   abilityLevel(tracker)=' + Game.abilityLevel('tracker'));
const walkTrack2 = approachRun(s1, 'walk, tracker L2    ', false, 20);
s1.abilities = (s1.abilities || []).filter(x => x.id !== 'tracker');
const stalkNoTrack = approachRun(s1, 'stalk, no tracker  ', true, 20);
ok('quiet approach kills more: tracker L2 walk beats loud walk', walkTrack2.kills > walkNoTrack.kills);
ok('quiet approach kills more: stalk beats loud walk', stalkNoTrack.kills > walkNoTrack.kills);

// ================= ACT 2: prey fights back =================
scene('ACT 2 — prey fights back: snapping turtle (aggressive, never bolts)');
const s2 = freshHunter();
giveSpear(s2);
s2.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife' });
s2.mx = 4; s2.my = 4;
s2.animal = { id: 'snapping_turtle', mx: 6, my: 4, aware: 0, pstate: 'graze' };
say();
note('   walk-in, turn by turn:');
let hissed = false;
for (let turn = 0; turn < 6; turn++) {
  const a = s2.animal;
  if (!a) { note(`   turn ${turn}: GONE (it bolted?!)`); break; }
  if (turn > 0) { s2.mx += Math.sign(a.mx - s2.mx); s2.my += Math.sign(a.my - s2.my); }
  Game.log.length = 0; Game.animalTurn();
  const txt = say();
  if (/hiss/i.test(txt)) hissed = true;
  const dist = Math.max(Math.abs(a.mx - s2.mx), Math.abs(a.my - s2.my));
  note(`   turn ${turn}: dist=${dist} pstate=${a.pstate} | ${txt.slice(0, 100) || '(silent)'}`);
}
ok('aggressive turtle hisses a warning at close range', hissed);
ok('aggressive turtle never bolts (still there after 6 turns)', !!s2.animal);
// now strike at grab range: the bite block in huntAnimal (60% aggressive)
s2.animal = { id: 'snapping_turtle', mx: 5, my: 4, aware: 0, pstate: 'graze' };
s2.mx = 4; s2.my = 4; say();
let bitten = 0, fumbled = 0, struck2 = 0;
const hpB = s2.health; // the bite block and animalTurn snaps damage s.health, not s.hp
while (s2.animal && struck2 < 12) {
  const a = s2.animal; a.mx = 5; a.my = 4; // hold it close for the test
  const hp0 = s2.health;
  Game.log.length = 0; Game.huntAnimal(); struck2++;
  const txt = say();
  if (s2.health < hp0) { bitten++; if (bitten === 1) note(`   first bite: ${txt.slice(0, 160)}`); }
  if (/fumble|wriggles free/i.test(txt)) fumbled++;
}
note(`   ${struck2} grab-range strikes: bitten ${bitten}x, fumbled ${fumbled}x, health ${hpB}->${s2.health}`);
ok('grab-range strikes on an aggressive animal cost blood (bitten >= 1)', bitten >= 1);
const carc2 = s2.inventory.findIndex(i => i.foodState === 'carcass');
note('   carcass: ' + (carc2 >= 0 ? s2.inventory[carc2].name : 'none'));

// ================= ACT 3: night hushwolf mid-hunt =================
scene('ACT 3 — night hushwolf mid-hunt: the silence telegraph');
const s3 = freshHunter();
giveSpear(s3);
s3.mx = 4; s3.my = 4;
s3.animal = { id: 'cottontail_rabbit', mx: 7, my: 6, aware: 0, pstate: 'graze' };
Game.dayPart = 3; // night
s3.dayTicks = Game.TIME ? Game.TIME.TICKS_PER_PART * 3 : 0;
note('   isNight=' + Game.isNight());
s3.monster = { id: 'hushwolf', mx: 6, my: 4 }; // monster arrives while you're hunting
say();
note('   hunting a rabbit... then the pack arrives. One turn:');
// let the rabbit sit; walk the player toward the monster and run a monster turn
s3.animal = null;
s3.mx = 5; s3.my = 4; // step adjacent to the wolf
Game.log.length = 0;
Game.monsterTurn();
let combatStarted = !!Game.tbfight && !Game.tbfight.over;
const telegraph = say();
note('   > ' + telegraph.slice(0, 260));
ok('hushwolf combat starts when adjacent', combatStarted);
ok('silence telegraph line fires', /goes? silent|holding its breath|holding its breath|silent/i.test(telegraph));
if (combatStarted) {
  // two player rounds: strike the lead, read the narration
  for (let r = 0; r < 2; r++) {
    if (!Game.tbfight || Game.tbfight.over) { note('   fight ended after round ' + r + ' (pack broke?)'); break; }
    Game.log.length = 0;
    if (!Game.tbIsPlayerTurn()) Game.tbAdvance();
    const lead = Game.tbfight.fighters.find(f => f.kind === 'monster' && f.wolfLead) || Game.tbfight.fighters.find(f => f.kind === 'monster');
    if (lead && Game.tbIsPlayerTurn()) Game.tbPlayerStrike(lead.key);
    if (Game.tbIsPlayerTurn()) Game.tbAdvance(); // only if still our turn
    note(`   round ${r + 1}: ` + say().slice(0, 220));
  }
  const leadWounded = Game.tbfight && Game.tbfight.fighters.some(f => f.wolfBroken);
  note('   wound-the-lead counter triggered (wolfBroken): ' + leadWounded);
  note('   fight still running: ' + !!(Game.tbfight && !Game.tbfight.over));
  // end combat gracefully
  if (Game.tbfight) Game.tbfight.over = true;
}

// ================= ACT 4: meat economy ledger =================
scene('ACT 4 — meat economy ledger: one rabbit, nose to tail');
const s4 = freshHunter();
giveSpear(s4);
s4.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife' });
const kcalStart = s4.kcal;
s4.mx = 4; s4.my = 4;
s4.animal = { id: 'cottontail_rabbit', mx: 5, my: 4, aware: 0, pstate: 'graze' };
say();
let strikes4 = 0, kill4 = false;
while (!kill4 && strikes4 < 25) {
  const a = s4.animal;
  if (!a) { kill4 = true; break; }
  a.mx = 5; a.my = 4;
  Game.log.length = 0; Game.huntAnimal(); strikes4++;
  if (!s4.animal) { kill4 = true; note('   kill msg: ' + say().slice(0, 200)); break; }
}
note(`   strikes to kill: ${strikes4} (each -100 kcal) -> hunt cost ${strikes4 * 100} kcal`);
const ci = s4.inventory.findIndex(i => i.foodState === 'carcass');
ok('carcass landed in inventory', ci >= 0);
if (ci >= 0) {
  Game.log.length = 0; Game.cleanCarcass(ci);
  note('   clean: ' + say().slice(0, 180));
  const mi = s4.inventory.findIndex(i => i.foodState === 'cleaned' && /rabbit/i.test(i.name));
  ok('cleaned meat exists', mi >= 0);
  if (mi >= 0) {
    const meat = s4.inventory[mi];
    // cook at the haven fire: lodge footprint rows 3-4/cols 3-5 (commit
    // ae99bb7, 2026-10-07) — put a lit fire on the player's tile.
    Game.genDetail = () => Array.from({ length: 9 }, (_, y) =>
      Array.from({ length: 9 }, (_, x) => (x === 4 && y === 4) ? 'fire' : 'grass'));
    s4.insideHaven = true;
    Game.log.length = 0; Game.cookFood(mi);
    note('   cook: ' + say().slice(0, 180));
    const coi = s4.inventory.findIndex(i => i.foodState === 'cooked' && /rabbit/i.test(i.name));
    if (coi >= 0) {
      const cooked = s4.inventory[coi];
      const total = (cooked.units || 1) * (cooked.kcalEach || 0);
      // eat it all, one portion at a time (the Pack UI eats per-item: eatOne).
      // Reset to a hungry 1200 first so the kcal bar cap can't clamp the ledger.
      const spentHunting = Math.round(kcalStart - s4.kcal); // strikes+clean+cook+ticks
      s4.kcal = 1200;
      let portions = 0;
      Game.log.length = 0;
      while (portions < 12) {
        const ci2 = s4.inventory.findIndex(i => i.foodState === 'cooked' && /rabbit/i.test(i.name));
        if (ci2 < 0) break;
        Game.eatOne(ci2); portions++;
      }
      say();
      const gained = Math.round(s4.kcal) - 1200;
      const net = gained - spentHunting;
      note(`   LEDGER: hunt-day spend ${spentHunting} kcal (strikes+clean+cook+ticks) | rabbit return +${gained} kcal (${portions} portions) | NET ${net >= 0 ? '+' : ''}${net} kcal`);
      ok('one rabbit covers a real fraction of the 2000 kcal day', total >= 400);
      ok('a clean rabbit hunt nets positive kcal', net > 0);
    }
  }
}

// ================= verdict =================
scene('VERDICT');
const fails = results.filter(r => !r[1]);
note(`checks: ${results.length - fails.length}/${results.length} passed`);
if (fails.length) { note('FAILED:'); fails.forEach(f => note('  - ' + f[0])); }
process.exit(fails.length ? 1 : 0);
})();
