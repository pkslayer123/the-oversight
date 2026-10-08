#!/usr/bin/env node
// GLASSWING DIVE + SUNBASKER BASK — play-as-player audit (Steve 2026-10-07).
// Worker B, flesh-out loop queue item #4: never audited by playing.
//
// Audits, against a PINNED engine tree (GAME_SRC env; this run pinned
// 2275cc125915e549e17a737f133bfd361d95bdb5 — see evidence note):
//   A. exploration dive trap: trigger, shadow escalation, HIT path
//   B. exploration dive trap: MISS path (move off the tile)
//   C. in-combat dive loop: declare -> dodge -> grounded -> punish -> escape/kill
//   D. in-combat dive: stand still -> hit, climb, damage within [10,16]
//   E. sunbasker bask: charge builds in sun, bite declared at 2, charge spends
//   F. sunbasker pressure: hitting every turn starves the charge
//   G. sunbasker flatten: night/shade -> "no sun, no fight"
//   H. knowledge gating: unknown vs coached telegraph text, first-contact lines
//   I. silent-turn sweep + audio-hook mapping + modifier consumption sweep
//
// Run: GAME_SRC=/tmp/glasswing-head SEED=7 node scripts/play-feel-20261007-glasswing-audit.js
// Exit 0 = all checks green. Exit 1 = a check failed (see FAIL lines).
const fs = require('fs');
const path = require('path');
const SRC = process.env.GAME_SRC || path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'))) });

// ---- seeded PRNG (mulberry32); deterministic proof, SEED env override ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED0 = parseInt(process.env.SEED || '7', 10);
function reseed(s) { Math.random = mulberry32(s); }

// ---- eval the FULL src/js list in index.html order (minus DOM-only) ----
const JS_LIST = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
  'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
  'src/js/build.js',
  // NOTE: drama.js excluded — it touches `document` at load (purely
  // presentational: hit-flash/animation). Mechanics under audit don't need it.
];
global.window = global; // equipment.js needs window at LOAD only
for (const f of JS_LIST) eval(fs.readFileSync(path.join(SRC, f), 'utf8'));
delete global.window;   // delete before PLAYING or combat goes async and stalls
const Game = globalThis.Scattering.Game;

// ---- recording wrappers ----
const sayLines = [];   // {turn, text}
const audioCalls = []; // {name, data} — current scenario
const audioCallsAll = []; // cumulative across the whole audit
let roundNo = 0;
const _say = Game.say.bind(Game);
Game.say = (t) => { sayLines.push({ round: roundNo, text: String(t) }); return _say(t); };
const _audio = Game.audioEvent.bind(Game);
Game.audioEvent = (name, data) => { audioCalls.push({ name, data }); return _audio(name, data); };
// tbEnd NULLS Game.tbfight (combat cleanup guarantee) — capture the result,
// and treat "no tbfight" as fight-over (a surviving tbfight with over=true
// is the other terminal state).
let lastResult = null;
const _tbEnd = Game.tbEnd.bind(Game);
Game.tbEnd = function (r) { lastResult = r; return _tbEnd(r); };
function fightOver() { return !Game.tbfight || !!Game.tbfight.over; }
function freshSay(fromIdx) { return sayLines.slice(fromIdx).map(s => s.text); }

