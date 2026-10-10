#!/usr/bin/env node
// BREAK-IT social r11 (2026-10-10): moot/vote/exile machinery.
// Target 3 (social) from the break-it rotation. Recent runs (r6-r10) hardened
// trust farms, gossip->trust, promise loops; this pass attacks the moot engine:
// vote stalls, re-convening, weregild economy.
//
// S1. SOFTLOCK (fix): a moot in session (player vote pending) was RE-CONVENED
//     by playerCaseTick every day — the case stays 'open', so each endDay
//     re-ran callMoot -> conductTrial: fresh broadcast spam, tickAction(48)
//     burned per day, and the trial re-randomized under the player's feet.
//     callMoot is now idempotent (c.trial guard) and playerCaseTick skips
//     in-session cases.
// S2. SOFTLOCK (fix): the trial vote is cast via conversation choices — a
//     player who never talks to anyone (away, exiled, ignoring the fire) left
//     the case at awaitingPlayerVote FOREVER: no verdict, justice ladder
//     frozen behind playerCaseOpen. New trialVoteTick: after 2 days of
//     silence the village takes the count without them (same honesty as the
//     exiled-vote line, same 2-day convention as the confrontation timeout).
//     The player can still vote any time before it fires.
// S3. HONESTY/ECONOMY (fix): weregild stocked 3000 kcal to the pantry
//     unconditionally AND another 3000 in each payer block — every sentence
//     minted 3000-6000 kcal from thin air. One sentence, one 3000-kcal
//     payment now: the village receives exactly what the accused pays.
// S4. SIBLING SWEEP (fix): demandMoot re-ran conductTrial on an in-session
//     case (same re-fire class as S1) — engine-level guard added; the dossier
//     UI already gated it.
// HELD (no fix): gossip spreads along social lines; all social modules are
//     loaded and wired; vote buttons render for any conversation partner;
//     belief clamped +/-100; defendSpeak diminishing returns; alibi one-shot.
//
// Usage: node scripts/test-break-social-r11-20261010.js
//        BEFORE=1 node scripts/test-break-social-r11-20261010.js (pre-fix HEAD)
//        SEED=99 node scripts/test-break-social-r11-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261010', 10);

// All fixes in this pass are in betrayal.js.
const PRE = ['src/js/betrayal.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bs11-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bs11-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const seededRng = mulberry32(SEED);
Math.random = seededRng; // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
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
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(String(t)); try { return origSay.call(this, t); } catch (e) {} };

function freshGame() {
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
}
function npcIds() {
  return Game.state.village.roster.filter(id => id !== Game.villagerId);
}
// a player-accused case with a trial in session, vote pending (deterministic:
// tally the votes directly, then seat the trial by hand)
function rigPendingVoteCase() {
  const accuser = npcIds()[0];
  const c = Game.openPlayerCase(accuser, 'theft', [], false);
  const t = Game.tallyVotes(c, false);
  c.trial = {
    present: t.present, votes: t.votes, guilty: t.guilty,
    day: Game.state.scholar.day, playerVoter: true, wildDay: false,
    awaitingPlayerVote: true,
  };
  return { c, accuser };
}
function pantryKcal() { return Game.pantryKcalLive(Game.state.village); }

