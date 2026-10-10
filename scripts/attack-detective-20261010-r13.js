// Detective adversarial r13 (2026-10-10): hostile player vs the lie system.
// Uncovered territory after r12 (accuserPays routing, deflection loop,
// per-doubt cooldown, observe-gone, freeloadGossip, liar-rep routing).
//
// H1 (HONESTY): the no-lie windup speaks a TENTATIVE question ("Something's
//     been bothering me... help me understand it") while the 'cleared'
//     aftermath narrates a REAL accusation ("you called X a liar, and you
//     were wrong") + fines the player. Scene words vs consequences disagree.
//     Per TRUTH.md canon, tentative questions clear neutrally; real
//     accusations cost. The windup must own which one it is.
// E1 (EXPLOIT): hostile grief — repeated false accusations against an
//     innocent. Each needs a fresh doubt; measure the cumulative price to
//     the accuser and the victim. Held = the pricing bites every round.
// S1 (SOFTLOCK): doubt on a villager with no shared language and no
//     interpreter — is confrontation offered? Is any resolution path open?
// S2 (HONESTY): substring lie cross-wiring — an observation doubt whose
//     evidence merely MENTIONS the cover word in unrelated context. Does
//     the confrontation pivot to the backstory lie the evidence doesn't
//     support? Documents behavior either way.
//
// Run: node scripts/attack-detective-20261010-r13.js (SEED=... optional)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load
global.SCATTER_DATA = {};
for (const f of fs.readdirSync(path.join(ROOT, 'src/data'))) {
  if (!f.endsWith('.json')) continue;
  try { global.SCATTER_DATA[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); } catch (e) {}
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
// capture say() output (the windup speaks through it)
let said = [];
const origSay = Game.say.bind(Game);
Game.say = function (t) { said.push(String(t)); try { return origSay(t); } catch (e) {} };
const drainSaid = () => { const s = said.join('\n'); said = []; return s; };
function fresh() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  drainSaid();
  return s;
}
const playerId = () => Game.villagerId;
const npcIds = () => Game.npcIds().filter(id => id !== playerId());
const trustOf = (vid) => { const t = (Game.state.village.trust || {})[vid]; return t === undefined ? 10 : t; };
// an innocent: no lies at all
function innocent() {
  for (const id of npcIds()) {
    const lies = Game.npcLies(id);
    if (!lies || !Object.keys(lies).length) return id;
  }
  const id = npcIds()[0];
  const vp = Game.vpOf(id);
  if (vp) vp.lies = {};
  return id;
}
// betrayal-style observation doubt: real engine-planted evidence, no lie, no field
function plantPlotDoubt(vid, text) {
  return Game.addDoubt(vid, 'observation',
    text || `${Game.displayName(vid)}'s story doesn't explain your wounds.`);
}
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ============ H1: tentative windup vs accusation punishment ============
(function () {
  console.log('H1: no-lie observation doubt — windup words vs cleared aftermath');
  fresh();
  const vid = innocent();
  const d = plantPlotDoubt(vid);
  const hearers = Game.npcIds().filter(id => id !== vid).slice(0, 3);
  const before = hearers.map(h => (Game.repOf(h).honest || 0));
  drainSaid();
  const r = Game.confrontDoubt(vid, d.id);
  const spoken = drainSaid();
  const windupTentative = /help me understand it/i.test(spoken);
  const windupAccusatory = /I've been watching|you told me one thing|doesn't match/i.test(spoken);
  const punished = /you called .* a liar, and you were wrong/i.test(r.afterSay || '');
  const after = hearers.map(h => (Game.repOf(h).honest || 0));
  const repMoved = after.some((v, i) => v < before[i]);
  console.log(`    outcome=${r.outcome} windupTentative=${windupTentative} windupAccusatory=${windupAccusatory}`);
  console.log(`    punished=${punished} repMoved=${repMoved}`);
  check('H1a confrontation clears (no lie behind it)', r.outcome === 'cleared', r.outcome);
  check('H1b windup and punishment agree: tentative<->neutral, accusatory<->punished',
    (windupTentative && !punished) || (windupAccusatory && punished),
    `tentative=${windupTentative} punished=${punished}`);
})();

