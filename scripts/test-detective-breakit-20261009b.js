// Detective adversarial break-it, run 2 (2026-10-09b).
// Hostile player verbs: trust-gated honesty, tentative-clear fairness,
// refusal-rotation griefing, claim-baseline consistency.
//
// BREAKS under test (expected FAIL before the fix, PASS after):
//  B1. TRUTH.md promises "High trust (>60) -> truth, UNLESS pathological".
//      getActiveLie knows this — but EVERY speech path (fillTalkLine,
//      convoThreadBeat, convoAskTopic, scrubLiesFromLine) swaps the cover
//      in on trust alone. A trusted liar keeps lying forever; the promise
//      is dead code. The player hears the COVER at trust 70.
//  B2. Behavior doubts and gossip LEADS were never accusations — the windup
//      says so ("Something's been bothering me... help me understand it").
//      But a clear ran accuserPays('cleared'): honest -5, village gossip
//      "you called X a liar, and you were wrong", wrongly_accused memory.
//      The engine narrates an accusation that never happened (H1-class lie).
//
// HELD (expected PASS before and after — record the target held):
//  S3. Refusal is per-doubt: with 2 doubts the player can rotate
//      confrontations. Must be bounded by COST (accuser pays per attack),
//      never crash, never softlock.
//  H-controls: pathological malicious liars still lie at trust 70;
//      resolved-doubt confronts are clean no-ops.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
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
for (const f of fs.readdirSync(path.join(ROOT, 'src/data'))) {
  if (!f.endsWith('.json')) continue;
  const key = f.replace(/\.json$/, '');
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); }
  catch (e) {}
}
for (const [f, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); }
  catch (e) {}
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
const playerId = () => Game.villagerId;
function setTrust(vid, v) { Game.state.village.trust = Game.state.village.trust || {}; Game.state.village.trust[vid] = v; }
function liarWithOccLie() {
  const ids = Game.npcIds().filter(id => id !== playerId());
  for (const id of ids) {
    const lies = Game.npcLies(id);
    if (lies && lies.occupation && !lies.occupation.confessed) return { vid: id, lie: lies.occupation };
  }
  const vid = ids[0];
  const vp = Game.vpOf(vid);
  vp.lies = vp.lies || {};
  vp.lies.occupation = Game.makeLie(vp, 'occupation', 'hiding');
  return { vid, lie: vp.lies.occupation };
}
function honestVillager() {
  const ids = Game.npcIds().filter(id => id !== playerId());
  for (const id of ids) {
    const l = Game.npcLies(id);
    if (!l || !Object.values(l).some(x => x && x.told && !x.confessed)) return id;
  }
  const vid = ids[0]; Game.vpOf(vid).lies = {}; return vid;
}
function gossipNamingPlayer() {
  return (Game.state.village.gossip || []).filter(g => g.dims && g.dims.who === playerId());
}
function memoriesOf(vid, t) {
  return (((Game.state.village || {}).memory || {})[vid] || []).filter(m => m.t === t);
}
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ============ B1: high trust must earn the truth (TRUTH.md promise) ============
(function () {
  console.log('B1: trust>60 liar — does the player hear the truth?');
  fresh();
  const { vid, lie } = liarWithOccLie();
  lie.motive = 'hiding'; // non-pathological: the promise applies
  setTrust(vid, 70);
  const active = Game.getActiveLie(vid, 'past');
  check('B1a getActiveLie returns null at trust 70 (gate exists)', active === null,
    'returned ' + JSON.stringify(active && active.told));
  const line = String(Game.convoAskTopic(vid, 'past') || '');
  say();
  const truth = Game.vpOf(vid).formerOccupation;
  const heardTruth = line.toLowerCase().includes(String(truth).toLowerCase());
  const heardCover = line.toLowerCase().includes(String(lie.told).toLowerCase());
  console.log(`    truth="${truth}" cover="${lie.told}" line: ${line.slice(0, 120)}`);
  check('B1b player HEARS the truth at trust 70', heardTruth && !heardCover,
    `heardTruth=${heardTruth} heardCover=${heardCover}`);
  // claim baseline must match what the player heard (no knowledge leak)
  const claims = Game.getClaims(vid, 'occupation');
  const last = claims.length ? claims[claims.length - 1].claim : null;
  check('B1c claim baseline records what was heard (the truth)', String(last).toLowerCase() === String(truth).toLowerCase(),
    'baseline=' + last);
})();