(async () => {
await Game.init();
Game.drama = () => {};
Game.audioEvent = () => {};
console.log(`seed=${SEED}`);

// ---------- S1. moot re-convene while the vote is pending ----------
console.log('S1. daily tick must not re-convene an in-session moot');
{
  freshGame();
  const { c } = rigPendingVoteCase();
  c.day = Game.state.scholar.day - 4; // mootIn (2-3d) has elapsed: the daily clock fires
  const trialObj = c.trial;
  const mootSaysBefore = said.filter(s => /MOOT|moot/.test(s)).length;
  Game.playerCaseTick(); // this is the daily accuser clock
  const mootSaysAfter = said.filter(s => /MOOT|moot/.test(s)).length;
  if (!BEFORE) {
    ok('trial object untouched by the daily tick', c.trial === trialObj);
    ok('no new moot announcement', mootSaysAfter === mootSaysBefore,
      `says ${mootSaysBefore} -> ${mootSaysAfter}`);
  } else {
    ok('BUG PRESENT: daily tick re-convenes the in-session moot',
      c.trial !== trialObj && mootSaysAfter > mootSaysBefore,
      `trial replaced=${c.trial !== trialObj}, moot says ${mootSaysBefore} -> ${mootSaysAfter}`);
  }
}

// ---------- S4. callMoot idempotence (sibling of S1) ----------
console.log('S4. callMoot on an in-session case is a no-op');
{
  freshGame();
  const { c, accuser } = rigPendingVoteCase();
  const trialObj = c.trial;
  const r = Game.callMoot(c.id, accuser);
  if (!BEFORE) {
    ok('second callMoot returns null', r === null, `got ${r === null ? 'null' : typeof r}`);
    ok('trial object unchanged', c.trial === trialObj);
  } else {
    ok('BUG PRESENT: callMoot re-runs conductTrial on an in-session case',
      r !== null && c.trial !== trialObj);
  }
}

// ---------- S2. the vote backstop: 2 days of silence -> count without you ----------
console.log('S2. pending vote resolves after 2 days of silence');
{
  freshGame();
  const { c } = rigPendingVoteCase();
  c.trial.day = Game.state.scholar.day - 3; // three days of silence
  if (!BEFORE) {
    ok('trialVoteTick exists', typeof Game.trialVoteTick === 'function');
    Game.trialVoteTick();
    ok('case resolved without the vote', c.status === 'resolved' || c.status === 'acquitted',
      `status=${c.status}`);
    ok('justice ladder unfrozen (no open player case)', !Game.playerCaseOpen());
    ok('honest line spoken', said.some(s => /doesn't wait forever/.test(s)));
  } else {
    ok('BUG PRESENT: no trialVoteTick — the case would sit at awaitingPlayerVote forever',
      typeof Game.trialVoteTick !== 'function');
    ok('BUG PRESENT: case still open after 3 days of silence',
      c.status === 'open' && !!(c.trial && c.trial.awaitingPlayerVote));
  }
}

// S2b. the backstop must not fire early, and a cast vote still wins the race
console.log('S2b. backstop does not fire early; a cast vote resolves first');
{
  freshGame();
  const { c } = rigPendingVoteCase();
  if (!BEFORE) {
    Game.trialVoteTick(); // same day — must be a no-op
    ok('same-day tick is a no-op', c.status === 'open' && !!c.trial.awaitingPlayerVote);
    Game.castPlayerVote(c.id, true);
    ok('cast vote resolves the case', c.status === 'resolved' || c.status === 'acquitted',
      `status=${c.status}`);
    ok('vote no longer pending', !c.trial.awaitingPlayerVote);
  } else {
    ok('skip (BEFORE)', true);
  }
}

// ---------- S3. weregild mints exactly one payment ----------
console.log('S3. weregild: one sentence, one 3000-kcal payment');
{
  // NPC accused: village gains exactly 3000
  freshGame();
  const me = Game.villagerId;
  const npc = npcIds()[0];
  const bs = Game.betrayalState();
  const c1 = {
    id: 'case_wg_npc', charge: 'theft', day: 0, accused: [npc], target: me,
    accuser: npcIds()[1] || me, belief: {}, evidence: [], bribes: [],
    exposedBribes: [], status: 'open', flipped: null, playerRole: 'bystander',
  };
  bs.cases.push(c1);
  const p0 = pantryKcal();
  Game.resolveCase('case_wg_npc', 'weregild');
  const p1 = pantryKcal();
  const gained = Math.round(p1 - p0);
  if (!BEFORE) {
    ok('NPC weregild: pantry gains exactly 3000', gained === 3000, `gained=${gained}`);
  } else {
    ok('BUG PRESENT: NPC weregild mints 6000 from thin air', gained === 6000, `gained=${gained}`);
  }

  // player accused: player pays 3000, village gains exactly 3000
  freshGame();
  const accuser = npcIds()[0];
  Game.state.scholar.kcal = 10000;
  const c2 = Game.openPlayerCase(accuser, 'theft', [], false);
  const k0 = Game.state.scholar.kcal;
  const q0 = pantryKcal();
  Game.resolveCase(c2.id, 'weregild');
  const k1 = Game.state.scholar.kcal;
  const q1 = pantryKcal();
  const paid = Math.round(k0 - k1);
  const vgain = Math.round(q1 - q0);
  if (!BEFORE) {
    ok('player pays exactly 3000 from their stores', paid === 3000, `paid=${paid}`);
    ok('village gains exactly what the player paid', vgain === 3000, `gained=${vgain}`);
  } else {
    ok('BUG PRESENT: village gains 6000 while player pays 3000', vgain === 6000 && paid === 3000,
      `paid=${paid}, gained=${vgain}`);
  }
}

// ---------- HELD: gossip actually spreads ----------
console.log('H1. gossip travels the social lines (held)');
{
  freshGame();
  const ids = npcIds();
  Game.seedGossip('theft', { honest: -15, generous: -10 }, [ids[0]]);
  const g0 = Game.state.village.gossip[Game.state.village.gossip.length - 1].heard.length;
  let heard = g0;
  for (let i = 0; i < 30 && heard === g0; i++) { Game.spreadGossip(); heard = Game.state.village.gossip[Game.state.village.gossip.length - 1].heard.length; }
  ok('seeded gossip gains hearers via spreadGossip', heard > g0, `heard ${g0} -> ${heard}`);
  // and it moves REP, never trust (canon Trust != reputation)
  const tBefore = (Game.state.village.trust || {})[ids[2]];
  Game.spreadGossip();
  const tAfter = (Game.state.village.trust || {})[ids[2]];
  ok('gossip hop leaves trust untouched (noTrust)', (tBefore === undefined ? 10 : tBefore) === (tAfter === undefined ? 10 : tAfter));
}

// ---------- HELD: vote buttons render for any conversation partner ----------
console.log('H2. pending vote is reachable — buttons render on any villager (held)');
{
  freshGame();
  const { c } = rigPendingVoteCase();
  const other = npcIds()[1];
  const choices = (Game.betrayalChoices(other) || []).map(x => x.id);
  ok('vote_guilty + vote_acquit offered', choices.some(id => id === 'betrayal:vote_guilty:' + c.id) &&
    choices.some(id => id === 'betrayal:vote_acquit:' + c.id), choices.join(','));
}

// ---------- HELD: social modules loaded + wired (dead-code check) ----------
console.log('D1. social modules are loaded and their key methods are live');
{
  freshGame();
  const wired = [
    ['justiceTick', typeof Game.justiceTick],
    ['callMoot', typeof Game.callMoot],
    ['conductTrial', typeof Game.conductTrial],
    ['castPlayerVote', typeof Game.castPlayerVote],
    ['finishTrial', typeof Game.finishTrial],
    ['resolveCase', typeof Game.resolveCase],
    ['exilePlayer', typeof Game.exilePlayer],
    ['syncJusticeAfterMoot', typeof Game.syncJusticeAfterMoot],
    ['seedGossip', typeof Game.seedGossip],
    ['spreadGossip', typeof Game.spreadGossip],
    ['spreadRumor', typeof Game.spreadRumor],
    ['comfort', typeof Game.comfort],
    ['makeAmends', typeof Game.makeAmends],
    ['recordGrievance', typeof Game.recordGrievance],
    ['resolveConsequence', typeof Game.resolveConsequence],
    ['defendSpeak', typeof Game.defendSpeak],
    ['fleeBeforeVerdict', typeof Game.fleeBeforeVerdict],
    ['demandMoot', typeof Game.demandMoot],
  ];
  let allLive = true;
  for (const [name, t] of wired) { if (t !== 'function') { allLive = false; console.log('    dead: ' + name); } }
  ok('18/18 social entry points are live functions', allLive);
}

console.log(`\n${pass} passed, ${fail} failed (${BEFORE ? 'BEFORE' : 'AFTER'} mode)`);
process.exit(fail ? 1 : 0);
})();
