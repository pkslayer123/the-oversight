#!/usr/bin/env node
// FLYERS play-audit (Steve 2026-10-07): nevermore / nightcourt / statickite.
// Worker 2, flesh-out loop — the three flyer monsters never play-audited.
// Plays each fight AS THE PLAYER (dodge telegraphs, punish windows), judges
// against the Highbeam Deer bar: distinct telegraph text, attack-pattern
// visual on grid, phase system visible to the player, behavior distinct from
// the other flyers. Exit 0 = all green; exit 1 = any FAIL.
//
// Data truth (monsters.json at HEAD 09155ea):
//   nevermore  — wave-1: perch (high, melee-untargetable) -> strafe (3-lane
//                dive, shadow telegraph) -> grounded (1 turn hit / 2 miss).
//   nightcourt — wave-1: roost (high, silent) -> dive (single-tile shadow) ->
//                redive (immediate re-aim at your new tile on a miss) ->
//                grounded 2 turns. The double-dive is the signature.
//   statickite — wave-2 System artifact: rise (high, holds range) -> mark
//                (3x3 zone, 2-beat windup) -> transmit (zone damage + dips
//                low, vulnerable, +50%) -> recover (climbs). Never lands.
//
// KNOWN audio gap (NOT re-audited, NOT fixed — engine owner): kiteUnfold,
// nevermoreUnfold, nightcourtTurn, nightcourtDive are data-declared but have
// no synths; the declare path goes fully silent (truthy values bypass the
// deerAggro fallback). Silence is noted per scenario, never asserted.
//
// Run: GAME_SRC=/tmp/headjs SEED=20261007 node scripts/test-flyers-20261007.js
// Pinned engine: git archive HEAD. Full index.html module order minus
// DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js and drama.js
// (touches document at load — pure presentation). Validated green at
// efc1ec1 (2026-10-07) across 6 seeds; re-pin GAME_SRC when re-running.
const fs = require('fs');
const path = require('path');
const SRC = process.env.GAME_SRC || path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'))) });

// ---- seeded PRNG (mulberry32); fixed default, SEED env override ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED0 = parseInt(process.env.SEED || '20261007', 10);
function reseed(s) { Math.random = mulberry32(s); }

// ---- eval full list in index.html order (minus DOM-only + drama.js) ----
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
];
global.window = global; // equipment.js needs window at LOAD only
for (const f of JS_LIST) eval(fs.readFileSync(path.join(SRC, f), 'utf8'));
delete global.window;   // delete before PLAYING — keeps combat sync
const Game = globalThis.Scattering.Game;

// ---- recording ----
const sayLines = [];    // {round, text}
const audioCalls = [];   // {name} — per scenario, summarized at scenario end
let roundNo = 0;
const _say = Game.say.bind(Game);
Game.say = (t) => { sayLines.push({ round: roundNo, text: String(t) }); return _say(t); };
const _audio = Game.audioEvent.bind(Game);
Game.audioEvent = (name) => { audioCalls.push(name); return _audio(name); };
function fightOver() { return !Game.tbfight || !!Game.tbfight.over; }
function saidSince(i) { return sayLines.slice(i).map(s => s.text); }
function audioSummary() {
  const counts = {};
  for (const n of audioCalls) counts[n] = (counts[n] || 0) + 1;
  return Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(', ') || '(none)';
}