// ============ B1d: the pathological exception — malicious psychos keep lying ============
(function () {
  console.log('B1d: pathological malicious liar at trust 70 keeps the cover');
  fresh();
  const { vid, lie } = liarWithOccLie();
  lie.motive = 'pathological';
  const vp = Game.vpOf(vid);
  vp.personality = vp.personality || {}; vp.personality.dark = { kind: 'malicious' };
  setTrust(vid, 70);
  const line = String(Game.convoAskTopic(vid, 'past') || '');
  say();
  const heardCover = line.toLowerCase().includes(String(lie.told).toLowerCase());
  console.log(`    line: ${line.slice(0, 110)}`);
  check('B1d pathological liar still lies when trusted', heardCover, 'heard the truth instead');
})();

// ============ B2: tentative clears must not brand the player a false accuser ============
(function () {
  console.log('B2: behavior-doubt clear — no false-accusation branding');
  fresh();
  const vid = honestVillager();
  const d = Game.addDoubt(vid, 'behavior', 'test: says belong, seen hoarding',
    ['claims goal: belong', 'observed: selfish behavior']);
  const rep0 = (Game.repOf(playerId()) || {}).honest || 0;
  const r = Game.confrontDoubt(vid, d.id);
  const log = say();
  console.log(`    outcome=${r.outcome} afterSay=${(r.afterSay || '').slice(0, 90)}`);
  check('B2a clears', r.outcome === 'cleared', r.outcome);
  const rep1 = (Game.repOf(playerId()) || {}).honest || 0;
  check('B2b no honest-rep hit for an honest question', rep1 >= rep0, `${rep0}->${rep1}`);
  check('B2c no false_accusation village gossip', gossipNamingPlayer().length === 0,
    gossipNamingPlayer().length + ' gossip entries name the player');
  check('B2d no wrongly_accused memory', memoriesOf(vid, 'wrongly_accused').length === 0,
    memoriesOf(vid, 'wrongly_accused').length + ' memories');
  check('B2e aftermath copy never claims an accusation happened',
    !/called .* a liar/i.test((r.afterSay || '') + ' ' + log), (r.afterSay || '').slice(0, 160));
})();

// ============ B2f: gossip-LEAD clear — the player relayed village talk, not an accusation ============
(function () {
  console.log('B2f: gossip-lead clear on an honest villager');
  fresh();
  const vid = honestVillager();
  const src = Game.npcIds().find(id => id !== vid && id !== playerId());
  Game.checkGossipClaim(vid, 'occupation', 'surgeon', src);
  say();
  const doubts = Game.getDoubts(vid).filter(x => x.kind === 'gossip');
  check('B2f-a lead doubt planted', doubts.length > 0, 'none');
  if (!doubts.length) return;
  const rep0 = (Game.repOf(playerId()) || {}).honest || 0;
  const r = Game.confrontDoubt(vid, doubts[0].id);
  const log = say();
  const rep1 = (Game.repOf(playerId()) || {}).honest || 0;
  console.log(`    outcome=${r.outcome}`);
  check('B2f-b lead clear costs the player nothing', r.outcome === 'cleared' && rep1 >= rep0 && gossipNamingPlayer().length === 0,
    `outcome=${r.outcome} rep ${rep0}->${rep1} gossip=${gossipNamingPlayer().length}`);
  check('B2f-c no wrongly_accused memory for relaying talk', memoriesOf(vid, 'wrongly_accused').length === 0, '');
  check('B2f-d aftermath copy stays honest', !/called .* a liar/i.test((r.afterSay || '') + ' ' + log), (r.afterSay || '').slice(0, 160));
})();

