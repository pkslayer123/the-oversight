#!/usr/bin/env node
// Glasswing Darter + Sunbasker mechanics tests (Steve 2026-10-05):
//  - glasswing (TRAP design): within 5 tiles it vanishes and sets a 3-turn
//    shadow trap. Stand still → dive hits (direct/splash) → grounded → combat.
//    Move away → hits empty dirt, climbs back into the sun. No turn-based on
//    approach — the trick is preserved.
//  - sunbasker: bask builds charge (+dmg), hits reset it, bite spends it,
//    shade/dusk flattens it (passive)
//  - codex: tbPatternDesc('single') no longer claims "hits an area around it"
//
// Turn driver: monsterActs() runs monster turns until it's the player turn.
// The player then acts directly (strike/move) with no intervening monster
// turn — the only honest way to test declare→respond→resolve beats.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// DETERMINISTIC RNG (Steve 2026-10-08): several modules capture `const R = Math.random`
// at load time — install one shared resettable RNG as Math.random BEFORE eval so every
// load-time capture stays deterministic too. resetRng() re-seeds (SEED env override to
// explore other seeds). Never rely on unseeded Math.random for assertions: flaky by
// construction.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DEFAULT_SEED = (process.env.SEED !== undefined ? Number(process.env.SEED) : 0xC0FFEE) >>> 0;
let _rng = mulberry32(DEFAULT_SEED);
function resetRng(seed) { _rng = mulberry32((seed === undefined ? DEFAULT_SEED : Number(seed)) >>> 0); }
Math.random = () => _rng();
// FULL PRODUCTION EVAL LIST (Steve 2026-10-08): every src/js/*.js in index.html load
// order, minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js and minus
// drama.js (top-level document access crashes node eval). A short list silently drops
// real systems (a missing statusEffects.js caused a false `seMoveMod is not a function`
// crash here; a missing corpses.js once nearly produced a false bug report) — keep
// this list complete. WINDOW STUB: equipment.js needs `window` at load, but a stub left
// in place flips combat to the async path and headless fights stall forever — stub for
// the eval phase, then `delete global.window` before playing.
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
 'src/js/convo-beats.js', 'src/js/examine.js', 'src/js/equipment.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
 'src/js/contests.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;

const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}
function flatGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
}
// DETERMINISTIC PLAYER (Steve 2026-10-06): roster generation is random —
// fear_aura (the monster hesitates on turn 1) and pocket_sand (blinds it 2
// turns) shift the whole turn economy, and random AGI feeds the footwork
// dodge vs the direct bite — all of it flakes the charge/dive damage beats.
// This file measures monster mechanics, not player builds: strip them.
function stripChaosAbilities(s) {
  const bad = (a) => { const id = (a && a.id) || a; return id !== 'fear_aura' && id !== 'pocket_sand'; };
  s.abilities = (s.abilities || []).filter(bad);
  s.backgroundAbilities = (s.backgroundAbilities || []).filter(bad);
  s.stats = s.stats || {}; s.stats.agi = 5; // footwork dodge needs agi > 5
  if (s.passives) delete s.passives.footwork;
}
function startFight(scen) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s0 = Game.state.scholar;
  s0.health = 500;
  s0.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) {
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  Game.debugScenario(scen);
  const s = Game.state.scholar; // freshGame() replaces state — re-capture
  stripChaosAbilities(s);
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const m = M();
  m.hp = m.maxHp = 200; // survive observation; mechanics, not lethality
  return Game.tbfight;
}
// Glasswing uses the trap design (Steve 2026-10-05) — no turn-based on
// approach. Separate setup: place the scenario, don't force combat.
function startGlasswing() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s0 = Game.state.scholar;
  s0.health = 500;
  Game.debugScenario('glasswing');
  const sg = Game.state.scholar; // freshGame() replaces state — re-capture
  stripChaosAbilities(sg);
  return sg;
}
function M() { return Game.tbfight.fighters.find(x => x.kind === 'monster'); }
function P() { return Game.tbFighter('p'); }
// run monster turns until it's the player turn (ends there, turn open)
function monsterActs() {
  const f = Game.tbfight;
  if (!f || f.over) return 'over';
  if (Game.tbIsPlayerTurn()) { const p = P(); p.moveLeft = 0; p.acted = true; }
  Game.tbAdvance();
  return f.over ? 'over' : 'ok';
}