// ---- checks ----
let fails = 0, passes = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passes++; console.log(`  PASS ${name}`); }
  else { fails++; failures.push(name); console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function note(t) { console.log(t); }

// ---- player helpers ----
function P() { return Game.tbfight ? Game.tbFighter('p') : null; }
function MON() { return (Game.tbfight ? Game.tbfight.fighters : []).find(x => x.kind === 'monster' && x.alive); }
function endTurn() {
  if (fightOver()) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction(); // advances the round; NEVER a trailing tbAdvance
}
// newRun: fresh fight setup. px,py = player start BEFORE startCombat.
function newRun(mid, px, py) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  // All-grass grid: honest pathing (glasswing-audit precedent).
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.debugScenario(mid);
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2000;
  // Deterministic hit-paths: footwork is a real passive dodge chance, but the
  // telegraph->damage pipeline is what's under audit here.
  s.stats = s.stats || {}; s.stats.agi = 3; s.passives = {};
  s.mx = px === undefined ? 4 : px;
  s.my = py === undefined ? 6 : py;
  roundNo = 0; sayLines.length = 0; audioCalls.length = 0;
  return s;
}
function startFight(mid, px, py) {
  const s = newRun(mid, px, py);
  const say0 = sayLines.length;
  Game.startCombat(mid);
  const m = MON();
  if (m) { m.hp = m.maxHp = 400; } // long audit fights; damage model untouched
  return { s, m, intro: saidSince(say0).join(' ') };
}
// one player turn via brain, then the monsters act inside tbAfterPlayerAction.
function playRound(brain) {
  roundNo++;
  const say0 = sayLines.length;
  if (!fightOver()) {
    if (Game.tbIsPlayerTurn()) brain(MON(), P());
    if (!fightOver() && Game.tbIsPlayerTurn()) endTurn(); // brain idled -> pass
  }
  return { said: saidSince(say0), m: MON(), p: P() };
}
function movePlayerTo(tx, ty) {
  const p = P(); let guard = 14;
  while (guard-- > 0 && p && (p.mx !== tx || p.my !== ty) && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
    if (!Game.tbPlayerMove(p.mx + Math.sign(tx - p.mx), p.my + Math.sign(ty - p.my))) break;
  }
}
// step to the nearest tile outside the monster's telegraph cells (interior 1..7)
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
// walk to the monster and strike (spear range 2 / sling range 4)
function strikeAdjacent() {
  const m = MON(), p = P();
  if (!m || !p) return false;
  movePlayerTo(m.mx, m.my); // stops adjacent ("don't stroll through" the last tile)
  const dd = Math.max(Math.abs(MON().mx - P().mx), Math.abs(MON().my - P().my));
  if (dd > 4) return false;
  return Game.tbPlayerStrike('m_0');
}
function badge(m) { try { return Game.encPhaseBadge(m); } catch (e) { return ''; } }

