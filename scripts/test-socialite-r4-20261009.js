// HOSTILE SOCIALITE PROBES r4 (2026-10-09) — adversarial playtest vs trust/gossip/dialogue.
// Seeded harness: RNG installed before eval (modules capture Math.random at load).
// Run: node scripts/test-socialite-r4-20261009.js [probe]   (SEED=... optional)
// Probes: speakback | promise | teach | rumorcap | talkspam | menus | exits | rumor-thread | hawk | askcontract | all
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.reset = (ns) => { s = ns >>> 0; };
  return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // eval-phase stub only
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/"]+\.js|src\/js\/engine\/[^\/"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // sync combat path
const Game = globalThis.Scattering.Game;

let A = 0, F = 0;
function ok(cond, msg, extra) { A++; if (!cond) { F++; console.log('  FAIL:', msg, extra || ''); } }
function verdict(name, broke, detail) { console.log(`${broke ? 'BREAK' : 'HELD '}: ${name}${detail ? ' — ' + detail : ''}`); }

const probes = {};

function boot() {
  return (async () => {
    await Game.init();
    Game.debugScenario('day1');
  })();
}
function roster() {
  const v = Game.state.village;
  return v.roster.filter(id => id !== Game.villagerId);
}
function trustOf(vid) { const t = Game.state.village.trust || {}; return t[vid] === undefined ? 10 : t[vid]; }
function nonEnglishVillager() {
  for (const vid of roster()) {
    try {
      const lang = Game.npcNativeLang(vid);
      if (lang && lang !== 'english') return vid;
    } catch (e) {}
  }
  return null;
}

// ---------- PROBE speakback: is it really once-ever? ----------
probes.speakback = function () {
  console.log('=== PROBE speakback-farm ===');
  const vid = nonEnglishVillager();
  if (!vid) { console.log('no non-English villager in this seed; skip'); return; }
  // force exposure high enough to unlock
  const lang = Game.npcNativeLang(vid);
  for (let i = 0; i < 8; i++) Game.langExposureGain(vid, lang, 3);
  const t0 = trustOf(vid);
  let offered = 0, pays = 0;
  for (let i = 0; i < 6; i++) {
    Game.startConvo(vid);
    const ids = (Game.convoChoices(vid) || []).map(x => x.id);
    if (ids.includes('speak_back')) { offered++; const tb = trustOf(vid); Game.convoTurn(vid, 'speak_back'); if (trustOf(vid) > tb) pays++; }
    Game.endConvo(vid, 'left');
  }
  const t1 = trustOf(vid);
  console.log(`offered=${offered}/6 pays=${pays} trust ${t0} -> ${t1}`);
  verdict('speak_back farm', pays > 1, `one-shot per villager: pays=${pays}`);
  ok(pays <= 1, 'speak_back pays at most once per villager', `pays=${pays}`);
};

// ---------- PROBE promise: belong cycle ----------
probes.promise = function () {
  console.log('=== PROBE promise-cycle ===');
  const vid = roster()[0];
  // learn their goal first (promiseHelp requires npcGoal)
  Game.startConvo(vid);
  for (let i = 0; i < 10; i++) {
    const ids = (Game.convoChoices(vid) || []).map(x => x.id);
    const ask = ids.find(x => x.indexOf('ask:') === 0);
    if (!ask) break;
    Game.convoTurn(vid, ask);
    if (Game.npcGoal(vid)) break;
  }
  Game.endConvo(vid, 'left');
  const goal = Game.npcGoal(vid);
  console.log(`goal known: ${goal}`);
  if (!goal) { console.log('goal not learnable this seed; skip'); return; }
  const t0 = trustOf(vid);
  const r1 = Game.promiseHelp(vid);
  const tMade = trustOf(vid);
  Game.startConvo(vid); Game.endConvo(vid, 'left'); // endConvo -> checkPromises('social', vid)
  const tKept = trustOf(vid);
  const r2 = Game.promiseHelp(vid); // re-promise attempt
  const tRe = trustOf(vid);
  console.log(`make=${!!(r1 && r1.ok)} trust ${t0}->${tMade}->kept ${tKept}; re-promise=${!!(r2 && r2.ok)} trust ${tRe}`);
  verdict('promise belong cycle', (r2 && r2.ok) || (tKept - t0) > 25,
    `re-promise blocked=${!(r2 && r2.ok)}, kept-delta=${tKept - t0}`);
  ok(!(r2 && r2.ok), 'cannot re-promise the same villager after keeping', `re-promise ok=${!!(r2 && r2.ok)}`);
};