// ---- check harness ----
let fails = 0, passes = 0;
function check(name, cond, extra) {
  if (cond) { passes++; console.log(`  PASS ${name}`); }
  else { fails++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function note(t) { console.log(t); }

// ---- player helpers ----
function P() { return Game.tbfight ? Game.tbFighter('p') : null; }
function MON() { return (Game.tbfight ? Game.tbfight.fighters : []).find(x => x.kind === 'monster' && x.alive); }
function endTurn() {
  if (fightOver()) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction(); // advances the round; NEVER add a trailing tbAdvance
}
function newRun(dayPart) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2000;
  s.abilities = []; s.backgroundAbilities = [];
  s.stats = s.stats || {}; s.stats.agi = 5;
  Game.dayPart = dayPart === undefined ? 1 : dayPart;
  sayLines.length = 0; lastResult = null;
  for (const a of audioCalls) audioCallsAll.push(a);
  audioCalls.length = 0;
  return s;
}
const SPEAR = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
// teach(): mirror what real play writes via tbLearnPattern — stage AND the
// patterns map (canShow 'mechanics' reads patterns[attackName], not attacksSeen).
function teach(id) {
  try {
    const e = Game.ensureMonsterEntry(id);
    e.stage = 'observed';
    const mdef = (Game.data.monsters || []).find(m => m.id === id);
    const atk = mdef && mdef.attack && mdef.attack.name;
    e.patterns = e.patterns || {};
    if (atk) e.patterns[atk] = 'taught by audit harness';
    e.attacksSeen = [atk || 'x'];
  } catch (err) {}
}
function forget(id) { try { delete Game.state.codex.monsters[id]; } catch (err) {} }
function startFight(mid, dayPart, pre) {
  const s = newRun(dayPart);
  s.equipped = { weapon: SPEAR };
  s.mx = 4; s.my = 6;
  roundNo = 0;
  if (pre) pre();
  Game.startCombat(mid);
  return s;
}
// one full round: player acts via brain, then monsters act inside tbAfterPlayerAction
function playRound(brain, label) {
  roundNo++;
  const say0 = sayLines.length;
  if (!fightOver()) {
    const m0 = MON(), p0 = P();
    if (Game.tbIsPlayerTurn()) brain(m0, p0);
    else endTurn();
  }
  const said = sayLines.length - say0;
  return { said, m: MON() };
}
function movePlayerTo(tx, ty) {
  const p = P(); let guard = 10;
  while (guard-- > 0 && (p.mx !== tx || p.my !== ty) && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
    if (!Game.tbPlayerMove(p.mx + Math.sign(tx - p.mx), p.my + Math.sign(ty - p.my))) break;
  }
}
function dodgeTelegraph(p) {
  const m = MON(); if (!m || !m.telegraph || !m.telegraph.cells) return false;
  const danger = new Set(m.telegraph.cells.map(c => c.cx + ',' + c.cy));
  if (!danger.has(p.mx + ',' + p.my)) return false;
  let best = null, bd = 1e9;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = p.mx + dx, ny = p.my + dy;
    if (nx < 1 || nx > 7 || ny < 1 || ny > 7) continue;
    if (danger.has(nx + ',' + ny)) continue;
    const dd = Math.abs(dx) + Math.abs(dy);
    if (dd < bd) { bd = dd; best = [nx, ny]; }
  }
  if (best) { movePlayerTo(best[0], best[1]); return true; }
  return false;
}

// ============ SCENARIO A: exploration dive trap — HIT (stand still) ============
function scenarioTrapHit(seed) {
  reseed(seed);
  note(`\n### A. exploration trap — HIT (seed ${seed})`);
  const s = newRun(1);
  Game.debugScenario('glasswing'); // player (2,4), glasswing (5,4), midday
  roundNo = 0;
  const say0 = sayLines.length;
  Game.monsterTurn(); // within 5 -> VANISHES, trap set at player tile
  const trap = Game.state.scholar.gwTrap;
  check('trap set at player tile', !!trap && trap.tileX === 2 && trap.tileY === 4,
    JSON.stringify(trap));
  check('trigger line (dread, not lecture)', freshSay(say0).join(' ').includes('The air feels wrong'),
    freshSay(say0).join(' | ').slice(0, 200));
  const hp0 = Math.round(Game.state.scholar.health);
  Game.gwTrapTick(); // shadow: faint
  Game.gwTrapTick(); // shadow: darker
  const warnText = freshSay(say0).join(' ');
  check('shadow escalates faint->darker', /faint/.test(warnText) && /darker/.test(warnText), warnText.slice(0, 300));
  check('shadow render contract non-null', !!Game.glasswingTrapCells() && Game.glasswingTrapCells().splash.length === 8);
  Game.gwTrapTick(); // RESOLVE — player never moved -> HIT
  const hp1 = Math.round(Game.state.scholar.health);
  const dmg = hp0 - hp1;
  check('trap HIT damage 20-30 (ambush)', dmg >= 20 && dmg <= 30, `dealt ${dmg}`);
  check('combat starts after trap hit', !!Game.tbfight && !Game.tbfight.over);
  const m = MON();
  check('monster spawns GROUNDED after trap hit', !!m && m.beamPhase === 'grounded', m && m.beamPhase);
  // The speed-5 darter OPENS combat (acts before the player), burning one
  // grounded tick on entry: 3 granted -> 2 remaining = the same 2 player
  // strikes as the in-combat path (design comment at the spawn site).
  check('trap-hit: 3 granted, 1 burned on entry, 2 strikes left', !!m && m.gwGrounded === 2, m && String(m.gwGrounded));
  check('trap cleared', Game.state.scholar.gwTrap === null);
  const hitText = freshSay(say0).join(' ');
  check('hit narrated (slams from above)', /SLAMS into you from above/.test(hitText));
  const names = audioCalls.map(a => a.name);
  check('audio: glasswingDive fired on trap hit', names.includes('glasswingDive'));
  check('audio: glasswingCircle+heartbeat fired at trigger',
    names.includes('glasswingCircle') && names.includes('heartbeat'));
}

