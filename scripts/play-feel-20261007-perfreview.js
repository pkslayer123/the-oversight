#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07) — PERFORMANCE REVIEW (review_drone) played pass.
//
// Wave-2 monster (non-apex): a drone that grades your dodges aloud. Beam
// pattern (length 6, windup 3), diurnal. Steve's wave-2 bar: "a genuine step
// up from wave 1, not reskins at the same threat level." The established bar
// (moderator played pass, today): wave 1 (Highbeam Deer) asks "read the
// freeze, leave the lane" — positional. Wave 2 must demand something NEW.
//
// Played AS A PLAYER through a node harness:
//   ACT 1 — blind first contact: dread, the spoken 3-count, the grading
//           theater, the recalc rhythm. Codex-gate checks on the played path
//           (unknown => no lane cells on grid, "Probably decorative").
//   ACT 2 — predictive aim: same sidestep twice => the line leads you.
//   ACT 3 — crowd counterplay: "bring friends" buys exactly one turn.
//   ACT 4 — codex-known (slain) rematch: exact-line coaching + grid cells.
//   ACT 5 — the kill: honest dodge-and-strike rhythm; loot aggregates vs the
//           wave-2 loot rule.
//   Audio hooks across the whole run.
//
// HOT-TREE SAFETY: the engine is loaded from HEAD via `git show` (immune to
// worktree churn on the shared tree). This script only CREATES its own file.
// RNG is seeded (mulberry32, fixed default, SEED env override) so the proof
// is deterministic. TURN HYGIENE: after the player action, advance ONLY if
// still player's turn and the round didn't advance during the action (a
// strike's internal advance runs the monster synchronously — a second advance
// runs the monster at 2x speed). Interior tiles 1..7 only — edges are the
// flee-by-barrier. Exit code non-zero on any assertion failure.
// Run: node scripts/play-feel-20261007-perfreview.js
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
const headFile = p => execSync('git show HEAD:' + p, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(headFile(f))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL index.html order at HEAD (minus DOM-only app.js/sprites.js/tile-scenes.js/
// move-anim.js and drama.js, which needs DOM at load). All Game.drama calls are try/caught.
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convo-wants.js', 'src/js/convoTopics.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
_SCRIPTS.forEach(f => eval(headFile(f)));
delete global.window; // drop the stub: combat takes the SYNC advance path without window
const Game = globalThis.Scattering.Game;

// ---------- output / evidence ----------
const transcript = [];
const note = t => { transcript.push(t); console.log(t); };
const results = [];
const ok = (name, cond, extra) => { results.push([name, !!cond]); note(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };
const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
function drain() { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; }
function scene(t) { note('\n==== ' + t + ' ===='); }
const T = () => transcript.join('\n');

// audio hook recorder: every audioEvent(name, data) lands here
const audioSeen = [];
Game.audio = new Proxy({}, { get: (t, name) => (d) => { audioSeen.push(name + (d && d.count != null ? ':' + d.count : '')); } });
const audioHas = n => audioSeen.some(a => a === n || a.startsWith(n + ':'));

// ---------- turn helpers ----------
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const clamp17 = v => Math.min(7, Math.max(1, v));
function P() { return Game.tbFighter('p'); }
function liveMonster() { const f = Game.tbfight; if (!f) return null; return f.fighters.find(x => x.kind === 'monster' && x.alive) || null; }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function stepTo(tx, ty) {
  tx = clamp17(tx); ty = clamp17(ty);
  const p = P(); if (!p || !Game.tbIsPlayerTurn()) return false;
  const bx = p.mx, by = p.my;
  Game.tbPlayerMove(tx, ty);
  return (p.mx !== bx || p.my !== by);
}
function stepToward(m) {
  const p = P();
  return stepTo(p.mx + Math.sign(m.mx - p.mx), p.my + Math.sign(m.my - p.my));
}
// Drive up to n PLAYER turns with a policy; prints the play-by-play.
function playerTurns(n, policy, quiet) {
  let taken = 0, guard = 0;
  while (Game.tbfight && !Game.tbfight.over && taken < n && guard++ < 600) {
    const cur = Game.tbCurrent();
    if (!cur) break;
    if (cur.kind === 'player') {
      const p = P(), m = liveMonster();
      const roundBefore = Game.tbfight.round;
      if (!quiet) note(`\n-- R${roundBefore} P@(${p.mx},${p.my})[${Math.round(p.hp)}] vs ${m ? `${m.name}@(${m.mx},${m.my})[${Math.round(m.hp)}/${m.maxHp}] ph=${m.beamPhase} eff=${Game.droneEff(m)} tel=${m.telegraph ? 'T' + m.telegraph.turnsLeft : '—'}` : 'no-foe'}`);
      const thought = policy(p, m) || '';
      if (thought && !quiet) note(`   💭 ${thought}`);
      const txt = drain();
      if (txt) { transcript.push('   ' + txt); if (!quiet) console.log('   ' + trunc(txt, 460)); }
      // End the turn ONLY if the policy didn't already advance it.
      if (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn() && Game.tbfight.round === roundBefore) endTurn();
      taken++;
    } else {
      const who = cur.kind === 'monster' ? cur.name : cur.kind;
      const php = P() ? P().hp : 0;
      Game.tbAdvance();
      const txt = drain();
      const php2 = P() ? P().hp : 0;
      if (txt) {
        const tag = `   [${who} R${Game.tbfight ? Game.tbfight.round : '?'}${php2 < php ? ` HIT -${Math.round(php - php2)}` : ''}] `;
        transcript.push(tag + txt);
        if (!quiet) console.log(tag + trunc(txt, 500));
      }
    }
  }
  return taken;
}
async function freshRun() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  drain();
}
function newFight(monsterId, px, py, mx, my) {
  const s = Game.state.scholar;
  s.health = 500; s.maxHealth = 500; s.kcal = 2400; s.hydration = 100; s.hp = 100;
  s.mx = px; s.my = py;
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
  s.monster = { id: monsterId, mx, my };
  drain();
  Game.startCombat(monsterId);
  const intro = drain(); // fight-init text (first-contact dread/coaching) — keep it, don't swallow it
  if (intro) transcript.push('   [fight intro] ' + intro);
  const fighters = (Game.tbfight.fighters || []).map(f => f.kind + ':' + (f.name || f.key)).join(', ');
  note(`   fighters: ${fighters}`);
  return liveMonster();
}
function monDef(id) { return (Game.data.monsters || []).find(m => m.id === id); }
function itemTier(itemId) { const d = (Game.data.items || []).find(i => i.id === itemId); return (d && d.lootTier) || 1; }
// damage watcher: wraps tbAdvance, logs every player-HP drop with the round
function watchDamage() {
  const log = [];
  const _adv = Game.tbAdvance.bind(Game);
  Game.tbAdvance = function () {
    const b = P() ? P().hp : 0;
    const r0 = Game.tbfight ? Game.tbfight.round : 0;
    const r = _adv.apply(Game, arguments);
    if (P() && P().hp < b - 0.001) log.push({ round: Game.tbfight ? Game.tbfight.round : r0, dmg: b - P().hp });
    return r;
  };
  return { log, restore() { Game.tbAdvance = _adv; } };
}
// the instinct policy: dodge the countdown (alternating sides), strike in free windows
function makeInstinct(opts) {
  opts = opts || {};
  const st = { armed: false, dodgeSign: 1, cycles: 0, strikes: 0, dmgDealt: 0, struckOnce: false,
    firstDeclare: null, secondDeclare: null, hpLast: 0 };
  const snapDeclare = (m, tg) => {
    const snap = { known: Game.encTelegraphKnown(m), cells: (tg.cells || []).length,
      laneSize: 0, laneMatch: false, cue: '' };
    try {
      const lane = Game.tbBeamLaneCells();
      snap.laneSize = lane.size;
      const tc = new Set((tg.cells || []).map(c => c.cx + ',' + c.cy));
      snap.laneMatch = lane.size === tc.size && tc.size > 0 && [...tc].every(k => lane.has(k));
      snap.cue = Game.tbTelegraphCue(m) || '';
    } catch (e) {}
    return snap;
  };
  const policy = (p, m) => {
    if (!p || p.acted || !m || !m.alive) return '';
    st.hpLast = p.hp;
    const tg = m.telegraph;
    if (tg && tg.turnsLeft > 0 && !tg.firing) {
      if (!st.armed) { // fresh declare — snapshot the knowledge-gate state
        st.armed = true;
        const snap = snapDeclare(m, tg);
        if (!st.firstDeclare) st.firstDeclare = snap; else if (!st.secondDeclare) st.secondDeclare = snap;
      }
      const dx = p.mx - m.mx, dy = p.my - m.my;
      let nx = p.mx, ny = p.my;
      if (Math.abs(dx) >= Math.abs(dy)) ny = clamp17(p.my + (opts.fixedDodge || st.dodgeSign));
      else nx = clamp17(p.mx + (opts.fixedDodge || st.dodgeSign));
      if (nx === p.mx && ny === p.my) { // edge clamp — flip
        if (Math.abs(dx) >= Math.abs(dy)) ny = clamp17(p.my - (opts.fixedDodge || st.dodgeSign));
        else nx = clamp17(p.mx - (opts.fixedDodge || st.dodgeSign));
      }
      stepTo(nx, ny);
      return `countdown — stepping off the line to (${nx},${ny})`;
    }
    if (st.armed) { st.armed = false; st.cycles++; if (!opts.fixedDodge) st.dodgeSign *= -1; }
    const d = cheb(p.mx, p.my, m.mx, m.my);
    if (!m.telegraph && d <= 2 && (opts.strike === 'always' || (opts.strike === 'once' && !st.struckOnce))) {
      st.struckOnce = true;
      const b = m.hp; Game.tbPlayerStrike(m.key);
      st.strikes++; st.dmgDealt += Math.max(0, b - m.hp);
      return `strike window — hit for ${Math.max(0, Math.round(b - m.hp))}`;
    }
    if (!m.telegraph && d > 2) { stepToward(m); return 'closing in while it re-runs the numbers'; }
    return 'holding — watching the lens';
  };
  return { policy, st };
}

(async () => {
await Game.init();
note('== SEED ' + SEED + ' ==');
let lastFightResult = null;
const _tbEnd = Game.tbEnd.bind(Game);
Game.tbEnd = function (r) { lastFightResult = r; return _tbEnd.apply(Game, arguments); };

// ================= data sanity =================
scene('DATA — review_drone definition (HEAD)');
const rdef = monDef('review_drone');
ok('review_drone: wave 2, diurnal, beam(6, windup 3)',
  rdef && rdef.wave === 2 && rdef.activity === 'diurnal' &&
  rdef.attack.pattern.type === 'beam' && rdef.attack.pattern.length === 6 && rdef.attack.pattern.windup === 3,
  `wave=${rdef.wave} activity=${rdef.activity} pattern=${JSON.stringify(rdef.attack.pattern)}`);
ok('review_drone: FIFO encounter, crowd limit 2, pain switch, predictive-aim fiction in codex',
  rdef.encounter.fifo === true && rdef.encounter.crowdLimit === 2 && rdef.encounter.painSwitch === true &&
  /same sidestep twice/.test(rdef.codexStages.slain),
  `fifo=${rdef.encounter.fifo} crowdLimit=${rdef.encounter.crowdLimit}`);
ok('review_drone: knownCue gates on pattern-learned ("It scores your dodges")',
  rdef.encounter.knownCue === 'It scores your dodges. Unpredictable movement breaks its lock.');

// ================= ACT 1: blind first contact =================
scene('ACT 1 — BLIND FIRST CONTACT (codex unknown), played as a player');
await freshRun();
if (Game.state.village) Game.state.village.positions = {}; // 1v1 (test setup)
let m = newFight('review_drone', 2, 4, 6, 4);
ok('fight is 1v1 (test setup)', (Game.tbfight.fighters || []).filter(f => f.alive).length === 2);
ok('codex: pattern UNKNOWN on first contact', Game.encTelegraphKnown(m) === false);
ok('dread: first contact is the grading, not the beam',
  /SUBJECT DETECTED\. COMMENCING BASELINE EVALUATION/.test(T()));
ok('audio: droneHum on first contact', audioHas('droneHum'));
ok('first contact does NOT coach the counterplay (unknown)',
  !/Move OFF the line/.test(T()));

const w1 = watchDamage();
const inst1 = makeInstinct({ strike: 'once' });
playerTurns(34, inst1.policy);
w1.restore();
const st1 = inst1.st;
note(`\n   ACT 1 LEDGER: cycles~${st1.cycles} strikes=${st1.strikes} dmgDealt=${Math.round(st1.dmgDealt)} playerDmgTaken=${Math.round(w1.log.reduce((a, d) => a + d.dmg, 0))} [${w1.log.map(d => 'R' + d.round + ':' + Math.round(d.dmg)).join(', ') || 'none'}]`);
ok('the loop runs: declare -> 3-count -> fire -> recalc breath, repeatedly', st1.cycles >= 2, `cycles=${st1.cycles}`);
ok('declare names the count ("COMMENCING CORRECTIVE ACTION IN THREE")', /COMMENCING CORRECTIVE ACTION IN THREE/.test(T()));
ok('the countdown is SPOKEN one beat per turn (TWO. / ONE. + efficiency)',
  /"TWO\." DODGE EFFICIENCY/.test(T()) && /"ONE\." DODGE EFFICIENCY/.test(T()));
ok('grading aloud after every resolve (CLEAN DODGE. LOGGED.)', /CLEAN DODGE\. LOGGED\./.test(T()));
ok('efficiency moves with performance (opens 41, clean dodge -> 49, graded aloud)',
  /DODGE EFFICIENCY: 49% — CLEAN DODGE\. LOGGED\./.test(T()));
ok('recovery beat between evaluations ("RECALIBRATING METRICS")', /RECALIBRATING METRICS/.test(T()));
ok('resume beat ("RECALIBRATION COMPLETE. RESUMING EVALUATION")', /RECALIBRATION COMPLETE/.test(T()));
const badges = {};
for (const ph of ['project', 'countdown', 'correct', 'recalc']) { m.beamPhase = ph; badges[ph] = Game.encPhaseBadge(m); }
note('   phase badges (UI surface): ' + JSON.stringify(badges));
ok('phase system visible to player (distinct badge per phase)',
  badges.project === ' 📊 EVALUATING' && badges.countdown === ' ⏳ CORRECTING IN…' &&
  badges.correct === ' 🎯 CORRECTING' && badges.recalc === ' 🌀 RECALIBRATING',
  JSON.stringify(badges));
ok('KNOWLEDGE LADDER, rung 1 — first declare (blind): no lane on grid, dread-only cue',
  st1.firstDeclare && st1.firstDeclare.known === false && st1.firstDeclare.laneSize === 0 &&
  /Probably decorative\. Probably\./.test(st1.firstDeclare.cue) &&
  !/exactly where the beam fires/.test(st1.firstDeclare.cue),
  st1.firstDeclare && `lane=${st1.firstDeclare.laneSize} cue="${trunc(st1.firstDeclare.cue, 100)}"`);
ok('surviving one beam TEACHES the pattern (codex: "You won\'t forget this")',
  /Codex: Scored Assessment/.test(T()) && Game.tbPatternKnown('review_drone', 'Scored Assessment') === true);
ok('KNOWLEDGE LADDER, rung 2 — second declare (learned): the lane renders, cue names it',
  st1.secondDeclare && st1.secondDeclare.known === true && st1.secondDeclare.laneMatch === true &&
  /That projected line is exactly where the beam fires — it cannot re-aim once announced\. Step off it\./.test(st1.secondDeclare.cue),
  st1.secondDeclare && `lane=${st1.secondDeclare.laneSize} match=${st1.secondDeclare.laneMatch}`);
ok('rung 2 appends the learned tail ("You know this one...")',
  st1.secondDeclare && /You know this one: Scored Assessment/.test(st1.secondDeclare.cue),
  st1.secondDeclare && trunc(st1.secondDeclare.cue.slice(-120), 120));
note('   BACKLOG (wiring, engine off-limits): the data knownCue "It scores your dodges. Unpredictable ' +
  'movement breaks its lock." NEVER surfaces — tbBatch4Cue builds its own `learned` string (game.js ' +
  '~17500) that duplicates knownTail\'s first sentence but omits the enc.knownCue append. tbBatch4Cue ' +
  'intercepts review_drone before knownTail ever runs, so the coaching line is dead content — same ' +
  'class as the catfish dead-knownCue (worker A). Suggested: mirror knownTail\'s kc append in tbBatch4Cue\'s learned.');
// pain switch: in 1v1 the striker is already the sole subject — the line
// correctly stays silent (it fires only when the striker was NOT front)
ok('pain switch: silent in 1v1 (striker already front of queue — correct)',
  !/PAIN RESPONSE LOGGED/.test(T()) && st1.strikes === 1, `strikes=${st1.strikes}`);
// beam geometry: 6 cells at declare
ok('beam is a 6-tile line at declare', st1.firstDeclare && st1.firstDeclare.cells === 6,
  st1.firstDeclare && `cells=${st1.firstDeclare.cells}`);
// the blind player who moves when it counts dodges clean — the fairness check
ok('blind-but-moving player takes NO beam damage (the line is locked at declare)',
  w1.log.length === 0, `hits=${w1.log.length}`);
ok('audio: droneCount fires per beat', audioSeen.filter(a => a.startsWith('droneCount')).length >= 3,
  audioSeen.filter(a => a.startsWith('droneCount')).slice(0, 6).join(','));
ok('audio: droneCorrect fires on resolve', audioHas('droneCorrect'));
ok('audio: droneRecalc fires on the breather', audioHas('droneRecalc'));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= ACT 2: predictive aim =================
scene('ACT 2 — PREDICTIVE AIM: same sidestep twice, the line leads you');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
m = newFight('review_drone', 2, 4, 6, 4);
const w2 = watchDamage();
const inst2 = makeInstinct({ fixedDodge: 1, strike: 'never' }); // deliberately repeat the SAME dodge
playerTurns(40, inst2.policy);
w2.restore();
const st2 = inst2.st;
const hits2 = w2.log;
note(`\n   ACT 2 LEDGER: cycles~${st2.cycles} hits=${hits2.length} [${hits2.map(d => 'R' + d.round + ':' + Math.round(d.dmg)).join(', ') || 'none'}]`);
ok('the drone announces the adaptation ("DODGE PATTERN RECOGNIZED. ADJUSTING AIM")',
  /DODGE PATTERN RECOGNIZED\. ADJUSTING AIM/.test(T()));
ok('same sidestep twice => the led line CONNECTS (the second repeat walks into it)',
  hits2.length >= 1, `hits=${hits2.length}`);
ok('the led hit is in the 18-28 band (no cheap one-shot)',
  hits2.length > 0 && hits2.every(d => d.dmg >= 18 && d.dmg <= 28),
  hits2.length ? 'dmg=[' + hits2.map(d => Math.round(d.dmg)).join(',') + ']' : 'no hits');
note('   observed: led-line hits do NOT wipe the dodge model (the wipe sits inside ' +
  '`if (tg.threatenedPlayer)` — led hits aren\'t threatened at declare, so the stale shift ' +
  'persists and the next declare leads you again until you vary or take a threatened hit). ' +
  'Coherent with the fiction ("it learned your dodge"); the code comment over-claims.');
// now vary: the counterplay works
const w2b = watchDamage();
const inst2b = makeInstinct({ fixedDodge: -1, strike: 'never' });
playerTurns(14, inst2b.policy);
w2b.restore();
ok('varying the dodge beats the led line (clean after the switch)',
  w2b.log.length === 0 && /CLEAN DODGE\. LOGGED\./.test(T()), `hits=${w2b.log.length}`);
// the punishment path, honestly: FRESH fight, stand still on the first declare
// (no dodge model yet — the aim is your tile, threatened at declare)
scene('ACT 2b — the punishment path: stand on the line, take it');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
m = newFight('review_drone', 2, 4, 6, 4);
const w2c = watchDamage();
const effBeforeStand = 41;
playerTurns(10, (p, mm) => {
  if (!p || p.acted || !mm || !mm.alive) return '';
  return 'standing still — taking the assessment on purpose';
});
w2c.restore();
ok('standing on the line: HIT TAKEN, graded aloud, efficiency drops',
  /HIT TAKEN\. LOGGED\./.test(T()) && w2c.log.length > 0 &&
  w2c.log.every(d => d.dmg >= 18 && d.dmg <= 28) && m.dodgeEff < effBeforeStand,
  `hits=${w2c.log.length} eff ${effBeforeStand} -> ${m.dodgeEff}`);
note('   BACKLOG (design gap, engine off-limits): led-line hits — the predictive aim leading you ' +
  'when you were NOT threatened at declare — land but go UNSCORED (no "HIT TAKEN. LOGGED.", ' +
  'efficiency unchanged, stale drDodge kept). The grading fiction goes silent exactly where the ' +
  'wave-2 mechanic bites. Suggest: recompute threatenedPlayer at resolve, or grade on actual hit.');
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= ACT 3: crowd counterplay =================
scene('ACT 3 — CROWD: "bring friends — it can\'t grade a crowd"');
await freshRun();
const roster = (Game.state.village && Game.state.village.roster) || [];
note(`   roster: ${roster.slice(0, 4).join(', ')}`);
if (Game.state.village) {
  Game.state.village.positions = {};
  for (const [i, rid] of roster.slice(0, 2).entries()) {
    Game.state.village.positions[rid] = { mx: 3, my: i === 0 ? 5 : 3 }; // within 4 of the player
  }
}
m = newFight('review_drone', 2, 4, 6, 4);
const nFighters = (Game.tbfight.fighters || []).filter(f => f.alive).length;
note(`   fighters in: ${nFighters}`);
const w3 = watchDamage();
const inst3 = makeInstinct({ strike: 'once' });
// instrument the pain switch: the line must fire iff the striker wasn't already front
const painEvents = [];
const _noticesPain = Game.encNoticesPain.bind(Game);
Game.encNoticesPain = function (mm, key) {
  const q = Game.encThreatQueue(mm) || [];
  const wasFront = q[0] === key;
  const l0 = (Game.log || []).length;
  const r = _noticesPain.apply(Game, arguments);
  const fired = (Game.log || []).slice(l0).map(x => x.text || x).join(' ').includes('PAIN RESPONSE LOGGED');
  painEvents.push({ key, wasFront, fired });
  return r;
};
playerTurns(20, inst3.policy); // recalc + adapt + ~1 full beam cycle
Game.encNoticesPain = _noticesPain;
w3.restore();
const pPains = painEvents.filter(e => e.key === 'p');
ok('pain switch: "PAIN RESPONSE LOGGED" fires iff the striker was NOT already front of queue',
  pPains.length > 0 && pPains.every(e => e.fired === !e.wasFront),
  pPains.length ? pPains.map(e => `wasFront=${e.wasFront} fired=${e.fired}`).join('; ') : 'player never struck');
ok('crowd overload triggers exactly one recalc ("TOO MANY SUBJECTS")',
  /TOO MANY SUBJECTS\. EVALUATION PAUSED\. RECALIBRATING/.test(T()));
ok('...then it adapts instead of stalling ("REDUCING SCOPE. EVALUATING PRIMARY SUBJECT")',
  /REDUCING SCOPE\. EVALUATING PRIMARY SUBJECT/.test(T()));
ok('the crowd buys one breather turn, not immunity (it declares again after)',
  (inst3.st.cycles >= 1), `beam cycles after adapt=${inst3.st.cycles}`);
ok('monsters were sent to fight: the fight continues, no permanent stall',
  !!liveMonster() && liveMonster().alive);
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= ACT 4: codex-known rematch =================
scene('ACT 4 — CODEX-KNOWN REMATCH (slain): the line, named');
await freshRun();
Game.state.codex.monsters = Game.state.codex.monsters || {};
Game.state.codex.monsters['review_drone'] = { stage: 'slain' };
if (Game.state.village) Game.state.village.positions = {};
m = newFight('review_drone', 2, 4, 6, 4);
ok('pattern counts as KNOWN after a kill (codex-gated)', Game.encTelegraphKnown(m) === true);
ok('first contact now coaches the counterplay (known)',
  /It counts down THREE-TWO-ONE then fires along the projected line\. Move OFF the line\. It can\'t handle crowds/.test(T()));
const inst4 = makeInstinct({ strike: 'never' });
let lastTg4 = null; const cuesSeen4 = [];
const w4 = watchDamage();
playerTurns(14, (p, mm) => {
  if (mm && mm.telegraph && mm.telegraph !== lastTg4 && cuesSeen4.length < 2) {
    lastTg4 = mm.telegraph;
    try { cuesSeen4.push(Game.tbTelegraphCue(mm) || ''); } catch (e) { cuesSeen4.push(''); }
  }
  return inst4.policy(p, mm);
});
w4.restore();
ok('known cue names the exact line (no more "decorative")',
  cuesSeen4.length > 0 &&
  /That projected line is exactly where the beam fires — it cannot re-aim once announced\. Step off it\./.test(cuesSeen4[0]),
  trunc(cuesSeen4[0] || '', 150));
ok('known: the lane renders on the grid during windup (beamLane overlay fed)',
  inst4.st.firstDeclare && inst4.st.firstDeclare.laneMatch === true,
  inst4.st.firstDeclare && `lane=${inst4.st.firstDeclare.laneSize} match=${inst4.st.firstDeclare.laneMatch}`);
ok('known player still takes no damage when they respect the named line',
  w4.log.length === 0, `hits=${w4.log.length}`);
// two-tier gating: slain-stage grants the exact-line coaching; the "You know
// this one" tail needs a SURVIVED beam (tbPatternKnown) in this run
ok('tier 1 (slain, no beam survived yet): exact-line coaching WITHOUT the learned tail',
  cuesSeen4.length > 0 && !/You know this one/.test(cuesSeen4[0]));
ok('tier 2 (beam survived mid-fight): the learned tail appends',
  cuesSeen4.length > 1 && /You know this one: Scored Assessment/.test(cuesSeen4[1]),
  trunc((cuesSeen4[1] || '').slice(-120), 120));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= ACT 5: the kill =================
scene('ACT 5 — THE KILL: dodge the count, punish the recalc');
await freshRun();
if (Game.state.village) Game.state.village.positions = {};
m = newFight('review_drone', 2, 4, 6, 4);
const droneMaxHp = m.maxHp;
const w5 = watchDamage();
const inst5 = makeInstinct({ strike: 'always' });
playerTurns(60, inst5.policy);
w5.restore();
const st5 = inst5.st;
const droneGone = !liveMonster() || !liveMonster().alive;
const phpEnd = st5.hpLast; // P() is null after tbEnd — track HP from the last player turn
note(`\n   KILL LEDGER: result=${lastFightResult} droneDead=${droneGone} droneMaxHp=${droneMaxHp} strikes=${st5.strikes} dmgDealt=${Math.round(st5.dmgDealt)} playerHp=500->${Math.round(phpEnd)} beamHits=${w5.log.length} [${w5.log.map(d => 'R' + d.round + ':' + Math.round(d.dmg)).join(', ') || 'none'}]`);
ok('KILLABLE by playing the rhythm (dodge the count, strike the recalc)', droneGone && lastFightResult === 'won', `result=${lastFightResult}`);
ok('the trick wins, not attrition (most of the health bar intact)',
  phpEnd > 500 * 0.6, `hp 500 -> ${Math.round(phpEnd)}`);
ok('death is narrated, loot-as-action on the body (no auto-loot)',
  /falls\.|ALIEN LOOT|search the body|printed performance review/i.test(T()),
  trunc(T().slice(-400), 200));

// ================= loot aggregates (deterministic) =================
scene('LOOT — wave-2 loot rule vs the data');
const rdefA = monDef('review_drone');
let drops = 0; const tiers = new Set(); const ids = new Set();
for (let i = 0; i < 200; i++) { const id = Game.rollAlienLoot(rdefA, {}); if (id) { drops++; tiers.add(itemTier(id)); ids.add(id); } }
note(`   review_drone: ${drops}/200 drops, tiers=[${[...tiers]}], ids=[${[...ids].join(', ')}]`);
ok('loot chance LOW, not raining (~0.15)', drops >= 12 && drops <= 48, `${drops}/200`);
ok('loot tier matches the DATA (tier 2 per monsters.json)', [...tiers].every(t => t === 2), `tiers=[${[...tiers]}]`);
note('   RULE CHECK: Steve\'s wave-2 loot rule says only veteran wave-1 variants (post unlock) + the apex may drop wave-2 loot (tier 3+); base wave-1 stays tier 1-2. A regular wave-2 monster at tier 2 is CONSISTENT with that rule — the task\'s "should drop tier 3+" expectation conflicts with the rule as stated. Flagged for Steve, not changed (stats off-limits).');
const bull = monDef('bulldozer');
const bTiers = new Set();
for (let i = 0; i < 200; i++) { const id = Game.rollAlienLoot(bull, {}); if (id) bTiers.add(itemTier(id)); }
ok('wave-1 base stays tier <= 2 (bulldozer)', [...bTiers].every(t => t <= 2), `tiers=[${[...bTiers]}]`);

// ================= audio across the run =================
scene('AUDIO HOOKS across the played fights');
for (const n of ['droneHum', 'droneCount', 'droneCorrect', 'droneRecalc', 'droneBeam'])
  ok('audio hook fires: ' + n, audioHas(n),
    n === 'droneCount' ? audioSeen.filter(a => a.startsWith('droneCount')).slice(0, 4).join(',') : undefined);
note('   all audio events seen: ' + [...new Set(audioSeen)].join(', '));

// ================= verdict =================
scene('VERDICT');
const fails = results.filter(r => !r[1]);
note(`\n   assertions: ${results.length - fails.length}/${results.length} green`);
const wave2Fails = fails.filter(r => /wave-2|predictive|crowd|grading|known|loot|audio|kill/i.test(r[0]));
if (wave2Fails.length === 0) {
  note('   VERDICT: PASS — the Performance Review is a genuine step up, not a reskin.');
  note('   Wave 1 (deer) asks: read the freeze, leave the lane. The Review asks:');
  note('   read the COUNT (a spoken 3-beat windup, fairer than the deer), manage your');
  note('   HABITS (it learns your dodge — same sidestep twice and the led line takes');
  note('   you; vary it), work the RHYTHM (punish the recalc breath), and bring FRIENDS');
  note('   (the crowd buys exactly one turn, then it adapts — monsters were sent to');
  note('   fight). The grading-aloud theater lands: dread first, coaching earned.');
} else {
  note('   VERDICT: NEEDS WORK — failing:');
  for (const f of wave2Fails) note('     · ' + f[0]);
}
if (fails.length) { note('\n   FAILING ASSERTIONS:'); for (const f of fails) note('     · ' + f[0]); process.exitCode = 1; }
else note('\n   all green.');
})();
