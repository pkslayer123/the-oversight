// Detective adversarial break-it, run 4 (2026-10-09d).
// Hostile player verbs: trust-transition forgery, observe-the-gone, windup honesty.
//
// BREAKS under test (expected FAIL before the fix, PASS after):
//  A1. SILENT TRUST-TRANSITION. Canon TRUTH.md: "Contradictions (automatic):
//      new claim != old claim on same topic -> doubt." But the honest branch
//      of convoAskTopic records claims with trackClaimSilent — the
//      contradiction check never runs there. Attack: hear a liar's cover at
//      trust 10 (claim recorded), raise trust to 65 (lie goes dormant —
//      lieLive honors the trust gate), ask again: they now speak the TRUTH,
//      and the claim log holds [cover, truth] with NO contradiction doubt and
//      no aha beat. The Codex "notices when things don't add up" — except
//      the exact moment a trusted liar comes clean.
//  A2. FLAP ASYMMETRY (documents the inconsistency; passes pre-fix too). The
//      reverse direction — truth recorded first at trust 65, then the cover
//      at trust 10 — goes through the lie branch's trackClaim and DOES fire
//      a contradiction. One direction fires, the other doesn't: the claim
//      log's contradiction rule depends on which branch recorded first.
//  S3. OBSERVE THE GONE. observePerson has no gone guard: a villager removed
//      from the roster (fled/exiled — same mechanism as betrayal.js:762) can
//      still be "watched" — 2 ticks spent, observation tells possible, doubts
//      planted on someone who can never be confronted (confrontDoubt's gone
//      guard returns "Never mind." forever). An open, unresolvable doubt: a
//      softlocked detective thread.
//
// HELD (expected PASS before and after — record the target held):
//  H4. WINDUP HONESTY. A gossip lead's windup must never claim "you told me"
//      (they told you nothing — village talk did). Regression for 2026-10-09c.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.SCATTER_DATA = {};
for (const f of fs.readdirSync(path.join(ROOT, 'src/data'))) {
  if (!f.endsWith('.json')) continue;
  const key = f.replace(/.json$/, '');
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); } catch (e) {}
}
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js',
 'src/js/fieldFights.js', 'src/js/villager-objectives.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
const say = () => { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; };
function fresh() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  say();
  return s;
}
function liarWithOccLie() {
  const vid = Game.npcIds()[0];
  const vp = Game.vpOf(vid);
  vp.lies = { occupation: { told: 'paramedic', truth: 'line cook', motive: 'shame', field: 'occupation' } };
  vp.formerOccupation = 'line cook';
  return vid;
}
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- A1. SILENT TRUST-TRANSITION ----
fresh();
{
  const vid = liarWithOccLie();
  Game.state.village.trust[vid] = 10;
  say();
  Game.convoAskTopic(vid, 'past'); // lie branch: cover recorded
  say();
  const claims1 = Game.getClaims(vid, 'occupation').map(c => c.claim);
  Game.state.village.trust[vid] = 65; // lie goes dormant — trust gate
  Game.convoAskTopic(vid, 'past'); // honest branch: claim baseline now truth
  const saidTruth = say();
  const claims2 = Game.getClaims(vid, 'occupation').map(c => c.claim);
  const doubts = Game.getDoubts(vid).filter(d => d.kind === 'contradiction');
  check('A1 claims log holds both cover and truth', claims2.includes('paramedic') && claims2.includes('line cook'),
    'claims=' + JSON.stringify(claims2));
  check('A1 contradiction doubt fires on the trust-transition', doubts.length > 0,
    'no contradiction doubt; claims=' + JSON.stringify(claims2));
  check('A1 the aha beat names both stories', /paramedic/i.test(saidTruth) && /line cook/i.test(saidTruth),
    saidTruth.slice(0, 200));
}

// ---- A2. FLAP ASYMMETRY (reverse direction — control) ----
fresh();
{
  const vid = liarWithOccLie();
  Game.state.village.trust[vid] = 65;
  say();
  Game.convoAskTopic(vid, 'past'); // honest: truth recorded
  Game.state.village.trust[vid] = 10;
  say();
  Game.convoAskTopic(vid, 'past'); // lie branch: cover vs truth
  const said = say();
  const doubts = Game.getDoubts(vid).filter(d => d.kind === 'contradiction');
  check('A2 reverse direction fires (control)', doubts.length > 0 && /line cook/i.test(said),
    'doubts=' + doubts.length);
}

// ---- S3. OBSERVE THE GONE ----
fresh();
{
  const vid = liarWithOccLie();
  // villager leaves the village (same mechanism as flee/exile: roster filter)
  Game.state.village.roster = Game.state.village.roster.filter(id => id !== vid);
  say();
  const ticksBefore = Game.state.scholar.dayTicks || 0;
  const r = Game.observePerson(vid);
  say();
  const doubts = (Game.state.codex.doubts || []).filter(d => d.vid === vid && !d.resolved);
  const ticksSpent = (Game.state.scholar.dayTicks || 0) !== ticksBefore;
  check('S3 observing a gone villager is refused cleanly', r && r.ok === false,
    'observePerson returned ok=' + (r && r.ok));
  check('S3 no ticks spent on the gone', !ticksSpent, 'dayTicks changed');
  check('S3 no doubt planted on the gone', doubts.length === 0, doubts.length + ' doubts');
}

// ---- H4. WINDUP HONESTY (regression) ----
fresh();
{
  const vid = Game.npcIds()[1];
  const d = Game.addDoubt(vid, 'gossip', 'lead text',
    ['Mara: the truth is "line cook"', `you haven't heard ${Game.firstRef(vid)}'s own story yet`],
    { field: 'occupation' });
  say();
  Game.confrontWindup(vid, d, null);
  const said = say();
  check('H4 lead windup never claims "you told me"', !/you told me|you said you/i.test(said), said.slice(0, 200));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