// ============ SCENARIO B: exploration dive trap — MISS (move off tile) ============
function scenarioTrapMiss(seed) {
  reseed(seed);
  note(`\n### B. exploration trap — MISS (seed ${seed})`);
  const s = newRun(1);
  Game.debugScenario('glasswing');
  roundNo = 0;
  const say0 = sayLines.length;
  Game.monsterTurn();
  check('trap set', !!Game.state.scholar.gwTrap);
  Game.gwTrapTick(); Game.gwTrapTick();
  // MOVE OFF: the weakness text says "move when the shadow comes".
  // NOTE: debugScenario() replaced Game.state.scholar via freshGame() — use
  // the LIVE reference, not the stale `s` from newRun().
  Game.state.scholar.mx = 5; Game.state.scholar.my = 4; // 3 tiles from trap tile (2,4)
  Game.gwTrapTick(); // RESOLVE -> MISS
  const missText = freshSay(say0).join(' ');
  check('miss narrated (hits empty dirt)', /hits empty dirt where you were/.test(missText));
  check('no combat after a dodged ambush', fightOver());
  check('trap cleared', Game.state.scholar.gwTrap === null);
  check('monster gone from world (ambush spent)', !Game.playerMonster() || Game.playerMonster().mx === undefined,
    JSON.stringify(Game.playerMonster()));
  const names = audioCalls.map(a => a.name);
  check('audio: dive+climb on miss (it leaves)', names.includes('glasswingDive') && names.includes('glasswingClimb'));
}

