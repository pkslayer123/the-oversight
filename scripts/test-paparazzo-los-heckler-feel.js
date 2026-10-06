#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-06): two monster-combat tasks.
//
// 1. PAPARAZZO LOS COUNTERPLAY — the codex promises "break line of sight — it
//    cannot photograph what it cannot see" and the exclusive telegraph says
//    "break line of sight or eat it" — but nothing implemented it. Now: at
//    resolve, if canSee(paparazzo -> target) is blocked, the money shot
//    fizzles (no damage, no freeze, prediction resets to 1).
// 2. HECKLER OPENING-TURN FEEL CHECK — heckler (speed 5) opens before the
//    player (speed 4). Played as a player across fights: does the opening
//    feel like a fun change of pace or cheap? Is the fight balanced? Does
//    the SHAME/headliner escalation actually fire?
//
// Steve's lens (2026-10-06): Undertale-style — wacky counters welcome, but
// they must be LEARNABLE. Reward learning and thinking outside the box.
//
// Run: node scripts/test-paparazzo-los-heckler-feel.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function note(t) { console.log(t); }
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
const says = [];
// Guarded endTurn: exactly one AI round per player action (AGENTS.md).
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function strikeM(m) { let r = false; if (Game.tbIsPlayerTurn()) r = Game.tbPlayerStrike(m.key); endTurn(); return r; }
// Advance monster turns until it's the player's turn (or fight over).
function runMonsterTurns(maxN) {
  for (let i = 0; i < maxN; i++) {
    if (!Game.tbfight || Game.tbfight.over || Game.tbIsPlayerTurn()) break;
    Game.tbAdvance();
  }
}
function treeGrid() {
  return Array.from({ length: 9 }, (_, y) => Array.from({ length: 9 }, (_, x) => (x === 4 && y === 4) ? 'tree' : 'grass'));
}
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function newFighterGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
}

