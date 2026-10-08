// Detective archetype feel playtest — 2026-10-08 run.
// Questions this run:
//   A. Pacing: on what day does the first doubt land, across seeds?
//   B. Confrontation economics: is confronting EVERYONE (guilty + innocent)
//      a dominant strategy? Is there any cost to a false accusation?
//   C. Doubt rot: a doubt left alone for 14 days — lingers? staleness? cold case?
//   D. Gossip-first leads: doubt with no claim on file — can you hear their
//      story then confront, and does the lead connect to the confrontation?
//   E. UI path: confront: choice via convoChoices → convoTurn (real player path).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// seeded PRNG (mulberry32) — deterministic, reproducible.
// ONE shared function object, resettable: modules that capture
// `const R = Math.random` at load time keep pointing at this same object,
// so reseeding via reset() stays deterministic for them too.
function makeSharedRng() {
  let a = 1 >>> 0;
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.reset = (seed) => { a = seed >>> 0; };
  return f;
}
const sharedRng = makeSharedRng();

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js load-time need; deleted before play
// SEED BEFORE EVAL: several modules capture `const R = Math.random` at load
// time (betrayal, corpses, justice, lifeseed...). Seeding after eval leaves
// those on the unseeded builtin and the run is non-deterministic.
Math.random = sharedRng;
sharedRng.reset(parseInt(process.env.SEED || '20261008', 10));
const files = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .match(/src\/js\/[^"]*\.js/g)
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
const seen = new Set();
for (const f of files) { if (seen.has(f)) continue; seen.add(f); eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
delete global.window;
const Game = globalThis.Scattering.Game;

const name = (vid) => { try { return Game.displayName(vid); } catch (e) { return vid; } };
const trustOf = (vid) => ((Game.state.village.trust || {})[vid]) || 10;

function newSession(seed) {
  sharedRng.reset(seed);
  const p = Game.init();
  return p.then(() => {
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
  });
}

function interviewAll(roster) {
  for (const vid of roster) {
    Game.startConvo(vid);
    try { Game.convoAskTopic(vid, 'past'); } catch (e) {}
    try { Game.convoAskTopic(vid, 'goal'); } catch (e) {}
    try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
  }
}

function gossipRound(roster, n) {
  for (let i = 0; i < n; i++) {
    const vid = roster[Math.floor(Math.random() * roster.length)];
    Game.startConvo(vid);
    try { Game.convoAskTopic(vid, 'gossip'); } catch (e) {}
    try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
  }
}

function advanceDay(roster) {
  // burn the day: sleep to next morning via day engine
  try { Game.endDay && Game.endDay(); } catch (e) {}
  try { Game.newDay && Game.newDay(); } catch (e) {}
}

// ============ EXPERIMENT A: pacing — first doubt day across seeds ============
async function expPacing() {
  const firstDays = [];
  for (const seed of [101, 102, 103, 104, 105]) {
    await newSession(seed);
    const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
    let firstDay = null;
    for (let d = 0; d < 10 && firstDay === null; d++) {
      interviewAll(roster);
      gossipRound(roster, 6);
      if (Game.allDoubts(false).length > 0) firstDay = Game.state.scholar.day;
      advanceDay(roster);
    }
    firstDays.push(firstDay);
  }
  return firstDays;
}

// ============ EXPERIMENT B: confrontation economics ============
// Play: interview everyone day 1-3, confront EVERY open doubt via UI path,
// including doubts about people who are innocent. Track trust deltas.
async function expConfrontEconomics() {
  await newSession(202);
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const startTrust = {}; roster.forEach(v => startTrust[v] = trustOf(v));
  const outcomeCount = {};
  const wrongAccused = [];
  for (let d = 0; d < 3; d++) {
    interviewAll(roster);
    gossipRound(roster, 8);
    // confront every open doubt through the UI choice path
    for (const doubt of Game.allDoubts(false)) {
      const vid = doubt.vid;
      const lies = Game.npcLies(vid) || {};
      const hasLiveLie = Object.values(lies).some(l => l && l.told && !l.confessed);
      Game.startConvo(vid);
      let choices = [];
      try { choices = Game.convoChoices(vid) || []; } catch (e) {}
      const cc = choices.find(c => c && c.id && String(c.id).startsWith('confront:'));
      let res = { outcome: 'no-ui-choice' };
      if (cc) {
        // convoTurn returns {line, choices, ended, transcript}; the outcome
        // lives in the doubt record it just resolved.
        const doubtId = cc.id.slice('confront:'.length);
        try { Game.convoTurn(vid, cc.id); } catch (e) { res = { outcome: 'error:' + e.message }; }
        if (!res.outcome.startsWith('error')) {
          const d = (Game.state.codex.doubts || []).find(x => x.id === doubtId);
          res = { outcome: d && d.resolved ? ('resolved:' + d.resolution) : 'open(deflected|attacked)' };
        }
      } else {
        // fall back to direct (records UI-path gap)
        try { res = Game.confrontDoubt(vid, doubt.id); } catch (e) { res = { outcome: 'error:' + e.message }; }
      }
      try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
      outcomeCount[res.outcome] = (outcomeCount[res.outcome] || 0) + 1;
      if (!hasLiveLie && res.outcome !== 'no-ui-choice') wrongAccused.push({ vid: name(vid), outcome: res.outcome });
    }
    advanceDay(roster);
  }
  const trustDelta = {};
  for (const v of roster) trustDelta[name(v)] = trustOf(v) - startTrust[v];
  return { outcomeCount, wrongAccused, trustDelta, openDoubts: Game.allDoubts(false).length };
}

// ============ EXPERIMENT C: doubt rot ============
// Form doubts, then ignore them for 14 days. Do they linger? Any staleness?
async function expDoubtRot() {
  await newSession(303);
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  interviewAll(roster); gossipRound(roster, 10);
  const formed = Game.allDoubts(false).length;
  const formedDay = Game.state.scholar.day;
  for (let d = 0; d < 14; d++) { advanceDay(roster); }
  const open = Game.allDoubts(false);
  // then confront them all: do ancient doubts still resolve / matter?
  const staleResults = [];
  for (const doubt of open) {
    const r = Game.confrontDoubt(doubt.vid, doubt.id);
    staleResults.push({ age: Game.state.scholar.day - doubt.day, outcome: r.outcome });
  }
  return { formed, formedDay, openAfter14d: open.length, staleResults };
}

// ============ EXPERIMENT D: gossip-first lead connection ============
// Find a 'gossip' doubt with no claim on file (lead). Then interview the
// target ('past' → trackClaimSilent path) and see whether confronting the
// SAME doubt after hearing their story works.
async function expLeadConnection() {
  await newSession(404);
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  let lead = null, tries = 0;
  while (!lead && tries < 30) {
    tries++;
    gossipRound(roster, 4);
    lead = Game.allDoubts(false).find(d => d.kind === 'gossip' &&
      d.evidence.some(e => String(e).includes("haven't heard")));
  }
  if (!lead) return { found: false };
  const vid = lead.vid;
  const claimsBefore = (Game.getClaims(vid, 'occupation') || []).length + (Game.getClaims(vid, 'origin') || []).length;
  // go hear their story
  Game.startConvo(vid);
  try { Game.convoAskTopic(vid, 'past'); } catch (e) {}
  try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
  const claimsAfter = (Game.getClaims(vid, 'occupation') || []).length + (Game.getClaims(vid, 'origin') || []).length;
  const stillOpen = Game.allDoubts(false).some(d => d.id === lead.id);
  // now confront the lead doubt — does it connect to the lie machinery?
  const res = Game.confrontDoubt(vid, lead.id);
  const lies = Game.npcLies(vid) || {};
  const hasLiveLie = Object.values(lies).some(l => l && l.told && !l.confessed);
  return {
    found: true, target: name(vid), claimsBefore, claimsAfter,
    doubtStillOpenAfterHearing: stillOpen,
    confrontOutcome: res.outcome, hadLiveLie: hasLiveLie,
    line: String(res.line || '').slice(0, 140),
  };
}

(async () => {
  console.log('=== A. first-doubt day across 5 seeds ===');
  console.log(JSON.stringify(await expPacing()));
  console.log('=== B. confront-everything economics ===');
  const B = await expConfrontEconomics();
  console.log('outcomes:', JSON.stringify(B.outcomeCount));
  console.log('wrongly accused (no live lie):', JSON.stringify(B.wrongAccused.slice(0, 8)));
  const deltas = Object.entries(B.trustDelta).sort((a, b) => b[1] - a[1]);
  console.log('top trust deltas:', JSON.stringify(deltas.slice(0, 6)));
  console.log('bottom trust deltas:', JSON.stringify(deltas.slice(-6)));
  console.log('open doubts left:', B.openDoubts);
  console.log('=== C. doubt rot (14 ignored days) ===');
  console.log(JSON.stringify(await expDoubtRot(), null, 1));
  console.log('=== D. gossip-first lead → hear story → confront ===');
  console.log(JSON.stringify(await expLeadConnection(), null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