// ============ SCENARIO C: in-combat dive — dodge, punish grounded, escape/kill ============
function scenarioDiveDodge(seed, taught) {
  reseed(seed);
  note(`\n### C. in-combat dive — dodge & punish (${taught ? 'taught' : 'fresh'}, seed ${seed})`);
  const s = startFight('glasswing', 1, () => { if (taught) teach('glasswing'); else forget('glasswing'); });
  // Start the darter FAR so the circle-approach phase is observable for a few
  // rounds (startCombat otherwise spawns it inside dive range and the first
  // declare happens before round 1).
  const mSetup = MON();
  if (mSetup) { mSetup.mx = 1; mSetup.my = 1; mSetup.telegraph = null; mSetup.beamPhase = 'circle'; mSetup.altitude = 'high'; }
  const say0 = sayLines.length;
  const seen = { circle: false, dive: false, grounded: false, hitClimb: false };
  let declaredCue = null, diveRounds = 0, punishStrikes = 0, plus50 = 0;
  let silentRounds = 0, rounds = 0, shadowOk = true;
  const brain = (m, p) => {
    if (!m) return;
    const acted = dodgeTelegraph(p);
    if (acted) { note(`  YOU: dodge the shadow -> (${p.mx},${p.my})`); endTurn(); return; }
    const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
    const airborne = Game.flyerAirborne(m);
    if (!airborne && d <= 1 && !p.acted) {
      const hpB = m.hp, logB = sayLines.length;
      Game.tbPlayerStrike(m.key);
      punishStrikes++;
      if (freshSay(logB).join(' ').includes('+50% while grounded')) plus50++;
      note(`  YOU: strike grounded darter -> dealt ${hpB - m.hp} (hp ${m.hp})`);
      endTurn(); return;
    }
    if (!airborne && d > 1 && p.moveLeft > 0) {
      movePlayerTo(m.mx, m.my); note(`  YOU: close in -> (${p.mx},${p.my})`);
    } else note(`  YOU: hold (phase=${m.beamPhase}, alt=${m.altitude})`);
    endTurn();
  };
  while (!fightOver() && rounds < 45) {
    rounds++;
    const m = MON();
    if (m) {
      if (m.beamPhase === 'circle') seen.circle = true;
      if (m.beamPhase === 'dive') { seen.dive = true; diveRounds++; }
      if (m.beamPhase === 'grounded') seen.grounded = true;
      if (m.telegraph && m.telegraph.attackName === 'Skyfall Dive' && !declaredCue)
        declaredCue = m.telegraph.cueText;
      // grid contract during circle/dive
      if (m.beamPhase === 'circle' || m.beamPhase === 'dive') {
        if (!Game.gwDiveShadow()) shadowOk = false;
      }
    }
    const r = playRound(brain);
    if (r.said === 0) silentRounds++;
    if (!MON()) break;
  }
  check('phase circle seen', seen.circle);
  check('phase dive declared (shadow telegraph)', seen.dive);
  check('gwDiveShadow grid contract live during circle/dive', shadowOk);
  check('miss -> GROUNDED phase seen', seen.grounded);
  check('no silent monster rounds', silentRounds === 0, `${silentRounds} silent`);
  if (taught) {
    check('taught cue is coached (MOVE)', !!declaredCue && /MOVE/.test(declaredCue), declaredCue);
    check('taught cue names the trick', !!declaredCue && /can.t turn mid-dive|not the bug/.test(declaredCue), declaredCue);
  } else {
    check('fresh cue is dread (no coaching leak)', !!declaredCue && !/MOVE/.test(declaredCue) && /shadow/i.test(declaredCue), declaredCue);
  }
  check('grounded punished (+50% line seen)', punishStrikes > 0 && plus50 > 0,
    `${punishStrikes} strikes, ${plus50} with +50% line`);
  // tbEnd NULLS Game.tbfight — the result was captured by the tbEnd wrapper.
  const res = lastResult;
  note(`  RESULT: ${res === 'won' ? 'DARTER SLAIN/DRIVEN OFF' : res ? 'fight over: ' + res : 'STALEMATE'} in ${rounds} rounds, player hp ${Math.round(Game.state.scholar.health)}`);
  check('fight resolves (kill or escape, never stalemate)', !!res, `rounds=${rounds}, lastResult=${res}`);
  const names = audioCalls.map(a => a.name);
  check('audio: dive fired on declare', names.includes('glasswingDive'));
  check('audio: land fired on crash', names.includes('glasswingLand'));
}

// ============ SCENARIO D: in-combat dive — stand still, eat it ============
function scenarioDiveHit(seed) {
  reseed(seed);
  note(`\n### D. in-combat dive — stand still, eat the Skyfall (seed ${seed})`);
  const s = startFight('glasswing', 1);
  forget('glasswing');
  const say0 = sayLines.length;
  let declared = false, hitDmg = null, rounds = 0;
  const brain = (m, p) => { note('  YOU: stand your ground.'); endTurn(); }; // never dodge
  while (!fightOver() && rounds < 25 && hitDmg === null) {
    rounds++;
    const m = MON();
    if (m && m.telegraph && m.telegraph.kind === 'squares') declared = true;
    const hpB = Math.round(Game.state.scholar.health);
    playRound(brain);
    const hpA = Math.round(Game.state.scholar.health);
    if (declared && hpA < hpB && hitDmg === null) hitDmg = hpB - hpA;
  }
  const m = MON();
  check('dive declared while standing still', declared);
  check('dive HIT damage within [10,16]', hitDmg !== null && hitDmg >= 10 && hitDmg <= 16, `dealt ${hitDmg}`);
  check('hit -> climbs back to sky (circle/high)', !!m && m.beamPhase === 'circle' && m.altitude === 'high',
    m && `${m.beamPhase}/${m.altitude}`);
  const txt = freshSay(say0).join(' ');
  check('hit narrated (snatches and climbs)', /snatches at you and climbs/.test(txt));
  const dist = m ? Math.max(Math.abs(m.mx - P().mx), Math.abs(m.my - P().my)) : 0;
  check('climb puts distance (shadow is the fight)', dist >= 2, `dist=${dist}`);
}