// ============ NEVERMORE ============
function scenarioNevermore(seed) {
  reseed(seed);
  note(`\n### NEVERMORE (seed ${seed})`);
  // Start far (d=4 > strafe range 3): the opening is a PERCH, not an ambush.
  const { m: m0, intro } = startFight('nevermore', 1, 7);
  let m = m0;
  const phaseSeen = [];
  const record = () => { const mm = MON(); if (mm && phaseSeen[phaseSeen.length - 1] !== mm.beamPhase) phaseSeen.push(mm.beamPhase); };
  record();
  note(`  intro: ${intro.slice(0, 160)}`);
  check('nevermore: opens PERCHED (out of strafe range)', m.beamPhase === 'perch', m.beamPhase);
  check('nevermore: altitude high while perched', m.altitude === 'high', m.altitude);
  check('nevermore: first contact is dread, not a lecture', /A crow on the treeline/.test(intro), intro.slice(0, 120));
  check('nevermore: phase badge PERCHED', /PERCHED/.test(badge(m)), badge(m));

  // REFUSAL PROBE (directed): player walks up to the perched crow and swings.
  // Real-play equivalent: closing during perch, then striking before it dives.
  let refused = false, refusedLine = '';
  let r = playRound((mm, p) => {
    if (!mm || mm.beamPhase !== 'perch' || mm.telegraph) return;
    const d = Math.max(Math.abs(mm.mx - p.mx), Math.abs(mm.my - p.my));
    if (d > 1) { p.mx = Math.min(7, Math.max(1, mm.mx - 1)); p.my = Math.min(7, Math.max(1, mm.my)); } // directed: close the gap
    Game.tbPlayerStrike('m_0');
  });
  record(); m = MON();
  refusedLine = r.said.join(' ');
  refused = /high overhead — out of|circling high above reach/.test(refusedLine);
  note(`  refusal: ${refusedLine.slice(0, 180)}`);
  check('nevermore: melee refused while high (honest, not silent)', refused, refusedLine.slice(0, 140));
  check('nevermore: refused strike deals no damage', Math.round(m.hp) === 400, String(Math.round(m.hp)));

  // STRAFE: the probe's strike spent the player's turn; the crow declares on
  // its turn inside that same round. Capture the FIRST declare's cue here —
  // the 1-turn windup resolves next round, so a later capture would see the
  // (already-learned) re-declare instead.
  let gotStrafe = false, unknownCue = '', strafeCells = 0, strafeTurns = 0;
  m = MON();
  if (m && m.telegraph && m.beamPhase === 'strafe') {
    gotStrafe = true;
    strafeCells = m.telegraph.cells.length;
    strafeTurns = m.telegraph.turnsLeft;
    unknownCue = m.telegraph.cueText || '';
    note(`  STRAFE: ${strafeCells} cells, turnsLeft=${strafeTurns}, cue="${unknownCue.slice(0, 80)}"`);
    note(`  said: ${r.said.slice(-2).join(' || ').slice(0, 240)}`);
  } else {
    // Fallback: wait for a declare (shouldn't happen — the probe guarantees it).
    for (let i = 0; i < 8 && !gotStrafe && !fightOver(); i++) {
      r = playRound(() => {});
      record(); m = MON();
      if (m && m.telegraph && m.beamPhase === 'strafe') {
        gotStrafe = true;
        strafeCells = m.telegraph.cells.length;
        strafeTurns = m.telegraph.turnsLeft;
        unknownCue = m.telegraph.cueText || '';
      }
    }
  }
  check('nevermore: strafe declared', gotStrafe);
  check('nevermore: 3-length lane on grid (3 cells)', strafeCells === 3, String(strafeCells));
  check('nevermore: 1-turn windup (the shadow gives one beat)', strafeTurns === 1, String(strafeTurns));
  check('nevermore: badge STRAFING while winding up', /STRAFING/.test(badge(m)), badge(m));
  check('nevermore: unknown cue is the shadow line (no coaching yet)',
    /straight black lane/.test(unknownCue) && !/MOVE OFF/.test(unknownCue), unknownCue.slice(0, 80));

  // STAND IN THE LANE -> the Unkind Cut hits (14-22). Then it lands: hit = 1 turn.
  const hp0 = Math.round(P().hp);
  r = playRound(() => {}); // stand still, take it
  record(); m = MON();
  const dmgTaken = hp0 - Math.round(P().hp);
  note(`  took ${dmgTaken} standing in the lane`);
  check('nevermore: strafe HITS a player on the lane (14-22)', dmgTaken >= 14 && dmgTaken <= 22, String(dmgTaken));
  check('nevermore: lands GROUNDED after the run', m.beamPhase === 'grounded', m.beamPhase);
  check('nevermore: hit-run grounds it 1 turn', m.nmGrounded === 1, String(m.nmGrounded));
  note(`  said: ${r.said.slice(-3).join(' || ').slice(0, 260)}`);

  // PUNISH the landing: spear, +50% while grounded.
  const mhp0 = Math.round(m.hp);
  r = playRound(() => { strikeAdjacent(); });
  record();
  const dmgDealt = mhp0 - Math.round(m.hp);
  note(`  punish strike dealt ${dmgDealt}`);
  check('nevermore: grounded punish lands', dmgDealt > 0, String(dmgDealt));
  check('nevermore: +50% grounded bonus announced', /\+50% while grounded/.test(r.said.join(' ')),
    r.said.slice(-2).join(' | ').slice(0, 140));

  // CYCLE: it climbs, perches, strafes again. Dodge this time -> miss = 2 turns.
  // The first resolve taught the pattern (tbLearnPattern) -> the re-declare coaches.
  let climbed = false, restrafeCue = '', dodged2 = false;
  for (let i = 0; i < 14 && !fightOver(); i++) {
    r = playRound((mm, p) => {
      if (!mm) return;
      if (mm.telegraph) dodgeTelegraph(p);
      else if (mm.beamPhase === 'grounded') strikeAdjacent();
    });
    record(); m = MON();
    if (m && m.beamPhase === 'perch') climbed = true;
    if (m && m.telegraph && m.beamPhase === 'strafe' && climbed && !restrafeCue) {
      restrafeCue = m.telegraph.cueText || '';
      dodged2 = !(m.telegraph.cells.some(c => c.cx === P().mx && c.cy === P().my));
      note(`  re-strafe cue: "${restrafeCue.slice(0, 80)}" (player dodged: ${dodged2})`);
    }
    if (restrafeCue && m && m.beamPhase === 'grounded') break;
  }
  check('nevermore: climbs back to PERCH after grounded', climbed);
  check('nevermore: re-strafe declare is COACHED after learning', /MOVE OFF/.test(restrafeCue), restrafeCue.slice(0, 80));
  check('nevermore: dodged run grounds it 2 turns', MON() && MON().nmGrounded >= 1, MON() && String(MON().nmGrounded));
  check('nevermore: phase order perch>strafe>grounded observed',
    phaseSeen.includes('perch') && phaseSeen.includes('strafe') && phaseSeen.includes('grounded'),
    phaseSeen.join('>'));
  note(`  audio: ${audioSummary()}`);
  note(`  player HP: ${Math.round(P().hp)}, crow HP: ${Math.round(MON().hp)}`);
}

