// PROOF: conversation depth — topic ledger, drift, speech DNA, recap (2026-10-07).
// Steve's fix-verification chain: seeded PRNG (mulberry32, fixed default,
// SEED env override) so the proof is deterministic. Exits nonzero on failure.
//
// What it proves (before/after):
//   1. A villager who lived through death/betrayal DRIFTS: voiceMods gains
//      haunted/embittered, driftedTemper bends, and their speech markers
//      change vs a fresh stranger.
//   2. Topics persist across turns AND conversations: the ledger records what
//      was discussed; walking away mid-thread plants an open thread; the next
//      conversation can resume it ("we never finished talking about X");
//      discussing it resolves it.
//   3. Subject changes plant open threads; the recap verb re-anchors long
//      exchanges from the thread log.
//   4. Speech DNA: discourse markers derive from the lifeseed register —
//      two villagers with different registers get different markers; skill
//      origin lines come from their seed ("who taught them").
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

(async () => {
  await Game.init();
  Game.debugScenario('mootAccused');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  ok('roster non-empty', roster.length >= 6, 'got ' + roster.length);
  v.trust = v.trust || {};
  console.log(`seed=${SEED} roster=${roster.length}`);

  // ============ 1. DRIFT: lived events bend the person ============
  console.log('=== 1. drift from lived events ===');
  const A = roster[0], B = roster[1];
  const d0 = Game.convoDrift(A);
  ok('fresh drift vector exists', d0 && typeof d0.grief === 'number',
    JSON.stringify(d0));
  ok('fresh villager undrifted', (d0.grief + d0.bitterness + d0.wariness + d0.warmth + d0.hardness) === 0,
    JSON.stringify(d0));
  const modsBefore = Game.voiceMods(A).slice();
  ok('no drift voice states before', modsBefore.indexOf('haunted') === -1 && modsBefore.indexOf('embittered') === -1,
    modsBefore.join(','));

  // AFTER: A lives through death and betrayal.
  Game.remember(A, 'promise_broken', 'proof-test betrayal');
  Game.remember(A, 'caught_you_stealing', 'proof-test theft accusation');
  Game.remember(A, 'loss', 'proof-test loss');
  try { Game.recordLifeseedEvent(Game.vpOf(A), { kind: 'death_of_kin', subject: 'Testkin', day: Game.state.scholar.day }); } catch (e) {}
  clearDriftCache(A);
  const d1 = Game.convoDrift(A);
  ok('grief drifted up', d1.grief >= 2, 'grief=' + d1.grief);
  ok('bitterness drifted up', d1.bitterness >= 2, 'bitterness=' + d1.bitterness);
  const modsAfter = Game.voiceMods(A);
  ok('voiceMods gains haunted', modsAfter.indexOf('haunted') !== -1, modsAfter.join(','));
  ok('voiceMods gains embittered', modsAfter.indexOf('embittered') !== -1, modsAfter.join(','));
  const dt = Game.convoDriftedTemper(A);
  ok('drifted temper bends (grief->withdrawn)', dt === 'withdrawn', 'got ' + dt);
  // npcTemper itself is untouched — sibling systems keep the authority.
  ok('npcTemper still authoritative', typeof Game.npcTemper(A) === 'string');

  // They SPEAK differently: drift markers appear in voiced lines.
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const out = Game.voiceLine(A, '"We should keep moving."');
    if (out !== '"We should keep moving."') seen.add(out);
  }
  const driftHit = [...seen].some(o => o.indexOf('…sorry.') !== -1 || o.indexOf('Hah. ') !== -1 || o.indexOf('Or something.') !== -1);
  ok('drift markers surface in speech', driftHit, [...seen].slice(0, 3).join(' | '));
  // The stranger (B) has no drift states.
  clearDriftCache(B);
  const modsB = Game.voiceMods(B);
  ok('stranger has no drift states', ['haunted', 'embittered', 'guarded', 'softened', 'hardened'].every(s => modsB.indexOf(s) === -1),
    modsB.join(','));

  // ============ 2. TOPIC LEDGER across turns ============
  console.log('=== 2. topic ledger: discussed, planted, resumed, resolved ===');
  const C = roster[2];
  v.trust[C] = 40;
  // ensure the personal topic has lines so the thread opens
  const vpC = Game.vpOf(C);
  if (!vpC.talk || !vpC.talk.length) vpC.talk = ['"I grew up mending nets. Hands learned it young."'];
  let st = Game.startConvo(C);
  ok('convo starts', st && !st.ended, String(st && st.line).slice(0, 60));
  let r = Game.convoTurn(C, 'ask:personal');
  ok('personal turn lands', r && !r.ended, String(r && r.line).slice(0, 60));
  const L = Game.convoTopicLedger(C);
  ok('personal noted as discussed', (L.discussed.personal || {}).times >= 1,
    JSON.stringify(Object.keys(L.discussed)));
  // recap re-anchors
  r = Game.convoTurn(C, 'recap');
  ok('recap names the topic', r && /themselves/i.test(r.line || ''), String(r && r.line).slice(0, 90));
  // walk away mid-thread -> open thread planted
  r = Game.convoTurn(C, 'leave');
  ok('leave ends convo', r && r.ended === true);
  const open1 = Game.convoOpenThreads(C);
  ok('open thread planted on walk-away', open1.some(o => o.tid === 'personal'),
    JSON.stringify(open1.map(o => o.tid + ':' + o.why)));
  // resume opener names the unfinished topic (whatever is open)
  const realRandom = Math.random;
  Math.random = () => 0.1; // force under the 0.65 resume gate
  const rs = Game.convoResumeOpener(C);
  Math.random = realRandom;
  ok('resume opener offered', !!rs, String(rs && rs.line).slice(0, 80));
  const rsOpen = open1.find(o => o.tid === (rs && rs.thread));
  ok('resume names the open topic', !!rsOpen && new RegExp(rsOpen.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(rs.line || ''),
    String(rs && rs.line).slice(0, 80));
  ok('resume carries the thread', !!rs && rs.thread === rsOpen.tid);
  // startConvo wiring: a resume becomes the opener, and discussing it resolves it.
  // Clear the sibling want-seed first: seeds (convo-wants.js) take opener
  // precedence by design — the resume is the fallback when no seed fires.
  try { delete Game.state.village.convoSeeds[C]; } catch (e) {}
  const resumeTid = rs.thread, resumeLabel = rsOpen.label;
  const origResume = Game.convoResumeOpener;
  Game.convoResumeOpener = () => ({ line: '"RESUME-PROOF."', thread: resumeTid });
  st = Game.startConvo(C);
  Game.convoResumeOpener = origResume;
  ok('startConvo uses resume opener', st && st.line === '"RESUME-PROOF."', String(st && st.line).slice(0, 60));
  ok('resumed thread marked discussed', (Game.convoTopicLedger(C).discussed[resumeTid] || {}).times >= 1);
  ok('resumed thread resolved from open', !Game.convoOpenThreads(C).some(o => o.tid === resumeTid),
    JSON.stringify(Game.convoOpenThreads(C).map(o => o.tid)));
  Game.endConvo(C, 'natural');

  // ============ 3. subject change plants open; dedupe holds ============
  console.log('=== 3. subject change + dedupe ===');
  const D = roster[3];
  v.trust[D] = 40;
  const vpD = Game.vpOf(D);
  if (!vpD.talk || !vpD.talk.length) vpD.talk = ['"I grew up mending nets. Hands learned it young."'];
  Game.startConvo(D);
  Game.convoTurn(D, 'ask:personal');
  Game.convoTurn(D, 'ask:village'); // subject change: personal -> village
  const openD = Game.convoOpenThreads(D);
  ok('subject change plants old thread', openD.some(o => o.tid === 'personal' && o.why === 'changed the subject'),
    JSON.stringify(openD.map(o => o.tid + ':' + o.why)));
  // dedupe: noting the same beat twice logs once
  const cD = Game.convoGet(D);
  const n0 = cD.threadLog.length;
  Game.convoNoteBeat(D, 'village', '"same line"');
  Game.convoNoteBeat(D, 'village', '"same line"');
  ok('consecutive duplicate beats collapse', cD.threadLog.length === n0 + 1,
    `log ${n0} -> ${cD.threadLog.length}`);
  Game.endConvo(D, 'natural');

  // ============ 4. SPEECH DNA from backstory ============
  console.log('=== 4. speech DNA ===');
  // registers are RNG-drawn per roster: assert on whatever registers exist
  const regs = {};
  for (const id of roster) {
    try { const r = Game.convoSpeechDNA(id).register; (regs[r] = regs[r] || []).push(id); } catch (e) {}
  }
  const regNames = Object.keys(regs);
  ok('roster has 2+ distinct registers', regNames.length >= 2, regNames.join(','));
  if (regNames.length >= 2) {
    const [r1, r2] = regNames;
    const m1 = Game.convoSpeechMarkers(regs[r1][0]), m2 = Game.convoSpeechMarkers(regs[r2][0]);
    ok('different registers -> different markers', JSON.stringify(m1) !== JSON.stringify(m2), r1 + ' vs ' + r2);
    const KNOWN = { laconic: ' Hm.', plainspoken: ' Simple as that.', effusive: 'Oh! ', wry: 'Well — ', formal: 'If I may — ', halting: 'I… ' };
    for (const rn of regNames) {
      if (!KNOWN[rn]) continue;
      const mk = Game.convoSpeechMarkers(regs[rn][0]);
      const all = (mk.open || []).concat(mk.close || []);
      ok(`register '${rn}' carries its marker`, all.some(x => x.indexOf(KNOWN[rn]) !== -1), all.join('/'));
    }
  }
  // DNA markers flow through voiceLine under the one-marker restraint.
  // (Letter-bearing markers only: single-punctuation markers like '.' also
  // match the sentence's own period, which would false-positive the count.)
  const E = (regNames.length ? regs[regNames[0]][0] : roster[4]);
  const dnaM = Game.convoSpeechMarkers(E);
  const markerPool = ((dnaM.open || []).concat(dnaM.close || [])).filter(mk => mk && /[a-zA-Z]/.test(mk));
  const stripOneMarker = (out) => {
    const sorted = markerPool.slice().sort((a, b) => b.length - a.length);
    for (const mk of sorted) {
      const i = out.indexOf(mk);
      if (i !== -1) return out.slice(0, i) + out.slice(i + mk.length);
    }
    return out;
  };
  const BASEL = '"We move at dawn."';
  let dnaHit = false, restraintOk = true;
  for (let i = 0; i < 80; i++) {
    const out = Game.voiceLine(E, BASEL);
    if (out === BASEL) continue;
    dnaHit = true;
    const rest = stripOneMarker(out);
    if (markerPool.some(mk => rest.indexOf(mk) !== -1)) { restraintOk = false; break; }
  }
  ok('DNA markers surface via voiceLine', dnaHit);
  ok('restraint holds: never two markers on one line', restraintOk);
  // skill origin line: who taught THEM, from the seed
  const F = roster.find(id => { try { return Object.keys((Game.convoSpeechDNA(id) || {}).skillOrigins || {}).length > 0; } catch (e) { return false; } });
  if (F) {
    const sol = Game.convoSkillOriginLine(F);
    ok('skill origin line from seed', typeof sol === 'string' && /^"/.test(sol) && /learn|taught|came from/i.test(sol),
      String(sol).slice(0, 90));
  } else {
    ok('roster has a villager with skill origins', false, 'none found');
  }
  // DNA carries the drifted temper read
  const dnaA = Game.convoSpeechDNA(A);
  ok('DNA reports drifted temper', dnaA.driftedTemper === 'withdrawn', dnaA.driftedTemper + ' / base ' + dnaA.temperament);

  // ============ 5. long-exchange recap ============
  console.log('=== 5. recap over a long exchange ===');
  const G = roster[5];
  v.trust[G] = 40;
  const vpG = Game.vpOf(G);
  if (!vpG.talk || !vpG.talk.length) vpG.talk = ['"I grew up mending nets. Hands learned it young."'];
  Game.startConvo(G);
  Game.convoTurn(G, 'ask:personal');
  Game.convoTurn(G, 'ask:village');
  const recap = Game.convoRecapLine(G);
  ok('recap names the arc', /themselves/i.test(recap) && /the village/i.test(recap),
    recap.slice(0, 110));
  const rc = Game.convoRecapChoice(G);
  ok('recap choice object well-formed', rc && rc.id === 'recap' && typeof rc.label === 'string');
  Game.endConvo(G, 'natural');

  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
