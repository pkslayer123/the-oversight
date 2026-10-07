// PROOF: conversation coherence — said facts, sticky teach skills, honest
// teaching, visible drift, thread lifecycle (2026-10-07).
// Steve's fix-verification chain: seeded PRNG (mulberry32, fixed default,
// SEED env override) so the proof is deterministic. Exits nonzero on failure.
//
// What it proves (before/after):
//   1. TEACH-SKILL STICKINESS: the offer opener, the engage beat, and "show
//      me" all name the SAME skill in one conversation (before: each call
//      re-rolled — offer "finding food", lesson "patching people up"). A
//      resurfaced teach seed names the same skill the next day.
//   2. SAID FACTS: stated claims go on the record (village.saidFacts) —
//      hardstory wound/anchor recorded; the others-topic's grievance history
//      doesn't reshuffle between conversations; convoFactConflict vets.
//   3. VOICE SIGNATURE: register|pace|humor|address is stable across turns
//      and days; drift bends temper, never the signature.
//   4. DRIFT VISIBILITY: when a drift channel crosses >=2, the next
//      conversation shows one short stage-direction beat — once per day,
//      always matching the actual drift state.
//   5. THREAD LIFECYCLE: a hanging thread that gets discussed earns its
//      closing beat at goodbye; re-planting revokes it; >14-day threads
//      lapse (remembered, never silently deleted); circling back to a
//      lapsed topic gets the honest nod; resume openers name how long the
//      thread hung and nod at other hanging threads.
//   6. HONEST TEACHING: lesson quality (trust + warmth - shutdown) decides
//      the speech — poor teaching is hedged/partial ("don't take this as
//      gospel"), recorded with its quality, warming less; the follow-up
//      names what was actually taught.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- seeded PRNG: deterministic proof ----
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261007', 10);
const seededRandom = mulberry32(SEED);
Math.random = seededRandom;

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // eval-phase stub only (equipment.js needs window at load)

const SCRIPTS = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of SCRIPTS) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); process.exit(1); }
}
delete global.window; // sync path for play
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}
function clearDriftCache(vid) { try { delete Game.vpOf(vid).convoDrift; } catch (e) {} }
function withSkillOrigins(vid) {
  const vp = Game.vpOf(vid);
  vp.lifeseed = vp.lifeseed || {};
  vp.lifeseed.skillOrigins = { tracking: "in Mara's kitchen", food: 'haying season at the clinic' };
  return vp;
}
function noSeeds(vid) { try { delete Game.state.village.convoSeeds[vid]; } catch (e) {} }
function quietStart(vid) {
  // startConvo with resume + seed suppressed: deterministic opening.
  noSeeds(vid);
  const orig = Game.convoResumeOpener;
  Game.convoResumeOpener = () => null;
  const st = Game.startConvo(vid);
  Game.convoResumeOpener = orig;
  return st;
}
function cHasSkillName(vid, line) {
  try {
    const s = Game.convoTeachSkill(vid);
    return !!(s && line && line.indexOf(s.name) !== -1);
  } catch (e) { return false; }
}

