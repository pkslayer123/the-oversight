#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07) — THE MODERATOR escalation played pass.
//
// Wave-2 apex (one apex per wave; wave-2 loot rule: only veteran wave-1
// variants + the apex may drop wave-2 loot). Steve's wave-2 bar: "a genuine
// step up from wave 1, not reskins at the same threat level."
//
// Played AS A PLAYER through a node harness:
//   ACT 1 — Highbeam Deer (gallowdeer) benchmark fight, wave-1 bar (its
//           stats are not questioned). Played with real dodge reactions.
//   ACT 2 — The Moderator, BLIND first contact: observing -> muting,
//           violation, field escape, mute flip, the 5-wait lift, compliance
//           vs defiance, shadowban, Deplatform windup, the kill.
//   ACT 3 — codex-known rematch: knownCue coaching after the pattern learned.
//   ACT 4 — deterministic aggregates: loot economy, field geometry, verdict.
//
// HOT-TREE SAFETY: the engine is loaded from HEAD via `git show` (immune to
// worktree churn on the shared tree). This script only CREATES its own file.
// RNG is seeded (mulberry32, fixed default, SEED env override) so the proof
// is deterministic; thresholds are structural, never unseeded aggregates.
// TURN HYGIENE: after the player action, advance ONLY if still player's turn
// (tbPlayerStrike/tbAfterPlayerAction already advance when the turn is
// spent). Interior tiles 1..7 only — edges are the flee-by-barrier.
// Exit code non-zero on any assertion failure.
// Run: node scripts/play-feel-20261007-moderator.js
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
const headFile = p => execSync('git show HEAD:' + p, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(headFile(f))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
// drama.js excluded: DOM at load. All Game.drama calls are try/caught.
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

// audio hook recorder: every audioEvent(name, data) lands here
const audioSeen = [];
Game.audio = new Proxy({}, { get: (t, name) => (d) => { audioSeen.push(name + (d && d.final ? ':final' : d && d.lift ? ':lift' : '')); } });

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
// Real WAIT: tbPlayerWait notes the 'wait' verb (slides the Moderator's
// attention off your habits) and advances. A bare endTurn does NOT note.
function waitPolicy(thought) {
  return (p) => {
    if (p && !p.acted && Game.tbIsPlayerTurn()) {
      Game.tbPlayerWait();
      return thought || 'WAIT — holding still, watching';
    }
    return '';
  };
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
      if (!quiet) note(`\n-- R${roundBefore} P@(${p.mx},${p.my})[${Math.round(p.hp)}] vs ${m ? `${m.name}@(${m.mx},${m.my})[${Math.round(m.hp)}/${m.maxHp}] ph=${m.beamPhase} mute=${(m.modMuted || []).join('+') || '—'} viol=${m.modViolations || 0}` : 'no-foe'} tel=${m && m.telegraph ? 'Y' : '—'}`);
      const thought = policy(p, m) || '';
      if (thought && !quiet) note(`   💭 ${thought}`);
      const txt = drain();
      // transcript keeps FULL text (assertions read it); console shows truncated
      if (txt) { transcript.push('   ' + txt); if (!quiet) console.log('   ' + trunc(txt, 420)); }
      // End the turn ONLY if the policy didn't already advance it (a strike
      // that spent the action, a violation, or tbPlayerWait all advance
      // internally — a second advance runs the monster twice).
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
        if (!quiet) console.log(tag + trunc(txt, 480));
      }
    }
  }
  return taken;
}
function fieldKeys() { const f = Game.tbfight; return f && f.terraform ? Object.keys(f.terraform) : []; }
function expectedFieldCount(mx, my, r) {
  let n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
    const nx = mx + dx, ny = my + dy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
    n++;
  }
  return n;
}
function nearestTile(pred) {
  const p = P(); let best = null, bd = 1e9;
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) {
    if (!pred(x, y)) continue;
    const d = cheb(x, y, p.mx, p.my);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}
