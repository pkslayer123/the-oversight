// Detective adversarial break-it: lie/accusation/evidence/trust (2026-10-09).
// Hostile player verbs: false accusations without cost, evidence games,
// accusation-as-trust-farming, confrontation softlocks, copy-vs-engine honesty.
//
// DESIGN CALLS (Steve: "figure it out yourself", documented here):
//  D1. Accusations must stick to the accuser. The game itself says so
//      ("Accusations have a way of sticking to the accuser" — truth.js
//      attacks pool), but confrontDoubt applied ZERO cost to the player:
//      every outcome moved the VICTIM's trust/standing, never the accuser's.
//      Fix: deflected/attacked/cleared now dent the player's honest/competent
//      rep directly (words, not mechanics), and attacked/cleared seed village
//      gossip naming the player. Being RIGHT (confessed) costs nothing.
//  D2. A counter-attack ends the conversation AND the topic: the villager
//      refuses further confrontation for 2 days (doubt.refusedUntil). The
//      old code let the player reopen a convo and re-accuse immediately —
//      an infinite grief loop with the doubt staying open forever.
//  D3. The dead can't confess. confrontDoubt/confrontTheft on a villager who
//      is gone (dead/exiled/removed) now returns {ok:false} instead of staging
//      a scene with a corpse.
//  D4. Gossip-lead windups are tentative. The old line said "doesn't match
//      what you told me" even when the player never heard their story —
//      the UI was lying. Leads now open with "Something's been bothering me".
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load
// data preload (mirrors test-break-contest-20261009.js): SCATTER_DATA from src/data/*.json
const PAIRS = [
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['synergies.json', 'synergies'],
  ['knowledge.json', 'knowledge'], ['nameCultures.json', 'nameCultures'],
  ['originPicker.json', 'originPicker'], ['foreignSpeech.json', 'foreignSpeech'],
  ['lifeseeds.json', 'lifeseeds'], ['arrivalText.json', 'arrivalText'],
  ['justiceVoice.json', 'justiceVoice'], ['alienPlayers.json', 'alienPlayers'],
  ['regions.json', 'regions'], ['dramaEffects.json', 'dramaEffects'],
  ['monsterBehaviors.json', 'monsterBehaviors'], ['contests.json', 'contests'],
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'], ['cooking.json', 'cooking'],
];
global.SCATTER_DATA = {};
// load every data file (key = basename); explicit pairs kept for the canonical keys
for (const f of fs.readdirSync(path.join(ROOT, 'src/data'))) {
  if (!f.endsWith('.json')) continue;
  const key = f.replace(/\.json$/, '');
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); }
  catch (e) { /* skip unreadable */ }
}
for (const [f, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); }
  catch (e) { /* some files may not exist; data key stays undefined */ }
}
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js',
 'src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js',
 'src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/convo-mood.js',
 'src/js/convoTopics.js','src/js/convo-wants.js','src/js/convo-dialogue.js','src/js/convo-beats.js',
 'src/js/convo-scene.js','src/js/examine.js','src/js/equipment.js','src/js/journal.js',
 'src/js/party.js','src/js/party-formal.js','src/js/truth.js','src/js/contests.js',
 'src/js/contestEngine.js','src/js/alienPlayers.js','src/js/storage.js','src/js/perceive.js',
 'src/js/carexplore.js','src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js',
 'src/js/lifeseed.js','src/js/progression.js','src/js/ledger.js','src/js/abilityActions.js',
 'src/js/monsterBehaviors.js','src/js/statusEffects.js','src/js/villager-agency.js',
 'src/js/fieldFights.js','src/js/villager-objectives.js','src/js/codex-people.js',
 'src/js/membership.js','src/js/hierarchy.js','src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // combat takes the sync path
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
const trustOf = (vid) => { const t = (Game.state.village.trust || {})[vid]; return t === undefined ? 10 : t; };
const repOf = (vid) => { try { return Object.assign({}, Game.repOf(vid)); } catch (e) { return {}; } };
const playerId = () => Game.villagerId;
function liarWithOccLie() {
  const ids = Game.npcIds().filter(id => id !== playerId());
  for (const id of ids) {
    const lies = Game.npcLies(id);
    if (lies && lies.occupation && !lies.occupation.confessed) return { vid: id, lie: lies.occupation };
  }
  // force one: hostile players don't wait for the RNG
  const vid = ids[0];
  const vp = Game.vpOf(vid);
  vp.lies = vp.lies || {};
  vp.lies.occupation = Game.makeLie(vp, 'occupation', 'hiding');
  return { vid, lie: vp.lies.occupation };
}
function plantOccDoubt(vid, lie) {
  return Game.addDoubt(vid, 'observation',
    `test doubt for ${vid}`,
    [`claims "${lie.told}"`, 'observed: hands don\'t know the work'],
    { field: 'occupation' });
}
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function gossipNamingPlayer() {
  return (Game.state.village.gossip || []).filter(g =>
    g.dims && g.dims.who === playerId());
}