// ============ E1: hostile grief — repeated false accusations ============
(function () {
  console.log('E1: grief loop — false accusations against an innocent, 3 rounds');
  fresh();
  const vid = innocent();
  const hearers = Game.npcIds().filter(id => id !== vid).slice(0, 3);
  const repBefore = hearers.map(h => (Game.repOf(h).honest || 0));
  const trustBefore = trustOf(vid);
  let totalPaid = 0, threw = false;
  for (let round = 0; round < 3; round++) {
    const d = plantPlotDoubt(vid, `round ${round}: ${Game.displayName(vid)} acted strangely.`);
    try {
      const r = Game.confrontDoubt(vid, d.id);
      if (r.outcome !== 'cleared') { console.log(`    round ${round}: unexpected outcome ${r.outcome}`); }
    } catch (e) { threw = true; }
    drainSaid();
  }
  const repAfter = hearers.map(h => (Game.repOf(h).honest || 0));
  const paid = repBefore.map((b, i) => b - repAfter[i]);
  const trustAfter = trustOf(vid);
  const mems = ((Game.state.village.memory || {})[vid] || []).filter(m => m.t === 'wrongly_accused').length;
  console.log(`    paid per hearer=${JSON.stringify(paid)} victimTrust ${trustBefore}->${trustAfter} wrongly_accused memories=${mems} threw=${threw}`);
  check('E1a no throw across 3 grief rounds', !threw);
  check('E1b every round priced the accuser (no free grief)', paid.every(p => p > 0), JSON.stringify(paid));
  check('E1c victim trust cost is bounded, not a zero-grind', trustAfter > trustBefore - 12, `${trustBefore}->${trustAfter}`);
})();

// ============ S1: doubt vs no shared language ============
// The base engine auto-bridges a bilingual interpreter (conversation.js:
// findInterpreter sets c.interpreter inside the nonverbal choices). The
// truth wrapper then legitimately offers confrontation "via" them. Only a
// village with NO bilingual may withhold the choice.
(function () {
  console.log('S1: doubt on a villager with no shared language');
  fresh();
  const vid = npcIds()[0];
  let threw = false, choicesBridged = null, choicesAlone = null, obsR = null, label = '';
  try {
    plantPlotDoubt(vid);
    const cg = Game.convoGet(vid);
    cg.thread = 'nonverbal'; cg.interpreter = null; cg.active = true; cg.pendingQ = null;
    choicesBridged = Game.convoChoices(vid);
    const item = (choicesBridged || []).find(ch => String(ch.id).indexOf('confront:') === 0);
    label = item ? item.label : '';
    // now simulate a village with no bilingual: findInterpreter finds nobody
    const origFI = Game.findInterpreter.bind(Game);
    Game.findInterpreter = () => null;
    const cg2 = Game.convoGet(vid);
    cg2.thread = 'nonverbal'; cg2.interpreter = null; cg2.active = true; cg2.pendingQ = null;
    choicesAlone = Game.convoChoices(vid);
    Game.findInterpreter = origFI;
    drainSaid();
    obsR = Game.observePerson(vid);
    drainSaid();
  } catch (e) { threw = true; console.log('    threw: ' + String(e.message).slice(0, 80)); }
  const offeredBridged = (choicesBridged || []).some(ch => String(ch.id).indexOf('confront:') === 0);
  const offeredAlone = (choicesAlone || []).some(ch => String(ch.id).indexOf('confront:') === 0);
  console.log(`    threw=${threw} bridgedOffered=${offeredBridged} labelVia=${/\(via /.test(label)} aloneOffered=${offeredAlone} observeOk=${obsR && obsR.ok}`);
  check('S1a no throw', !threw);
  check('S1b bridged confrontation is offered WITH via-attribution', offeredBridged && /\(via /.test(label), label.slice(0, 70));
  check('S1c no confrontation offered with truly no shared words', !offeredAlone);
  check('S1d observation still works (non-verbal path exists)', !!(obsR && obsR.ok));
})();

// ============ S2: substring lie cross-wiring ============
(function () {
  console.log('S2: observation evidence merely mentions the cover word');
  fresh();
  // liar with an occupation lie; observation doubt whose evidence mentions
  // the cover in an unrelated context (not as a claim about their past)
  let vid = null, lie = null;
  for (const id of npcIds()) {
    const lies = Game.npcLies(id);
    if (lies && lies.occupation && !lies.occupation.confessed) { vid = id; lie = lies.occupation; break; }
  }
  if (!vid) {
    // deterministic fallback: plant an occupation lie (mirrors r12)
    vid = npcIds()[0];
    const vp = Game.vpOf(vid);
    vp.lies = vp.lies || {};
    vp.lies.occupation = Game.makeLie(vp, 'occupation', 'hiding');
    lie = vp.lies.occupation;
    console.log('    (planted occupation lie for determinism)');
  }
  const d = Game.addDoubt(vid, 'observation',
    `${Game.displayName(vid)} was seen near the ovens, flour on their hands.`,
    [`seen near the ovens at dusk (day ${(Game.state.scholar || {}).day || 0})`, `flour on their hands — ${lie.told}s work?`],
    { field: 'stash_skim' });
  drainSaid();
  const r = Game.confrontDoubt(vid, d.id);
  const spoken = drainSaid();
  const pivotedToLie = /You said you were/i.test(spoken);
  console.log(`    cover="${lie.told}" outcome=${r.outcome} pivotedToBackstoryLie=${pivotedToLie}`);
  console.log(`    (documents behavior; the claimBit is true — they DID claim it)`);
  check('S2a no throw', !!r);
  check('S2b recorded: confrontation pivots to the lie the evidence named', true,
    `pivoted=${pivotedToLie} outcome=${r.outcome}`);
})();

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
process.exit(fail ? 1 : 0);