// ============ SCENARIO E: sunbasker bask — ignore it, charge builds, bite lands ============
function scenarioBaskIgnore(seed) {
  reseed(seed);
  note(`\n### E. sunbasker bask — ignored, charge builds (seed ${seed})`);
  const s = startFight('sunbasker', 1); // midday
  forget('sunbasker');
  const say0 = sayLines.length;
  const charges = [];
  let biteDeclared = null, biteDmg = null, spentSaid = false, rounds = 0, silentRounds = 0;
  let scorchSeen = false;
  const brain = (m, p) => {
    // walk adjacent, then WATCH it charge — never strike
    if (!m) return;
    const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
    if (d > 1 && p.moveLeft > 0) { movePlayerTo(m.mx, m.my); note(`  YOU: close in -> (${p.mx},${p.my})`); }
    else note('  YOU: watch it bask. (deliberately not hitting)');
    endTurn();
  };
  while (!fightOver() && rounds < 20 && biteDmg === null) {
    rounds++;
    const m = MON();
    if (m) {
      charges.push(m.sbCharge || 0);
      if (m.telegraph && m.telegraph.kind === 'direct' && !biteDeclared) {
        biteDeclared = { dmg: m.telegraph.dmg.slice(), charge: m.sbCharge, cue: m.telegraph.cueText };
        note(`  BITE DECLARED at charge ${m.sbCharge}, telegraphed dmg [${m.telegraph.dmg}]`);
      }
      if (Game.tbfight.terraform && Object.keys(Game.tbfight.terraform).length) scorchSeen = true;
      const halo = Game.sbHeatKeys();
      if (!m.sbFlat && (m.beamPhase === 'bask' || m.beamPhase === 'charged') && !halo)
        check('sbHeatKeys grid contract live while basking', false);
    }
    const hpB = Math.round(Game.state.scholar.health);
    const r = playRound(brain);
    if (r.said === 0) silentRounds++;
    const hpA = Math.round(Game.state.scholar.health);
    const m2 = MON();
    if (biteDeclared && hpA < hpB && biteDmg === null) {
      biteDmg = hpB - hpA;
      note(`  BITE LANDED for ${biteDmg}`);
    }
    if (m2 && biteDeclared && (m2.sbCharge || 0) === 0 && !spentSaid) {
      spentSaid = freshSay(say0).join(' ').includes('The charge is spent');
    }
  }
  const maxCharge = Math.max(...charges);
  check('charge builds 0->1->2 while ignored', charges.includes(1) && charges.includes(2), `charges seen: ${[...new Set(charges)]}`);
  check('charge caps at 3', maxCharge <= 3, `max=${maxCharge}`);
  check('bite declared at charge>=2 (tracking, direct)', !!biteDeclared, JSON.stringify(biteDeclared));
  check('declared dmg = base+4/charge', !!biteDeclared && biteDeclared.dmg[0] === 8 + 4 * biteDeclared.charge &&
    biteDeclared.dmg[1] === 14 + 4 * biteDeclared.charge, JSON.stringify(biteDeclared && biteDeclared.dmg));
  check('bite lands for telegraphed amount', biteDmg !== null &&
    biteDmg >= biteDeclared.dmg[0] && biteDmg <= biteDeclared.dmg[1], `landed ${biteDmg}, declared [${biteDeclared && biteDeclared.dmg}]`);
  check('bite SPENDS the charge (loop restarts)', spentSaid);
  check('bask scorches the earth (terraform)', scorchSeen);
  check('no silent monster rounds', silentRounds === 0, `${silentRounds} silent`);
  const txt = freshSay(say0).join(' ');
  check('fresh bite cue is dread (molten gold, no coaching)', /molten gold/.test(txt) && !/hit it NOW/.test(txt));
  const names = audioCalls.map(a => a.name);
  check('audio: baskCharge fired while charging', names.includes('baskCharge'));
}