// ============ E1: confrontation spam loop — the accuser must pay ============
(function () {
  console.log('E1: accusation griefing — repeated confrontations');
  fresh();
  const { vid, lie } = liarWithOccLie();
  const d = plantOccDoubt(vid, lie);
  const t0 = trustOf(vid);
  const rep0 = repOf(playerId()).honest || 0;
  let rounds = 0, outcomes = [];
  for (let i = 0; i < 40; i++) {
    if (d.resolved) break;
    const r = Game.confrontDoubt(vid, d.id);
    rounds++;
    outcomes.push(r.outcome);
    if (r.ok === false) break; // refused / guarded
  }
  say();
  const t1 = trustOf(vid);
  const rep1 = repOf(playerId()).honest || 0;
  const goss = gossipNamingPlayer();
  console.log(`    rounds=${rounds} outcomes=${outcomes.join(',')} trust ${t0}->${t1} playerHonest ${rep0}->${rep1} gossipNamingPlayer=${goss.length}`);
  // The break: the loop must NOT be infinite AND the accuser must pay.
  // Green bar: bounded rounds AND (player rep dented OR village gossip names player OR refusal engaged)
  const bounded = rounds < 40 || d.resolved;
  // D1: being RIGHT is free — the accuser pays only for dodges, blowups, and
  // baseless accusations. If every round confessed, no cost is the design.
  const harsh = outcomes.some(o => ['deflected', 'attacked', 'cleared'].includes(o));
  const accuserPaid = rep1 < rep0 || goss.length > 0;
  const refused = outcomes.includes('refused') || (d.refusedUntil || 0) > 0;
  check('E1a loop is bounded (resolves or refuses)', bounded && (d.resolved || refused),
    `rounds=${rounds} resolved=${d.resolved}`);
  check('E1b harsh outcomes cost the accuser (being right stays free)', !harsh || accuserPaid,
    `outcomes=${outcomes.join(',')} playerHonest ${rep0}->${rep1}, gossip=${goss.length}`);
  check('E1c victim not ground to zero for free', !(t1 <= 0 && !accuserPaid),
    `trust ${t0}->${t1} with accuserPaid=${accuserPaid}`);
})();