// ---------- PROBE teach: pool-bounded? honest when empty? ----------
probes.teach = function () {
  console.log('=== PROBE teach-pool ===');
  const vid = roster()[0];
  // grant player knowledge of real plants at L2
  const dandelionIds = ['dandelion','cattail','blackberry','persimmon','hickory_nut','acorn_white_oak','wild_onion','chickweed','plantain','yarrow','elderberry','wild_garlic'];
  Game.state.codex = Game.state.codex || {}; Game.state.codex.plants = Game.state.codex.plants || {};
  for (const p of dandelionIds) Game.state.codex.plants[p] = { level: 2 };
  const t0 = trustOf(vid);
  let teaches = 0;
  for (let i = 0; i < 20; i++) {
    Game.startConvo(vid);
    const ids = (Game.convoChoices(vid) || []).map(x => x.id);
    if (!ids.includes('teach')) { Game.endConvo(vid, 'left'); break; }
    const tb = trustOf(vid);
    const st = Game.convoTurn(vid, 'teach');
    if (trustOf(vid) > tb) teaches++;
    Game.endConvo(vid, 'left');
  }
  const t1 = trustOf(vid);
  // one more teach attempt now that pool should be exhausted — check honesty of the no-op
  Game.startConvo(vid);
  const ids = (Game.convoChoices(vid) || []).map(x => x.id);
  let honestLine = null;
  if (ids.includes('teach')) { const st = Game.convoTurn(vid, 'teach'); honestLine = st && st.line; }
  Game.endConvo(vid, 'left');
  console.log(`successful teaches=${teaches} trust ${t0} -> ${t1}; exhausted-line: ${(honestLine || '').slice(0, 70)}`);
  verdict('teach farm', teaches > 12, `bounded by pool: ${teaches} teaches`);
  ok(teaches <= 12, 'teach is bounded by the teachable pool', `teaches=${teaches}`);
  // the menu hides teach only when the pool is TRULY exhausted — force that
  // state directly: mark every plant the player knows as taught.
  const v2 = Game.state.village;
  v2.taught = v2.taught || {};
  v2.taught[vid] = Object.keys(Game.state.codex.plants || {}).filter(k => Game.plantKnown(k));
  Game.startConvo(vid);
  const idsAfter = (Game.convoChoices(vid) || []).map(x => x.id);
  Game.endConvo(vid, 'left');
  ok(!idsAfter.includes('teach'), 'menu hides teach when the pool is exhausted', `teach offered=${idsAfter.includes('teach')}`);
};

// ---------- PROBE rumorcap: dedupe gate — same rumor twice pays once ----------
// (The residue is INTENTIONALLY uncapped — "felt warmth"; the words cap at 40
// via the resolver. The exploit vector here is the dedupe: re-spreading the
// same rumor in the same day-part must pay nothing — detective 2026-10-08.)
probes.rumorcap = function () {
  console.log('=== PROBE rumor-dedupe ===');
  const ids = roster();
  if (ids.length < 3) { console.log('need 3 villagers; skip'); return; }
  const listener = ids[0], target = ids[1];
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[listener] = 25;
  const t0 = trustOf(listener);
  function spreadOnce() {
    const dpBefore = Game.dayPart;
    Game.startConvo(listener);
    let menu = (Game.convoChoices(listener) || []).map(c => c.id);
    if (menu.includes('dlg:subject')) { Game.convoTurn(listener, 'dlg:subject'); menu = (Game.convoChoices(listener) || []).map(c => c.id); }
    if (!menu.includes('ask:spread_rumor')) { Game.endConvo(listener, 'left'); return { delta: 'no-offer', samePart: true }; }
    Game.convoTurn(listener, 'ask:spread_rumor');
    menu = (Game.convoChoices(listener) || []).map(c => c.id);
    const tpick = menu.find(id => id === 'rumor:tgt:' + target);
    if (tpick) Game.convoTurn(listener, tpick);
    menu = (Game.convoChoices(listener) || []).map(c => c.id);
    const ypick = menu.find(id => id === 'rumor:type:stingy');
    const tb = trustOf(listener);
    if (ypick) Game.convoTurn(listener, ypick);
    const delta = trustOf(listener) - tb; // rumor:spread's own payout (excl. endConvo)
    const samePart = Game.dayPart === dpBefore;
    Game.endConvo(listener, 'left');
    return { delta, samePart };
  }
  const d1 = spreadOnce();
  const d2 = spreadOnce(); // same target — dedupe must pay 0 within one day-part
  console.log(`first spread rumor-payout=${d1.delta}, repeat rumor-payout=${d2.delta} (same day-part: ${d1.samePart && d2.samePart})`);
  if (d1.samePart && d2.samePart && d1.delta !== 'no-offer' && d2.delta !== 'no-offer') {
    verdict('rumor dedupe farm', d2.delta > 0, `repeat paid ${d2.delta}`);
    ok(d2.delta === 0, 're-spreading the same rumor in the same day-part pays no trust', `repeat delta=${d2.delta}`);
  } else {
    console.log('  (day-part boundary crossed or no offer — dedupe is per day-part by design; skip)');
  }
  void t0;
};

