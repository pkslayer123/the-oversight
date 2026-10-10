#!/usr/bin/env node
// BREAK-IT: persistence (save/load) — NINTH PASS (2026-10-10).
// Passes 1–8 killed 30+ (see evidence/2026-10-10/break-persistence-8.md).
// This pass attacks the FRESH surface (commits landed after pass 8's check):
//   camps r11 (exile clears insideTent), alien players r11 (apKnowsAlien gate,
//   group-chain), monsters r13 (no src changes — held by absence), contests
//   r12 (held-contest counter, _cxWinnerShare), socialite r11 (in-convo
//   flags, v.conv rewire), survivalist r5 (nearest-fire fuel), explorer
//   playtest (walk-price, fog), gap3 breadth (ruin-book 30% first-search,
//   codex counts), gap4 bloodair (sealed arena), social r11 (moot trial),
//   knowledge r2, food r2.
//
// KILLS this pass:
//   K9. STALE CONVERSATION ACTIVE (SOFTLOCK/HONESTY — HIGH): v.conv[vid].active
//       persists on state.village, but the chat UI is DOM-only. After Continue
//       no chat is open, yet the person card hides the Talk button while
//       active (app.js) — a mid-conversation save locked the villager out of
//       talk forever (until you talked to someone else, which swept it with a
//       dishonest "turn away" line). Fix: load() settles stale actives —
//       substantive convos via the tested endConvo(vid,'left') path (rewards
//       scale with what actually happened), empty ones quietly cleared.
//   K10. ARENA VOID ON GHOST-FIGHT (SOFTLOCK — MEDIUM): a mid-arena-fight save
//       whose fighters all drop on load (corrupt/ghost) left
//       activeContest.arenaSuspended + state.arenaContest set with no fight —
//       contestChoose drops every input while suspended and the post-arena
//       phases are unreachable by choice, so the contest could never resolve.
//       Fix: void the bout as lost (the startCombat-throw precedent), with an
//       honest line, instead of stranding the show.
//   K11. SCAM LEDGER ID COLLISION (sibling sweep — LOW/MEDIUM): recordScam
//       minted 'scam_'+Date.now()+R()*99 — two scammed wares bought in the
//       same millisecond collided with p=1/99, and ledger lookups by id then
//       hit the wrong entry (wrong discovered/resolved, wrong confrontation).
//       Fix: widen to the fight-id shape (timestamp + 1e9 random).
//
// HELD (attacked, resisted — documented):
//   H1 ruin bookChecked persists on the map tile (no save-scum re-roll).
//   H2 apKnowsAlien round-trips (apState.known persists).
//   H3 state.alienGroup (group chain) round-trips.
//   H4 scholar.insideTent round-trips (camps r11 exile-clear proven by its own test).
//   H5 gap3 codex counts are derived live from entries (no counters to desync).
//   H6 empty (0-exchange) convos settle quietly on load — no crash, no spam.
//   H7 moot trial state (awaitingPlayerVote) round-trips.
//   H8 state.contestsHeld round-trips (r12 counter, ||0-guarded for old saves).
//   H9 arenaSuspended + live tbfight restore (non-ghost; pass-8 re-proven).
//   H10 monster ghost-drop with live player: honest line, fight continues
//       (the documented ghost policy — same as wild fights).
//   Sibling sweep: _seSeq (pass 8) is the only volatile mint counter;
//       vis_/link_/app_ are paced (one-at-a-time/day/player-action) so their
//       timestamp ids can't collide in practice; d_/gossip_/cache/corpse_/
//       gen_/fight ids are wide-random. scam_ was the one that collided (K11).
//
// BEFORE=1 runs the break demonstrations against pre-fix code from git HEAD
// (src/js/game.js, src/js/betrayal.js). Seeded: SEED env, default 20261010.
// Usage: node scripts/test-break-persistence9-20261010.js
//        BEFORE=1 node scripts/test-break-persistence9-20261010.js
//        SEED=7 node scripts/test-break-persistence9-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js', 'src/js/betrayal.js'];
if (BEFORE) {
  for (const f of PRE) execSync(`git show HEAD:${f} > /tmp/bp9-before-${path.basename(f)}`, { cwd: ROOT });
  console.log('MODE: BEFORE (pre-fix game.js + betrayal.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bp9-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub (with length getter — r7's self-healing scan needs it) ----
function makeStore() {
  const _store = {};
  const api = {
    getItem: (k) => (k in _store ? _store[k] : null),
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    key: (i) => Object.keys(_store)[i] || null,
    _keys: () => Object.keys(_store),
    _reset: () => { for (const k of Object.keys(_store)) delete _store[k]; },
  };
  Object.defineProperty(api, 'length', { get: () => Object.keys(_store).length });
  return api;
}
globalThis.localStorage = makeStore();

// ---- seeded RNG BEFORE eval (modules capture Math.random at load) ----
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;

// ---- full module list in index.html order (minus DOM-only) ----
const LOAD_ORDER = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/broadcast.js',
  'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
  'src/js/corruption.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
  'src/js/build.js'];