// ============ E2: counter-attack then immediate re-accuse ============
(function () {
  console.log('E2: attacked -> reopen convo -> confront again');
  fresh();
  const { vid, lie } = liarWithOccLie();
  const d = plantOccDoubt(vid, lie);
  // force the counter-attack deterministically: pathological motive + zero
  // trust + prickly temper collapses confessP below zero; roll 0.99 then
  // lands past confessP+0.35 every time.
  lie.motive = 'pathological';
  Game.state.village.trust[vid] = 0;
  const realTemper = Game.npcTemper, realRandom = Math.random;
  Game.npcTemper = () => 'prickly';
  Math.random = () => 0.99;
  let r1;
  try { r1 = Game.confrontDoubt(vid, d.id); }
  finally { Game.npcTemper = realTemper; Math.random = realRandom; }
  say();
  console.log(`    outcome=${r1.outcome} refusedUntil=${d.refusedUntil} day=${(Game.state.scholar || {}).day}`);
  check('E2a counter-attack triggers a refusal cooldown', r1.outcome === 'attacked' && (d.refusedUntil || 0) > 0,
    `outcome=${r1.outcome} refusedUntil=${d.refusedUntil}`);
  const r = Game.confrontDoubt(vid, d.id);
  check('E2b re-confront during cooldown is refused', r.ok === false && r.outcome === 'refused',
    `got ${JSON.stringify(r && { ok: r.ok, outcome: r.outcome })}`);
  // and the UI must not offer the choice either
  Game.startConvo(vid); say();
  const choices = Game.convoChoices(vid);
  const hasConfront = choices.some(ch => String(ch.id).indexOf('confront:') === 0);
  check('E2c convo menu hides confrontation during cooldown', !hasConfront,
    `choices=${choices.map(c => c.id).join(',')}`);
  try { Game.endConvo(vid, 'left'); } catch (e) {}
  say();
  // cooldown expires: the still-open doubt is confrontable again
  Game.state.scholar.day = (d.refusedUntil || 0) + 1;
  const r3 = Game.confrontDoubt(vid, d.id);
  check('E2d cooldown expires — confrontation possible again', r3.ok === true,
    `got ${JSON.stringify(r3 && { ok: r3.ok, outcome: r3.outcome })}`);
  say();
})();

// ============ S1: confronting the dead ============
(function () {
  console.log('S1: theft doubt vs a dead robber');
  fresh();
  const ids = Game.npcIds().filter(id => id !== playerId());
  const vid = ids[0];
  const d = Game.addDoubt(vid, 'observation', 'saw them by the cache', ['saw them near the cache'], { quiet: true });
  d.theft = { cacheId: 'c1', label: 'buried stew', place: 'the ridge', day: 1, witness: 'you' };
  try { Game.removeVillager(vid, 'killed'); } catch (e) { console.log('    removeVillager threw: ' + e.message); }
  say();
  let threw = false, r = null;
  try { r = Game.confrontDoubt(vid, d.id); } catch (e) { threw = true; r = { err: e.message }; }
  console.log(`    threw=${threw} result=${JSON.stringify(r && { ok: r.ok, outcome: r.outcome })}`);
  check('S1a no throw on dead target', !threw, r && r.err);
  check('S1b dead target refuses cleanly (no confession from a corpse)', r && r.ok === false,
    JSON.stringify(r && { ok: r.ok, outcome: r.outcome }));
  // S1c (SUPERSEDED 2026-10-09e): the old expectation was "doubt stays open,
  // not resolved by the void". That was precisely the softlock — an open
  // doubt on a gone villager has no resolution path (confront refuses
  // forever, no convo can exist) and the codex promises "confront them,
  // watch them, or ask around" about a corpse. Design call, documented in
  // scripts/test-detective-breakit-20261009e.js: removal closes open doubts
  // as UNANSWERED — the question outlives them, honestly.
  check('S1c doubt closes as unanswered on removal (supersedes old open-forever)', d && d.resolved && /unanswered/i.test(d.resolution || ''), 'doubt resolved=' + (d && d.resolved) + ' res=' + (d && d.resolution));
})();

// ============ S2: confront choice with no active conversation ============
(function () {
  console.log('S2: convoTurn confront: with no active convo');
  fresh();
  const { vid, lie } = liarWithOccLie();
  const d = plantOccDoubt(vid, lie);
  const t0 = trustOf(vid);
  let threw = false, r = null;
  try { r = Game.convoTurn(vid, 'confront:' + d.id); } catch (e) { threw = true; r = { err: String(e.message).slice(0, 80) }; }
  say();
  console.log(`    threw=${threw} ended=${r && r.ended} resolved=${d.resolved}`);
  check('S2a no throw without an active convo', !threw, r && r.err);
  check('S2b refused cleanly outside a conversation', r && r.ended === true && !d.resolved && trustOf(vid) === t0,
    `ended=${r && r.ended} resolved=${d.resolved} trust ${t0}->${trustOf(vid)}`);
})();

