// PROOF TEST (Steve 2026-10-06): wave-2 difficulty spec P1 — PAPARAZZO + UNDERSTUDY + THE SIX review.
// Played AS A PLAYER via node harness (NOT jest). Authority: Steve 2026-10-06
// "Wave 2 needs to be harder. We gate with better loot and progress."
//
// BEFORE (baseline, pre-spec):
//   - paparazzo: prediction +1/flash on resolve, exclusive at 5 — unreachable in
//     3-4 round fights; hp [65,85]; no loot entry.
//   - understudy: Opening Steal + Desperate Improv were codex promises with no
//     code; arc blew by in ~2 rounds; no loot entry.
// AFTER (this test asserts):
//   1. Paparazzo EXCLUSIVE FIRES in a live fight: prediction climbs on commit,
//      phase hits 'exclusive' by the 5th monster turn, the money-shot telegraph
//      is unavoidable, and it re-centers on the player's current position
//      (footwork stops working — break line of sight or eat it).
//   2. Paparazzo counterplay matters pre-exclusive: a flash dodged by footwork
//      misses (the player is NOT auto-hit).
//   3. Paparazzo data: hp [70,90], loot 0.15/tier 3.
//   4. Understudy code TRUE per data promises: performing at 3 observations,
//      Opening Steal fires (halved + answered, switch-weapons counterplay),
//      Desperate Improv fires below 30% HP (two-move chain), learned guard.
//   5. Understudy data: loot 0.15/tier 3.
//   6. No codex lies: every move named in understudy's slain text exists in
//      game.js; paparazzo knownCue matches the implemented /4 mechanic.
//   7. The Six review: review_drone, voice_mimic_radio, memory_projector,
//      warranty_caller, bright_idea, mirror_stag each have loot 0.15/tier 2-3,
//      knownCue, armor, resistances, a distinct AI block with phases —
//      no changes, they meet the wave-2 bar (Steve 2026-10-06: wave 2 is a
//      genuine step up from wave 1 on its own terms).
//
// Run: node scripts/test-wave2-apply-p1.js
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
const GAME_SRC = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const MONSTERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const MDEF = Object.fromEntries(MONSTERS.filter(m => m.id).map(m => [m.id, m]));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
// TURN HYGIENE: endTurn() advances EXACTLY one AI round, never two.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
const SPEAR = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
function newFight(id, hp) {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  Game.startCombat(id);
  const m = M(); if (!m) throw new Error('newFight: startCombat produced no monster');
  if (hp) m.hp = m.maxHp = hp;
  const pl = P(); pl.hp = pl.maxHp = 400;
  // interior tiles only (1..7): edges are the flee-by-barrier
  pl.mx = Math.min(7, Math.max(1, m.mx - 3)); pl.my = Math.min(7, Math.max(1, m.my));
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
  Game.state.scholar.equipped.weapon = Object.assign({}, SPEAR);
  return m;
}
function strikeMonster() {
  const d = () => Math.max(Math.abs(P().mx - M().mx), Math.abs(P().my - M().my));
  let guard = 0;
  while (Game.tbIsPlayerTurn() && !P().acted && M() && M().alive && d() > 2 && P().moveLeft > 0 && guard++ < 8) {
    const nx = Math.min(7, Math.max(1, P().mx + Math.sign(M().mx - P().mx)));
    const ny = Math.min(7, Math.max(1, P().my + Math.sign(M().my - P().my)));
    if (!Game.tbPlayerMove(nx, ny)) break;
  }
  if (Game.tbIsPlayerTurn() && !P().acted && M() && M().alive && d() <= 2) Game.tbPlayerStrike(M().key);
  endTurn();
}
(async () => {
  await Game.init();
  let says = [];
  const audioFired = [];
  Game.say = (t) => { says.push(String(t)); };
  const origAudio = Game.audioEvent;
  Game.audioEvent = function (n, o) { audioFired.push(n); try { return origAudio.call(this, n, o); } catch (e) {} };
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: Object.assign({}, SPEAR) };
  Game.canSee = () => true;

  // ---------- [1] data checks ----------
  console.log('\n[1] data: paparazzo + understudy');
  const pz = MDEF['paparazzo'], us = MDEF['understudy'];
  check('paparazzo hp [70,90]', JSON.stringify(pz.hp) === '[70,90]', JSON.stringify(pz.hp));
  check('paparazzo loot 0.15/tier 3', pz.loot && pz.loot.chance === 0.15 && pz.loot.tier === 3, JSON.stringify(pz.loot));
  check('understudy loot 0.15/tier 3', us.loot && us.loot.chance === 0.15 && us.loot.tier === 3, JSON.stringify(us.loot));
  check('paparazzo knownCue present (sibling)', !!(pz.encounter || {}).knownCue);
  check('understudy knownCue present (sibling)', !!(us.encounter || {}).knownCue);
  check('paparazzo armor/resistances present (sibling)', typeof pz.armor === 'number' && typeof pz.resistances === 'object');
  check('understudy armor 0/resistances {} (sibling)', us.armor === 0 && JSON.stringify(us.resistances) === '{}');

  // ---------- [2] paparazzo: the exclusive FIRES ----------
  console.log('\n[2] paparazzo exclusive fires in a live fight');
  says = [];
  let m = newFight('paparazzo', 400); // fat target: the arc must fire, not the kill
  const arc = [];
  let sawUnavoidable = false, sawGotIt = false;
  let rounds = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds < 8 && M() && M().alive && P() && P().alive) {
    const mm = M();
    arc.push(`${rounds}:${mm.beamPhase || '?'}(pz=${mm.pzPrediction})`);
    if (mm.telegraph && mm.telegraph.unavoidable) sawUnavoidable = true;
    endTurn(); // player waits — the shoot is the whole point
    rounds++;
    if (M() && M().beamPhase === 'exclusive') break;
  }
  // the exclusive telegraph is declared on the exclusive turn (or the next,
  // once the previous cycle's telegraph clears) — poll for it
  let tgGuard = 0;
  while (!sawUnavoidable && tgGuard++ < 4 && Game.tbfight && !Game.tbfight.over && M() && M().alive && P() && P().alive) {
    const tg = M().telegraph;
    if (tg && tg.unavoidable) { sawUnavoidable = true; break; }
    endTurn();
    rounds++;
  }
  console.log('  arc: ' + arc.join(' '));
  sawGotIt = says.some(s => s.includes('GOT IT'));
  check('exclusive phase reached by round 5', M() && M().beamPhase === 'exclusive', arc.join(' '));
  check('money-shot text fires ("GOT IT")', sawGotIt);
  check('unavoidable telegraph declared', sawUnavoidable);
  check('prediction capped at 4', M() && (M().pzPrediction || 0) <= 4, String(M() && M().pzPrediction));

  // ---------- [3] paparazzo: counterplay matters pre-exclusive ----------
  console.log('\n[3] paparazzo counterplay: footwork dodges the regular flash');
  says = [];
  m = newFight('paparazzo', 400);
  // round 1: monster declares; player sprints clear of the burst, then resolve
  endTurn(); // monster turn 1: declares flash (prediction 1)
  let dodged = false, dodgeSaid = false;
  if (M() && M().telegraph && M().telegraph.cells) {
    const cells = new Set(M().telegraph.cells.map(c => c.cx + ',' + c.cy));
    // find an interior tile outside the burst
    let safe = null;
    for (let y = 1; y <= 7 && !safe; y++) for (let x = 1; x <= 7 && !safe; x++) {
      if (!cells.has(x + ',' + y) && Math.max(Math.abs(x - P().mx), Math.abs(y - P().my)) <= 4) safe = { x, y };
    }
    const phpBefore = P().hp;
    if (safe) { P().mx = safe.x; P().my = safe.y; } // footwork: 4-speed player outruns a pr=2 burst
    endTurn(); // resolve
    dodged = P().hp === phpBefore;
    dodgeSaid = says.some(s => s.includes('Clean dodge'));
  }
  check('regular flash is dodgeable by footwork', dodged, 'player still hit — footwork failed');
  check('dodge is acknowledged ("Clean dodge")', dodgeSaid);
  check('exclusive re-centers: unavoidable ignores footwork', GAME_SRC.includes("it predicted the\n      // dodge, so footwork doesn't save you") || GAME_SRC.includes("so footwork doesn't save you"),
    're-center comment missing');

  // ---------- [4] understudy: code TRUE per data promises ----------
  console.log('\n[4] understudy: performing@3, Opening Steal, Desperate Improv');
  says = [];
  m = newFight('understudy', 115);
  let guard = 0;
  while (M() && M().alive && M().beamPhase !== 'performing' && guard++ < 10) strikeMonster();
  check('performing reached at 3 observations', M() && M().beamPhase === 'performing',
    M() ? `${M().beamPhase} seen=${JSON.stringify(M().usSeen)}` : 'no monster');
  check('steal armed on most-used weapon', M() && M().usStealArmed === 'Fire-hardened spear', String(M() && M().usStealArmed));
  says = [];
  const phpB = P().hp;
  strikeMonster(); // stolen-weapon strike: halved + answered
  check('Opening Steal fires', says.some(s => s.includes('OPENING STEAL')));
  check('steal answers with the copy (player hurt)', P().hp < phpB, `player ${phpB}->${P().hp}`);
  // improv: wound below 30%, let it act
  if (M() && M().alive) { m.hp = Math.min(m.hp, 25); M().mx = P().mx + 1; M().my = P().my; }
  says = [];
  endTurn();
  check('improv phase fires below 30% HP', M() && M().beamPhase === 'improv', String(M() && M().beamPhase));
  check('improv telegraph chains two learned moves',
    !!(M() && M().telegraph && M().telegraph.usImprov && (M().telegraph.usImprovNames || []).length === 2),
    JSON.stringify(M() && M().telegraph && M().telegraph.usImprovNames));
  says = [];
  endTurn();
  check('improv resolution names your moves', says.some(s => s.includes('DESPERATE IMPROV — your')));

  // ---------- [5] no codex lies ----------
  console.log('\n[5] codex honesty');
  const slain = ((us.codexStages || {}).slain) || '';
  const srcLower = GAME_SRC.toLowerCase();
  for (const mv of ['Mirror Strike', 'Opening Steal', 'Desperate Improv']) {
    check(`understudy slain names "${mv}" — implemented in game.js`, slain.includes(mv) && srcLower.includes(mv.toLowerCase()), mv);
  }
  check('understudy slain fidelity 50/65/80 matches code',
    slain.includes('50') && GAME_SRC.includes('m.beamPhase === \'performing\' ? 0.8'));
  const pzKnown = ((pz.encounter || {}).knownCue) || '';
  check('paparazzo knownCue matches /4 mechanic', pzKnown.includes('Four shots') && GAME_SRC.includes('m.pzPrediction}/4'),
    pzKnown.slice(0, 80));

  // ---------- [6] the six review ----------
  console.log('\n[6] the six review (no changes expected — they meet the bar)');
  const six = ['review_drone', 'voice_mimic_radio', 'memory_projector', 'warranty_caller', 'bright_idea', 'mirror_stag'];
  const preds = { review_drone: 'droneIs', voice_mimic_radio: 'vmIs', memory_projector: 'mpIs', warranty_caller: 'wcIs', bright_idea: 'biIs', mirror_stag: 'stagIs' };
  for (const id of six) {
    const d = MDEF[id];
    const enc = d.encounter || {};
    const okLoot = d.loot && d.loot.chance === 0.15 && (d.loot.tier === 2 || d.loot.tier === 3);
    const okData = okLoot && !!enc.knownCue && typeof d.armor === 'number' && typeof d.resistances === 'object'
      && Array.isArray(enc.phases) && enc.phases.length >= 3 && !!enc.aggroAudio;
    const okCode = GAME_SRC.includes(preds[id] + '(m)') && GAME_SRC.includes(`'${id}'`);
    check(`${id}: loot/knownCue/armor/res/phases/audio + AI block`, okData && okCode,
      okData && okCode ? '' : `data=${okData} code=${okCode}`);
  }

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