(async () => {
  await Game.init();
  Game.debugScenario('mootAccused');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  ok('roster non-empty', roster.length >= 6, 'got ' + roster.length);
  v.trust = v.trust || {};
  const day0 = (Game.state.scholar || {}).day || 1;
  console.log(`seed=${SEED} roster=${roster.length} day=${day0}`);

  // ============ 1. TEACH-SKILL STICKINESS ============
  console.log('=== 1. teach skill sticky within a conversation ===');
  const A = roster[0];
  withSkillOrigins(A);
  v.trust[A] = 50;
  quietStart(A);
  const s1 = Game.convoTeachSkillLock(A);
  ok('skill locks', !!s1 && !!s1.key, JSON.stringify(s1));
  const s2 = Game.convoTeachSkill(A);
  const s3 = Game.convoTeachSkill(A);
  ok('lock is sticky: same skill every mention', s2 && s3 && s2.key === s1.key && s3.key === s1.key,
    `${s1 && s1.key} vs ${s2 && s2.key} vs ${s3 && s3.key}`);
  ok('said-fact records the skill story', Game.convoFactRecalled(A, 'skillstory') === s1.key,
    String(Game.convoFactRecalled(A, 'skillstory')));
  Game.endConvo(A, 'natural');
  // A planted teach seed resurfaces with its skill (public path).
  Game.convoPlantSeed(A, { wantId: 'offer_teach', note: 'x', skill: s1.key });
  const wsel = Game.convoSelectWant(A);
  ok('seed resurfaces offer_teach', wsel && wsel.id === 'offer_teach' && wsel.fromSeed, JSON.stringify(wsel && wsel.id));
  ok('seed carries the skill', wsel && wsel.seedSkill === s1.key, String(wsel && wsel.seedSkill));
  noSeeds(A);

  // Full player arc: day 1 the offer names a skill; day 2 the seed
  // resurfaces and the opener + engage name the SAME skill.
  const B = roster[1];
  withSkillOrigins(B);
  v.trust[B] = 50;
  quietStart(B);
  const sb = Game.convoTeachSkillLock(B);
  Game.endConvo(B, 'natural');
  Game.convoPlantSeed(B, { wantId: 'offer_teach', note: 'the ' + sb.name + ' lesson', skill: sb.key });
  Game.state.scholar.day = day0 + 1;
  const stB = Game.startConvo(B); // wrapper surfaces the seed immediately
  const sb2 = Game.convoTeachSkill(B);
  ok('day-2 seed teaches the SAME skill', sb2 && sb2.key === sb.key && sb2.name === sb.name,
    `${sb.key}/${sb.name} -> ${sb2 && sb2.key}/${sb2 && sb2.name}`);
  ok('day-2 seed opener names the skill', stB && stB.line && stB.line.indexOf(sb.name) !== -1,
    String(stB && stB.line).slice(0, 120));
  ok('seed opener is one clean quote (no dangling quote garble)',
    stB && stB.line && !/— " /.test(stB.line) && /^"About /.test(stB.line) && /"$/.test(stB.line),
    String(stB && stB.line).slice(0, 120));
  const cB = Game.convoGet(B);
  const engageLine = cB.want.def.engage.call(Game, B);
  // The engage names the skill by name or by its origin phrase — and never
  // the OTHER skill's name/origin (no contradiction).
  const otherKey = sb.key === 'tracking' ? 'food' : 'tracking';
  const otherName = otherKey === 'tracking' ? 'reading ground' : 'finding food';
  const otherOrigin = otherKey === 'tracking' ? "in Mara's kitchen" : 'haying season at the clinic';
  ok('day-2 engage names the seed skill (name or origin)',
    engageLine && (engageLine.indexOf(sb.name) !== -1 || engageLine.indexOf(sb.origin) !== -1),
    String(engageLine).slice(0, 110));
  ok('day-2 engage never names the other skill',
    engageLine && engageLine.indexOf(otherName) === -1 && engageLine.indexOf(otherOrigin) === -1,
    String(engageLine).slice(0, 110));
  Game.endConvo(B, 'natural');
  Game.state.scholar.day = day0;

  // ============ 2. SAID FACTS ============
  console.log('=== 2. said facts: record, recall, conflict ===');
  const C = roster[2];
  ok('record returns true', Game.convoSaidFact(C, 'hometown', 'Portland') === true);
  ok('recall returns the value', Game.convoFactRecalled(C, 'hometown') === 'Portland');
  ok('no conflict on same value', Game.convoFactConflict(C, 'hometown', 'Portland') === false);
  ok('conflict on different value', Game.convoFactConflict(C, 'hometown', 'Bangor') === true);
  ok('no conflict on unrecorded key', Game.convoFactConflict(C, 'never_said', 'x') === false);
  ok('recall null on unrecorded key', Game.convoFactRecalled(C, 'never_said') === null);

  // Hardstory: wound + anchor go on the record verbatim.
  const D = roster[3];
  const vpD = Game.vpOf(D);
  vpD.lifeseed = vpD.lifeseed || {};
  vpD.lifeseed.wound = 'Marcus left Anna in the snow';
  try { Game.recordLifeseedEvent(vpD, { kind: 'death_of_kin', subject: 'Testkin', day: day0 }); } catch (e) {}
  const hs = Game.t2gen_hardstory(D);
  ok('hardstory generates', Array.isArray(hs) && hs.length > 0, String(hs && hs.length));
  const recWound = Game.convoFactRecalled(D, 'hardstory:wound');
  ok('hardstory wound on record', typeof recWound === 'string' && recWound.length > 0, String(recWound));
  const recAnchor = Game.convoFactRecalled(D, 'hardstory:anchor');
  ok('hardstory anchor on record', recAnchor === 'Since Testkin died', String(recAnchor));

  // Others: the grievance history doesn't reshuffle between conversations.
  const E = roster[4], Eo = roster[5];
  v.conflicts = v.conflicts || [];
  v.conflicts.push({ a: E, b: Eo, resolved: false, history: ['stole my winter stores'] });
  const g1 = Game.t2gen_others(E);
  ok('grievance line names the history', g1.some(l => l.indexOf('stole my winter stores') !== -1),
    g1.join(' / ').slice(0, 120));
  ok('grievance history on record', Game.convoFactRecalled(E, 'otherhist:' + Eo) === 'stole my winter stores',
    String(Game.convoFactRecalled(E, 'otherhist:' + Eo)));
  // Next conversation: even if the conflict history array is reordered,
  // the recorded claim wins — same story, not a new past.
  const cf = v.conflicts.find(x => x.a === E && x.b === Eo);
  cf.history = ['burned my letters', 'stole my winter stores'];
  const g2 = Game.t2gen_others(E);
  ok('grievance history stable across conversations', g2.some(l => l.indexOf('stole my winter stores') !== -1),
    g2.join(' / ').slice(0, 120));
  v.conflicts = v.conflicts.filter(x => !(x.a === E && x.b === Eo));

  // ============ 3. VOICE SIGNATURE STABILITY ============
  console.log('=== 3. voice signature stable across days ===');
  const F = roster[0];
  clearDriftCache(F);
  const sig0 = Game.convoVoiceSig(F);
  ok('voice sig well-formed', /^\S+\|\S+\|\S+\|\S+$/.test(sig0), sig0);
  Game.state.scholar.day = day0 + 2;
  const sig2 = Game.convoVoiceSig(F);
  Game.remember(F, 'loss', 'proof-test loss');
  Game.remember(F, 'mourned', 'proof-test mourned');
  clearDriftCache(F);
  Game.state.scholar.day = day0 + 4;
  const sig4 = Game.convoVoiceSig(F);
  ok('sig stable across days AND drift', sig0 === sig2 && sig2 === sig4, `${sig0} / ${sig2} / ${sig4}`);
  ok('drift still bends the temper', Game.convoDriftedTemper(F) === 'withdrawn', Game.convoDriftedTemper(F));
  Game.state.scholar.day = day0;

  // ============ 4. DRIFT VISIBILITY ============
  console.log('=== 4. drift note: once a day, matches the state ===');
  const G = roster[1];
  clearDriftCache(G);
  try { delete Game.vpOf(G).convoDriftNoted; } catch (e) {}
  const n0 = Game.convoDriftNote(G);
  ok('no note for the undrifted', n0 === null, String(n0));
  Game.remember(G, 'loss', 'proof-test loss');
  Game.remember(G, 'mourned', 'proof-test mourned');
  clearDriftCache(G);
  const n1 = Game.convoDriftNote(G);
  const gname = (Game.displayName(G) || 'they').split(' ')[0];
  ok('note fires on grief crossing', typeof n1 === 'string' && n1.indexOf(gname) === 0 && /hollowed out/.test(n1), String(n1));
  const n1b = Game.convoDriftNote(G);
  ok('note fires once per day', n1b === null, String(n1b));
  Game.state.scholar.day = day0 + 1;
  clearDriftCache(G);
  const n2 = Game.convoDriftNote(G);
  ok('no re-fire without new crossing', n2 === null, String(n2));
  Game.remember(G, 'promise_broken', 'proof-test betrayal');
  Game.remember(G, 'theft_victim', 'proof-test theft');
  clearDriftCache(G);
  const n3 = Game.convoDriftNote(G);
  ok('new channel crossing fires its own note', typeof n3 === 'string' && /edge today/.test(n3), String(n3));
  Game.state.scholar.day = day0;

  // ============ 5. THREAD LIFECYCLE ============
  console.log('=== 5. thread lifecycle: close, lapse, honest resume ===');
  const H = roster[2];
  Game.convoThreadOpen(H, 'personal', 'themselves', 'walked away mid-thread');
  const cH = Game.convoGet(H); cH.count = (cH.count || 0) + 1;
  Game.convoNoteTopic(H, 'personal', 'themselves');
  const closeLine = Game.convoCloseLine(H);
  ok('close line offered once', typeof closeLine === 'string' && /settled/.test(closeLine), String(closeLine));
  ok('close line consumed', Game.convoCloseLine(H) === null);
  ok('close line is grammatical (no "themselves")', typeof closeLine === 'string' && /your story/.test(closeLine) && !/themselves/.test(closeLine),
    String(closeLine));
  // Re-plant revokes: walked away AGAIN is not "settled".
  Game.convoThreadOpen(H, 'village', 'the village', 'walked away mid-thread');
  Game.convoNoteTopic(H, 'village', 'the village');
  Game.convoThreadOpen(H, 'village', 'the village', 'walked away mid-thread');
  ok('re-plant revokes the closing beat', Game.convoCloseLine(H) === null);

  // Lapse: a 15-day-old thread is remembered, not deleted.
  const I = roster[3];
  Game.convoThreadOpen(I, 'goal', 'what they want', 'unfinished business');
  let LI = Game.convoTopicLedger(I);
  LI.open.find(o => o.tid === 'goal').day = day0 - 15;
  LI = Game.convoTopicLedger(I);
  ok('15-day thread lapses (remembered)', LI.lapsed.some(o => o.tid === 'goal'), JSON.stringify(LI.lapsed.map(o => o.tid)));
  ok('lapsed thread leaves the open list', !LI.open.some(o => o.tid === 'goal'));
  const realRandom = Math.random;
  Math.random = () => 0.1; // force under the 0.65 resume gate
  v.trust[I] = 40;
  const rsLapsed = Game.convoResumeOpener(I);
  Math.random = realRandom;
  ok('resume never resurrects a lapsed thread', rsLapsed === null, String(rsLapsed && rsLapsed.line));
  const cI = Game.convoGet(I); cI.count = (cI.count || 0) + 1;
  Game.convoNoteTopic(I, 'goal', 'what they want');
  const lapseLine = Game.convoLapseLine(I);
  ok('lapse line is honest, not a fresh start', typeof lapseLine === 'string' && /left .* hanging/i.test(lapseLine) && /circled back/i.test(lapseLine),
    String(lapseLine));

  // Resume time-honesty: a 10-day-old thread is not "last time".
  const J = roster[4];
  v.trust[J] = 40;
  Game.convoThreadOpen(J, 'personal', 'themselves', 'walked away mid-thread');
  const LJ = Game.convoTopicLedger(J);
  LJ.open.find(o => o.tid === 'personal').day = day0 - 10;
  Math.random = () => 0.1;
  const rsOld = Game.convoResumeOpener(J);
  Math.random = realRandom;
  ok('old resume names the gap', !!rsOld && /10 days back/.test(rsOld.line) && !/last time/.test(rsOld.line),
    String(rsOld && rsOld.line).slice(0, 110));

  // Multi-thread awareness: the other hanging thread gets its nod.
  const K = roster[5];
  v.trust[K] = 40;
  Game.convoThreadOpen(K, 'personal', 'themselves', 'walked away mid-thread');
  Game.convoThreadOpen(K, 'village', 'the village', 'changed the subject');
  Math.random = () => 0.1; // gate passes, picks index 0, mention gate passes
  const rsMulti = Game.convoResumeOpener(K);
  Math.random = realRandom;
  ok('resume nods at the other hanging thread',
    !!rsMulti && /still owe the village a proper ending/.test(rsMulti.line) && !/themselves talk/.test(rsMulti.line),
    String(rsMulti && rsMulti.line).slice(0, 150));

  // endConvo integration: the close beat lands in the transcript at goodbye.
  const M = roster[0];
  v.trust[M] = 40;
  quietStart(M);
  Game.convoThreadOpen(M, 'personal', 'themselves', 'walked away mid-thread');
  Game.convoNoteTopic(M, 'personal', 'themselves');
  Game.convoGet(M).thread = 'small'; // opener thread: nothing to re-plant
  const er = Game.endConvo(M, 'natural');
  const tx = (er.transcript || []).map(t => t.text).join('\n');
  ok('close beat lands at goodbye', /settled/.test(tx), tx.slice(-160));

  // ============ 6. HONEST TEACHING ============
  console.log('=== 6. honest teaching: quality decides the speech ===');
  // GOOD teacher: high trust + warm moment, no shutdown -> full lesson.
  const T = roster[1];
  withSkillOrigins(T);
  v.trust[T] = 70;
  v.memory[T] = []; // clean slate: no drift penalty
  try { Game.vpOf(T).lifeseed.lived = []; } catch (e) {}
  clearDriftCache(T);
  try { delete Game.vpOf(T).convoDriftNoted; } catch (e) {}
  quietStart(T);
  Game.convoMoodShift(T, 2); // warm the moment
  const trustBefore = v.trust[T] || 70;
  const lr = Game.convoTurn(T, 'dlg:learn');
  const taught = (v.taughtBy[Game.villagerId] || []).filter(e => e.by === T).pop();
  ok('good lesson teaches the sticky skill', lr && lr.line && /Mara's kitchen|reading ground|finding food|haying season/.test(lr.line),
    String(lr && lr.line).slice(0, 110));
  ok('good lesson recorded with quality', taught && taught.quality >= 2, JSON.stringify(taught));
  ok('good lesson warms (+3 trust)', (v.trust[T] || 0) >= trustBefore + 2, `${trustBefore} -> ${v.trust[T]}`);
  const lr2 = Game.convoTurn(T, 'dlg:learn');
  ok('follow-up names what was taught', lr2 && lr2.line && /for now/.test(lr2.line) && cHasSkillName(T, lr2.line),
    String(lr2 && lr2.line).slice(0, 110));
  Game.endConvo(T, 'natural');

  // POOR teacher: low trust + shut down by grief -> hedged partial.
  const P = roster[2];
  withSkillOrigins(P);
  v.trust[P] = 10;
  Game.remember(P, 'loss', 'proof-test loss');
  Game.remember(P, 'mourned', 'proof-test mourned');
  clearDriftCache(P);
  try { delete Game.vpOf(P).convoDriftNoted; } catch (e) {}
  quietStart(P);
  ok('poor teacher is shut down', Game.convoDriftedTemper(P) === 'withdrawn', Game.convoDriftedTemper(P));
  const pTrustBefore = v.trust[P] || 10;
  const pr = Game.convoTurn(P, 'dlg:learn');
  const ptaught = (v.taughtBy[Game.villagerId] || []).filter(e => e.by === P).pop();
  ok('poor lesson is hedged', pr && pr.line && /rough shape|gospel/.test(pr.line),
    String(pr && pr.line).slice(0, 130));
  ok('poor lesson recorded with low quality', ptaught && ptaught.quality <= 1, JSON.stringify(ptaught));
  ok('poor lesson warms less', (v.trust[P] || 0) <= pTrustBefore + 1, `${pTrustBefore} -> ${v.trust[P]}`);
  ok('poor lesson still names the sticky skill (partial, not nothing)',
    pr && pr.line && /reading ground|finding food/.test(pr.line), String(pr && pr.line).slice(0, 130));
  Game.endConvo(P, 'natural');

  // The lesson is on the record — no take-backs.
  const tskill = Game.convoFactRecalled(T, 'skillstory');
  ok('lesson on the record', Game.convoFactRecalled(T, 'taught:' + tskill) === 'shown',
    `${tskill} -> ${Game.convoFactRecalled(T, 'taught:' + tskill)}`);

  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