// ============ H1: gossip-lead windup must not claim a contradiction that never happened ============
(function () {
  console.log('H1: gossip-lead windup honesty');
  fresh();
  const ids = Game.npcIds().filter(id => id !== playerId());
  // a liar with a gossip LEAD: heard nothing from them, but the village talked
  const { vid, lie } = liarWithOccLie();
  const src = ids.find(id => id !== vid);
  Game.checkGossipClaim(vid, 'occupation', lie.truth, src);
  say();
  const doubts = Game.getDoubts(vid).filter(x => x.kind === 'gossip');
  check('H1a lead doubt planted', doubts.length > 0, 'none');
  if (doubts.length) {
    Game.confrontDoubt(vid, doubts[0].id);
    const log = say();
    const claimsContradiction = /doesn't match what you told me|told me one thing, then another/i.test(log);
    console.log('    log head: ' + log.slice(0, 130));
    check('H1b lead windup does not invent a prior claim', !claimsContradiction, log.slice(0, 200));
  }
  // control: WITH a claim on file, the contradiction phrasing is honest
  fresh();
  const ids2 = Game.npcIds().filter(id => id !== playerId());
  const L2 = liarWithOccLie();
  const src2 = ids2.find(id => id !== L2.vid);
  Game.trackClaimSilent(L2.vid, 'occupation', 'baker');
  Game.checkGossipClaim(L2.vid, 'occupation', L2.lie.truth, src2);
  say();
  const d2 = Game.getDoubts(L2.vid).filter(x => x.kind === 'gossip');
  check('H1c control doubt planted', d2.length > 0, 'none');
  if (d2.length) {
    Game.confrontDoubt(L2.vid, d2[0].id);
    const log = say();
    check('H1d real-contradiction windup names the mismatch', /doesn't match/i.test(log), log.slice(0, 160));
  }
})();

// ============ H2: being RIGHT must stay free; being WRONG must sting ============
(function () {
  console.log('H2: cleared (baseless) vs confessed (right) accuser cost');
  fresh();
  // baseless: villager with NO lies at all
  const ids = Game.npcIds().filter(id => id !== playerId());
  let honest = null;
  for (const id of ids) { const l = Game.npcLies(id); if (!l || !Object.values(l).some(x => x && x.told && !x.confessed)) { honest = id; break; } }
  if (!honest) { console.log('    (no fully-honest villager; forcing)'); honest = ids[0]; const vp = Game.vpOf(honest); vp.lies = {}; }
  // REFINED 2026-10-09b: a behavior doubt was never an accusation — it is a
  // real observation raised tentatively, and now clears neutrally (see B2 in
  // test-detective-breakit-20261009b.js). The truly-baseless case is a REAL
  // accusation (observation doubt) with nothing behind it.
  const d = Game.addDoubt(honest, 'observation', 'test baseless', ['claims "baker"', 'observed: something off']);
  const rep0 = repOf(playerId()).honest || 0;
  const r = Game.confrontDoubt(honest, d.id);
  say();
  const rep1 = repOf(playerId()).honest || 0;
  console.log(`    outcome=${r.outcome} playerHonest ${rep0}->${rep1}`);
  check('H2a baseless accusation resolves as cleared', r.outcome === 'cleared', r.outcome);
  check('H2b baseless accusation dents accuser honesty rep', rep1 < rep0, `${rep0}->${rep1}`);
  check('H2c baseless accusation is village news', gossipNamingPlayer().length > 0, 'no gossip');
})();

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
process.exit(fail ? 1 : 0);
