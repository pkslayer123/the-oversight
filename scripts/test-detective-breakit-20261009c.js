// Detective adversarial break-it, run 3 (2026-10-09c).
// Hostile player verbs: stale-lead framing, overheard slips, wrong-lie
// confession fallback, refusal rotation, menu-label honesty.
//
// BREAKS under test (expected FAIL before the fix, PASS after):
//  C1. STALE LEAD MARKER. A gossip lead ("you haven't heard X's own story
//      yet") keeps its tentative framing FOREVER: once the player hears the
//      story, stampHeardStory appends "heard X's own story (day N)" but the
//      old "haven't heard" marker stays, so confrontWindup's isLead test
//      still matches. The windup plays the tentative "I wanted to hear your
//      side" beat while the scene proceeds to a full confess/deflect/attack
//      accusation — and confrontDoubt's `tentative` flag stays true for the
//      no-lie path, granting neutral clears for EARNED contradictions.
//      (2026-10-09b's design: tentative until the contradiction is earned.)
//  C2. MENU LABEL LIES FOR LEADS. convoChoices labels a gossip LEAD
//      "Someone told me something about you that doesn't match. Explain." —
//      but a lead has no mismatch yet (no claim on file). The windup knows
//      this (isLead → tentative). The menu overpromises; copy vs engine.
//  C3. OVERHEARD SLIPS CLAIM A CONVERSATION THAT NEVER HAPPENED. endDay's
//      slip loop fires for villagers the player has never met (lies generate
//      lazily for the whole roster). The doubt text says "X told you
//      'cover' — ..." and journals it as told-to-you. The say-lines are
//      overheard scenes ("Someone asks X..."); the doubt/journal text must
//      match: "you overheard".
//  C4. WRONG-LIE CONFESSION FALLBACK. confrontDoubt's by-kind fallback
//      (contradiction/observation → liveLie('occupation')||liveLie('origin'))
//      fires when no lie matches the doubt's evidence — i.e. exactly when
//      the doubt is NOT about a live lie. With lie A confessed and lie B
//      live, confronting A's doubt confesses B under A's banner and resolves
//      A's doubt as "confessed: <B's truth>". All real doubt producers put
//      the cover in the evidence, so the evidence-match loop is sufficient;
//      the guess confesses unrelated lies.
//
// HELD (expected PASS before and after — record the target held):
//  S5. Refusal rotation: attacked → 2-day refusal per doubt; other doubts
//      still confrontable; no crash, no softlock, menu returns after cooldown.
//  H6. accuserPays('cleared') for a REAL accusation (contradiction, no lie)
//      still brands the accuser: honest -5 + false_accusation gossip naming
//      the player + wrongly_accused memory.
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
  const key = f.replace(/.json$/,'');
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); } catch (e) {}
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
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ============ C1: stale lead marker ============
// gossip lead → hear their story (stamp) → the doubt must stop being a lead.
(function () {
  console.log('C1: gossip lead, then the story is heard — lead framing must expire');
  fresh();
  const { vid, lie } = liarWithOccLie();
  setTrust(vid, 10); // lie stays live
  const src = Game.npcIds().find(id => id !== vid && id !== playerId());
  // force the teller to know the liar: plant the lead via checkGossipClaim
  Game.checkGossipClaim(vid, 'occupation', lie.truth, src);
  say();
  let doubts = Game.getDoubts(vid).filter(x => x.kind === 'gossip');
  check('C1a lead doubt planted', doubts.length > 0, 'none');
  if (!doubts.length) return;
  const d = doubts[0];
  const leadBefore = (d.evidence || []).some(e => /haven't heard/.test(String(e)));
  check('C1b starts as a lead', leadBefore, JSON.stringify(d.evidence));
  // now hear their story: ask 'past' with the lie live → cover claimed + stamp
  String(Game.convoAskTopic(vid, 'past') || ''); say();
  const stamped = (d.evidence || []).some(e => /own story \(day/.test(String(e)));
  check('C1c story-heard stamp landed', stamped, JSON.stringify(d.evidence));
  // the engine's lead test must now say "not a lead"
  const isLead = Game.doubtIsLead ? Game.doubtIsLead(d) : (d.evidence || []).some(e => /haven't heard/.test(String(e)));
  check('C1d doubtIsLead false after the story is heard', isLead === false,
    'still treated as a lead — windup stays tentative, clears stay neutral');
  // and the windup must speak the earned-contradiction version, not the tentative one
  const beats = Game.confrontWindup(vid, d, lie);
  const spoken = beats && beats[0] ? String(beats[0].text) : '';
  say();
  check('C1e windup upgrades to the contradiction framing', /doesn't match what you told me/.test(spoken),
    spoken.slice(0, 140));
})();

// ============ C2: menu label for leads ============
(function () {
  console.log('C2: gossip-lead menu label must not claim a mismatch');
  fresh();
  const vid = honestVillager();
  const src = Game.npcIds().find(id => id !== vid && id !== playerId());
  Game.checkGossipClaim(vid, 'occupation', 'surgeon', src);
  say();
  const doubts = Game.getDoubts(vid).filter(x => x.kind === 'gossip');
  if (!doubts.length) { check('C2a lead planted', false, 'none'); return; }
  // build a fake active convo so convoChoices offers confrontation
  const c = Game.convoGet(vid);
  const wasActive = c.active;
  c.active = true; c.thread = 'talk'; c.pendingQ = null;
  let label = null;
  try {
    const choices = Game.convoChoices(vid);
    const ch = choices.find(x => String(x.id).indexOf('confront:') === 0);
    label = ch ? String(ch.label) : null;
  } catch (e) { label = 'ERR ' + e.message; }
  c.active = wasActive;
  console.log('    label: ' + label);
  check('C2a lead label is tentative (no "doesn\'t match" claim)',
    label && !/doesn't match/.test(label), label);
})();

// ============ C2b: confronting a pure lead (story unheard) still works ============
// The field-aware fallback must keep the lead → confrontation flow alive:
// a lead confronted BEFORE hearing their story should play the tentative
// windup ("Word is...", never "You said...") and reach a real outcome.
(function () {
  console.log('C2b: pure lead confronted directly — tentative windup, real scene');
  fresh();
  const { vid, lie } = liarWithOccLie();
  setTrust(vid, 10);
  const src = Game.npcIds().find(id => id !== vid && id !== playerId());
  Game.checkGossipClaim(vid, 'occupation', lie.truth, src);
  say();
  const d = Game.getDoubts(vid).find(x => x.kind === 'gossip');
  if (!d) { check('C2b-a lead planted', false, 'none'); return; }
  const beats = Game.confrontWindup(vid, d, lie);
  const spoken = beats && beats[0] ? String(beats[0].text) : '';
  say();
  check('C2b-a lead windup attributes the cover to talk, not their mouth',
    /Word is you were/.test(spoken) && !/You said you were/.test(spoken), spoken.slice(0, 130));
  const r = Game.confrontDoubt(vid, d.id);
  say();
  check('C2b-b lead confrontation reaches a real outcome (not a neutral clear)',
    ['confessed', 'deflected', 'attacked'].includes(r.outcome), `outcome=${r.outcome}`);
})();
// ============ C3: slips are cracks, never the truth ============
// slipOrigin/slipGoal used to name the TRUE origin/goal outright in the
// narrator's voice — handing the player unearned truth and short-circuiting
// the confrontation. The occupation slips were already fixed to crack-only
// (Steve 2026-10-06); origin/goal must match that discipline.
(function () {
  console.log('C3: slip lines earn a crack, never name the truth');
  fresh();
  const pools = Game.truthLinePools;
  const leaked = [];
  for (const pk of ['slipOrigin', 'slipGoal', 'slipOccupation']) {
    for (const line of pools[pk]) {
      if (/{truth}|{atruth}|{truthCap}/.test(line)) leaked.push(pk + ': ' + line.slice(0, 70));
    }
  }
  check('C3a no slip pool interpolates the truth', leaked.length === 0, leaked.join(' | '));
  // end-to-end: an endDay-style slip about a stranger names no truth
  const ids = Game.npcIds().filter(id => id !== playerId());
  const vid = ids.find(id => {
    const l = Game.npcLies(id) || {};
    const hasLie = (l.occupation && !l.occupation.confessed) || (l.origin && !l.origin.confessed) || (l.goal && !l.goal.confessed);
    const noClaims = (Game.getClaims(id, 'occupation') || []).length === 0 &&
                     (Game.getClaims(id, 'origin') || []).length === 0;
    return hasLie && noClaims;
  });
  if (!vid) { check('C3b unmet liar exists', false, 'none found'); return; }
  const lies = Game.npcLies(vid) || {};
  const lie = lies.occupation || lies.origin || lies.goal;
  Game.truthSlip(vid, lie);
  say();
  const doubts = Game.getDoubts(vid).filter(x => x.kind === 'slip');
  check('C3b slip doubt planted for the stranger', doubts.length > 0, 'none');
  if (!doubts.length) return;
  const text = String(doubts[doubts.length - 1].text || '');
  const evText = (doubts[doubts.length - 1].evidence || []).join(' ');
  console.log('    doubt: ' + text.slice(0, 120));
  check('C3c slip doubt + evidence never name the true ' + lie.field,
    !text.includes(lie.truth) && !evText.includes(lie.truth), text.slice(0, 120));
})();

// ============ C4: wrong-lie confession fallback ============
(function () {
  console.log('C4: doubt about confessed lie A + live lie B must not confess B under A\'s banner');
  fresh();
  const ids = Game.npcIds().filter(id => id !== playerId());
  let vid = null;
  for (const id of ids) {
    const l = Game.npcLies(id) || {};
    if (l.occupation && l.origin && !l.occupation.confessed && !l.origin.confessed) { vid = id; break; }
  }
  if (!vid) {
    // force it: give someone both lies
    vid = ids[0];
    const vp = Game.vpOf(vid);
    vp.lies = vp.lies || {};
    if (!vp.lies.occupation) vp.lies.occupation = Game.makeLie(vp, 'occupation', 'shame');
    if (!vp.lies.origin) vp.lies.origin = Game.makeLie(vp, 'origin', 'shame');
  }
  const lies = Game.npcLies(vid);
  setTrust(vid, 10);
  // confess the occupation lie first (via its own doubt); retry — shame+trust 90
  // makes confession near-certain but a bad roll can deflect
  const dOcc = Game.addDoubt(vid, 'contradiction', 'test: occupation contradiction',
    [`said "${lies.occupation.told}" (day 1)`, `now says "something else" (day 2)`]);
  lies.occupation.motive = 'shame';
  setTrust(vid, 90);
  let r1 = null;
  for (let i = 0; i < 8 && !(lies.occupation.confessed); i++) { r1 = Game.confrontDoubt(vid, dOcc.id); say(); }
  check('C4a occupation lie confessed', lies.occupation.confessed === true,
    `outcome=${r1 && r1.outcome}`);
  if (!lies.occupation.confessed) return;
  // now a NEW doubt whose evidence names the occupation cover (stale), while origin stays live
  setTrust(vid, 10);
  const dStale = Game.addDoubt(vid, 'contradiction', 'test: stale occupation contradiction',
    [`said "${lies.occupation.told}" (day 3)`, `now says "another thing" (day 4)`]);
  const r2 = Game.confrontDoubt(vid, dStale.id);
  const log2 = say();
  console.log(`    outcome=${r2.outcome} line: ${String(r2.line).slice(0, 100)}`);
  check('C4b stale doubt resolves as already-confessed, not a fresh confession',
    r2.outcome === 'already-confessed', `outcome=${r2.outcome}`);
  check('C4c the live origin lie was NOT confessed by the stale doubt',
    lies.origin.confessed !== true, 'origin lie got confessed: ' + JSON.stringify(lies.origin.confessed));
})();

// ============ S5: refusal rotation (held) ============
(function () {
  console.log('S5: attacked → 2-day refusal per doubt; rotation bounded, menu recovers');
  fresh();
  // force attacked outcomes: pathological motive, prickly temp, low trust.
  // Fresh doubts each round (evidence weight would otherwise force confessions —
  // the "walls closing in" design working as intended); if the lie confesses,
  // reset it — the refusal mechanics don't care about the lie's history.
  const nowDay = () => (Game.state.scholar || {}).day || 0;
  const hostile = (vid) => {
    const lies = Game.npcLies(vid);
    for (const l of Object.values(lies)) if (l && l.told) l.motive = 'pathological';
    const vp = Game.vpOf(vid); vp.personality = vp.personality || {}; vp.personality.temperament = 'prickly';
    vp.personality.dark = { kind: 'malicious' };
    setTrust(vid, 0);
  };
  let target = liarWithOccLie();
  hostile(target.vid);
  let S5n = 0; // unique doubt texts: addDoubt dedups on (vid, kind, text)
  const forceAttack = () => {
    for (let i = 0; i < 40; i++) {
      if (target.lie.confessed) target.lie.confessed = false; // test reset: fresh liar
      const d = Game.addDoubt(target.vid, 'contradiction', 's5 doubt ' + (S5n++),
        [`said "${target.lie.told}" (day 1)`, 'now says "y" (day 2)'], { field: 'occupation' });
      if (!d) continue;
      const r = Game.confrontDoubt(target.vid, d.id);
      say();
      if (r.outcome === 'attacked') return d;
    }
    return null;
  };
  const dA = forceAttack(), dB = forceAttack();
  check('S5a counter-attacks happened without crash', !!(dA && dB), `dA=${!!dA} dB=${!!dB}`);
  const vid = target.vid;
  const refused = Game.getDoubts(vid).filter(d => d.refusedUntil && nowDay() < d.refusedUntil);
  check('S5b refused doubts are gated per-doubt', refused.length >= 2, `refused=${refused.length}`);
  // direct call during refusal → clean refused, no trust movement
  if (refused.length) {
    const t0 = (Game.state.village.trust || {})[vid];
    const r = Game.confrontDoubt(vid, refused[0].id);
    const t1 = (Game.state.village.trust || {})[vid];
    check('S5c refused confrontation is a clean no-op', r.ok === false && r.outcome === 'refused' && t0 === t1,
      `ok=${r.ok} outcome=${r.outcome} trust ${t0}->${t1}`);
  }
  // menu: no confront choice for refused doubts
  const c = Game.convoGet(vid);
  const wasActive = c.active;
  c.active = true; c.thread = 'talk'; c.pendingQ = null;
  let menuIds = [];
  try { menuIds = Game.convoChoices(vid).map(x => String(x.id)); } catch (e) {}
  c.active = wasActive;
  const refusedIds = refused.map(d => 'confront:' + d.id);
  check('S5d menu hides refused doubts', !menuIds.some(id => refusedIds.includes(id)),
    menuIds.filter(id => id.indexOf('confront:') === 0).join(','));
  // recovery: 3 days later the refusal expires — the filter the menu uses
  // must admit the previously-refused doubts again (the menu only ever
  // offers doubts[0], so assert eligibility, not the exact choice id)
  if (refused.length) {
    Game.state.scholar.day = nowDay() + 3;
    const eligible = Game.getDoubts(target.vid).filter(d => !(d.refusedUntil && ((Game.state.scholar || {}).day || 0) < d.refusedUntil));
    const eligibleIds = eligible.map(d => d.id);
    check('S5e refused doubts become eligible again after the refusal expires',
      refused.every(d => eligibleIds.includes(d.id)),
      'eligible: ' + eligibleIds.join(','));
  }
})();

// ============ H6: real false accusation still stings (held) ============
(function () {
  console.log('H6: contradiction with nothing behind it — the accuser still pays');
  fresh();
  const vid = honestVillager();
  const d = Game.addDoubt(vid, 'contradiction', 'test: contradiction, honest villager',
    ['said "x" (day 1)', 'now says "y" (day 2)']);
  // r12 (2026-10-10): repOf(player) is the unread self-view slot — the cost
  // lands on the hearers' view of the player.
  const hsH = Game.npcIds().filter(id => id !== vid).slice(0, 3);
  const rep0 = hsH.map(h => ((Game.repOf(h) || {}).honest || 0));
  const r = Game.confrontDoubt(vid, d.id);
  const log = say();
  const rep1 = hsH.map(h => ((Game.repOf(h) || {}).honest || 0));
  const gossip = (Game.state.village.gossip || []).filter(g => g.dims && g.dims.who === playerId());
  const mem = (((Game.state.village || {}).memory || {})[vid] || []).filter(m => m.t === 'wrongly_accused');
  console.log(`    outcome=${r.outcome} hearerHonest [${rep0}]->[${rep1}]`);
  check('H6a clears as a real (non-tentative) accusation', r.outcome === 'cleared', r.outcome);
  check('H6b honest rep dented (hearers, read slot)', hsH.some((h, i) => rep1[i] < rep0[i]), `[${rep0}]->[${rep1}]`);
  check('H6c village gossip names the accuser', gossip.length > 0, `${gossip.length}`);
  check('H6d wrongly_accused memory written', mem.length > 0, `${mem.length}`);
  check('H6e aftermath copy owns the accusation', /called .* a liar/i.test((r.afterSay || '') + ' ' + log),
    (r.afterSay || '').slice(0, 120));
})();

// ============ H7: journal occupation label grammar (copy honesty) ============
(function () {
  console.log('H7: "learned what they do" not "what they does"');
  fresh();
  const vid = honestVillager();
  Game.journalLearn(vid, 'occupation', 'baker', { sure: true });
  const log = say();
  console.log('    ' + log.split('\n').filter(l => /learned/.test(l)).join(' ').slice(0, 110));
  check('H7a unnamed villager label is grammatical',
    /learned what they do/.test(log) && !/what they does/.test(log), log.slice(0, 140));
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
