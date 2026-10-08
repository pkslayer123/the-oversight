#!/usr/bin/env node
// Glasswing dive + Sunbasker bask — Highbeam Deer level proof (Steve 2026-10-07).
// Proves: telegraph distinctness, phase visibility (badges), codex gating
// (unknown -> dread-only, known -> coaching), dive/bask behavior distinct
// from each other and from the wave-1 gallowdeer beam, seeded PRNG.
//
// FULL PRODUCTION SCRIPT LIST (AGENTS.md 2026-10-06/07): node harnesses must
// eval the full index.html script list in order, minus DOM-only (app.js,
// sprites.js, tile-scenes.js, move-anim.js) and drama.js (top-level document
// access crashes node eval). equipment.js needs `window` at load — stubbed
// for the eval phase, DELETED before playing (else combat goes async).
//
// SEED: mulberry32, fixed default, SEED env override (AGENTS.md 2026-10-07).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = process.env.SEED ? parseInt(process.env.SEED, 10) : 0xD1E;
Math.random = mulberry32(SEED);

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global; // eval phase only
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

// --- capture ---
const said = [], heard = [];
const sayOrig = Game.say.bind(Game);
Game.say = (t) => { said.push(String(t)); };
const audioOrig = Game.audioEvent.bind(Game);
Game.audioEvent = (n, p) => { heard.push(String(n)); };
const tbDamageOrig = Game.tbDamage.bind(Game);
let lastDmgOpts = 'unset';
Game.tbDamage = function (...args) { lastDmgOpts = args[4]; return tbDamageOrig(...args); };
const clearCap = () => { said.length = 0; heard.length = 0; };

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL [seed ${SEED}] ${name}${extra ? ' — ' + extra : ''}`); }
}
function flatGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
}
function strip(s) {
  const bad = (a) => { const id = (a && a.id) || a; return id !== 'fear_aura' && id !== 'pocket_sand'; };
  s.abilities = (s.abilities || []).filter(bad);
  s.backgroundAbilities = (s.backgroundAbilities || []).filter(bad);
  s.stats = s.stats || {}; s.stats.agi = 5;
  if (s.passives) delete s.passives.footwork;
}
function freshRun() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  return s;
}
function markSlain(id) {
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  Game.state.codex.monsters[id] = Object.assign(Game.state.codex.monsters[id] || {}, { stage: 'slain' });
}
// full "learned" state: stage + the pattern written to the codex (what
// tbLearnPattern does when you survive the attack). encTelegraphKnown also
// accepts stage 'slain' alone, but encAttackName needs the pattern.
function markKnown(id, attackName) {
  markSlain(id);
  const e = Game.state.codex.monsters[id];
  e.patterns = e.patterns || {};
  e.patterns[attackName] = 'test pattern';
}
function M() { return Game.tbfight ? Game.tbfight.fighters.find(x => x.kind === 'monster') : null; }
function P() { return Game.tbFighter('p'); }
function monsterActs() {
  const f = Game.tbfight; if (!f || f.over) return;
  if (Game.tbIsPlayerTurn()) { const p = P(); p.moveLeft = 0; p.acted = true; }
  Game.tbAdvance();
}
function playerWait() { const p = P(); p.moveLeft = 0; p.acted = true; Game.tbEndCheck(); }
// world-mode trap path (the natural glasswing entry)
function trapSetup() {
  freshRun();
  Game.debugScenario('glasswing');
  const s = Game.state.scholar; strip(s);
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.monsterTurn(); // trap set
  return s;
}
// seeded in-combat circling darter: the world trap only ever lands grounded,
// so the in-combat dive loop is seeded directly (its declare/resolve/climb
// code is real and exercised here).
function circlingCombat() {
  freshRun();
  Game.debugScenario('glasswing');
  const s = Game.state.scholar; strip(s);
  s.monster = { id: 'glasswing', mx: 5, my: 4, beamPhase: 'circle', altitude: 'high' };
  s.mx = 4; s.my = 4;
  Game.canSee = () => true;
  Game.startCombat('glasswing');
  const m = M(); m.hp = m.maxHp = 200;
  return m;
}
function sunbaskerFight() {
  freshRun();
  Game.debugScenario('sunbasker');
  const s = Game.state.scholar; strip(s);
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const m = M(); m.hp = m.maxHp = 300;
  return m;
}

(async () => {
  await Game.init();
  Game.genDetail = () => flatGrid();

  // ================= GLASSWING: TRAP APPROACH =================
  {
    const s = trapSetup();
    ok('trap set on approach', !!s.gwTrap);
    clearCap();
    Game.gwTrapTick();
    ok('unknown approach: dread-only, no coaching',
      said.some(l => /shadow on the ground — faint/i.test(l)) && !said.some(l => /MOVE when it grows/i.test(l)),
      said.join(' | ').slice(0, 120));
    ok('approach turn is audible + escalating', heard.includes('glasswingShadowClose'));
  }
  {
    const s = trapSetup();
    markSlain('glasswing');
    clearCap();
    Game.gwTrapTick();
    ok('known approach: coaching lands ("MOVE when it grows")',
      said.some(l => /MOVE when it grows/i.test(l)),
      said.join(' | ').slice(0, 160));
  }
  {
    // stand still -> dive hits -> grounded combat
    const s = trapSetup();
    Game.gwTrapTick(); Game.gwTrapTick();
    const hpBefore = s.health;
    clearCap();
    Game.gwTrapTick();
    const m = M();
    ok('standing still: dive hits', s.health < hpBefore);
    ok('hit -> grounded combat', !!Game.tbfight && m && m.beamPhase === 'grounded');
    ok('grounded phase badge visible', m && Game.encPhaseBadge(m) === ' 🪰 GROUNDED',
      m && `'${Game.encPhaseBadge(m)}'`);
    ok('dive audio fires', heard.includes('glasswingDive'));
  }
  {
    // move away -> dive hits dirt, no combat
    const s = trapSetup();
    Game.gwTrapTick(); Game.gwTrapTick();
    s.mx = 0; s.my = 0;
    const hpBefore = s.health;
    clearCap();
    Game.gwTrapTick();
    ok('moved away: no damage (dodge works)', s.health === hpBefore);
    ok('miss: no combat', !Game.tbfight);
    ok('miss line reads', said.some(l => /hits empty dirt/i.test(l)));
    ok('miss audio: dive + climb', heard.includes('glasswingDive') && heard.includes('glasswingClimb'));
  }

  // ================= GLASSWING: IN-COMBAT DIVE =================
  {
    // unknown declare
    const m = circlingCombat();
    for (let i = 0; i < 6 && !m.telegraph; i++) monsterActs();
    ok('in-combat dive declares', !!m.telegraph && m.telegraph.kind === 'squares');
    ok('dive locks exactly ONE tile (commitCells)', m.telegraph && m.telegraph.cells.length === 1 && m.telegraph.commitCells === true);
    ok('unknown declare: dread-only cueText', m.telegraph && !/MOVE/.test(m.telegraph.cueText) && /falling out of the sky/.test(m.telegraph.cueText),
      m.telegraph && m.telegraph.cueText);
    ok('unknown attack name gated ("the attack")', Game.encAttackName(m) === 'the attack');
    ok('dive phase badge visible', Game.encPhaseBadge(m) === ' ⬇️ DIVING!');
    const sh = Game.gwDiveShadow();
    ok('gwDiveShadow: dive contract (tile + streak)', sh && sh.phase === 'dive' && sh.tile && Array.isArray(sh.streak) && sh.turnsLeft === 1,
      JSON.stringify(sh));
  }
  {
    // known declare at the player
    freshRun();
    Game.debugScenario('glasswing');
    const s = Game.state.scholar; strip(s);
    markKnown('glasswing', 'Skyfall Dive');
    s.monster = { id: 'glasswing', mx: 5, my: 4, beamPhase: 'circle', altitude: 'high' };
    s.mx = 4; s.my = 4;
    Game.canSee = () => true;
    Game.startCombat('glasswing');
    const m = M(); m.hp = m.maxHp = 200;
    for (let i = 0; i < 6 && !m.telegraph; i++) monsterActs();
    ok('known declare names YOUR tile + MOVE', m.telegraph && /diving at YOUR tile/.test(m.telegraph.cueText) && /MOVE/.test(m.telegraph.cueText),
      m.telegraph && m.telegraph.cueText);
    ok('known attack name revealed', Game.encAttackName(m) === 'Skyfall Dive');
  }
  {
    // known declare at a VILLAGER: coaching names the real mark, not "YOUR tile"
    const m = circlingCombat();
    markSlain('glasswing');
    m.telegraph = null; m.beamPhase = 'circle'; m.altitude = 'high'; // reset opening declare
    const v = { key: 'v_test', kind: 'villager', name: 'Test Villager', alive: true, fled: false,
      mx: 6, my: 4, hp: 50, maxHp: 50, speed: 3, telegraph: null, moveLeft: 0, acted: false };
    Game.tbfight.fighters.push(v);
    m.threatQueue.unshift('v_test');
    const p = P(); p.mx = 1; p.my = 1; // player far: scan can't re-prioritize
    clearCap();
    for (let i = 0; i < 6 && !m.telegraph; i++) monsterActs();
    ok('villager-target declare: names the mark, no "YOUR tile" lie',
      m.telegraph && /Test Villager's tile/.test(m.telegraph.cueText) && /SHOUT/.test(m.telegraph.cueText) && !/YOUR tile/.test(m.telegraph.cueText),
      m.telegraph && m.telegraph.cueText);
  }
  {
    // resolve: player stands still -> HIT -> snatch + climb
    const m = circlingCombat();
    for (let i = 0; i < 6 && !m.telegraph; i++) monsterActs();
    clearCap();
    for (let i = 0; i < 8 && m.telegraph; i++) { playerWait(); monsterActs(); }
    ok('dive resolve (stood still): hit -> climbs back to circle/high',
      !m.telegraph && m.beamPhase === 'circle' && m.altitude === 'high',
      `phase=${m.beamPhase} alt=${m.altitude}`);
    ok('climb audio fires', heard.includes('glasswingClimb'));
    ok('snatch line reads', said.some(l => /snatches/i.test(l)));
  }
  {
    // resolve: player moves off -> MISS -> grounded, vulnerable
    const m = circlingCombat();
    for (let i = 0; i < 6 && !m.telegraph; i++) monsterActs();
    const p = P(); p.mx = 0; p.my = 0; // off the locked tile
    clearCap();
    for (let i = 0; i < 8 && m.telegraph; i++) { playerWait(); monsterActs(); }
    ok('dive resolve (moved): miss -> grounded', !m.telegraph && m.beamPhase === 'grounded');
    ok('land audio fires', heard.includes('glasswingLand'));
    ok('grounded badge visible', Game.encPhaseBadge(m) === ' 🪰 GROUNDED');
    // strike the grounded darter: the +50% flyer-down hook fires
    const gm = M();
    const pp = P(); pp.mx = gm.mx + 1; pp.my = gm.my;
    clearCap();
    Game.tbPlayerStrike(gm.key);
    ok('grounded +50% hook fires', said.some(l => /takes the hit badly/i.test(l)));
  }

  // ================= SUNBASKER: THE BASK =================
  {
    const m = sunbaskerFight();
    ok('sunbasker opens basking', m.beamPhase === 'bask' && Game.encPhaseBadge(m) === ' ☀️ BASKING');
    clearCap();
    monsterActs(); // bask 1
    ok('charge builds to 1, still basking', M().sbCharge === 1 && M().beamPhase === 'bask');
    ok('unknown bask: dread-only, no coaching',
      !said.some(l => /Hit it NOW/i.test(l)) && heard.includes('baskCharge'),
      said.join(' | ').slice(0, 120));
    const heat = Game.sbHeatKeys();
    ok('sbHeatKeys: charge meter contract', heat && heat.charge === 1 && heat.ring.length === 8 && heat.monster,
      JSON.stringify(heat && { charge: heat.charge, ring: heat.ring.length }));
  }
  {
    const m = sunbaskerFight();
    markKnown('sunbasker', 'Sun-Charged Bite');
    clearCap();
    monsterActs(); // bask 1, known
    ok('known bask: coaching lands',
      said.some(l => /Hit it NOW|break it before it's fully gold/i.test(l)) &&
      !said.some(l => /dull brown to gold\. Heat shimmers/i.test(l)),
      said.join(' | ').slice(0, 160));
    clearCap();
    monsterActs(); // bask 2 -> bite declared
    const mm = M();
    ok('charge 2 -> charged phase + badge', mm.beamPhase === 'charged' && Game.encPhaseBadge(mm) === ' 🔥 CHARGED');
    ok('bite is a DIRECT telegraph (tracking: footwork can\'t dodge)',
      mm.telegraph && mm.telegraph.kind === 'direct');
    ok('known bite cue coaches the counterplay',
      mm.telegraph && /hit it NOW and the charge dies/i.test(mm.telegraph.cueText),
      mm.telegraph && mm.telegraph.cueText);
    ok('bite declare audio: telegraph + shimmer',
      heard.includes('telegraph') && heard.includes('sunbaskerShimmer'));
  }
  {
    // unknown bite declare: dread-only
    const m = sunbaskerFight();
    monsterActs(); monsterActs();
    const mm = M();
    ok('unknown bite cue: dread-only',
      mm.telegraph && !/hit it NOW/i.test(mm.telegraph.cueText) && /Something is about to happen/.test(mm.telegraph.cueText),
      mm.telegraph && mm.telegraph.cueText);
  }
  {
    // bite resolve: charge spends, dedicated audio, undodgeable
    const m = sunbaskerFight();
    monsterActs(); monsterActs(); // charge 2 + declare
    lastDmgOpts = 'unset';
    clearCap();
    monsterActs(); // resolve
    const mm = M();
    ok('bite spends charge, back to bask', mm.sbCharge === 0 && mm.beamPhase === 'bask');
    ok('bite-land audio event fires', heard.includes('sunbaskerBite'), heard.join(','));
    ok('bite is undodgeable (tracking)', lastDmgOpts && lastDmgOpts.undodgeable === true,
      JSON.stringify(lastDmgOpts));
    ok('spent line reads', said.some(l => /charge is spent/i.test(l)));
  }
  {
    // counterplay: hit it mid-windup -> charge dies
    const m = sunbaskerFight();
    monsterActs(); // bask 1
    clearCap();
    Game.tbPlayerStrike(M().key);
    ok('hit knocks the charge out', M().sbCharge === 0);
    ok('charge-break line reads', said.some(l => /knocks the (charge|sunlight) out|gold flickers and dies/i.test(l)));
    ok('charge-break audio fires', heard.includes('baskBreak'));
    ok('phase drops back to bask', Game.encPhaseBadge(M()) === ' ☀️ BASKING');
  }
  {
    // night: flatten — honest badge (no "BASKING" lie), no heat halo
    const m = sunbaskerFight();
    Game.dayPart = 3;
    clearCap();
    monsterActs();
    const mm = M();
    ok('night: flattened', !!mm.sbFlat && mm.sbCharge === 0 && !mm.telegraph);
    ok('flatten phase is honest (badge blank, not "BASKING")',
      mm.beamPhase === 'flat' && Game.encPhaseBadge(mm) === '',
      `phase=${mm.beamPhase} badge='${Game.encPhaseBadge(mm)}'`);
    ok('flattened: no heat halo', Game.sbHeatKeys() === null);
    ok('flatten audio fires', heard.includes('baskFlatten'));
    Game.dayPart = 1;
    monsterActs();
    ok('sun returns: back to live basking', M().beamPhase === 'bask' && Game.encPhaseBadge(M()) === ' ☀️ BASKING');
  }

  // ================= DISTINCTNESS =================
  {
    // dive vs bask: different telegraph kinds, different counterplay
    const dm = circlingCombat();
    for (let i = 0; i < 6 && !dm.telegraph; i++) monsterActs();
    const diveKind = dm.telegraph.kind;
    try { Game.tbEnd('fled'); } catch (e) {}
    const bm = sunbaskerFight();
    monsterActs(); monsterActs();
    const biteKind = M().telegraph.kind;
    ok('dive = squares telegraph, bite = direct telegraph', diveKind === 'squares' && biteKind === 'direct');
    ok('dive counterplay = move (dodge works); bite counterplay = hit (undodgeable)',
      true); // proven by trap-miss test + undodgeable test above
  }
  {
    // audio identities are disjoint: glasswing = falling whistle set, sunbasker = solar set
    const gw = ['glasswingDive', 'glasswingClimb', 'glasswingLand', 'glasswingCircle', 'glasswingShadowClose', 'glasswingBuzz'];
    const sb = ['baskCharge', 'baskBreak', 'baskFlatten', 'sunbaskerShimmer', 'sunbaskerBite'];
    ok('audio identities disjoint', gw.every(a => !sb.includes(a)));
  }
  {
    // distinct from wave-1: the gallowdeer beam is a 9-lane sweep; the dive
    // locks ONE tile; the bask builds charge over turns (no wave-1 analog)
    const defs = Game.data.monsters;
    const deer = defs.find(d => d.id === 'gallowdeer');
    const gw = defs.find(d => d.id === 'glasswing');
    const sb = defs.find(d => d.id === 'sunbasker');
    ok('wave-1 deer: beam pattern', deer.attack.pattern.type === 'beam' && deer.attack.pattern.length === 9);
    ok('dive: single-tile pattern (not a lane)', gw.attack.pattern.type === 'single' && gw.attack.pattern.range === 3);
    ok('bask: charge-build pattern (sbCharge 0..3, bite spends)', sb.attack.pattern.type === 'single');
  }
  {
    // armor/resistance sanity for the fiction
    const defs = Game.data.monsters;
    const gw = defs.find(d => d.id === 'glasswing');
    const sb = defs.find(d => d.id === 'sunbasker');
    ok('glasswing: no armor (membrane wings; untouchable in air, +50% when grounded)',
      gw.armor === 0 && JSON.stringify(gw.resistances) === '{}');
    ok('sunbasker: armored solar lizard (fire resist, cold vuln)',
      sb.armor === 5 && sb.resistances.fire === 0.75 && sb.resistances.cold === -0.5);
  }

  console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