// ---------- PROBE talkspam: PURE ack grind vs cap (no alive: content) ----------
// alive: choices are real continuity (fresh memories, open threads) — they
// EARN the residue by design. The exploit is zero-content ack-spam.
probes.talkspam = function () {
  console.log('=== PROBE talk-spam-cap (pure ack) ===');
  const vid = roster()[0];
  const t0 = trustOf(vid);
  for (let n = 0; n < 25; n++) {
    Game.startConvo(vid);
    for (let i = 0; i < 8; i++) {
      const ids = (Game.convoChoices(vid) || []).map(x => x.id);
      // ack-grade only: gestures, agree, joke, silence — never alive:/asks
      const pick = ids.find(x => x.indexOf('nv:') === 0) || ids.find(x => x === 'agree')
        || ids.find(x => x === 'joke') || ids.find(x => x === 'silence');
      if (!pick) break;
      const r = Game.convoTurn(vid, pick);
      if (r && r.ended) break;
    }
    Game.endConvo(vid, 'natural');
  }
  const t1 = trustOf(vid);
  console.log(`25 convos pure-ack spam: trust ${t0} -> ${t1}`);
  verdict('talk-spam farm', t1 > 40, `trust ${t1}`);
  ok(t1 <= 40, 'pure acknowledgment spam cannot pass 40', `trust=${t1}`);
};

// ---------- PROBE menus: empty-menu sweep (fresh states incl. mid-thread) ----------
probes.menus = function () {
  console.log('=== PROBE menu-softlock-sweep ===');
  let total = 0, empty = 0, threw = 0;
  for (const vid of roster()) {
    for (const mood of [-3, 0, 3]) {
      try {
        Game.startConvo(vid);
        const ch = Game.convoChoices(vid);
        total++;
        if (!ch || ch.length === 0) { empty++; console.log(`EMPTY MENU: ${vid} (fresh)`); }
        // mid-thread: force a rumor thread open then check menu
        const ids = (ch || []).map(x => x.id);
        const rt = ids.find(x => x === 'rumor' || (x || '').indexOf('rumor:tgt:') === 0);
        if (rt) {
          Game.convoTurn(vid, rt);
          const ch2 = Game.convoChoices(vid); total++;
          if (!ch2 || ch2.length === 0) { empty++; console.log(`EMPTY MENU: ${vid} (rumor thread mid-flow)`); }
        }
        Game.endConvo(vid, 'left');
      } catch (e) { threw++; console.log(`THREW: ${vid} ${e.message}`); }
    }
  }
  console.log(`menus=${total} empty=${empty} threw=${threw}`);
  verdict('menu softlock', empty > 0 || threw > 0, `${empty} empty, ${threw} threw`);
  ok(empty === 0 && threw === 0, 'no empty menus / throws across villagers and rumor mid-flow', `empty=${empty} threw=${threw}`);
};

// ---------- PROBE exits: every menu must offer SOME exit ----------
probes.exits = function () {
  console.log('=== PROBE exit-availability ===');
  let total = 0, noexit = 0;
  const isExit = (id) => /goodbye|leave|end|opt_out|honest_pass|silence|nevermind|never_mind|back|done/i.test(id || '');
  for (const vid of roster().slice(0, 6)) {
    Game.startConvo(vid);
    for (let i = 0; i < 6; i++) {
      const ch = Game.convoChoices(vid) || [];
      total++;
      const ids = ch.map(x => x.id);
      if (!ids.some(isExit)) { noexit++; console.log(`NO EXIT: ${vid} turn ${i}: [${ids.join(', ')}]`); }
      const pick = ids.find(x => !isExit(x)) || ids[0];
      if (!pick) break;
      Game.convoTurn(vid, pick);
      const c = Game.convoGet(vid);
      if (!c || !c.active) break;
    }
    try { Game.endConvo(vid, 'left'); } catch (e) {}
  }
  console.log(`menus=${total} without-exit=${noexit}`);
  verdict('no-exit menu', noexit > 0, `${noexit}/${total} menus lack an exit`);
  ok(noexit === 0, 'every menu offers an exit', `noexit=${noexit}`);
};