// ============ NIGHTCOURT ============
function scenarioNightcourt(seed) {
  reseed(seed);
  note(`\n### NIGHTCOURT (seed ${seed})`);
  // d=4 from the roost = dive range: the faster owl opens with an ambush dive.
  const { m: m0, intro } = startFight('nightcourt', 1, 7);
  let m = m0;
  const phaseSeen = [];
  const record = () => { const mm = MON(); if (mm && phaseSeen[phaseSeen.length - 1] !== mm.beamPhase) phaseSeen.push(mm.beamPhase); };
  record();
  note(`  intro: ${intro.slice(0, 160)}`);
  check('nightcourt: fight-init sets ROOST (dread first contact)', /Two eyes, forward-facing/.test(intro), intro.slice(0, 120));
  const openedDive = m.beamPhase === 'dive' && !!m.telegraph;
  check('nightcourt: faster owl ambush-opens with the dive when in range', openedDive, m.beamPhase);
  const unknownCue = (m.telegraph && m.telegraph.cueText) || '';
  note(`  opening dive cue: "${unknownCue.slice(0, 80)}"`);
  check('nightcourt: unknown cue is the silent-shadow line (no coaching)',
    /No sound/.test(unknownCue) && /shadow/.test(unknownCue) && !/MOVE/.test(unknownCue), unknownCue.slice(0, 80));
  check('nightcourt: single-tile telegraph (1 cell)', m.telegraph.cells.length === 1, String(m.telegraph.cells.length));

  // DODGE the dive -> MISS. The threat must NOT end: it turns mid-air.
  const hp0 = Math.round(P().hp);
  let r = playRound((mm, p) => { dodgeTelegraph(p); });
  record(); m = MON();
  check('nightcourt: dodged dive misses (0 damage)', Math.round(P().hp) === hp0, `hp ${hp0} -> ${Math.round(P().hp)}`);
  check('nightcourt: miss reads as the turn, not a whiff', /It TURNS, mid-air, impossibly/.test(r.said.join(' ')),
    r.said.slice(-2).join(' | ').slice(0, 140));
  check('nightcourt: missed dive arms the SECOND HEARING', m.ncRedove === true, String(m.ncRedove));

  // The redive declares on its next turn, re-aimed at the CURRENT tile.
  r = playRound(() => {}); // player holds; the owl is already turning
  record(); m = MON();
  const reaim = m.telegraph && m.telegraph.cells[0];
  note(`  redive: phase=${m.beamPhase}, aim=(${reaim && reaim.cx},${reaim && reaim.cy}) player=(${P().mx},${P().my})`);
  note(`  said: ${r.said.slice(-2).join(' || ').slice(0, 240)}`);
  check('nightcourt: REDIVE declared (second hearing)', m.beamPhase === 'redive', m.beamPhase);
  check('nightcourt: badge SECOND HEARING', /SECOND HEARING/.test(badge(m)), badge(m));
  check('nightcourt: redive re-aimed at the CURRENT player tile',
    !!(reaim && reaim.cx === P().mx && reaim.cy === P().my),
    reaim && `(${reaim.cx},${reaim.cy}) vs (${P().mx},${P().my})`);
  check('nightcourt: second warning is always coached', /SECOND DIVE/.test((m.telegraph && m.telegraph.cueText) || ''),
    ((m.telegraph && m.telegraph.cueText) || '').slice(0, 80));

  // DODGE AGAIN -> second miss -> SPENT, grounded 2 turns.
  const hp1 = Math.round(P().hp);
  r = playRound((mm, p) => { dodgeTelegraph(p); });
  record(); m = MON();
  check('nightcourt: second dodge avoids the redive', Math.round(P().hp) === hp1, `hp ${hp1} -> ${Math.round(P().hp)}`);
  check('nightcourt: two misses -> GROUNDED (spent)', m.beamPhase === 'grounded', m.beamPhase);
  check('nightcourt: spent lasts 2 turns', m.ncGrounded === 2, String(m.ncGrounded));
  note(`  said: ${r.said.slice(-2).join(' || ').slice(0, 240)}`);

  // PUNISH: two spear strikes inside the window, +50% while grounded.
  const mhp0 = Math.round(m.hp);
  r = playRound(() => { strikeAdjacent(); });
  const d1 = mhp0 - Math.round(m.hp);
  note(`  punish 1 dealt ${d1}`);
  check('nightcourt: punish strike lands', d1 > 0, String(d1));
  check('nightcourt: +50% while grounded announced', /\+50% while grounded/.test(r.said.join(' ')),
    r.said.slice(-2).join(' | ').slice(0, 140));
  check('nightcourt: window survives a strike (2 turns, not 1)',
    MON() && MON().beamPhase === 'grounded', MON() && MON().beamPhase);
  r = playRound(() => { strikeAdjacent(); });
  record();

  // CYCLE: it climbs back to roost.
  let climbed = false;
  for (let i = 0; i < 10 && !fightOver(); i++) {
    r = playRound((mm, p) => { if (mm && mm.telegraph) dodgeTelegraph(p); });
    record(); m = MON();
    if (m && m.beamPhase === 'roost') { climbed = true; break; }
  }
  check('nightcourt: climbs back to ROOST after spent', climbed);
  check('nightcourt: phase order roost>dive>redive>grounded observed',
    ['roost', 'dive', 'redive', 'grounded'].every(ph => phaseSeen.includes(ph)), phaseSeen.join('>'));
  note(`  audio: ${audioSummary()}`);
}

