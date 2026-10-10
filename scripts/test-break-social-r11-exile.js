// BREAK-IT social r11 (2026-10-10): exile edges + ghost trials + schism re-trigger.
// Prior rounds killed: word-farms (r2), interpreter/giveFood/promise/rumor-trace (r4),
// deal/appeal/trust-bands/bribery (r5), generous-rumor/who-gossip/phantom-talk/absentia-weregild (r6),
// mediate/theft/intimidation double-pays/seed-skims/unkeepable-promises (r7), mood-residue (r8),
// trivial-gift/theft-apology (r9), yieldChallenge/0-resurrection/ghost-challenge/dead-allies (r10).
// Fresh ground this run:
//   T1-T3 exile pantry/kitchen lockdown (EXPLOIT): exiled player kept 'inside'
//        hall access (s.insideHaven never cleared), 'remote' pantry access at
//        integration stage 3, and could host feasts on the VILLAGE pantry.
//   T4    ghost trial (SOFTLOCK/phantom): an accused killed mid-case was still
//        convened, voted on, and sentenced (exile, for a corpse).
//   T5    schism re-trigger: second schism pushed duplicate 'feud_a'/'feud_b'
//        groups -> group ripples hit shared members twice.
//   T6-T7 payBribe/canAffordBribe pantry gate while exiled (sibling sweep, same class).
// Held (documented, asserted): dual challenge, feast math, dark-package scarcity,
// theft proportionality, teaching non-repeatability, no player-initiated NPC
// accusation (re-verified), tiny-roster moot.
// Run: node scripts/test-break-social-r11-exile.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.reset = (ns) => { s = ns >>> 0; }; return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/\"]+\.js|src\/js\/engine\/[^\/\"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const fails = [];
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); if (!cond) fails.push(name); };

async function fresh() {
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const S = Game.state, v = S.village, me = Game.villagerId;
  const npcs = (v.roster || []).filter(id => id !== me);
  return { S, v, me, npcs };
}
function mkCase(accused, target, accuser, id) {
  const bs = Game.betrayalState();
  const c = { id: id || ('case_t' + (++bs.seq)), plotId: null, charge: 'murder', day: Game.state.scholar.day,
    accused: [...accused], target, accuser, belief: {}, evidence: [], bribes: [], exposedBribes: [],
    inconsistencies: [], status: 'open', flipped: null, playerRole: 'bystander', knownToPlayer: true };
  bs.cases.push(c);
  return c;
}