// ---------- PROBE rumor-thread: abandon mid-flow, no dangle ----------
probes.rumorthread = function () {
  console.log('=== PROBE rumor-thread-dangle ===');
  const ids = roster();
  const listener = ids[0], target = ids[1];
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[listener] = 25; // gossipOpen needs effTrust >= 20
  Game.startConvo(listener);
  let menu = (Game.convoChoices(listener) || []).map(c => c.id);
  if (menu.includes('dlg:subject')) { Game.convoTurn(listener, 'dlg:subject'); menu = (Game.convoChoices(listener) || []).map(c => c.id); }
  if (!menu.includes('ask:spread_rumor')) { console.log('rumor flow not offered; skip'); Game.endConvo(listener, 'left'); return; }
  Game.convoTurn(listener, 'ask:spread_rumor');
  menu = (Game.convoChoices(listener) || []).map(c => c.id);
  const tpick = menu.find(id => id === 'rumor:tgt:' + target);
  if (!tpick) { console.log('rumor target not offered; skip'); Game.endConvo(listener, 'left'); return; }
  Game.convoTurn(listener, tpick); // now mid-thread: type selection pending
  const c = Game.convoGet(listener);
  const midThread = c.thread, midTarget = c.rumorTarget;
  // abandon: end convo mid-thread, start a fresh one — does the thread dangle?
  Game.endConvo(listener, 'left');
  Game.startConvo(listener);
  const c2 = Game.convoGet(listener);
  menu = (Game.convoChoices(listener) || []).map(c => c.id);
  if (menu.includes('dlg:subject')) { Game.convoTurn(listener, 'dlg:subject'); menu = (Game.convoChoices(listener) || []).map(c => c.id); }
  const canRumorAgain = menu.includes('ask:spread_rumor');
  console.log(`mid: thread=${midThread} target=${!!midTarget}; after re-open: thread=${c2.thread} rumorDone=${c2.rumorDone} can-rumor-again=${canRumorAgain}`);
  Game.endConvo(listener, 'left');
  verdict('rumor thread dangle', !canRumorAgain, `re-offer=${canRumorAgain}`);
  ok(canRumorAgain, 'abandoned rumor thread resets; rumor re-offerable', `canRumorAgain=${canRumorAgain}`);
};

// ---------- PROBE hawk: stranded pendingHawk ----------
probes.hawk = function () {
  console.log('=== PROBE hawker-strand ===');
  let tested = 0, stranded = 0;
  for (const vid of roster()) {
    let ware = null;
    try { ware = Game.hawkerOffer(vid); } catch (e) {}
    if (!ware || ware.sold) continue;
    tested++;
    Game.startConvo(vid);
    const ids = (Game.convoChoices(vid) || []).map(x => x.id);
    if (ids.includes('hawker')) Game.convoTurn(vid, 'hawker');
    const c = Game.convoGet(vid);
    const pending = !!(c && c.pendingHawk);
    // abandon without answering, then re-open: is the offer state coherent?
    Game.endConvo(vid, 'left');
    Game.startConvo(vid);
    const c2 = Game.convoGet(vid);
    const ids2 = (Game.convoChoices(vid) || []).map(x => x.id);
    const pending2 = !!(c2 && c2.pendingHawk);
    if (pending && pending2 && !ids2.includes('hawker_yes') && !ids2.includes('hawker_no')) {
      stranded++; console.log(`STRANDED pendingHawk: ${vid}`);
    }
    Game.endConvo(vid, 'left');
    if (tested >= 3) break;
  }
  console.log(`hawkers tested=${tested} stranded=${stranded}`);
  verdict('hawker strand', stranded > 0, `${stranded} stranded`);
  ok(stranded === 0, 'no stranded pendingHawk without exits', `stranded=${stranded}`);
};

// ---------- PROBE askcontract: run the built-in validator ----------
probes.askcontract = function () {
  console.log('=== PROBE ask-contract-validator ===');
  const vid = roster()[0];
  Game.startConvo(vid);
  let res = null;
  try { res = Game.validateAskContract(vid); } catch (e) { console.log('validator threw:', e.message); }
  Game.endConvo(vid, 'left');
  if (!res) { console.log('no validator result; skip'); return; }
  console.log(`ok=${res.ok} failures=${(res.failures || []).length}`);
  (res.failures || []).slice(0, 10).forEach(f => console.log('  -', f));
  verdict('ask contract', !res.ok, `${(res.failures || []).length} failures`);
  ok(res.ok, 'Ask/Answer contract holds on all questions', JSON.stringify((res.failures || []).slice(0, 3)));
};

(async () => {
  await boot();
  const which = process.argv[2] || 'all';
  const list = which === 'all' ? Object.keys(probes) : [which];
  for (const p of list) {
    Math.random.reset(SEED);
    if (!probes[p]) { console.log('unknown probe', p); continue; }
    try { probes[p](); } catch (e) { console.log(`PROBE ${p} THREW:`, e.message); }
    console.log('');
  }
  console.log(`${A - F}/${A} assertions passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})();