// ============ SCENARIO F: sunbasker pressure — hit every turn, charge starves ============
function scenarioBaskPressure(seed) {
  reseed(seed);
  note(`\n### F. sunbasker bask — pressure, hit every turn (seed ${seed})`);
  const s = startFight('sunbasker', 1);
  teach('sunbasker');
  const say0 = sayLines.length;
  const charges = [];
  let biteDmg = null, biteDeclared = false, rounds = 0;
  const brain = (m, p) => {
    if (!m) return;
    const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
    if (d > 1 && p.moveLeft > 0) { movePlayerTo(m.mx, m.my); }
    else if (d <= 1 && !p.acted) {
      Game.tbPlayerStrike(m.key);
      note(`  YOU: strike (pressure) -> monster hp ${m.hp}, charge ${m.sbCharge || 0}`);
    } else note('  YOU: hold');
    endTurn();
  };
  while (!fightOver() && rounds < 25 && biteDmg === null) {
    rounds++;
    const m = MON();
    if (m) {
      charges.push(m.sbCharge || 0);
      if (m.telegraph && m.telegraph.kind === 'direct') biteDeclared = true;
    }
    const hpB = Math.round(Game.state.scholar.health);
    playRound(brain);
    const hpA = Math.round(Game.state.scholar.health);
    if (hpA < hpB && biteDmg === null) { biteDmg = hpB - hpA; note(`  BITE LANDED for ${biteDmg} (under pressure)`); }
  }
  const maxCharge = Math.max(...charges, 0);
  check('pressure keeps charge at 0-1 (never reaches 2)', maxCharge <= 1, `max=${maxCharge}`);
  const txt = freshSay(say0).join(' ');
  // Break narration has 3 variants (hadFull + 2 pickFresh); match all of them.
  check('charge-break narrated', /knocks the (charge|sunlight) out of its scales|gold flickers and dies/.test(txt));
  // Perfect pressure means the bite never declares — the coached bite cue is
  // untestable here BY DESIGN (see E2 for the taught declare). Only assert
  // the landed amount if a bite somehow got through.
  if (biteDmg !== null) {
    check('bite under pressure lands near base [8,14]', biteDmg >= 5 && biteDmg <= 16, `landed ${biteDmg}`);
  } else note('  SKIP bite-damage check: no bite landed under perfect pressure (by design)');
  check('bite never even declared under pressure', !biteDeclared);
  note(`  RESULT: ${lastResult === 'won' ? 'SUNBASKER SLAIN' : lastResult ? 'fight over: ' + lastResult : 'fight ongoing'} in ${rounds} rounds, player hp ${Math.round(Game.state.scholar.health)}`);
  const names = audioCalls.map(a => a.name);
  check('audio: baskBreak fired on charge knock-out', names.includes('baskBreak'));
}

// ============ SCENARIO E2: sunbasker bite declare, TAUGHT — coached cue ============
function scenarioBaskTaughtCue(seed) {
  reseed(seed);
  note(`\n### E2. sunbasker bite declare — taught, coached cue (seed ${seed})`);
  const s = startFight('sunbasker', 1, () => teach('sunbasker'));
  const say0 = sayLines.length;
  let cue = null, rounds = 0;
  const brain = (m, p) => {
    if (!m) return;
    const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
    if (d > 1 && p.moveLeft > 0) movePlayerTo(m.mx, m.my);
    else note('  YOU: watch it bask. (deliberately not hitting)');
    endTurn();
  };
  while (!fightOver() && rounds < 12 && cue === null) {
    rounds++;
    const m = MON();
    if (m && m.telegraph && m.telegraph.kind === 'direct') cue = m.telegraph.cueText;
    playRound(brain);
  }
  check('taught bite declare is coached (hit it NOW, tracks)', !!cue && /hit it NOW/.test(cue) && /tracks/.test(cue), cue);
  try { Game.tbEnd('fled'); } catch (e) {}
}