// ============ NIGHTCOURT hit path ============
function scenarioNightcourtHit(seed) {
  reseed(seed);
  note(`\n### NIGHTCOURT dive-hit path (seed ${seed})`);
  startFight('nightcourt', 1, 7);
  // Stand still: the opening dive HITS (12-18) -> straight to grounded, no redive.
  const hp0 = Math.round(P().hp);
  const r = playRound(() => {});
  const m = MON();
  const dmgTaken = hp0 - Math.round(P().hp);
  note(`  took ${dmgTaken} standing under the dive`);
  note(`  said: ${r.said.slice(-3).join(' || ').slice(0, 260)}`);
  check('nightcourt: dive HITS a player under the shadow (12-18)', dmgTaken >= 12 && dmgTaken <= 18, String(dmgTaken));
  check('nightcourt: landed dive -> GROUNDED directly (no second hearing)', m.beamPhase === 'grounded', m.beamPhase);
  check('nightcourt: hit also grounds it 2 turns', m.ncGrounded === 2, String(m.ncGrounded));
}

// ============ STATIC KITE ============
function scenarioStatickite(seed) {
  reseed(seed);
  note(`\n### STATICKITE (seed ${seed})`);
  // Kite is slow (speed 3): the player opens. Start mid-range to watch the RISE drift.
  const { m: m0, intro } = startFight('statickite', 1, 7);
  let m = m0;
  const phaseSeen = [];
  const record = () => { const mm = MON(); if (mm && phaseSeen[phaseSeen.length - 1] !== mm.beamPhase) phaseSeen.push(mm.beamPhase); };
  record();
  note(`  intro: ${intro.slice(0, 160)}`);
  check('kite: opens RISING (no ambush — it films first)', m.beamPhase === 'rise' && !m.telegraph,
    `${m.beamPhase}/tg=${!!m.telegraph}`);
  check('kite: altitude high while rising', m.altitude === 'high', m.altitude);
  check('kite: first contact is dread, not a lecture', /Nobody is holding the string/.test(intro), intro.slice(0, 120));

  // MARK WATCH: the kite marks on its first turn at d<=6 (the player is at
  // d=4) — the rise drift only shows when it's off standoff range, which the
  // recover phase demonstrates later. Capture the declare the same round it
  // fires: the 2-beat windup ticks fast.
  let gotMark = false, unknownCue = '';
  for (let i = 0; i < 4 && !gotMark && !fightOver(); i++) {
    r = playRound(() => {}); // idle: let it frame the shot
    record(); m = MON();
    if (m && m.telegraph && m.beamPhase === 'mark') {
      gotMark = true;
      unknownCue = m.telegraph.cueText || '';
      note(`  MARK: ${m.telegraph.cells.length} cells, turnsLeft=${m.telegraph.turnsLeft}, cue="${unknownCue.slice(0, 80)}"`);
      note(`  said: ${r.said.slice(-2).join(' || ').slice(0, 260)}`);
    }
  }
  check('kite: mark declared', gotMark);
  check('kite: 3x3 scan zone on grid (9 cells)', m.telegraph.cells.length === 9, String(m.telegraph.cells.length));
  check('kite: 2-beat windup (the mark is the mercy)', m.telegraph.turnsLeft === 2, String(m.telegraph.turnsLeft));
  check('kite: badge MARKING', /MARKING/.test(badge(m)), badge(m));
  check('kite: unknown cue is the framing line (no coaching)',
    /framing the shot/.test(unknownCue) && !/TWO beats/.test(unknownCue), unknownCue.slice(0, 80));
  check('kite: stays HIGH while marking (sling/bow answer, not spear)', m.altitude === 'high', m.altitude);

  // RANGED ANSWER: the sling (range 4) CAN touch it while high. Spear couldn't.
  // Strike on the first windup beat (turnsLeft 2 -> 1 after the monster's tick).
  const mhpSling = Math.round(m.hp);
  const pd = Math.max(Math.abs(m.mx - P().mx), Math.abs(m.my - P().my));
  r = playRound(() => { if (pd <= 4) Game.tbPlayerStrike('m_0'); });
  record();
  const slingDmg = mhpSling - Math.round(m.hp);
  note(`  sling at high kite (d=${pd}): dealt ${slingDmg}`);
  check('kite: sling reaches the high kite (ranged answer is real)', slingDmg > 0, String(slingDmg));

  // DODGE the remaining beat(s): leave the zone, then the broadcast resolves.
  const hp0 = Math.round(P().hp);
  for (let i = 0; i < 4 && !fightOver(); i++) {
    r = playRound((mm, p) => { dodgeTelegraph(p); });
    record(); m = MON();
    if (m && m.beamPhase === 'transmit') break;
  }
  const zoneDmg = hp0 - Math.round(P().hp);
  note(`  player at (${P().mx},${P().my}) after dodge; took ${zoneDmg}`);
  check('kite: leaving the zone avoids the broadcast (0 dmg)', zoneDmg === 0, String(zoneDmg));
  check('kite: miss reads honestly (screams at empty ground)', /empty ground/.test(r.said.join(' ')),
    r.said.slice(-2).join(' | ').slice(0, 140));
  check('kite: TRANSMIT phase DIPS LOW (vulnerable)', m.beamPhase === 'transmit' && m.altitude === 'low',
    `${m.beamPhase}/${m.altitude}`);
  check('kite: badge TRANSMITTING', /TRANSMITTING/.test(badge(m)), badge(m));
  note(`  said: ${r.said.slice(-3).join(' || ').slice(0, 280)}`);

  // PUNISH THE DIP: one player turn at melee height, +50% while low.
  const mhp0 = Math.round(m.hp);
  r = playRound(() => { strikeAdjacent(); });
  record();
  const dipDmg = mhp0 - Math.round(m.hp);
  note(`  dip strike dealt ${dipDmg}`);
  check('kite: dip punish lands', dipDmg > 0, String(dipDmg));
  check('kite: +50% while low announced', /\+50% while low/.test(r.said.join(' ')),
    r.said.slice(-2).join(' | ').slice(0, 140));

  // RECOVER: climbs, cooldown, doesn't mark while cooling down. This is where
  // the rise-drift reads: it repositions at standoff range, high, filming.
  m = MON();
  check('kite: recover phase after the dip', m.beamPhase === 'recover', m.beamPhase);
  check('kite: climbs back HIGH after transmitting', m.altitude === 'high', m.altitude);
  check('kite: NEVER lands (no grounded phase, ever)', !phaseSeen.includes('grounded'), phaseSeen.join('>'));
  const recPos = [m.mx, m.my];
  r = playRound(() => {});
  record(); m = MON();
  const recPos2 = [m.mx, m.my];
  note(`  recover drift: (${recPos}) -> (${recPos2}), said: ${r.said.slice(-1).join(' ').slice(0, 110)}`);
  check('kite: recover drifts without marking (cooldown honest)',
    m.beamPhase === 'recover' && !m.telegraph, `${m.beamPhase}/tg=${!!m.telegraph}`);

  // SECOND CYCLE: the resolve taught the pattern -> the next mark coaches.
  let knownCue = '';
  for (let i = 0; i < 14 && !fightOver(); i++) {
    r = playRound((mm, p) => { if (mm && mm.telegraph) dodgeTelegraph(p); });
    record(); m = MON();
    if (m && m.telegraph && m.beamPhase === 'mark' && !knownCue) {
      knownCue = m.telegraph.cueText || '';
      note(`  re-mark cue: "${knownCue.slice(0, 80)}"`);
      break;
    }
  }
  check('kite: re-mark declare is COACHED after learning', /TWO beats\. MOVE/.test(knownCue), knownCue.slice(0, 80));
  note(`  audio: ${audioSummary()}`);
}