const inField = (m, x, y) => !!(m && m.modFieldSet && m.modFieldSet.has(x + ',' + y));

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
  drain();
  const fighters = (Game.tbfight.fighters || []).map(f => f.kind + ':' + (f.name || f.key)).join(', ');
  note(`   fighters: ${fighters}`);
  return liveMonster();
}
function modDef(id) { return (Game.data.monsters || []).find(m => m.id === id); }
function itemTier(itemId) { const d = (Game.data.items || []).find(i => i.id === itemId); return (d && d.lootTier) || 1; }

(async () => {
await Game.init();
note('== SEED ' + SEED + ' ==');
// capture fight end results (tbEnd nulls tbfight on cleanup)
let lastFightResult = null;
const _tbEnd = Game.tbEnd.bind(Game);
Game.tbEnd = function (r) { lastFightResult = r; return _tbEnd.apply(Game, arguments); };

// ================= ACT 1: wave-1 benchmark — Highbeam Deer =================
scene('ACT 1 — WAVE-1 BENCHMARK: Highbeam Deer (gallowdeer), played as a player');
await freshRun();
let deer = newFight('gallowdeer', 2, 4, 6, 4);
const deerMetrics = { telegraphs: new Set(), hitsTaken: 0, dmgTaken: 0, strikes: 0, dmgDealt: 0, rounds: 0, beamTicks: 0 };
function deerPolicy(p, m) {
  deerMetrics.rounds++;
  if (!p.acted && m) {
    const tel = m.telegraph;
    const cue = String(Game.tbTelegraphCue(m) || '');
    if (cue) deerMetrics.telegraphs.add(trunc(cue, 90));
    if (tel && !tel.firing) {
      const ny = clamp17(p.my + (p.my <= 4 ? 2 : -2));
      stepTo(p.mx, ny);
      return `it FROZE — sidestepping out of the lane (windup cue: "${trunc(cue, 70)}")`;
    }
    if (tel && tel.firing) {
      deerMetrics.beamTicks++;
      const ny = clamp17(p.my + (p.my <= 4 ? 3 : -3));
      stepTo(p.mx, ny);
      return 'beam is LIVE — FULL 3-tile sidestep, make it chase';
    }
    const d = cheb(p.mx, p.my, m.mx, m.my);
    if (d <= 2) {
      const before = m.hp;
      Game.tbPlayerStrike(m.key);
      deerMetrics.strikes++;
      deerMetrics.dmgDealt += Math.max(0, before - m.hp);
      return 'in spear range — strike';
    }
    stepToward(m);
    return 'closing in while it grazes';
  }
  return '';
}
// wrap monster advances to count damage taken
const _tbAdvance = Game.tbAdvance.bind(Game);
let lastPhp = 0;
Game.tbAdvance = function () { lastPhp = P() ? P().hp : 0; const r = _tbAdvance.apply(Game, arguments); if (P() && P().hp < lastPhp) { deerMetrics.hitsTaken++; deerMetrics.dmgTaken += (lastPhp - P().hp); } return r; };
playerTurns(40, deerPolicy);
Game.tbAdvance = _tbAdvance;
const deerDead = !liveMonster();
const deerEnd = lastFightResult || 'no-result';
note(`   deer end: result=${deerEnd} fled=${!!deer.fled} alive=${!!deer.alive}`);
note(`\n   DEER LEDGER: dead=${deerDead} rounds~${deerMetrics.rounds} strikes=${deerMetrics.strikes} dmgDealt=${Math.round(deerMetrics.dmgDealt)} hitsTaken=${deerMetrics.hitsTaken} dmgTaken=${Math.round(deerMetrics.dmgTaken)} beamFireTicksSeen=${deerMetrics.beamTicks}`);
note('   telegraphs seen:');
for (const t of deerMetrics.telegraphs) note('     · ' + t);
ok('deer: fight resolves (no softlock) against a reacting player', ['won', 'lost', 'fled'].includes(deerEnd), `result=${deerEnd}`);
if (deerEnd === 'lost') note('   (obs: the benchmark deer KILLED a 500-HP player who dodged every round — the dwell multiplier (2.5-3.5x) is fearsome. Feel data for the wave-1 bar.)');
ok('deer: freeze telegraph is distinct and readable', [...deerMetrics.telegraphs].some(t => /freez|aiming/i.test(t)));
ok('deer: the wave-1 answer is positional (beam dodge possible — damage taken finite, fight winnable)', deerMetrics.dmgTaken < 500);

// ================= ACT 2: THE MODERATOR, blind first contact =================
scene('ACT 2 — THE MODERATOR, blind first contact (wave-2 apex)');
await freshRun();
const mdef0 = modDef('moderator');
ok('moderator mdef: wave 2, apex, tier-4 loot slot (one apex per wave)',
  mdef0 && mdef0.wave === 2 && mdef0.apex === true && mdef0.loot && mdef0.loot.tier === 4 && mdef0.loot.chance <= 0.3,
  `wave=${mdef0.wave} apex=${mdef0.apex} loot=${JSON.stringify(mdef0.loot)}`);
let mod = newFight('moderator', 2, 4, 6, 4);
// 1v1: keep villagers out of this test fight (test setup, not engine)
if (Game.state.village) Game.state.village.positions = {};
ok('fight is 1v1 (test setup)', (Game.tbfight.fighters || []).filter(f => f.alive).length === 2);

// notice recorder: every muting/shadowban declare, labelled by defiance
const notices = [];
let expectDefiant = false;
const seenTel = new Set();
const dropLog = [];
const _adv2 = Game.tbAdvance.bind(Game);
let _php = 0;
Game.tbAdvance = function () {
  _php = P() ? P().hp : 0;
  const r0 = Game.tbfight ? Game.tbfight.round : 0;
  const r = _adv2.apply(Game, arguments);
  const m = liveMonster();
  if (P() && P().hp < _php - 0.001) dropLog.push({ round: Game.tbfight ? Game.tbfight.round : r0, dmg: _php - P().hp });
  if (m && m.telegraph && !seenTel.has(m.telegraph)) {
    seenTel.add(m.telegraph);
    if ((m.beamPhase === 'muting' || m.beamPhase === 'shadowban') && m.telegraph.dmg) {
      notices.push({ phase: m.beamPhase, dmg: m.telegraph.dmg.slice(), defiant: expectDefiant,
        turnsLeft: m.telegraph.turnsLeft, declRound: Game.tbfight ? Game.tbfight.round : r0,
        cue: trunc(String(Game.tbTelegraphCue(m) || ''), 140) });
    }
    expectDefiant = false;
  }
  return r;
};
const T = () => transcript.join('\n');

// ---- ACT 2a: observing ----
scene('ACT 2a — observing: CONTENT UNDER REVIEW');
playerTurns(4, (p, m) => {
  if (!p.acted && m) {
    const d = cheb(p.mx, p.my, m.mx, m.my);
    if (d > 2) { stepToward(m); return "closing in — it's drawing a purple circle on the dirt, reading everything I've ever done"; }
    if (Game.tbfight.round <= 3) { const b = m.hp; Game.tbPlayerStrike(m.key); return `strike for ${Math.max(0, Math.round(b - m.hp))} — its taps are weak, it's still reviewing me`; }
    return 'wait — watching what it does next';
  }
  return '';
});
mod = liveMonster();
ok('moderator: fight opens in OBSERVING (CONTENT UNDER REVIEW)', T().includes('CONTENT UNDER REVIEW'));
const obsDrops = dropLog.filter(d => d.round <= 3);
// NOTE: declare cue text is intentionally grid-only (sayTelegraphOnce: "The visual
// telegraph on the grid is the warning") — the log carries phase/coaching, not the cue.
ok('moderator: observing chips are weak ranging taps (6-10, unavoidable)',
  obsDrops.length > 0 && obsDrops.every(d => d.dmg >= 6 && d.dmg <= 10),
  'dmg=[' + obsDrops.map(d => Math.round(d.dmg)).join(',') + ']');
ok('moderator: muting phase engages (round 4+)', mod && mod.beamPhase === 'muting', 'phase=' + (mod && mod.beamPhase));

// ---- ACT 2b: the mute ----
scene('ACT 2b — muting: it mutes what I lean on');
playerTurns(3, (p, m) => {
  if (!p.acted && m) {
    const d = cheb(p.mx, p.my, m.mx, m.my);
    if (d > 2) { stepToward(m); return 'closing'; }
    Game.tbPlayerStrike(m.key);
    return 'strike — feeding the algorithm my favorite verb';
  }
  return '';
});
mod = liveMonster();
ok('moderator: most-used verb gets MUTED (strike-spam -> STRIKE muted)', (mod.modMuted || []).includes('strike'), 'muted=' + (mod.modMuted || []).join('+'));
ok('moderator: mute announcement uses KNOWN coaching (pattern learned on first Notice — codex-gated, working as designed)',
  /It mutes what you lean on/.test(T()) && /vary your verbs/.test(T()));
if (!/REMOVED FOR VIOLATING COMMUNITY STANDARDS/.test(T()))
  note('   (obs: the UNKNOWN mute text never fires in normal play — the first Notice resolves before muting starts, so the pattern is always learned. Dead content? flagged for Steve.)');
const mutingKeys = fieldKeys().length;
ok('moderator: suppression field is grid-visible (radius-2 tiles projected)',
  mutingKeys === expectedFieldCount(mod.mx, mod.my, 2) && mutingKeys > 0, `${mutingKeys} tiles`);
ok('moderator: player starts INSIDE the field (the trap is set)', inField(mod, P().mx, P().my));

// ---- ACT 2c: the violation ----
scene('ACT 2c — the violation: swing muted inside the purple');
const v0 = mod.modViolations || 0;
playerTurns(1, (p, m) => {
  if (!p.acted && m) {
    Game.tbPlayerStrike(m.key); expectDefiant = true;
    return 'DELIBERATE: striking with STRIKE muted, inside the field';
  }
  return '';
});
mod = liveMonster();
ok('moderator: muted verb inside field = VIOLATION (turn spent, flagged)', (mod.modViolations || 0) === v0 + 1, `violations ${v0} -> ${mod.modViolations}`);
ok('moderator: violation text coaches the REAL escape', /IS MUTED inside the suppression field/.test(T()) && /PRIOR VIOLATIONS/.test(T()));
ok('moderator: violation bonus = +3 per violation', Game.modStrikeBonus(mod) === (mod.modViolations || 0) * 3, `bonus=${Game.modStrikeBonus(mod)}`);

// ---- ACT 2d: the field escape ----
scene('ACT 2d — the escape: step OUT of the purple');
const vBeforeEscape = mod.modViolations || 0;
const tBeforeEscape = transcript.length;
playerTurns(2, (p, m) => {
  if (!p.acted && m) {
    if (inField(m, p.mx, p.my)) {
      const t = nearestTile((x, y) => !inField(m, x, y));
      stepTo(t[0], t[1]);
      return `stepping OUT of the purple to (${t[0]},${t[1]}) — the mute only holds inside`;
    }
    Game.tbPlayerStrike(m.key);
    return 'striking from OUTSIDE the field with STRIKE muted — the attempt itself is legal out here';
  }
  return '';
});
mod = liveMonster();
const escapeSlice = transcript.slice(tBeforeEscape).join('\n');
ok('moderator: outside the field, the muted verb is NOT a violation (the mute only holds inside)',
  (mod.modViolations || 0) === vBeforeEscape && !/flagged as a violation/.test(escapeSlice),
  `violations stayed ${vBeforeEscape}`);
if (/can.t reach/.test(escapeSlice))
  note('   (obs: from outside the field a spear cannot REACH the moderator (field r=2 == spear range 2) — "step out" unblocks the verb but melee must re-enter and play the flip/lift game; ranged weapons convert it to damage. Geometry, not a bug.)');

// ---- ACT 2e: flip the mute ----
scene('ACT 2e — flipping the mute: flood the window with MOVE');
playerTurns(5, (p, m) => {
  if (!p.acted && m) {
    const ny = p.my === 4 ? 5 : 4;
    stepTo(3, ny);
    return 'MOVE — flooding the 5-verb window so the mute chases the wrong one';
  }
  return '';
});
mod = liveMonster();
ok('moderator: mute CHASES the most-used verb (now MOVE)', (mod.modMuted || []).join(',') === 'move', 'muted=' + (mod.modMuted || []).join('+'));
scene('ACT 2e2 — the trap: MOVE muted, inside the field');
const v1 = mod.modViolations || 0;
playerTurns(2, (p, m) => {
  if (!p.acted && m) {
    if (!inField(m, p.mx, p.my)) {
      const t = nearestTile((x, y) => inField(m, x, y) && cheb(x, y, p.mx, p.my) >= 1);
      stepTo(t[0], t[1]);
      return 'stepping INTO the field with MOVE muted — the entry itself is legal';
    }
    stepTo(p.mx + 1, p.my);
    expectDefiant = true;
    return 'trying to walk out with MOVE muted…';
  }
  return '';
});
mod = liveMonster();
ok('moderator: MOVE-mute trap — walking out IS the violation (coached, not lied about)',
  (mod.modViolations || 0) === v1 + 1 && /cannot walk out while MOVE is muted/i.test(T()),
  `violations ${v1} -> ${mod.modViolations}`);

// ---- ACT 2f: the lift ----
scene('ACT 2f — the lift: five quiet rounds');
playerTurns(5, waitPolicy('WAIT — going quiet. Silence is a verb the algorithm cannot moderate'));
mod = liveMonster();
ok('moderator: 5 quiet rounds LIFT the mute (it loses the thread)', (mod.modMuted || []).length === 0, 'muted=' + (mod.modMuted || []).join('+'));
ok('moderator: the lift is announced plainly (no lie)', /lost the thread/i.test(T()));

// ---- ACT 2g: compliance vs defiance ----
scene('ACT 2g — compliance vs defiance: obey the mute, then break it');
// pin HP in the muting band (disclosed): the lift left it low enough that
// stray strikes would shadowban early and wreck the comparison
mod.hp = Math.floor(mod.maxHp * 0.8);
if (P()) P().hp = 500;
note(`   (pinning Moderator HP at 80% to hold the muting phase; topping fighter to 500 — disclosed test setup)`);
playerTurns(1, (p, m) => { // one strike re-mutes (window is all-quiet after the lift)
  if (!p.acted && m) {
    const d = cheb(p.mx, p.my, m.mx, m.my);
    if (d > 2) { stepToward(m); return 'closing'; }
    Game.tbPlayerStrike(m.key); return 'one strike — re-teaching it my habit';
  }
  return '';
});
mod = liveMonster();
ok('moderator: a single strike re-mutes after the lift (the algorithm re-learns fast)',
  (mod.modMuted || []).includes('strike'), 'muted=' + (mod.modMuted || []).join('+'));
playerTurns(1, (p, m) => {
  if (!p.acted && m && !inField(m, p.mx, p.my)) {
    const t = nearestTile((x, y) => inField(m, x, y));
    stepTo(t[0], t[1]); return 'stepping inside to take the Notice on its terms';
  }
  return 'holding inside the field — compliant, hands still';
});
notices.length = 0;
playerTurns(1, waitPolicy('WAIT — obeying the mute, letting the Notice come'));
playerTurns(1, (p, m) => {
  if (!p.acted && m) {
    const v0 = m.modViolations || 0;
    const n0 = notices.length;
    expectDefiant = true; // set BEFORE: the strike's internal advance runs the monster turn synchronously
    Game.tbPlayerStrike(m.key);
    if ((m.modViolations || 0) === v0) {
      // not actually blocked — repair any mislabeled declare from this turn
      expectDefiant = false;
      for (let i = n0; i < notices.length; i++) notices[i].defiant = false;
      return 'strike (not blocked — no violation this time)';
    }
    return 'VIOLATION on purpose — defying the mute to feel the difference';
  }
  return '';
});
playerTurns(2, waitPolicy('WAIT — the defiant verdict is already written'));
const comp = notices.find(n => n.phase === 'muting' && !n.defiant);
const defi = notices.find(n => n.phase === 'muting' && n.defiant);
ok('moderator: compliance GRAZES the Notice (8-12 band)', !!comp, comp && `declared ${comp.dmg}`);
ok('moderator: defiance voids the graze AND stacks +3/violation', !!comp && !!defi && defi.dmg[0] > comp.dmg[1],
  comp && defi && `compliant ${comp.dmg} vs defiant ${defi.dmg}`);
ok('moderator: the wave-1 answer (dodge the telegraph) FAILS here — Notices are unavoidable direct',
  /no dodging it|won't dodge/i.test(T()));

// ---- ACT 2h: shadowban ----
scene('ACT 2h — SHADOWBAN: the field widens, the ground rejects you');
if (P()) P().hp = 500;
note('   (topped the fighter to 500 — the shadowban watch eats Deplatforms — disclosed)');
playerTurns(5, waitPolicy('WAIT — clearing the thread before the storm'));
mod = liveMonster();
const mutKeys = fieldKeys().length;
const vBeforeShadow = mod.modViolations || 0;
playerTurns(1, (p, m) => {
  if (m && !p.acted) { m.hp = Math.floor(m.maxHp * 0.45); return `(wounding the Moderator to 45% to force the shadowban — disclosed test shortcut)`; }
  return '';
});
mod = liveMonster();
ok('moderator: SHADOWBAN at half HP (phase 3 of 3)', mod && mod.beamPhase === 'shadowban', 'phase=' + (mod && mod.beamPhase));
const shKeys = fieldKeys().length;
ok('moderator: field widens radius 2 -> 3 in shadowban',
  shKeys === expectedFieldCount(mod.mx, mod.my, 3) && shKeys > expectedFieldCount(mod.mx, mod.my, 2),
  `${mutKeys} -> ${shKeys} tiles`);
ok('moderator: SHADOWBAN announced with its own text + badge', /SHADOWBAN/.test(T()));
// feel the rejecting ground (2 HP — disclosed)
playerTurns(1, (p, m) => {
  if (!p.acted && m) {
    let best = null, bd = 1e9;
    for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) {
      const d = cheb(x, y, p.mx, p.my);
      if (d < 1 || d > 2) continue;
      if (!inField(m, x, y)) continue;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) { const b = p.hp; stepTo(best[0], best[1]); return `stepping onto the black field — it rejects me for ${Math.round(b - p.hp)}`; }
  }
  return 'wait';
});
ok('moderator: shadowed ground rejects entry (the black field is the tell)', /shadowbanned ground rejects/i.test(T()));
// Deplatform: wait for the RISES declare, then the fall
notices.length = 0; dropLog.length = 0;
playerTurns(8, (p, m) => {
  if (m && m.telegraph && /rises/i.test(String(Game.tbTelegraphCue(m) || ''))) return 'the hammer is RISING — it falls next round. This is the windup. Watching.';
  if (p && !p.acted && Game.tbIsPlayerTurn()) { Game.tbPlayerWait(); return 'WAIT — holding still, compliant, watching the hammer'; }
  return '';
});
const deplat = notices.find(n => n.phase === 'shadowban');
ok('moderator: DEPLATFORM has a full-round windup (hammer RISES before it falls)',
  !!deplat && /rises/i.test(deplat.cue) && deplat.turnsLeft === 2, deplat && `windup=${deplat.turnsLeft} cue="${deplat.cue.slice(0, 60)}"`);
const fall = deplat && dropLog.find(d => d.round > deplat.declRound);
const vNow = (mod && mod.modViolations) || 0;
ok('moderator: the fall lands a round AFTER the rise (a real tell, not a gotcha)', !!fall, fall && `declared R${deplat.declRound}, landed R${fall.round} for ${Math.round(fall.dmg)}`);
ok('moderator: compliant Deplatform in the 14-18+bonus band (hardest single hit, survivable when obeyed)',
  !!fall && fall.dmg >= 14 + vNow * 3 && fall.dmg <= 18 + vNow * 3 + 1, fall && `${Math.round(fall.dmg)} (viol=${vNow})`);

// ---- ACT 2i: the kill ----
scene('ACT 2i — the kill: does the trick win, or is it attrition?');
if (P()) { P().hp = 500; note('   (topped the fighter to 500 to isolate the kill — disclosed)'); }
const phpAtKillStart = P() ? P().hp : 0;
let killMoves = 0, killEndHp = 0;
playerTurns(40, (p, m) => {
  if (!p || !m) return '';
  if (p.acted) return '';
  killEndHp = p.hp;
  const d = cheb(p.mx, p.my, m.mx, m.my);
  const muted = m.modMuted || [];
  // 1. strike is free and in range → STRIKE (the mute only bites next turn)
  if (!muted.includes('strike') && d <= 2) {
    killMoves = 0;
    const b = m.hp; Game.tbPlayerStrike(m.key);
    return `strike for ${Math.max(0, Math.round(b - m.hp))}`;
  }
  // 2. strike muted → committed flip: 5 moves (closing while we do it)
  if (muted.includes('strike')) {
    killMoves++;
    const nx = clamp17(p.mx + Math.sign(m.mx - p.mx));
    const ny = clamp17(p.my + Math.sign(m.my - p.my));
    if ((nx !== p.mx || ny !== p.my) && stepTo(nx, ny)) return `flip ${killMoves}/5 — closing while unmuting strike`;
    const ly = p.my === 4 ? 5 : 4;
    if (stepTo(p.mx, ly)) return `flip ${killMoves}/5 — lateral, unmuting strike`;
    Game.tbPlayerWait(); return `flip ${killMoves}/5 — waiting`;
  }
  // 3. strike free but out of range → close in if legal, else wait for the thread to loosen
  if (d > 2) {
    if (!muted.includes('move')) { stepToward(m); return 'closing for the kill'; }
    Game.tbPlayerWait(); return 'move muted, out of range — waiting for the thread to loosen';
  }
  return '';
});
mod = liveMonster();
const modGone = !mod || !mod.alive;
const killResult = lastFightResult;
ok('moderator: KILLABLE via the trick (verb-flip + discipline, not stat-check)',
  modGone && killResult === 'won', `result=${killResult}`);
ok('moderator: death is narrated, alien loot granted as loot-as-action (search the body)',
  /falls\.|ALIEN LOOT/.test(T()),
  'machine: no meat, but the kill is narrated and the System leaves its gift on the body');
ok('moderator: the kill did not cost the whole health bar (trick > attrition)',
  killEndHp > phpAtKillStart * 0.4, `hp ${Math.round(phpAtKillStart)} -> ${Math.round(killEndHp)}`);
Game.tbAdvance = _adv2; // restore

// ================= ACT 3: codex-known rematch =================
scene('ACT 3 — codex-known rematch: knownCue coaching after the pattern learned');
await freshRun();
Game.state.codex.monsters = Game.state.codex.monsters || {};
Game.state.codex.monsters['moderator'] = { stage: 'slain' };
if (Game.state.village) Game.state.village.positions = {};
let mod2 = newFight('moderator', 2, 4, 6, 4);
ok('moderator: pattern counts as KNOWN after a kill (codex-gated)', Game.encTelegraphKnown(mod2) === true);
playerTurns(5, (p, m) => {
  if (!p.acted && m) {
    const d = cheb(p.mx, p.my, m.mx, m.my);
    if (d > 2) { stepToward(m); return 'closing'; }
    Game.tbPlayerStrike(m.key); return 'strike';
  }
  return '';
});
ok('moderator: knownCue coaches the counterplay (not just louder text)',
  /It mutes what you lean on/.test(T()) && /vary your verbs/.test(T()));
ok('moderator: known Notice cue names the graze economy', /GRAZE/.test(T()));
try { Game.tbEnd('fled'); } catch (e) {}
drain();

// ================= ACT 4: deterministic aggregates =================
scene('ACT 4 — deterministic aggregates: loot economy');
const mdefApex = modDef('moderator');
let mDrops = 0; const mTiers = new Set();
for (let i = 0; i < 200; i++) { const id = Game.rollAlienLoot(mdefApex, {}); if (id) { mDrops++; mTiers.add(itemTier(id)); } }
ok('apex loot: LOW chance, not raining (~0.2)', mDrops >= 15 && mDrops <= 65, `${mDrops}/200`);
ok('apex loot: tier 4 when it drops (the apex slot)', mDrops > 0 && [...mTiers].every(t => t === 4), `tiers=[${[...mTiers]}]`);
const bull = modDef('bulldozer');
let bTiers = new Set(), bDrops = 0;
for (let i = 0; i < 200; i++) { const id = Game.rollAlienLoot(bull, {}); if (id) { bDrops++; bTiers.add(itemTier(id)); } }
ok('wave-1 base loot capped at tier 2 (bulldozer)', [...bTiers].every(t => t <= 2), `tiers=[${[...bTiers]}] drops=${bDrops}`);
const _uw = Game.unlockedWave;
Game.unlockedWave = () => 2; // wave-2 unlocked
const vetTiers = new Set(); let vetDrops = 0;
for (let i = 0; i < 200; i++) { const id = Game.rollAlienLoot(bull, { veteranVariant: 'scarred' }); if (id) { vetDrops++; vetTiers.add(itemTier(id)); } }
Game.unlockedWave = _uw;
ok('veteran wave-1 (post wave-2 unlock): tier <= 3, never 4', vetDrops > 0 && [...vetTiers].every(t => t <= 3), `tiers=[${[...vetTiers]}] drops=${vetDrops}`);
ok('wave-2 loot rule holds: only apex + veterans touch wave-2 tiers', [...mTiers].every(t => t === 4) && [...bTiers].every(t => t <= 2));

// ---- audio ----
scene('audio hooks across the played fights');
const audioHas = n => audioSeen.some(a => a === n || a.startsWith(n + ':'));
for (const n of ['modNotice', 'modNoted', 'modMute', 'modViolation', 'modRemoval', 'modShadow', 'modDown'])
  ok('audio hook fires: ' + n, audioHas(n), audioSeen.filter(a => a.startsWith(n)).join(',') || '—');
note('   all audio events seen: ' + [...new Set(audioSeen)].join(', '));

// ================= verdict =================
scene('VERDICT');
const fails = results.filter(r => !r[1]);
const modFails = fails.filter(r => /moderator|apex|veteran|audio/.test(r[0]));
note(`\n   assertions: ${results.length - fails.length}/${results.length} green`);
if (modFails.length === 0) {
  note('   VERDICT: PASS — the Moderator is a different LEAGUE, not a reskin.');
  note('   Wave 1 (deer) asks: read the freeze, leave the lane. Wave 2 (Moderator) asks:');
  note('   manage your own habits (the mute), manage space (the field), manage obedience');
  note('   (compliance grazes, defiance stacks), and respect a new phase economy (shadowban');
  note('   widens the field, rejects the ground, and telegraphs its hardest hit a full round');
  note('   out. New verbs, new demands — the wave-1 answer (dodge the telegraph) fails by design.');
} else {
  note('   VERDICT: NEEDS WORK — failing:');
  for (const f of modFails) note('     · ' + f[0]);
}
if (fails.length) { note('\n   FAILING ASSERTIONS:'); for (const f of fails) note('     · ' + f[0]); process.exitCode = 1; }
else note('\n   all green.');
})();