// ============ SCENARIO G: sunbasker flatten — night, and shade ============
function scenarioFlatten(seed) {
  reseed(seed);
  note(`\n### G. sunbasker flatten — night (seed ${seed})`);
  const s = startFight('sunbasker', 3); // night
  const say0 = sayLines.length;
  let rounds = 0, flatSaid = false, acted = false;
  const brain = (m, p) => {
    if (!m) return;
    const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
    if (d <= 1 && !p.acted) { Game.tbPlayerStrike(m.key); acted = true; note(`  YOU: strike the flattened lizard -> hp ${m.hp}`); }
    else note('  YOU: watch');
    endTurn();
  };
  while (!fightOver() && rounds < 15) {
    rounds++;
    const m = MON();
    if (m && (m.sbCharge || 0) > 0) acted = true; // charge building at night = bug
    playRound(brain);
    if (/no sun, no fight|The sun is gone/.test(freshSay(say0).join(' '))) flatSaid = true;
  }
  const m = MON();
  check('flatten narrated (no sun, no fight)', flatSaid);
  check('no charge builds at night', !m || (m.sbCharge || 0) === 0);
  check('flattened lizard is killable', !m, m && `hp=${m.hp}`);
  note(`  RESULT: ${!MON() ? 'flattened lizard killed' : 'still alive'} in ${rounds} rounds`);
  const names = audioCalls.map(a => a.name);
  check('audio: baskFlatten fired', names.includes('baskFlatten'));
  // shade unit check: tree orthogonally adjacent = shade
  Game.genDetail = () => Array.from({ length: 9 }, (_, y) =>
    Array.from({ length: 9 }, (_, x) => (x === 5 && y === 4 ? 'tree' : 'grass')));
  check('tbInShade true next to tree', Game.tbInShade(4, 4) === true);
  check('tbInShade false in open grass', Game.tbInShade(1, 1) === false);
}

// ============ SCENARIO H: first-contact intros are dread-gated, coaching earned ============
function scenarioFirstContact(seed) {
  reseed(seed);
  note(`\n### H. first-contact intros — dread first, coaching earned (seed ${seed})`);
  // glasswing fresh
  let s = newRun(1); s.equipped = { weapon: SPEAR }; s.mx = 4; s.my = 6;
  forget('glasswing'); roundNo = 0;
  let say0 = sayLines.length;
  Game.startCombat('glasswing');
  let intro = freshSay(say0).join(' ');
  check('glasswing first contact: dread, not lecture', /shadow moves wrong against the sun/.test(intro));
  check('glasswing first contact: NO coaching leak', !/It dives at where you STAND/.test(intro));
  try { Game.tbEnd('fled'); } catch (e) {}
  // glasswing taught
  s = newRun(1); s.equipped = { weapon: SPEAR }; s.mx = 4; s.my = 6;
  teach('glasswing'); roundNo = 0; say0 = sayLines.length;
  Game.startCombat('glasswing');
  intro = freshSay(say0).join(' ');
  check('glasswing known: coaching lands (knownCue)', /It dives at where you STAND/.test(intro), intro.slice(0, 200));
  try { Game.tbEnd('fled'); } catch (e) {}
  // sunbasker fresh
  s = newRun(1); s.equipped = { weapon: SPEAR }; s.mx = 4; s.my = 6;
  forget('sunbasker'); roundNo = 0; say0 = sayLines.length;
  Game.startCombat('sunbasker');
  intro = freshSay(say0).join(' ');
  check('sunbasker first contact: dread, not lecture', /Gold in the grass/.test(intro));
  check('sunbasker first contact: NO coaching leak', !/every sunny turn makes the bite worse/.test(intro));
  try { Game.tbEnd('fled'); } catch (e) {}
  // sunbasker taught
  s = newRun(1); s.equipped = { weapon: SPEAR }; s.mx = 4; s.my = 6;
  teach('sunbasker'); roundNo = 0; say0 = sayLines.length;
  Game.startCombat('sunbasker');
  intro = freshSay(say0).join(' ');
  check('sunbasker known: coaching lands', /every sunny turn makes the bite worse/.test(intro), intro.slice(0, 200));
  try { Game.tbEnd('fled'); } catch (e) {}
}