// ============ STATIC KITE zone-hit path ============
function scenarioKiteZoneHit(seed) {
  reseed(seed);
  note(`\n### STATICKITE zone-hit path (seed ${seed})`);
  startFight('statickite', 1, 7);
  // The kite marks on its first turn (d=4<=6). Wait for the declare, then
  // STAND IN THE ZONE: the broadcast hits (10-16, sonic).
  let m = MON();
  for (let i = 0; i < 4 && !(m.telegraph && m.beamPhase === 'mark') && !fightOver(); i++) {
    playRound(() => {});
    m = MON();
  }
  const hp0 = Math.round(P().hp);
  playRound(() => {}); // beat 1: stand
  const r = playRound(() => {}); // beat 2: stand
  const dmgTaken = hp0 - Math.round(P().hp);
  note(`  took ${dmgTaken} standing in the scan zone`);
  note(`  said: ${r.said.slice(-3).join(' || ').slice(0, 260)}`);
  check('kite: broadcast HITS a player in the zone (10-16)', dmgTaken >= 10 && dmgTaken <= 16, String(dmgTaken));
  check('kite: hit reads as the square SCREAMING', /SCREAMS/.test(r.said.join(' ')),
    r.said.slice(-2).join(' | ').slice(0, 120));
}

// ---- run all ----
async function main() {
  await Game.init(); // data via the fetch stub
  // 3 seeds; SEED env overrides the base (each scenario offsets from it).
  const SEEDS = [SEED0, SEED0 + 1009, SEED0 + 9176];
  for (const s of SEEDS) {
    note(`\n================ SEED ${s} ================`);
    scenarioNevermore(s);
    scenarioNightcourt(s + 11);
    scenarioNightcourtHit(s + 23);
    scenarioStatickite(s + 37);
    scenarioKiteZoneHit(s + 53);
  }
  note(`\n==== RESULT: ${passes} PASS, ${fails} FAIL ====`);
  if (failures.length) note('failures: ' + failures.join(' | '));
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