(async () => {
  await Game.init();
  Game.genDetail = () => flatGrid();
  let m;

  // --- 0. codex no longer lies about 'single' ---
  ok("tbPatternDesc('single') is not the area lie",
    !/area around it/i.test(Game.tbPatternDesc({ type: 'single' })));

  // ================= GLASSWING (trap design, Steve 2026-10-05) =================
  // No turn-based combat on approach — within 5 tiles it VANISHES and sets a
  // 3-turn shadow trap. Stand still → dive hits → grounded → combat starts.
  // Move away → it hits empty dirt and climbs back into the sun.
  {
    const s = startGlasswing();
    s.mx = s.monster.mx + 1; s.my = s.monster.my; // dist 1, within 5
    Game.monsterTurn();
    ok('glasswing vanishes within 5', !s.monster);
    ok('trap set', !!s.gwTrap);
    ok('trap dread line', Game.log.some(l => /The air feels wrong/i.test(l)));
  }
  {
    // shadow warnings escalate, then the dive
    const s = startGlasswing();
    s.mx = s.monster.mx + 1; s.my = s.monster.my;
    Game.monsterTurn(); // trap set
    Game.gwTrapTick(); // turn 1
    ok('shadow faint', Game.log.some(l => /shadow on the ground — faint/i.test(l)));
    Game.gwTrapTick(); // turn 2
    ok('shadow darker', Game.log.some(l => /shadow on the ground — darker/i.test(l)));
    // player stands still on the trap tile → direct hit
    const hpBefore = s.health;
    Game.gwTrapTick(); // turn 3 → dive
    ok('standing still: dive hits', s.health < hpBefore);
    ok('direct hit hurts (20-29)', hpBefore - s.health >= 20 && hpBefore - s.health <= 29);
    // s.monster is cleared on startCombat ("it's in the fight now") — the
    // grounded phase lives on the fighter.
    const gm = Game.tbfight.fighters.find(x => x.kind === 'monster');
    ok('hit → grounded', gm && gm.beamPhase === 'grounded');
    ok('grounded crash line', Game.log.some(l => /GROUNDED/i.test(l)));
    ok('combat starts on grounded hit', !!Game.tbfight);
    // GROUNDED-WINDOW PARITY (Steve 2026-10-06): the trap hit lands outside
    // combat and the speed-5 darter OPENS, burning a tick before the player
    // moves — so the trap sets gwGrounded=3 where the in-combat miss sets 2
    // (the miss resolves on the monster's own turn). Read after the opener:
    // 2 ticks left = 2 player actions = the same real window as the
    // in-combat path. (The +50% grounded hook makes one good strike often
    // lethal — the window is real, not a formality.)
    ok('trap-hit grounded window: 2 ticks left after the opener (2 player actions)',
      gm && gm.gwGrounded === 2, `gwGrounded=${gm && gm.gwGrounded}`);
    try { Game.tbEnd('fled'); } catch (e) {}
  }
  {
    // moving away dodges the dive
    const s = startGlasswing();
    const tx = s.monster.mx, ty = s.monster.my;
    s.mx = tx + 1; s.my = ty;
    Game.monsterTurn(); // trap set on the player's tile
    Game.gwTrapTick(); Game.gwTrapTick(); // turns 1-2
    s.mx = 0; s.my = 0; // far from the trap tile
    const hpBefore = s.health;
    Game.gwTrapTick(); // turn 3 → miss
    ok('moved away: no damage', s.health === hpBefore);
    ok('miss: no combat, trap cleared', !Game.tbfight && !s.gwTrap);
    ok('miss line', Game.log.some(l => /hits empty dirt/i.test(l)));
  }

  // ================= SUNBASKER =================
  startFight('sunbasker');
  m = M();
  ok('sunbasker opens basking', m.beamPhase === 'bask');
  ok('sunbasker opening dread line', Game.log.some(l => /Gold in the grass/i.test(l)));
  ok('slow monster: no opening-pass turn (charge 0)', m.sbCharge === 0);
  monsterActs(); // bask 1
  m = M();
  ok('charge builds to 1', m.sbCharge === 1 && m.beamPhase === 'bask');
  monsterActs(); // bask 2 → bite declared
  m = M();
  ok('charge builds to 2', m.sbCharge === 2);
  ok('bite declared at charge 2', !!m.telegraph && m.telegraph.kind === 'direct');
  ok('bite phase charged', m.beamPhase === 'charged');

  // --- hitting it mid-windup kills the charge; bite lands weak ---
  Game.tbPlayerStrike(m.key); // player turn is open
  m = M();
  ok('hit resets charge', m.sbCharge === 0);
  ok('charge-break line', Game.log.some(l => /knocks the charge out/i.test(l)));
  const hp3 = P().hp;
  monsterActs(); // bite resolves with no charge bonus
  const biteDmg = hp3 - P().hp;
  ok('weakened bite lands (base 8-14, no charge bonus)', biteDmg >= 8 && biteDmg <= 14);
  m = M();
  ok('bite spends charge, back to bask', m.sbCharge === 0 && m.beamPhase === 'bask');

  // --- full-charge bite hurts (leave it alone) ---
  monsterActs(); // charge 1
  monsterActs(); // charge 2 + declare
  const hp4 = P().hp;
  monsterActs(); // resolve at charge 2 → 16-22
  const fullDmg = hp4 - P().hp;
  ok('full-charge bite hits harder (16-22)', fullDmg >= 16 && fullDmg <= 22);

  // --- night flattens it (passive) ---
  startFight('sunbasker');
  Game.dayPart = 3;
  monsterActs();
  m = M();
  ok('night: flattened', !!m.sbFlat);
  ok('night: no charge, no telegraph', m.sbCharge === 0 && !m.telegraph);
  ok('flatten line', Game.log.some(l => /dull brown/i.test(l)));
  Game.dayPart = 1;

  // --- shade flattens too ---
  Game.genDetail = () => { const g = flatGrid(); g[4][3] = 'tree'; return g; };
  startFight('sunbasker');
  m = M();
  m.mx = 4; m.my = 4; // tree at (3,4) = orthogonal → shade
  monsterActs();
  ok('shade: flattened', !!M().sbFlat);
  Game.genDetail = () => flatGrid();

  // ================= WING/BASK VISUAL CONTRACTS (Steve 2026-10-06) =================
  // gwDiveShadow(): in-combat dive shadow — circle (faint shadow under the
  // circling monster) → dive (shadow on the target tile + fall-path streak).
  // sbHeatKeys(): the sunbasker's heat halo — {charge, monster, ring}, null
  // when flattened/shaded/night. Both are diegetic → UNGATED; the coaching
  // stays codex-gated (cueText at declare, knownCue, first-contact).
  {
    // --- trap audio: shadow-closing turns are audible and escalating ---
    const fired = [];
    Game.audio = {
      glasswingShadowClose(d) { fired.push(['shadowClose', d && d.turns]); },
      glasswingDive() { fired.push(['dive']); },
      glasswingClimb() { fired.push(['climb']); },
      glasswingCircle() { fired.push(['circle']); },
      glasswingLand() { fired.push(['land']); },
      heartbeat() { fired.push(['heartbeat']); },
    };
    const s = startGlasswing();
    s.mx = s.monster.mx + 1; s.my = s.monster.my;
    Game.monsterTurn(); // trap set → circle + heartbeat
    ok('trap set fires glasswingCircle', fired.some(f => f[0] === 'circle'));
    Game.gwTrapTick(); // turn 1
    Game.gwTrapTick(); // turn 2
    ok('shadow-closing turns fire glasswingShadowClose (escalating 1,2)',
      fired.filter(f => f[0] === 'shadowClose').map(f => f[1]).join(',') === '1,2');
    s.mx = 0; s.my = 0; // dodge
    Game.gwTrapTick(); // turn 3 → miss
    ok('miss fires dive + climb', fired.some(f => f[0] === 'dive') && fired.some(f => f[0] === 'climb'));
    delete Game.audio;
  }
  {
    // --- in-combat dive shadow: circle → dive ---
    const s = startGlasswing();
    s.mx = s.monster.mx + 1; s.my = s.monster.my;
    Game.monsterTurn(); // trap set
    Game.gwTrapTick(); Game.gwTrapTick(); // turns 1-2
    Game.gwTrapTick(); // turn 3 → standing still: dive hits → combat, grounded
    ok('gwDiveShadow: null while grounded (aftermath needs no shadow)',
      Game.gwDiveShadow() === null);
    let gm = Game.tbfight.fighters.find(x => x.kind === 'monster');
    gm.hp = gm.maxHp = 200;
    P().hp = P().maxHp = 500;
    // force a fresh circling pass out of dive range
    gm.beamPhase = 'circle'; gm.telegraph = null; gm.gwGrounded = 0;
    const p = P();
    gm.mx = 0; gm.my = 0; p.mx = 7; p.my = 7; // dist 7 > diveRange 3
    let sh = Game.gwDiveShadow();
    ok('gwDiveShadow: circle phase — faint shadow under the circling monster',
      sh && sh.phase === 'circle' && sh.monster.x === 0 && sh.monster.y === 0);
    // close in → the dive declares on the player's tile
    gm.mx = 5; gm.my = 6; // dist 2 <= 3
    monsterActs();
    gm = Game.tbfight.fighters.find(x => x.kind === 'monster');
    ok('dive declared in combat', !!gm.telegraph && gm.beamPhase === 'dive');
    sh = Game.gwDiveShadow();
    ok('gwDiveShadow: dive shadow sits on the target tile',
      sh && sh.phase === 'dive' && sh.tile.x === p.mx && sh.tile.y === p.my);
    ok('gwDiveShadow: fall streak traces monster→target, grid-clamped',
      sh && Array.isArray(sh.streak) && sh.streak.length > 0 &&
      sh.streak.every(c => c.x >= 0 && c.x <= 8 && c.y >= 0 && c.y <= 8) &&
      !sh.streak.some(c => c.x === sh.tile.x && c.y === sh.tile.y));
    // unknown pattern: the shadow shows anyway (diegetic); the cue is dread
    ok('dive shadow renders while pattern unknown (diegetic)',
      !Game.encTelegraphKnown(gm) && !!Game.gwDiveShadow());
    ok('dive cueText is dread when unknown — no coaching',
      gm.telegraph.cueText && !/You know this one/.test(gm.telegraph.cueText));
    // let the dive resolve on the player: hit → climb → pattern learned
    const hpB = P().hp;
    monsterActs(); // resolve
    ok('dive hits the player tile', P().hp < hpB);
    ok('Skyfall Dive learned after surviving it',
      Game.tbPatternKnown('glasswing', 'Skyfall Dive'));
    ok('codex wrote the dive down', /Codex: Skyfall Dive/.test(Game.log.join('\n')));
    // second dive, pattern known → the cueText coaches
    gm = Game.tbfight.fighters.find(x => x.kind === 'monster');
    gm.beamPhase = 'circle'; gm.telegraph = null;
    gm.mx = 5; gm.my = 6;
    monsterActs();
    gm = Game.tbfight.fighters.find(x => x.kind === 'monster');
    const gwCue = Game.tbTelegraphCue(gm); // player-facing: cueText + earned knownTail
    ok('known dive cueText coaches (shadow + move)',
      gm.telegraph && /You know this one/.test(gwCue) && /Watch the shadow/.test(gwCue));
    try { Game.tbEnd('fled'); } catch (e) {}
  }
  {
    // --- sunbasker heat halo: the charge made visible ---
    startFight('sunbasker');
    m = M();
    m.hp = m.maxHp = 200;
    monsterActs(); // bask 1 → charge 1
    m = M();
    let heat = Game.sbHeatKeys();
    ok('sbHeatKeys: halo while basking in sunlight', heat && heat.charge === 1);
    ok('sbHeatKeys: monster tile + 8-cell ring',
      heat && heat.monster.x === m.mx && heat.monster.y === m.my && heat.ring.length === 8);
    ok('heat halo renders while pattern unknown (diegetic)',
      !Game.encTelegraphKnown(m) && !!Game.sbHeatKeys());
    monsterActs(); // bask 2 → bite declared (charge 2)
    m = M();
    heat = Game.sbHeatKeys();
    ok('sbHeatKeys: charge 2 halo brighter tier', heat && heat.charge === 2);
    ok('bite cueText is dread when unknown',
      m.telegraph && !/You know this one/.test(m.telegraph.cueText));
    // tier-3 shape (defensive cap): direct-set, ring still 8
    m.sbCharge = 3;
    heat = Game.sbHeatKeys();
    ok('sbHeatKeys: charge 3 halo (cap tier)', heat && heat.charge === 3 && heat.ring.length === 8);
    m.sbCharge = 2;
    // learn the pattern by surviving the bite, then re-declare → coaching
    P().hp = P().maxHp = 500;
    monsterActs(); // bite resolves on the player
    ok('Sun-Charged Bite learned after surviving it',
      Game.tbPatternKnown('sunbasker', 'Sun-Charged Bite'));
    m = M();
    if (m && m.alive) {
      m.beamPhase = 'bask'; m.telegraph = null; m.sbCharge = 1;
      m.hp = m.maxHp = 200;
      monsterActs(); // bask → charge 2 → declare
      m = M();
      const sbCue = Game.tbTelegraphCue(m); // player-facing: cueText + earned knownTail
      ok('known bite cueText coaches (hit it / shade)',
        m.telegraph && /You know this one/.test(sbCue) &&
        /hit it NOW/.test(sbCue));
    }
    try { Game.tbEnd('fled'); } catch (e) {}
  }
  {
    // --- heat halo dies with the sun ---
    startFight('sunbasker');
    m = M();
    monsterActs(); // bask 1
    ok('halo present while basking', !!Game.sbHeatKeys());
    Game.dayPart = 3; // night
    monsterActs();
    ok('sbHeatKeys: null when flattened (night)', Game.sbHeatKeys() === null);
    Game.dayPart = 1;
    try { Game.tbEnd('fled'); } catch (e) {}
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