// ============ S3: refusal rotation — villager-level (2026-10-10) ============
// SPEC CHANGE (detective playtest 2026-10-10): the old S3a asserted the
// rotation was NOT blocked mid-fight ("no guard yet"). That was the loophole:
// a second open doubt bypassed the counter-attack cooldown entirely, and the
// "we're done with that" fiction broke on the next breath. The refusal now
// covers the PERSON for 2 days — the grief loop the refusal was built to stop
// ("no reopen-and-re-accuse grind") applied to doubt #2 verbatim. Doubts
// planted after the blowup day are new business and stay actionable.
(function () {
  console.log('S3: two-doubt refusal rotation (villager-level)');
  fresh();
  const { vid, lie } = liarWithOccLie();
  lie.motive = 'pathological';
  const vp = Game.vpOf(vid);
  vp.personality = vp.personality || {}; vp.personality.dark = { kind: 'malicious' };
  setTrust(vid, 0);
  const d1 = Game.addDoubt(vid, 'observation', 'doubt one', [`claims "${lie.told}"`, 'observed: hands'], { field: 'occupation' });
  const d2 = Game.addDoubt(vid, 'slip', 'doubt two', [`claimed "${lie.told}"`, 'slipped'], {});
  const realTemper = Game.npcTemper, realRandom = Math.random;
  Game.npcTemper = () => 'prickly';
  Math.random = () => 0.99; // force counter-attacks
  let r1, r2, r3, r4;
  try {
    r1 = Game.confrontDoubt(vid, d1.id);
    r2 = Game.confrontDoubt(vid, d2.id); // rotation: now refused (villager-level)
    r3 = Game.confrontDoubt(vid, d1.id); // cooldown
    r4 = Game.confrontDoubt(vid, d2.id);
  } finally { Game.npcTemper = realTemper; Math.random = realRandom; }
  say();
  console.log(`    ${r1.outcome}/${r2.outcome}/${r3.outcome}/${r4.outcome}`);
  check('S3a first attack lands, rotation blocked mid-fight (refusal covers the person)',
    r1.outcome === 'attacked' && r2.outcome === 'refused' && r2.ok === false,
    `${r1.outcome}/${r2.outcome}`);
  check('S3b both doubts refuse during cooldown (no re-grind)', r3.ok === false && r4.ok === false,
    `${r3.outcome}/${r4.outcome}`);
  const repHit = ((Game.repOf(playerId()) || {}).honest || 0);
  check('S3c the blocked rotation still COST the accuser (price AND guard now)',
    repHit < 0 || gossipNamingPlayer().length > 0,
    `playerHonest=${repHit} gossip=${gossipNamingPlayer().length}`);
  // menu hides both during cooldown
  Game.startConvo(vid); say();
  const hasConfront = Game.convoChoices(vid).some(ch => String(ch.id).indexOf('confront:') === 0);
  try { Game.endConvo(vid, 'left'); } catch (e) {}
  say();
  check('S3d menu offers no confrontation while both refuse', !hasConfront, '');
  // resolved-doubt confront is a clean no-op
  const t0 = (Game.state.village.trust || {})[vid];
  const rr = Game.confrontDoubt(vid, d1.id); // still refused; use a resolved one instead
  Game.resolveDoubt(d2.id, 'test resolution');
  const rr2 = Game.confrontDoubt(vid, d2.id);
  say();
  check('S3e resolved doubt confront is a clean no-op', rr2.ok === false && (Game.state.village.trust || {})[vid] === t0,
    JSON.stringify({ ok: rr2.ok }));
})();

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
process.exit(fail ? 1 : 0);