for (const f of LOAD_ORDER) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

let fails = 0, passes = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  if (cond) passes++; else fails++;
}
function deq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deq(x, b[i]));
  }
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every(k => deq(a[k], b[k]));
}

(async () => {
  await Game.init();
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  Game.drama = () => {}; Game.audioEvent = () => {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 5000; s.hydration = 100; s.mx = 4; s.my = 4;
  const v = Game.state.village; v.trust = v.trust || {};
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const vid2 = roster[0];
  const saveKey = () => Game.state.runKey;

  // ================= K9: STALE CONVERSATION ACTIVE =================
  // Start a real conversation, drive one exchange, save mid-conversation.
  Game.startConvo(vid2);
  check('K9 setup: convo active', Game.convoGet(vid2).active === true);
  try { Game.convoTurn(vid2, 'agree'); } catch (e) { /* harness may lack the beat */ }
  const k9ex = Game.convoGet(vid2).exchanges || 0;
  const k9substantive = k9ex >= 1;
  check('K9 setup: saved mid-conversation', Game.save() === true, 'save status=' + Game.save());
  const k9key = saveKey();
  said.length = 0;
  check('K9 setup: load ok', Game.load(k9key) === true);
  const k9activeAfter = Game.convoGet(vid2).active === true;
  const k9uiActive = Game.convoUI(vid2).active === true;
  if (BEFORE) {
    // The break: active persists — the person card hides Talk (app.js:
    // talkLabel = convo.active ? null : ...) and the chat view is gone.
    check('K9 BREAK: stale convo active after load', k9activeAfter && k9uiActive,
      `active=${k9activeAfter} uiActive=${k9uiActive} — Talk button hidden, villager un-talkable`);
  } else {
    check('K9 FIX: stale convo settled on load', !k9activeAfter && !k9uiActive,
      `active=${k9activeAfter} uiActive=${k9uiActive}`);
    // Talk works again — the softlock is gone.
    const reopened = Game.startConvo(vid2);
    check('K9 FIX: can talk again after load', !!reopened && Game.convoGet(vid2).active === true);
    Game.endConvo(vid2, 'left');
    // No double-settle: endConvo after the load-settle is a noop.
    const c2 = Game.convoGet(vid2);
    check('K9 FIX: no phantom active after re-end', c2.active === false);
  }

  // ================= K9b: ARENA GHOST VOID =================
  // Mid-arena-fight save; tamper the blob so NO fighter restores
  // (corrupt player entry + ghost monster — the documented drop classes).
  Game.tbfight = {
    id: 'f_arena9', over: false, result: null,
    fighters: [
      { key: 'p', kind: 'villager', name: 'You', hp: 80, maxHp: 100, mx: 4, my: 4, alive: true, villagerId: Game.villagerId, moveLeft: 3, acted: false },
      { key: 'm1', kind: 'monster', name: 'Ghost Beast', monsterId: 'ghost_beast_xyz', hp: 50, maxHp: 160, mx: 5, my: 4, alive: true, moveLeft: 3, acted: false },
    ],
    order: ['p', 'm1'], turnIdx: 0, round: 2, terraform: {},
  };
  Game.state.activeContest = {
    contestId: 'blood_pit', phase: 'fight', phaseIdx: 1,
    phases: [{ choices: [{ id: 'arena', label: 'Enter' }] }],
    arenaSuspended: true, participant: 'player',
  };
  Game.state.arenaContest = { contestId: 'blood_pit', waves: ['ghost_beast_xyz'], waveIdx: 0 };
  check('K10 setup: arena save ok', Game.save() === true);
  const k10key = saveKey();
  // tamper: nuke both fighters in the stored blob
  const raw = JSON.parse(localStorage.getItem(k10key));
  raw.run.tbfight.fighters = [null, { key: 'm1', kind: 'monster', monsterId: 'ghost_beast_xyz' }];
  localStorage.setItem(k10key, JSON.stringify(raw));
  said.length = 0;
  check('K10 setup: load ok', Game.load(k10key) === true);
  const k10susp = !!(Game.state.activeContest && Game.state.activeContest.arenaSuspended);
  const k10arc = !!Game.state.arenaContest;
  const k10fight = !!Game.tbfight;
  let k10choose = null;
  try { k10choose = Game.contestChoose(0); } catch (e) { k10choose = 'threw'; }
  const k10stranded = k10susp && k10arc && !k10fight && k10choose && k10choose.arena === true;
  if (BEFORE) {
    check('K10 BREAK: arena contest stranded after ghost load', !!k10stranded,
      `suspended=${k10susp} arenaContest=${k10arc} fight=${k10fight} choose=${JSON.stringify(k10choose)}`);
  } else {
    check('K10 FIX: arena released, not stranded', !k10stranded,
      `suspended=${k10susp} arenaContest=${k10arc} fight=${k10fight}`);
    const acDone = !Game.state.activeContest || Game.state.activeContest.phase === 'done';
    check('K10 FIX: contest voided (phase done)', acDone,
      'phase=' + (Game.state.activeContest && Game.state.activeContest.phase));
    let k10choose2 = null;
    try { k10choose2 = Game.contestChoose(0); } catch (e) { k10choose2 = 'threw'; }
    check('K10 FIX: contest input no longer arena-dead', !(k10choose2 && k10choose2.arena === true),
      'choose=' + JSON.stringify(k10choose2));
    const voidSaid = said.some(t => /voids the bout|gate stands empty/i.test(t));
    check('K10 FIX: honest void line said', voidSaid);
  }

  // ================= K11: SCAM LEDGER ID COLLISION =================
  const realNow = Date.now;
  Date.now = () => 1700000000000; // freeze the clock: same-ms mints
  const ids = new Set();
  for (let i = 0; i < 200; i++) {
    ids.add(Game.recordScam('Face', 'vis_1', 'overprice', 'Ware' + i).id);
  }
  Date.now = realNow;
  if (BEFORE) {
    check('K11 BREAK: scam ids collide on same-ms mint', ids.size < 200,
      `${ids.size}/200 unique — ledger find() hits the wrong entry`);
  } else {
    check('K11 FIX: scam ids unique on same-ms mint', ids.size === 200, `${ids.size}/200 unique`);
  }

  // ================= HELD =================
  // H1: ruin bookChecked persists on the map tile — the 30% first-search
  // can't be re-rolled by save/load.
  const pt = Game.playerTile();
  pt.type = 'ruin'; pt.bookChecked = true; pt.loot = [];
  Game.save(); Game.load(saveKey());
  check('H1 HELD: ruin bookChecked survives save/load', Game.playerTile().bookChecked === true);

  // H2: apKnowsAlien round-trips.
  let h2 = 'skip';
  try {
    const pids = (Game.apPersonas ? Game.apPersonas() : []).map(p => p.id);
    if (pids.length) {
      Game.apRevealAlien(pids[0], 'test');
      const before = Game.apKnowsAlien(pids[0]);
      Game.save(); Game.load(saveKey());
      h2 = before && Game.apKnowsAlien(pids[0]);
    }
  } catch (e) { h2 = 'error: ' + e.message; }
  check('H2 HELD: apKnowsAlien round-trips', h2 === true, String(h2));

  // H3: alienGroup chain state round-trips.
  Game.state.alienGroup = { pids: ['a', 'b'], current: 1 };
  Game.save(); Game.load(saveKey());
  check('H3 HELD: alienGroup round-trips', deq(Game.state.alienGroup, { pids: ['a', 'b'], current: 1 }));

  // H4: insideTent round-trips.
  Game.state.scholar.insideTent = { tx: 1, ty: 2, cx: 3, cy: 4 };
  Game.save(); Game.load(saveKey());
  check('H4 HELD: insideTent round-trips', deq(Game.state.scholar.insideTent, { tx: 1, ty: 2, cx: 3, cy: 4 }));
  Game.state.scholar.insideTent = null;

  // H5: gap3 codex counts are derived from entries — no counters to desync.
  Game.state.codex.monsters = { m1: { stage: 'slain' } };
  Game.state.codex.animals = { a1: { level: 2 } };
  Game.state.codex.techniques = { t1: {} };
  Game.save(); Game.load(saveKey());
  check('H5 HELD: codex entries round-trip (counts derive live)',
    deq(Game.state.codex.monsters, { m1: { stage: 'slain' } }) &&
    deq(Game.state.codex.animals, { a1: { level: 2 } }) &&
    deq(Game.state.codex.techniques, { t1: {} }));

  // H6: empty (0-exchange) convo settles quietly on load — no crash.
  Game.startConvo(vid2);
  Game.save(); Game.load(saveKey());
  check('H6 HELD: empty convo cleared on load, no crash', Game.convoGet(vid2).active === (BEFORE ? true : false));

  // H7: moot trial state round-trips.
  let h7 = 'skip';
  try {
    const bs = Game.betrayalState();
    bs.cases = bs.cases || [];
    bs.cases.push({ id: 'ctest1', status: 'open', playerRole: 'accused', accused: [Game.villagerId], trial: { awaitingPlayerVote: true, day: 5, present: [], votes: {} } });
    Game.save(); Game.load(saveKey());
    const c = (Game.betrayalState().cases || []).find(x => x.id === 'ctest1');
    h7 = !!(c && c.trial && c.trial.awaitingPlayerVote === true);
    Game.betrayalState().cases = (Game.betrayalState().cases || []).filter(x => x.id !== 'ctest1');
  } catch (e) { h7 = 'error: ' + e.message; }
  check('H7 HELD: moot trial awaitingPlayerVote round-trips', h7 === true, String(h7));

  // H8: r12 held-contest counter round-trips (||0-guarded for old saves).
  Game.state.contestsHeld = 3;
  Game.save(); Game.load(saveKey());
  check('H8 HELD: contestsHeld round-trips', Game.state.contestsHeld === 3);
  Game.state.contestsHeld = 0;

  // H9: arenaSuspended + LIVE tbfight restore (non-ghost; pass-8 re-proven).
  let h9 = 'skip';
  try {
    const mid = (Game.data.monsters || []).find(m => m && m.id) || { id: 'hushwolf' };
    Game.tbfight = {
      id: 'f_arena_live', over: false, result: null,
      fighters: [
        { key: 'p', kind: 'villager', name: 'You', hp: 80, maxHp: 100, mx: 4, my: 4, alive: true, villagerId: Game.villagerId, moveLeft: 3, acted: false },
        { key: 'm1', kind: 'monster', name: mid.name || 'Beast', monsterId: mid.id, hp: 50, maxHp: 160, mx: 5, my: 4, alive: true, moveLeft: 3, acted: false },
      ],
      order: ['p', 'm1'], turnIdx: 0, round: 1, terraform: {},
    };
    Game.state.activeContest = { contestId: 'blood_pit', phase: 'fight', phaseIdx: 1, phases: [{}], arenaSuspended: true, participant: 'player' };
    Game.state.arenaContest = { contestId: 'blood_pit', waves: [mid.id], waveIdx: 0 };
    Game.save(); Game.load(saveKey());
    h9 = !!Game.tbfight && Game.tbfight.fighters.length === 2 &&
      !!(Game.state.activeContest && Game.state.activeContest.arenaSuspended) &&
      deq(Game.state.arenaContest, { contestId: 'blood_pit', waves: [mid.id], waveIdx: 0 });
    Game.tbfight = null;
    Game.state.activeContest = null; Game.state.arenaContest = null;
  } catch (e) { h9 = 'error: ' + e.message; }
  check('H9 HELD: live arena fight restores mid-fight', h9 === true, String(h9));

  // H10: monster ghost-drop with live player — honest line, fight continues
  // (the documented ghost policy, same as wild fights).
  let h10 = 'skip';
  try {
    Game.tbfight = {
      id: 'f_ghost_live', over: false, result: null,
      fighters: [
        { key: 'p', kind: 'villager', name: 'You', hp: 80, maxHp: 100, mx: 4, my: 4, alive: true, villagerId: Game.villagerId, moveLeft: 3, acted: false },
        { key: 'm1', kind: 'monster', name: 'Ghost', monsterId: 'ghost_beast_xyz', hp: 50, maxHp: 160, mx: 5, my: 4, alive: true, moveLeft: 3, acted: false },
      ],
      order: ['p', 'm1'], turnIdx: 0, round: 1, terraform: {},
    };
    said.length = 0;
    Game.save(); Game.load(saveKey());
    const ghostSaid = said.some(t => /phantom fighter|gone/i.test(t));
    h10 = !!Game.tbfight && Game.tbfight.fighters.length === 1 && ghostSaid;
    Game.tbfight = null;
  } catch (e) { h10 = 'error: ' + e.message; }
  check('H10 HELD: ghost monster drops w/ honest line, player fight continues', h10 === true, String(h10));

  console.log(`\n${passes} passed, ${fails} failed — ${BEFORE ? 'BEFORE' : 'AFTER'} mode, seed ${SEED}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
