#!/usr/bin/env node
// AP BEAM SOURCE-FIX PROOF (Steve 2026-10-08) — apBeamHit in alienPlayers.js
// addressed the player fighter as 'player' while the combat engine keys it
// 'p': tbFighter('player') is undefined, so every alien beam announced and
// silently whiffed (damage block skipped). The ap-encounter worker fixed it
// with a seam adapter in encounters.js; this run fixes it at the SOURCE
// (engineKey normalization inside apBeamHit) and removes the adapter, which
// would otherwise translate 'player'->'p' before the module's own display
// logic and silently kill the 'You take' wording and the sentimental-bond
// deepen moment (Steve 2026-10-07).
//
// What this proves:
//   A — direct apBeamHit('player') lands damage on the player (was a no-op)
//   B — display reads "You take ... beam damage" (module display convention)
//   C — bonded sentimental armor deepens its bond when it catches a beam
//       (the path the seam adapter would have skipped)
//   D — encounters.js no longer wraps G.apBeamHit (adapter removed)
//   E — engine-key callers ('p') still work
//
// HARNESS: full src/js/*.js list in index.html order + alienPlayers.js after
// contests.js, minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js
// and minus drama.js. global.window stub for eval, deleted before play
// (sync combat path). RNG seeded (mulberry32, fixed default 20261008, SEED
// env override).
//
// Exit code non-zero on any assertion failure.
// Run: node scripts/test-ap-beam-source-fix-20261008.js
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // BEFORE eval: modules capture it at load
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(read(f))) });
global.window = global; // equipment.js touches window at load
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 // alienPlayers.js: index.html placement is right after contests.js
 'src/js/alienPlayers.js',
 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
_SCRIPTS.forEach(f => eval(read(f)));
delete global.window; // sync combat path
const Game = globalThis.Scattering.Game;

let passN = 0, failN = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passN++; }
  else { failN++; fails.push(name + (extra ? ' — ' + extra : '')); console.log(`   [FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
}
function drain() {
  const l = Game.log || [];
  const s = l.map(x => x.text || x).join('\n');
  l.length = 0;
  return s;
}

// ---------- setup: real alien fight via the debug scenario ----------
(async () => {
await Game.init(); // async data load (fetch stubbed above)
Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
Game.genRoster('Columbus, Ohio');
Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
Game.depart();
const s0 = Game.state.scholar;
s0.day = 30;
Game.state.systemArrived = true;
Game.state.systemIntegration = 1;
Game.state.waveKills = { 1: 4 };
Game.state.wandererNextDay = 9999;
s0.health = 120; s0.kcal = 2400; s0.hydration = 100; s0.trauma = 0;
s0.insideHaven = false;
s0.mx = 4; s0.my = 4;
drain();

const scenOk = Game.debugScenario('alienEncounter');
ok('alienEncounter debug scenario starts a fight', !!scenOk && !!Game.tbfight && !Game.tbfight.over);
const pl0 = Game.tbFighter('p');
ok('player fighter keyed p exists and alive', !!(pl0 && pl0.alive));

// ---------- ACT A: direct apBeamHit('player') lands damage ----------
drain();
const hpBefore = pl0.hp;
Game.apBeamHit('player', 0, 'test beam', { damageType: 'alien_beam' });
const plAfter = Game.tbFighter('p');
ok('beam damage LANDS (hp decreased — was a silent whiff)', plAfter.hp < hpBefore, `hp ${hpBefore} -> ${plAfter.hp}`);
const logA = drain();
ok('display reads "You take ... beam damage"', /You take \d+ beam damage/.test(logA), logA.slice(0, 120));
ok('beam-horror beat fires on first unresisted beam', /NOT A FAIR FIGHT/.test(logA));

// ---------- ACT B: bonded sentimental armor deepens bond ----------
// Fake a sentimental armor def (test-only): apBeamResistPieces counts it
// when class==='sentimental', def.armor truthy, bond>=25.
// NOTE: re-fetch state.scholar — the scenario may have replaced the object.
const schB = Game.state.scholar;
Game.data.items.push({ id: '__test_bonded_vest', name: 'test bonded vest', class: 'sentimental', armor: {} });
schB.equipped = schB.equipped || {};
schB.equipped.torso = { itemId: '__test_bonded_vest', bond: 30 };
schB._beamHorrorSeen = true; // isolate the bond path from the horror beat
const bondCalls = [];
const _bumpBond = Game.bumpBond;
Game.bumpBond = function (itemId, n, why) { bondCalls.push({ itemId, n, why }); };
plAfter.hp = plAfter.maxHp; plAfter.alive = true; // revive for act B
drain();
Game.apBeamHit('player', 0, 'test beam', { damageType: 'alien_beam' });
const logB = drain();
ok('bonded armor absorbs part of the beam', /1 resistant piece/.test(logB) || /resistant/.test(logB));
ok('sentimental bond deepens when it catches a beam', bondCalls.some(c => c.itemId === '__test_bonded_vest'), JSON.stringify(bondCalls));
Game.bumpBond = _bumpBond;
delete schB.equipped.torso;
Game.data.items = Game.data.items.filter(i => i.id !== '__test_bonded_vest');

// ---------- ACT C: engine-key callers still work; no adapter ----------
const encSrc = read('src/js/encounters.js');
ok('seam adapter removed from encounters.js', encSrc.indexOf('_beamWrapped') < 0);
plAfter.hp = plAfter.maxHp; plAfter.alive = true;
drain();
const hpC = plAfter.hp;
Game.apBeamHit('p', 0, 'test beam', { damageType: 'alien_beam' });
ok("engine-key call apBeamHit('p') also lands", Game.tbFighter('p').hp < hpC);

// ---------- summary ----------
console.log(`\n== ${passN} passed, ${failN} failed ==`);
if (failN) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('ALL GREEN');
})().catch(e => { console.error('PROOF CRASHED:', e); process.exit(1); });