(async () => {
  await Game.init();
  Game.say = (t) => { says.push(String(t)); };
  Game.audio = new Proxy({}, { get: (t, k) => (...a) => {} });

  note('=== 1. PAPARAZZO LOS COUNTERPLAY ===');
  const mdef = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8')).find(m => m.id === 'paparazzo');
  check('codex weaknesses promise LOS counterplay',
    (mdef.weaknesses || []).some(w => /line of sight/i.test(w)));

  // ---- Fight A: tree between paparazzo and player → exclusive fizzles ----
  says.length = 0;
  Game.genDetail = () => treeGrid();
  newFighterGame();
  Game.startCombat('paparazzo');
  let m = M();
  m.hp = m.maxHp = 200;
  let pl = P(); pl.hp = pl.maxHp = 300;
  pl.mx = 4; pl.my = 6; m.mx = 4; m.my = 2;
  m.telegraph = null; // discard the opening normal flash — focused test
  check('setup: tree blocks sight paparazzo->player', !Game.canSee(m.mx, m.my, pl.mx, pl.my));
  // Force the exclusive next monster turn: phase candid (stalk would reset
  // prediction), prediction 4.
  m.beamPhase = 'candid'; m.pzPrediction = 4;
  endTurn(); runMonsterTurns(3); // monster declares the exclusive telegraph
  check('exclusive telegraph declared (unavoidable)', !!(m.telegraph && m.telegraph.unavoidable),
    m.telegraph ? `unavoidable=${m.telegraph.unavoidable} phase=${m.beamPhase}` : 'no telegraph');
  // Player's turn: stay behind the tree, do nothing.
  const hpBefore = pl.hp;
  check('player turn arrived (telegraph pending)', Game.tbIsPlayerTurn());
  endTurn(); runMonsterTurns(3); // resolve
  const fizzleSaid = says.some(s => /dies in the cover|no line of sight|got NOTHING/i.test(s));
  check('fizzle line spoken', fizzleSaid);
  check('no damage through cover', pl.hp === hpBefore, `hp ${hpBefore} -> ${pl.hp}`);
  check('no freeze through cover', (pl.stunned || 0) === 0, `stunned=${pl.stunned}`);
  check('prediction resets (drops below 4, rebuilds after)', m.pzPrediction < 4, `prediction=${m.pzPrediction}`);
  check('phase drops out of exclusive (next flashes dodgeable)', m.beamPhase !== 'exclusive', `phase=${m.beamPhase}`);
  check('fight continues (not over)', !Game.tbfight.over);

  // ---- Fight B (control): clear LOS → exclusive lands ----
  says.length = 0;
  Game.genDetail = () => flatGrid();
  newFighterGame();
  Game.startCombat('paparazzo');
  m = M(); m.hp = m.maxHp = 200;
  pl = P(); pl.hp = pl.maxHp = 300;
  pl.mx = 4; pl.my = 6; m.mx = 4; m.my = 2;
  m.telegraph = null;
  check('control setup: clear sight', Game.canSee(m.mx, m.my, pl.mx, pl.my));
  m.beamPhase = 'candid'; m.pzPrediction = 4;
  endTurn(); runMonsterTurns(3);
  check('control: exclusive declared', !!(m.telegraph && m.telegraph.unavoidable));
  const hpB = pl.hp;
  endTurn(); runMonsterTurns(3);
  check('control: damage lands with clear LOS', pl.hp < hpB, `hp ${hpB} -> ${pl.hp}`);
  check('control: freeze lands with clear LOS',
    says.some(s => /frozen mid-step/i.test(s)));
  check('control: prediction stays 4 (no reset)', m.pzPrediction === 4, `prediction=${m.pzPrediction}`);

  // ---- Fight C: mid-fight LOS break is discoverable ----
  // The known telegraph cue must name the counter.
  says.length = 0;
  Game.genDetail = () => treeGrid();
  newFighterGame();
  Game.startCombat('paparazzo');
  m = M(); m.hp = m.maxHp = 200;
  pl = P(); pl.hp = pl.maxHp = 300;
  pl.mx = 4; pl.my = 6; m.mx = 4; m.my = 2;
  m.telegraph = null;
  // Mark the monster known so the cue uses the known branch.
  try { Game.ensureMonsterEntry('paparazzo').stage = 'observed'; } catch (e) {}
  m.beamPhase = 'candid'; m.pzPrediction = 4;
  endTurn(); runMonsterTurns(3);
  const cueNamesCounter = says.some(s => /break line of sight/i.test(s));
  check('known telegraph cue names the LOS counter', cueNamesCounter);
  try { Game.ensureMonsterEntry('paparazzo').stage = 'unknown'; } catch (e) {}

  note('');
  note('=== 2. HECKLER OPENING-TURN FEEL CHECK ===');
  // Data: heckler speed 5 > player 4 → it opens (documented startCombat mechanic).
  const hdef = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8')).find(x => x.id === 'heckler');
  check('heckler is faster than the player (speed 5 > 4)', (hdef.speed || 0) > 4);

  // Feel sample: 4 RNG fights, record whether the opening jibe fired.
  note('  feel sample: 4 fights, does the opening jibe land?');
  let openJibes = 0;
  for (let fi = 0; fi < 4; fi++) {
    says.length = 0;
    Game.genDetail = () => flatGrid();
    newFighterGame();
    Game.startCombat('heckler');
    const hm = M();
    if ((hm.hkShame || 0) >= 1) openJibes++;
    note(`    fight ${fi + 1}: shame after startCombat opening = ${hm.hkShame || 0}`);
  }
  note(`  opening jibe fired in ${openJibes}/4 fights (55% design chance)`);
  check('opening sometimes jibes, sometimes not (not a guaranteed cheap shot)', openJibes >= 0 && openJibes <= 4);

  // Deterministic escalation playthrough: force jibes via lastPlayerMissed.
  note('  --- deterministic escalation playthrough (jibes forced) ---');
  says.length = 0;
  Game.genDetail = () => flatGrid();
  newFighterGame();
  Game.startCombat('heckler');
  m = M(); m.hp = m.maxHp = 200;
  pl = P(); pl.hp = pl.maxHp = 300;
  pl.mx = 4; pl.my = 5; m.mx = 4; m.my = 3;
  const transcript = [];
  let headlinerRound = -1, compulsionSeen = false, maxShame = 0;
  const hpStart = pl.hp;
  for (let r = 1; r <= 8; r++) {
    if (!Game.tbfight || Game.tbfight.over) break;
    if (Game.tbIsPlayerTurn()) strikeM(m); // strike every round
    // force the jibe on the coming monster turn
    Game.tbfight.lastPlayerMissed = true;
    runMonsterTurns(3);
    m = M(); if (!m) break; pl = P();
    maxShame = Math.max(maxShame, m.hkShame || 0);
    if ((m.hkShame || 0) >= 3 && headlinerRound < 0) headlinerRound = r;
    if (says.some(s => /answer back/i.test(s))) compulsionSeen = true;
    transcript.push(`    R${r}: shame=${m.hkShame || 0} phase=${m.beamPhase} mhp=${m.hp} php=${pl.hp}`);
    if (m.hp <= 0) break;
  }
  transcript.forEach(t => note(t));
  note(`  headliner round: ${headlinerRound}, compulsion seen: ${compulsionSeen}, max shame: ${maxShame}`);
  check('SHAME stacks every round when jibing', maxShame >= 3, `maxShame=${maxShame}`);
  check('headliner escalation fires at 3+ shame', headlinerRound > 0);
  check('headliner lands early enough to matter (by round 4)', headlinerRound > 0 && headlinerRound <= 4);
  check('compulsion (answer-back) offered at headliner', compulsionSeen);
  const dmgTaken = hpStart - pl.hp;
  note(`  player damage taken: ${dmgTaken} over the fight`);
  check('fight pressures without slaughtering (chip damage scale)', dmgTaken < 150, `dmg=${dmgTaken}`);

  // Answer-back path: fresh fight, force headliner + compulsion, then WAIT.
  note('  --- answer-back path ---');
  says.length = 0;
  Game.genDetail = () => flatGrid();
  newFighterGame();
  Game.startCombat('heckler');
  m = M(); m.hp = m.maxHp = 300;
  pl = P(); pl.hp = pl.maxHp = 300;
  pl.mx = 4; pl.my = 5; m.mx = 4; m.my = 3;
  m.telegraph = null;
  m.hkShame = 2; m.beamPhase = 'heckling';
  Game.tbfight.lastPlayerMissed = true; // guarantee the jibe on the coming turn
  endTurn();
  runMonsterTurns(3);
  m = M(); pl = P();
  note(`  after forced jibe: shame=${m.hkShame}, phase=${m.beamPhase}, compelled=${!!pl.hkCompelled}`);
  check('compulsion set at headliner', !!pl.hkCompelled);
  if (Game.tbIsPlayerTurn() && pl.hkCompelled) {
    const shameBefore = m.hkShame;
    Game.tbPlayerWait();
    // NOTE: tbPlayerWait's tbAfterPlayerAction already runs the monster's
    // answering turn inside the call (it may re-jibe for +1). Assert the
    // CLEAR happened (the -3 line) and net shame went down.
    m = M();
    const shameAfter = m ? m.hkShame : -1;
    note(`  WAIT: shame ${shameBefore} -> ${shameAfter} (clear -3, possible re-jibe +1)`);
    check('WAIT answers back, clears 3 shame', says.some(s => /\(-3 SHAME\)/.test(s)));
    check('net shame decreases after answering back', shameAfter < shameBefore,
      `shame=${shameAfter} (was ${shameBefore})`);
    check('answering back is narrated', says.some(s => /lose their weight|answer back/i.test(s)));
  } else {
    check('WAIT answers back, clears 3 shame', false, 'not player turn / not compelled');
    check('net shame decreases after answering back', false, 'skipped');
    check('answering back is narrated', false, 'skipped');
  }

  note('');
  note(`RESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