// ============ SCENARIO I: audio-hook mapping + modifier-consumption sweep (static) ============
function scenarioStaticSweep() {
  note('\n### I. static sweep: audio hooks + modifier consumption');
  const gameSrc = fs.readFileSync(path.join(SRC, 'src/js/game.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(SRC, 'src/js/app.js'), 'utf8');
  // --- audio: every DIVE/BASK audioEvent('name') fired in game.js must have a synth in app.js ---
  const fired = new Set();
  for (const m of gameSrc.matchAll(/audioEvent\(\s*['"]([A-Za-z0-9_]+)['"]/g)) fired.add(m[1]);
  const diveBask = ['glasswingDive', 'glasswingClimb', 'glasswingCircle', 'glasswingShadowClose', 'glasswingLand', 'baskCharge', 'baskBreak', 'baskFlatten'];
  const unmappedDB = diveBask.filter(n => {
    const defined = new RegExp(`function\\s+${n}\\s*\\(|\\b${n}\\(\\)\\s*\\{`).test(appSrc);
    return fired.has(n) && !defined;
  });
  check('all 8 dive/bask hooks mapped to app.js synths', unmappedDB.length === 0, `unmapped: ${unmappedDB.join(', ')}`);
  // Other fired-but-unmapped hooks are the audio worker's backlog (audioEvent
  // no-ops until the synth lands — the established pattern). List, don't fail.
  const otherUnmapped = [...fired].filter(n => !diveBask.includes(n) &&
    !new RegExp(`function\\s+${n}\\s*\\(|\\b${n}\\(\\)\\s*\\{`).test(appSrc));
  if (otherUnmapped.length) note(`  INFO unmapped non-dive/bask hooks (audio worker backlog): ${otherUnmapped.join(', ')}`);
  const missingDB = diveBask.filter(n => !fired.has(n));
  check('all 8 dive/bask hooks fired somewhere in game.js', missingDB.length === 0, `never fired: ${missingDB.join(', ')}`);
  // every dive/bask hook actually FIRED during this audit run
  for (const a of audioCalls) audioCallsAll.push(a);
  const firedLive = new Set(audioCallsAll.map(a => a.name));
  const neverLive = diveBask.filter(n => !firedLive.has(n));
  check('all 8 dive/bask hooks fired live in this audit', neverLive.length === 0, `never live: ${neverLive.join(', ')}`);
  // --- modifiers: every m.gw*/m.sb*/s.gw* written must be read somewhere ---
  const names = new Set();
  for (const m of gameSrc.matchAll(/\b[ms]\.(gw|sb)[A-Za-z0-9]*/g)) names.add(m[0]);
  const dead = [];
  for (const n of [...names].sort()) {
    const esc = n.replace(/\./g, '\\.');
    const writes = [...gameSrc.matchAll(new RegExp(esc + '\\s*(?:=[^=]|\\+\\+|--)', 'g'))].length;
    const readsTotal = [...gameSrc.matchAll(new RegExp(esc + '(?![A-Za-z0-9])', 'g'))].length;
    const reads = readsTotal - writes;
    if (writes > 0 && reads === 0) dead.push(`${n} (writes=${writes}, reads=0)`);
  }
  // KNOWN BACKLOG (audit 2026-10-07): m.gwDive is written once (game.js, circle
  // init) and never read — the dive runs on m.telegraph + m.beamPhase instead.
  // Engine owner: delete it or wire it up. The proof asserts no OTHER dead
  // modifiers, so this stays green while the backlog item is tracked openly.
  const knownDead = ['m.gwDive'];
  const newDead = dead.filter(d => !knownDead.some(k => d.startsWith(k + ' ')));
  check('no written-but-never-read dive/bask modifiers (beyond known m.gwDive)', newDead.length === 0,
    `dead: ${newDead.join('; ')}`);
  if (dead.length) note(`  INFO known dead modifier (backlog): ${dead.join('; ')}`);
}

// ============ MAIN ============
(async () => {
  await Game.init();
  Game.canSee = () => true;
  note(`AUDIT BASE: GAME_SRC=${SRC}`);
  note('AUDIT SHA: ' + (process.env.AUDIT_SHA || '(not provided)'));
  const seeds = [SEED0, SEED0 + 35];
  for (const seed of seeds) {
    note(`\n######## SEED ${seed} ########`);
    scenarioTrapHit(seed);
    scenarioTrapMiss(seed);
    scenarioDiveDodge(seed, false);
    scenarioDiveDodge(seed, true);
    scenarioDiveHit(seed);
    scenarioBaskIgnore(seed);
    scenarioBaskPressure(seed);
    scenarioBaskTaughtCue(seed);
    scenarioFlatten(seed);
    scenarioFirstContact(seed);
  }
  scenarioStaticSweep();
  note(`\n==== ${passes} passed, ${fails} failed ====`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
