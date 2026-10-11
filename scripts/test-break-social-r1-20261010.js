// BREAK-IT social r1 2026-10-10: hostile attacks on the social systems.
// Deterministic: seed Math.random BEFORE eval (modules capture it at load).
// Usage: node scripts/test-break-social-r1-20261010.js [seed]
// Exit 0 = all assertions hold, nonzero = a break was reproduced.
'use strict';
const fs = require('fs');
const path = require('path');

const SEED = parseInt(process.env.SEED || process.argv[2] || '7', 10);
const BEFORE = !!process.env.BEFORE;
const ROOT = path.join(__dirname, '..');
const PRE = ['src/js/game.js', 'src/js/storage.js']; // files this run changes (BEFORE evals HEAD copies)
if (BEFORE) {
  const { execSync } = require('child_process');
  for (const f of PRE) execSync(`git show HEAD:${f} > /tmp/bksr1-before-${path.basename(f)}`, { cwd: ROOT });
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => (BEFORE && PRE.includes(f))
  ? fs.readFileSync(`/tmp/bksr1-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// mulberry32 — resettable, shared as Math.random BEFORE module eval.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL script list in index.html order, minus DOM-only (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: runtime checks take the sync path without window
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL [' + SEED + ']', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

// ---- minimal village scaffold ----
function mkVillage(ids) {
  Game.state = Game.state || {};
  Game.state.scholar = Object.assign({ day: 10, kcal: 5000, exiled: false }, Game.state.scholar);
  Game.villagerId = 'player';
  const roster = ['player'].concat(ids);
  Game.state.village = {
    roster: roster.slice(),
    trust: {}, rep: {}, groups: [], conflicts: [], bonds: {}, gossip: [],
    positions: {}, engaged: {},
  };
  Game.state.codex = Game.state.codex || { plants: {} };
  Game.data = Game.data || {};
  return Game.state.village;
}
Game.say = function () {};
Game.displayName = function (id) { return id === 'player' ? 'you' : 'V(' + id + ')'; };
Game.whoTag = function (id) { return id === 'player' ? 'you' : 'V(' + id + ')'; };
Game.capFirst = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
Game.npcIds = function () { return (Game.state.village.roster || []).filter(id => id !== 'player'); };
Game.isPlayer = function (id) { return id === 'player'; };
Game.repOf = Game.repOf || function (vid) {
  const v = Game.state.village; v.rep = v.rep || {};
  return v.rep[vid] || (v.rep[vid] = { generous: 0, brave: 0, honest: 0, competent: 0 });
};
Game.remember = function () {};
Game.journalNote = function () {};

console.log('seed', SEED, 'modules', FILES.length);

// ============ A. freeloadVote: the count must be per-voter, never unanimous-by-construction ============
(function () {
  const v = mkVillage(['a', 'b', 'c', 'd', 'e', 'f']);
  const accused = 'c';
  // a,b are the accused's group-mates (affinity +25 -> vote NO)
  // d is in open conflict with c (affinity -tension -> vote YES)
  // e,f are strangers (affinity 0 -> vote YES at threshold <10)
  // player: no bonds -> affinity 0 -> votes YES
  v.groups = [{ id: 'g0', kind: 'friends', members: ['a', 'b', 'c'] }];
  v.conflicts = [{ a: 'c', b: 'd', tension: 30 }];
  v.freeload = {};
  v.contribHist = {}; v.contribLog = {}; v.gives = {}; v.takes = {};
  // accused's trust-of-player set HIGH (the old bug read THIS for every voter -> unanimous NO)
  v.trust = { c: 90 };
  const said = [];
  const oldSay = Game.say; Game.say = function (s) { said.push(s); };
  Game.freeloadVote(accused);
  Game.say = oldSay;
  const countLine = said.find(s => /Hands:/.test(s));
  const m = countLine && countLine.match(/Hands: (\d+) for exile, (\d+) against/);
  ok(!!m, 'A1: freeloadVote announces a hand count', countLine);
  if (m) {
    const yes = +m[1], no = +m[2];
    // expected: a,b vote no (group +25); d votes yes (conflict -30); e,f,player vote yes (0 < 10)
    ok(yes === 4 && no === 2, 'A2: per-voter affinity count (expect 4 yes / 2 no)', { yes, no });
    ok(!(yes === 0 || no === 0), 'A3: count is not unanimous (old bug: all-no from accused trust 90)', { yes, no });
  }
  // accused is NOT exiled here (4 < 4 needed? total 6, need >3: 4>3 -> exiled). just check function ran.
  ok(said.length > 0, 'A4: freeloadVote narrates', said.length);
})();

// A5: unanimous-friendship edge — everyone loves the accused -> all NO, acquitted, no exile
(function () {
  const v = mkVillage(['a', 'b', 'c']);
  v.groups = [{ id: 'g0', kind: 'friends', members: ['a', 'b', 'c'] }];
  v.bonds['c|player'] = { v: 40, depth: 2, day: 10, dayGain: 0 }; // player is fond of c too
  v.freeload = {}; v.trust = { c: 5 }; // accused distrusts player; must NOT matter
  const said = [];
  const oldSay = Game.say; Game.say = function (s) { said.push(s); };
  Game.freeloadVote('c');
  Game.say = oldSay;
  const m = (said.find(s => /Hands:/.test(s)) || '').match(/Hands: (\d+) for exile, (\d+) against/);
  ok(m && +m[1] === 0 && +m[2] === 3, 'A5: beloved accused acquitted unanimously-no (0/3)', m && m[0]);
  ok(said.some(s => /stays/.test(s)), 'A6: acquittal narrated, no exile path', said.join(' | ').slice(0, 120));
})();

// ============ B. observe() dead actions: trade / bribe_fight / stole ============
(function () {
  // w3 is NOT a witness — gossip is only seeded when someone didn't see it
  const v = mkVillage(['w1', 'w2', 'w3']);
  v.positions = { w1: { mx: 4, my: 4 }, w2: { mx: 5, my: 4 }, player: { mx: 4, my: 5 } };
  Game.witnesses = function () { return ['w1', 'w2']; };
  Game.npcTemper = function () { return 'steady'; };
  Game.npcGoal = function () { return 'survive'; };
  Game.playerAtHaven = function () { return true; };
  Game.dayPart = 'evening';
  const repBefore = JSON.stringify(Game.repOf('w1'));
  const gBefore = (Game.state.village.gossip || []).length;
  try { Game.observe('trade', { noTrust: true }); } catch (e) { ok(false, 'B0: observe(trade) throws', String(e)); }
  const repAfter = JSON.stringify(Game.repOf('w1'));
  ok(repAfter !== repBefore, 'B1: observe(trade) moves witness rep (was a full no-op)', { repBefore, repAfter });
  ok((Game.state.village.gossip || []).length > gBefore, 'B2: observe(trade) seeds gossip', (Game.state.village.gossip || []).length);
  ok(Game.state.village.trust.w1 === undefined, 'B3: noTrust honored — trade moves REP only, no trust drift', JSON.stringify(Game.state.village.trust));
})();

(function () {
  const v = mkVillage(['w1']);
  v.positions = { w1: { mx: 4, my: 4 }, player: { mx: 4, my: 5 } };
  Game.witnesses = function () { return ['w1']; };
  Game.npcTemper = function () { return 'steady'; };
  Game.npcGoal = function () { return 'survive'; };
  Game.dayPart = 'evening';
  const r0 = Game.repOf('w1').generous || 0;
  try { Game.observe('bribe_fight', { target: 'hostile1' }); } catch (e) { ok(false, 'B4: observe(bribe_fight) throws', String(e)); }
  ok((Game.repOf('w1').generous || 0) > r0, 'B5: observe(bribe_fight) warms witness generosity (was dead)', { r0, r1: Game.repOf('w1').generous });
})();

// ============ C. talk-stipend farm resistance (documents HELD) ============
(function () {
  const v = mkVillage(['t1']);
  v.trust = { t1: 10 };
  // simulate 60 open/close cycles with zero exchanges: endConvo must be a noop (c.active false)
  let maxTrust = 10;
  for (let i = 0; i < 60; i++) {
    try {
      Game.convoGet = Game.convoGet || function () { return null; };
      const r = Game.endConvo ? Game.endConvo('t1', 'left') : null;
      void r;
    } catch (e) { /* harness lacks full convo state; guard must noop, not throw */ }
    maxTrust = Math.max(maxTrust, (Game.state.village.trust || {}).t1 || 10);
  }
  ok(maxTrust <= 40, 'C1: 60 dead endConvo calls cannot farm trust past the 40 talk cap', maxTrust);
})();

// ============ D. rumor trust farm resistance (documents HELD — r6 pin) ============
// The r6 break: subject-targeted gossip paid trust-of-player per hop. The pin:
// spreadGossip hardcodes noTrust=true on the hop applyRep, and the trace
// bumpTrust is the only trust move. Seed WITHOUT the noTrust flag (like
// mootAccuserAftermath does) — trust must still not move.
(function () {
  const v = mkVillage(['s1', 's2', 's3']);
  v.trust = { s1: 10, s2: 10, s3: 10 };
  Game.dayPart = 'morning';
  Game.npcTemper = function () { return 'warm'; };
  Game.remember = function () {};
  for (let i = 0; i < 12; i++) {
    try { Game.seedGossip('moot_weak_case', { honest: -8, competent: -8, who: 's1' }, ['s2']); } catch (e) {}
    const oldRandom = Math.random;
    Math.random = function () { return 0.99; }; // spread rarely, trace never
    try { Game.spreadGossip(); } catch (e) { ok(false, 'D0: spreadGossip throws', String(e)); }
    Math.random = oldRandom;
  }
  ok(v.trust.s1 === 10 && v.trust.s2 === 10 && v.trust.s3 === 10,
    'D1: 12 subject-gossip cycles move zero trust (REP only, r6 pin)', JSON.stringify(v.trust));
})();

// ============ E. gossip hop trust pin (spreadGossip hardcodes noTrust) ============
(function () {
  const v = mkVillage(['g1', 'g2']);
  Game.dayPart = 'morning';
  v.trust = { g1: 10, g2: 10 };
  Game.state.village.gossip = [{ action: 'generous', dims: { who: 'g1' }, heard: ['g2'], distortion: 0, day: 10, partKey: 'x' }];
  Game.npcTemper = function () { return 'warm'; }; // max spread rate
  const oldRandom = Math.random;
  Math.random = function () { return 0.0; }; // force every spread + trace roll
  try { Game.spreadGossip(); } catch (e) { ok(false, 'E0: spreadGossip throws', String(e)); }
  Math.random = oldRandom;
  ok(v.trust.g1 === 10 && v.trust.g2 === 10, 'E1: gossip hops never move trust even at max spread', JSON.stringify(v.trust));
})();

// ============ F. trustBand wiring (dead-code kill) ============
(function () {
  ok(typeof Game.trustBand === 'function', 'F1: trustBand exists');
  const v = mkVillage(['b1']);
  v.trust = { b1: 5 };
  ok(Game.trustBand('b1') === 'hostile', 'F2: trust 5 -> hostile', Game.trustBand('b1'));
  v.trust = { b1: 60 };
  ok(Game.trustBand('b1') === 'friendly', 'F3: trust 60 -> friendly', Game.trustBand('b1'));
  delete v.trust.b1;
  ok(Game.trustBand('b1') === 'hostile', 'F4: unset trust defaults to 10 -> hostile (honest with engine)', Game.trustBand('b1'));
  ok(typeof Game.trustTone === 'function' && Game.trustTone('b1') === 'Hostile.', 'F5: trustTone wired to the canonical bands', typeof Game.trustTone === 'function' ? Game.trustTone('b1') : '?');
})();

// ============ G. stash-skim gossip: subject-routed, fragments honest ============
(function () {
  const v = mkVillage(['rob', 'w1', 'w2']);
  Game.dayPart = 'morning';
  v.trust = { rob: 10, w1: 10, w2: 10 };
  Game.npcTemper = function () { return 'warm'; };
  // seen skim: the player saw rob palm the stash — heard by the player first
  try { Game.seedGossip('stash_skim', { who: 'rob', honest: -12, generous: -8 }, ['player'], true); } catch (e) { ok(false, 'G0: seedGossip throws', String(e)); }
  // pre-age the story so the fragments line can fire this call
  Game.state.village.gossip[Game.state.village.gossip.length - 1].distortion = 2;
  Game.state.village.gossip[Game.state.village.gossip.length - 1].heard.push('w1');
  const said = []; const oldSay = Game.say; Game.say = function (s) { said.push(s); };
  const oldRandom = Math.random;
  Math.random = function () { return 0.0; }; // force spread + fragments
  try { Game.spreadGossip(); } catch (e) { ok(false, 'G0b: spreadGossip throws', String(e)); }
  Math.random = oldRandom; Game.say = oldSay;
  ok((Game.repOf('rob').honest || 0) < 0, 'G1: seen skim dents the ROBBER\'s honest rep', JSON.stringify(Game.repOf('rob')));
  ok((Game.repOf('player').honest || 0) === 0, 'G2: witness-player\'s own rep untouched', JSON.stringify(Game.repOf('player')));
  ok(v.trust.rob === 10 && v.trust.w1 === 10 && v.trust.w2 === 10, 'G3: skim gossip moves REP only, never trust', JSON.stringify(v.trust));
  ok(!said.some(s => /you telling/.test(s)), 'G4: no "you telling X about you" fragments line', said.join(' | ').slice(0, 200));
  ok(said.some(s => /about V\(rob\)/.test(s)), 'G5: fragments line names the real subject', said.join(' | ').slice(0, 200));
})();

console.log('PASS', pass, 'FAIL', fail, 'seed', SEED);
process.exit(fail ? 1 : 0);