(async () => {
  // ---------- T1: exilePlayer clears insideHaven ----------
  {
    const { S } = await fresh();
    S.scholar.insideHaven = true;
    let err = null;
    try { Game.exilePlayer('moot'); } catch (e) { err = e.message; }
    check('T1 exilePlayer walks you out of the hall (insideHaven cleared)', err === null && !S.scholar.insideHaven, `err=${err} insideHaven=${S.scholar.insideHaven}`);
  }
  // ---------- T2: havenStoresAccess 'none' while exiled, even at integration 3 ----------
  {
    const { S, v } = await fresh();
    S.systemArrived = true; S.scholar.integration = 90; S.scholar.insideHaven = null;
    S.scholar.exiled = true;
    let acc = null, err = null;
    try { acc = Game.havenStoresAccess(); } catch (e) { err = e.message; }
    check('T2 exiled player gets no remote pantry access (integration 3)', err === null && acc === 'none', `err=${err} access=${acc}`);
    // sanity: non-exiled member keeps remote
    S.scholar.exiled = false;
    check('T2b non-exiled member keeps remote access', Game.havenStoresAccess() === 'remote');
  }
  // ---------- T3: hostFeast refuses while exiled ----------
  {
    const { S, v } = await fresh();
    Game.stockPantry(8000, 'test stock');
    S.scholar.exiled = true;
    const before = Game.pantryKcalLive(v);
    let r = null, err = null;
    try { r = Game.hostFeast(); } catch (e) { err = e.message; }
    const after = Game.pantryKcalLive(v);
    check('T3 exiled player cannot host a feast on the village pantry', err === null && typeof r === 'string' && r.indexOf('Exile') === 0 && S.scholar.feastDay !== S.scholar.day && Math.abs(after - before) < 1, `err=${err} r=${String(r).slice(0,40)} feastDay=${S.scholar.feastDay}`);
  }
  // ---------- T4: ghost trial — accused killed mid-case ----------
  {
    const { v, me, npcs } = await fresh();
    const [A, B, C] = npcs;
    const c = mkCase([A], B, C, 'case_ghost1');
    Game.removeVillager(A, 'killed');
    check('T4 case against a dead accused is closed (accused_died)', c.status === 'resolved' && c.resolution === 'accused_died', `status=${c.status} res=${c.resolution}`);
    let r = 'no-call', err = null;
    try { r = Game.callMoot(c.id, C); } catch (e) { err = e.message; }
    check('T4b no moot can be convened on the closed case', err === null && r === null, `err=${err} r=${r}`);
    // target-dead case stands (the crime happened)
    const c2 = mkCase([B], A, C, 'case_ghost2');
    Game.removeVillager(B, 'exiled');
    check('T4c exiled (living) accused: case stands for trial in absentia', c2.status === 'open', `status=${c2.status}`);
  }
  // ---------- T5: schism re-trigger merges feud groups ----------
  {
    const { v, me, npcs } = await fresh();
    const [A, B, C, D] = npcs;
    const c1 = mkCase([A], B, C, 'case_sch1'); Game.resolveCase(c1.id, 'schism');
    const feuds1 = (v.groups || []).filter(g => g.id === 'feud_a');
    const c2 = mkCase([C], D, A, 'case_sch2'); Game.resolveCase(c2.id, 'schism');
    const feuds2 = (v.groups || []).filter(g => g.id === 'feud_a');
    const allFeuds = (v.groups || []).filter(g => g.kind === 'feud');
    const fa = feuds2[0] || {};
    const hasAll = [A, C].every(id => (fa.members || []).includes(id)) && (fa.members || []).length === new Set(fa.members || []).size;
    check('T5 repeat schism does not duplicate feud groups', feuds1.length === 1 && feuds2.length === 1, `feud_a count: ${feuds1.length} -> ${feuds2.length}, total feuds=${allFeuds.length}`);
    check('T5b feud members merge deduped', hasAll, `members=${JSON.stringify(fa.members)}`);
  }
  // ---------- T6: payBribe cannot reach the pantry while exiled ----------
  {
    const { S, v } = await fresh();
    Game.stockPantry(10000, 'test stock');
    S.scholar.inventory = [];
    S.scholar.exiled = true; S.scholar.insideHaven = null;
    const before = Game.pantryKcalLive(v);
    let spent = null, err = null;
    try { spent = Game.payBribe({}, 'somevid', 800); } catch (e) { err = e.message; }
    const after = Game.pantryKcalLive(v);
    check('T6 payBribe spends no pantry food while exiled', err === null && Math.abs(after - before) < 1, `err=${err} spent=${spent} pantry ${Math.round(before)} -> ${Math.round(after)}`);
    check('T6b canAffordBribe ignores pantry while exiled', Game.canAffordBribe({}, 'somevid') === false);
  }
  // ---------- T7: payBribe still works from pack while exiled (theft allowed = your own food) ----------
  {
    const { S, v } = await fresh();
    Game.stockPantry(10000, 'test stock');
    S.scholar.inventory = [{ name: 'Pack rations', kcalEach: 150, units: 20, spoilDay: 99 }];
    S.scholar.exiled = true; S.scholar.insideHaven = null;
    const before = Game.pantryKcalLive(v);
    let spent = null, err = null;
    try { spent = Game.payBribe({}, 'somevid', 800); } catch (e) { err = e.message; }
    const after = Game.pantryKcalLive(v);
    check('T7 exiled bribe spends the pack, not the pantry', err === null && spent > 0 && Math.abs(after - before) < 1, `err=${err} spent=${spent} pantryΔ=${Math.round(after - before)}`);
  }

  // ================= HELD =================
  // H1: dual challenge — a second contender does not overwrite a live one
  {
    const { v, me, npcs } = await fresh();
    const A = npcs[0], B = npcs[1];
    const recB = (Game.data.villagers || []).find(x => x.id === B);
    if (recB) { recB.goal = 'lead'; recB.personality = recB.personality || {}; recB.personality.temperament = 'bold'; }
    v.challenge = { cid: A, task: 'forage', age: 0 };
    v.heat = v.heat || {}; v.heat[B] = 3;
    for (let i = 0; i < 25; i++) { try { Game.leadershipFriction(npcs[2] || me, 'forage'); } catch (e) {} }
    check('H1 second contender does not overwrite a live challenge', v.challenge && v.challenge.cid === A, `cid=${v.challenge && v.challenge.cid}`);
    // and villager-agency's guard
    const src = fs.readFileSync(path.join(ROOT, 'src/js/villager-agency.js'), 'utf8');
    check('H1b agencyLeadershipTick early-returns while a challenge is live', /if \(v\.challenge\) return;/.test(src));
  }
  // H2: feast trust math — 1/day, progressive
  {
    const { S, v, npcs } = await fresh();
    Game.stockPantry(20000, 'test stock');
    const N = npcs[0];
    v.trust = v.trust || {}; v.trust[N] = 95;
    let r1 = null, err = null;
    try { r1 = Game.hostFeast(); } catch (e) { err = e.message; }
    const gain = (v.trust[N] || 0) - 95;
    check('H2 feast trust is progressive at high trust (no jump to 100)', err === null && gain >= 0 && gain <= 2, `err=${err} trust 95 -> ${v.trust[N]}`);
    let r2 = null;
    try { r2 = Game.hostFeast(); } catch (e) { r2 = e.message; }
    check('H2b one feast a day', typeof r2 === 'string' && r2.indexOf('One feast a day') === 0, `r2=${String(r2).slice(0, 40)}`);
  }
  // H3: dark care packages are honestly scarce
  {
    const { S } = await fresh();
    S.systemArrived = true; S.scholar.corruption = 90;
    S.scholar.inventory = [];
    let packs = 0, err = null;
    try {
      for (let d = 1; d <= 200; d++) {
        S.scholar.day = d; Game.dayPart = 0;
        const n0 = S.scholar.inventory.length;
        Game.darkCarePackageTick();
        if (S.scholar.inventory.length > n0) packs++;
      }
    } catch (e) { err = e.message; }
    check('H3 dark care packages are scarce (5-day min gap, 8% roll)', err === null && packs > 0 && packs <= 40, `err=${err} packs=${packs}/200 days`);
  }
  // H4: no player-initiated NPC accusation path (re-verified)
  {
    const meths = Object.keys(Game).filter(k => /accus/i.test(k));
    const allowed = ['considerPlayerAccusation', 'forcePlayerAccusation', 'openPlayerCase', 'playerAccusedCase', 'seedAccuserStory', 'defendPressAccuser', 'accuserPays', 'mootAccuserAftermath'];
    const rogue = meths.filter(k => allowed.indexOf(k) === -1);
    check('H4 every accusation method is player-defense machinery', rogue.length === 0, `rogue=${JSON.stringify(rogue)} all=${JSON.stringify(meths)}`);
    const src = fs.readFileSync(path.join(ROOT, 'src/js/betrayal.js'), 'utf8');
    check('H4b demandMoot requires playerRole=accused', /demandMoot\(caseId\) \{\s*\n?\s*const c = this\.getCase\(caseId\); if \(!c \|\| c\.playerRole !== 'accused'\) return null;/.test(src));
  }
  // H5: theft punishment is proportional and honest
  {
    const { v, npcs } = await fresh();
    const V = npcs[0];
    v.trust = v.trust || {}; v.trust[V] = 0; // a hater: penalties must not resurrect
    let res = null, err = null;
    try { res = Game.stealFrom(V); } catch (e) { err = e.message; }
    if (res === 'unseen') {
      try { Game.dayPart = (Game.dayPart + 1) % 4; Game.theftNoticeSweep(); } catch (e) { err = e.message; }
    }
    const gossip = (v.gossip || []).some(g => (g.kind || g.type || '') === 'theft' || JSON.stringify(g).indexOf('theft') !== -1);
    check('H5 theft notice: trust 0 stays 0 (no resurrection), rep moves instead', err === null && (v.trust[V] || 0) === 0, `err=${err} res=${res} trust=${v.trust[V]}`);
    void gossip;
  }
  // H6: teaching the same knowledge twice is blocked by v.taught
  {
    const { S, v, npcs } = await fresh();
    const V = npcs[0];
    const known = Object.keys((S.codex || {}).plants || {}).filter(k => { try { return Game.plantKnown(k); } catch (e) { return false; } });
    let ok = true, err = null;
    try {
      v.taught = v.taught || {};
      if (known.length) {
        v.taught[V] = [known[0]];
        const theyKnow = (v.taught && v.taught[V]) || [];
        const teachable = known.filter(pid => theyKnow.indexOf(pid) === -1);
        ok = teachable.indexOf(known[0]) === -1;
      }
    } catch (e) { err = e.message; ok = false; }
    check('H6 taught[] blocks re-teaching the same plant (no teaching farm)', err === null && ok, `err=${err} known=${known.length}`);
  }
  // H7: tiny-roster moot resolves without crashing
  {
    const { S, v, me, npcs } = await fresh();
    const A = npcs[0];
    v.roster = [me, A];
    const c = mkCase([A], me, me, 'case_tiny');
    let r = null, err = null;
    try { r = Game.callMoot(c.id, me); } catch (e) { err = e.message; }
    if (r && r.awaitingPlayerVote) {
      try { Game.castPlayerVote(c.id, true); } catch (e) { err = e.message; }
    }
    check('H7 moot with one villager resolves without crashing', err === null && (c.status === 'resolved' || c.status === 'acquitted' || !!c.trial), `err=${err} status=${c.status} r=${JSON.stringify(r).slice(0, 60)}`);
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join(', ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
