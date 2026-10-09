// Break-it alien-players r4: duel / interference / contact / affinity /
// group-rate / knowledge paths / wren / feeding / save-load (A,B,C,D,H,J,K,L,M).
const H = require('./break-alien-harness.js');
const assert = require('assert');
const fs = require('fs'), path = require('path');
// contestEngine.js is in index.html but not in the shared harness's eval
// list (pre-existing gap); eval it here for _cxCaseScore (B).
eval(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'contestEngine.js'), 'utf8'));
let N = 0;
function ok(c, m) { N++; assert(c, m); console.log('ok ' + N + ' - ' + m); }
// Wave-2 eligibility (pass-3 setup): alien systems gate on systemArrived +
// unlockedWave() >= 2. fresh() alone leaves wave 1 -> silent early-returns.
const _rawFresh = H.fresh.bind(H);
function setup(day) {
  const s = _rawFresh(day);
  H.Game.state.waveKills = { 1: 10 };
  H.Game.isSafeTile = () => false;
  H.Game.apReadinessCheck = () => ({ ready: true, score: 999, reasons: ['test'] });
  return s;
}
const realRandom = Math.random;
function forceRoll(v) { Math.random = () => v; }
function unforce() { Math.random = realRandom; }
const SRC = path.join(__dirname, '..', 'src', 'js');

(async () => {
  await H.boot();
  const seeds = [20261009, 777, 4242];

  // ============ A. DUEL ============
  for (const seed of seeds) {
    H.RNG.reset(seed);
    const s = setup(30); const G = H.Game; const ap = G.apState();
    ap.active = { vex_marlowe: {}, countess_sable: {}, pip_quindle: {} };
    ap.lastDuelDay = -999;
    let fired = false, guard = 0, before = Object.keys(G.apActive()).length;
    while (!fired && guard++ < 500) { ap.lastDuelDay = -999; fired = G.apPlaygroundDuel(); }
    ok(fired, `seed ${seed}: duel fires with 3 active aliens`);
    const afterKeys = Object.keys(G.apActive());
    ok(before - afterKeys.length <= 1, `seed ${seed}: duel is 1v1 — at most one alien leaves (${before} -> ${afterKeys.length})`);
    ok(ap.lastDuelDay === s.day, `seed ${seed}: lastDuelDay recorded on fire`);
    ok(G.apPlaygroundDuel() === false, `seed ${seed}: 10-day gate blocks an immediate second duel`);
    // <2 active: no duel possible
    ap.active = { vex_marlowe: {} }; ap.lastDuelDay = -999;
    fired = false; guard = 0;
    while (!fired && guard++ < 60) fired = G.apPlaygroundDuel();
    ok(!fired, `seed ${seed}: no duel with a single active alien`);
  }

  // ============ B. INTERFERENCE EFFECTS ============
  for (const seed of seeds) {
    H.RNG.reset(seed);
    const s = setup(30); const G = H.Game; const ap = G.apState();
    // Sadistic rig: verdict-style call (no forPlayer)
    ap.met = { vex_marlowe: { encounters: 3, bond: 0, lastOutcome: 'lost', lastDay: 28 } };
    ap.lastRigDay = -999;
    forceRoll(0.1); // beat the 0.35 rig gate
    let res;
    try { res = G.apContestInterference({ participants: ['v1'] }); } finally { unforce(); }
    ok(res && res.winMod === -0.12, `seed ${seed}: sadistic rig returns winMod -0.12 (got ${res && res.winMod})`);
    ok(res.note && /judg/i.test(res.note), `seed ${seed}: rig carries an honest note`);
    // The verdict wires apRig into cheerBonus/cheerLift — prove the penalty is REAL.
    const vid = (G.state.village.roster || [])[0];
    const c0 = G._cxCaseScore(vid, 0);
    const cRig = G._cxCaseScore(vid, -0.12 * 20); // cheerLift = apRig*20 in _contestVerdict
    ok(cRig === c0 - 2.4, `seed ${seed}: rigged cheerLift is a real -2.4 case-score penalty (${c0} -> ${cRig})`);
    // Fan favor: verdict-style, favor high -> +0.08
    ap.favor = 60; ap.lastRigDay = s.day; // rig on cooldown so only favor speaks
    forceRoll(0.99);
    let res2;
    try { res2 = G.apContestInterference({ participants: ['v1'] }); } finally { unforce(); }
    ok(res2 && res2.winMod === 0.08, `seed ${seed}: fan favor returns winMod +0.08 (got ${res2 && res2.winMod})`);
    // forPlayer call: rig and favor are skipped, only lifeline is evaluated
    forceRoll(0.1);
    let res3;
    try { res3 = G.apContestInterference({ participants: ['player'] }, { forPlayer: true }); } finally { unforce(); }
    ok(res3 && res3.winMod === 0 && res3.deathSave === false, `seed ${seed}: forPlayer call skips rig/favor (verdict-only fiction)`);
  }

  // ============ C. CONTACT WARNING ============
  for (const seed of seeds) {
    H.RNG.reset(seed);
    const s = setup(25); const G = H.Game; const ap = G.apState();
    const vid = (G.state.village.roster || [])[0];
    ap.contactedVid = vid; ap.lastContactWarningDay = -999;
    forceRoll(0.1);
    let w;
    try { w = G.apContactWarning(); } finally { unforce(); }
    ok(w === true, `seed ${seed}: contact warning fires once a contact exists`);
    const said = H.allText();
    ok(/dream/i.test(said), `seed ${seed}: warning is framed as the contact's dream (honest framing)`);
    ok(G.apContactWarning() === false, `seed ${seed}: 4-day cooldown blocks repeats`);
    // No contact: silent
    ap.contactedVid = null;
    ok(G.apContactWarning() === false, `seed ${seed}: silent with no contact`);
    // Contact establishment path exists (day 20+, 0.3/day)
    H.RNG.reset(seed); const s2 = setup(25); const ap2 = H.Game.apState();
    let cv = null, guard = 0;
    while (!cv && guard++ < 200) cv = H.Game.apContactedVillager();
    ok(!!cv, `seed ${seed}: a contacted villager is established over time`);
  }

  // ============ D. AFFINITY — deliberately removed, not dead ============
  {
    const G = H.Game;
    ok(typeof G.apPilotAffinity === 'undefined', 'apPilotAffinity is absent from the module');
    const hits = fs.readdirSync(SRC).filter(f => f.endsWith('.js'))
      .map(f => ({ f, n: (fs.readFileSync(path.join(SRC, f), 'utf8').match(/apPilotAffinity/g) || []).length }))
      .filter(x => x.n > 0);
    ok(hits.length === 0, 'no dangling apPilotAffinity references in src/js (removed by Steve 2026-10-07 human-impersonation rework)');
  }

  // ============ H. GROUP RATE + COOLDOWN HONESTY ============
  for (const seed of seeds) {
    H.RNG.reset(seed);
    const s = setup(45); const G = H.Game; const ap = G.apState();
    ap.met = {
      vex_marlowe: { encounters: 3, bond: 0 }, countess_sable: { encounters: 2, bond: 0 },
      rax_dentist: { encounters: 2, bond: 0 },
    };
    ap.lastGroupDay = -999;
    ok(G.apGroupEligible(), `seed ${seed}: group eligible at day 45 with 3 rivals`);
    let groups = 0; const TRIALS = 2000;
    for (let t = 0; t < TRIALS; t++) { ap.lastGroupDay = -999; if (G.apRollGroupEncounter()) groups++; }
    const rate = groups / TRIALS;
    ok(rate > 0.01 && rate < 0.06, `seed ${seed}: group rate ~3% design (measured ${(rate * 100).toFixed(2)}% over ${TRIALS})`);
    // H1: a FAILED group start must not burn the 14-day cooldown.
    ap.lastGroupDay = -999;
    let grp = null, guard = 0;
    while (!grp && guard++ < 500) { ap.lastGroupDay = -999; grp = G.apRollGroupEncounter(); }
    ok(!!grp, `seed ${seed}: rolled a group (${grp})`);
    const _sac = G.startAlienCombat.bind(G);
    G.startAlienCombat = () => null; // fight refuses (already in combat)
    let started;
    try { started = G.apStartGroupEncounter(grp); } finally { G.startAlienCombat = _sac; }
    ok(started === false, `seed ${seed}: refused group start returns false`);
    ok((ap.lastGroupDay || -999) === -999, `seed ${seed}: failed start does NOT burn the 14-day cooldown`);
    ok(!G.state.alienGroup, `seed ${seed}: no phantom alienGroup left behind`);
  }

  // ============ J. KNOWLEDGE PATHS ============
  for (const seed of seeds) {
    H.RNG.reset(seed);
    const s = setup(30); const G = H.Game; const ap = G.apState();
    // Path 1: 3rd encounter reveals.
    ap.met = { vex_marlowe: { encounters: 2, bond: 0, lastOutcome: 'lost', lastDay: 28 } };
    G.apOnCombatEnd('vex_marlowe', 'won');
    ok(G.apKnowsAlien('vex_marlowe'), `seed ${seed}: 3rd encounter reveals the alien (pattern recognition)`);
    // Path 2: System feed slip reveals a sadistic rival.
    H.RNG.reset(seed); const s2 = setup(30); const ap2 = H.Game.apState();
    ap2.met = { countess_sable: { encounters: 1, bond: 0, lastOutcome: 'lost', lastDay: 28 } };
    ap2.lastFeedDay = -999;
    forceRoll(0.1); // feed gate (0.4) + slip gate (0.3)
    try { H.Game.apFeedMessage(); } finally { unforce(); }
    ok(H.Game.apKnowsAlien('countess_sable'), `seed ${seed}: feed slip can reveal a sadistic rival`);
    // Enumeration: these are the ONLY writers of ap.known.
    const src = fs.readFileSync(path.join(SRC, 'alienPlayers.js'), 'utf8');
    const writers = src.split('\n').filter(l => /ap\.known\[pid\] =/.test(l) && !/^\s*\/\//.test(l));
    ok(writers.length === 1, `seed ${seed}: single ap.known writer (apRevealAlien), called from exactly 2 paths`);
    const callers = src.split('\n').filter(l => /this\.apRevealAlien\(pid/.test(l));
    ok(callers.length === 2, `seed ${seed}: apRevealAlien called from 2 sites (3rd-encounter + feed slip)`);
  }

  // ============ K. WREN ============
  for (const seed of seeds) {
    H.RNG.reset(seed);
    const s = setup(30); const G = H.Game; const ap = G.apState();
    // Reachable: dead drops (Wren helps from the start, no bond needed).
    ap.lastDropDay = -999;
    s.kcal = 100; // below cap, so the grant is visible
    const kcalBefore = s.kcal;
    forceRoll(0.1);
    let dd;
    try { dd = G.apDeadDrop(); } finally { unforce(); }
    ok(dd === true, `seed ${seed}: Wren's dead drop fires (reachable, no combat needed)`);
    ok(s.kcal > kcalBefore, `seed ${seed}: dead drop delivers real kcal (${kcalBefore} -> ${s.kcal})`);
    ok(/hollow|bandages|meat/i.test(H.allText()), `seed ${seed}: Wren's helpLines actually surface`);
    // Reachable: feed whisper. Script the RNG: pass the gates, then select
    // the LAST message in the pool (the whisper).
    H.clearLog(); ap.lastFeedDay = -999;
    const seq = [0.1, 0.1, 0.9]; let si = 0;
    Math.random = () => seq[Math.min(si++, seq.length - 1)];
    try { G.apFeedMessage(); } finally { unforce(); }
    ok(/northern treeline/i.test(H.allText()), `seed ${seed}: Wren's warning whisper surfaces on the feed`);
    // K1: she can be KNOWN — repeated drops let you spot her (her data says
    // "eventually Wren risks direct contact").
    ap.wrenDrops = 5; ap.lastDropDay = -999;
    forceRoll(0.1);
    try { G.apDeadDrop(); } finally { unforce(); }
    ok(G.apKnowsAlien('wren'), `seed ${seed}: after repeated drops you spot Wren — she becomes known`);
    ok(/Don't.*react|I'm Wren/i.test(H.allText()), `seed ${seed}: the reveal uses her intro line`);
    // Non-combat graceful: intro for a null combat situation doesn't crash.
    let threw = null;
    try { G.apCombatLine('wren', 'onHit'); } catch (e) { threw = e; }
    ok(!threw && G.apCombatLine('wren', 'onHit') === null, `seed ${seed}: Wren's combat lines stay gracefully null`);
  }

  // ============ L. FEEDING GATES ============
  for (const seed of seeds) {
    H.RNG.reset(seed);
    const s = setup(30); const G = H.Game; const ap = G.apState();
    // Benevolent persona package (Old Tam): real kcal, capped, 6-day gate.
    ap.met = { old_tam: { encounters: 2, bond: 1, lastOutcome: 'won', lastDay: 28 } };
    ap.lastPersonaPackageDay = -999;
    s.kcal = 100;
    const cap = G.kcalCap ? G.kcalCap() : 2400;
    let fired = false, guard = 0, got = 0;
    while (!fired && guard++ < 300) { ap.lastPersonaPackageDay = -999; s.day++; fired = G.apPersonaPackage(); }
    ok(fired, `seed ${seed}: Old Tam's package fires`);
    got = s.kcal - 100;
    ok(got >= 400 && got <= 700, `seed ${seed}: benevolent package is 400-700 kcal (got ${got})`);
    ok(s.kcal <= cap, `seed ${seed}: package respects kcalCap`);
    ok(G.apPersonaPackage() === false, `seed ${seed}: 6-day package gate blocks farming`);
    // Dead drop gate: 1 per 3 days.
    ap.lastDropDay = s.day;
    ok(G.apDeadDrop() === false, `seed ${seed}: dead-drop 3-day gate blocks farming`);
    // Feed gate: 1 per day.
    ap.lastFeedDay = s.day;
    ok(G.apFeedMessage() === false, `seed ${seed}: feed 1/day gate blocks farming`);
  }

  // ============ M. SAVE/LOAD ============
  for (const seed of seeds) {
    H.RNG.reset(seed);
    const s = setup(30); const G = H.Game; const ap = G.apState();
    ap.favor = 42;
    ap.met = { vex_marlowe: { encounters: 3, bond: 0, lastOutcome: 'lost', lastDay: 28 } };
    ap.known = { vex_marlowe: 'you recognized the fighting style' };
    ap.lastHuntDay = { vex_marlowe: 28 };
    ap.lastDropDay = 27; ap.lastFeedDay = 29; ap.lastGroupDay = 20; ap.lastDuelDay = 15;
    ap.active = { vex_marlowe: { lastActionDay: 29 } };
    let snap;
    try { snap = JSON.parse(JSON.stringify(G.state)); } catch (e) { snap = null; }
    ok(!!snap, `seed ${seed}: full state serializes (save path)`);
    const a2 = snap.alienPlayers;
    ok(a2 && a2.favor === 42, `seed ${seed}: favor survives save/load`);
    ok(a2.met.vex_marlowe.encounters === 3, `seed ${seed}: met records survive`);
    ok(a2.known.vex_marlowe, `seed ${seed}: knowledge survives`);
    ok(a2.lastHuntDay.vex_marlowe === 28 && a2.lastDropDay === 27 && a2.lastGroupDay === 20 && a2.lastDuelDay === 15,
      `seed ${seed}: all cooldowns survive`);
    ok(a2.active.vex_marlowe, `seed ${seed}: active roster survives`);
    // Mid-encounter: the fighter snapshot must serialize (no circular refs).
    const fighter = G.apBuildFighter('vex_marlowe', 4, 4);
    G.state.alienEncounter = { pid: 'vex_marlowe', fighter };
    let okSer = true;
    try { JSON.stringify(G.state); } catch (e) { okSer = false; }
    ok(okSer, `seed ${seed}: mid-encounter state serializes (save during a hunt won't nuke the save)`);
    delete G.state.alienEncounter;
  }

  console.log(`\nPASS: ${N} asserts (duel/interference/contact/affinity/group/knowledge/wren/feeding/saveload)`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
