#!/usr/bin/env node
// PROOF (socialite r11, 2026-10-10): before/after for 4 fixes.
// F1: diplomat XP on convo OPEN farmed L3 via 35 zero-exchange open/leave
//     cycles (10 kcal + 1 tick each; free at 0 kcal). AFTER: XP lands in
//     endConvo gated on exchanges>=1 — open/leave grants nothing.
// F2: MODAL "one conversation at a time" iterated v.convos (dead key;
//     convoGet stores v.conv) — 12 simultaneous active convos possible.
//     AFTER: opening B ends A's convo (no payout), v.convos references gone.
// F3: ask:gossip inside a conversation silently charged a SECOND 10 kcal
//     (askAbout's standalone verb cost), contradicting CONVERSATIONS.md's
//     "10 kcal per conversation (charged on open)". AFTER: in-convo ask is
//     free; standalone askAbout still charges its honest 10.
// F4: dlg:help "How can I help?" set c.offeredHelp, locking the FORMAL
//     offer_help (tracked promise) out of the menu for the rest of the
//     conversation. AFTER: casual ask no longer blocks the formal vow.
// Run: node scripts/test-socialite-r11-fixes-20261010.js (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const LOAD_ORDER = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'
];
for (const f of LOAD_ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;
let fails = 0;
const check = (name, cond, detail) => {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};
const trustOf = (vid) => ((Game.state.village.trust || {})[vid] === undefined ? 10 : Game.state.village.trust[vid]);

(async () => {
  await Game.init();
  Game.say = () => {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 5000; s.hydration = 100; s.mx = 4; s.my = 4;
  s.backgroundAbilities = [{ id: 'diplomat', name: 'Diplomat', level: 1, xp: 0 }];
  const dip = () => s.backgroundAbilities.find(a => a.id === 'diplomat');
  const v = Game.state.village; v.trust = v.trust || {};
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0], vid2 = roster[1];

  // ---- F1: open/leave grants NO diplomat XP anymore ----
  for (let i = 0; i < 12; i++) { Game.startConvo(vid); Game.endConvo(vid, 'left'); }
  check('F1: 12 open/leave cycles grant 0 diplomat XP (was 12, L2 at 10)', dip().xp === 0 && dip().level === 1,
    `xp=${dip().xp} level=${dip().level}`);
  // a real 1-exchange conversation still earns it
  Game.startConvo(vid);
  Game.convoTurn(vid, 'agree');
  Game.endConvo(vid, 'natural');
  check('F1: 1-exchange conversation still earns 1 diplomat XP', dip().xp === 1, `xp=${dip().xp}`);
  // 0-kcal open/leave: no XP, no negative kcal
  s.kcal = 0;
  const xp0 = dip().xp;
  Game.startConvo(vid); Game.endConvo(vid, 'left');
  check('F1: 0-kcal open/leave grants no XP and kcal stays >= 0', dip().xp === xp0 && s.kcal === 0,
    `xp ${xp0}->${dip().xp}, kcal=${s.kcal}`);
  s.kcal = 5000;

  // ---- F2: modal — one conversation at a time ----
  v.trust[vid] = 10; v.trust[vid2] = 10;
  Game.startConvo(vid);
  Game.convoTurn(vid, 'agree');
  Game.startConvo(vid2);
  const aConvo = Game.convoGet(vid);
  check('F2: opening B ends A\'s conversation', aConvo && !aConvo.active,
    `A active=${!!(aConvo && aConvo.active)}`);
  check('F2: abandoned convo pays no trust stipend', trustOf(vid) === 10, `trust=${trustOf(vid)}`);
  check('F2: B\'s conversation is the live one', !!(Game.convoGet(vid2) || {}).active, '');
  Game.endConvo(vid2, 'left');
  // no dead v.convos references remain anywhere
  const src = fs.readFileSync(path.join(ROOT, 'src/js/conversation.js'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'src/js/abilityActions.js'), 'utf8');
  check('F2: no v.convos dead-key references remain', !/v\.convos\b/.test(src), '');

  // ---- F3: gossip ask no longer double-charges ----
  v.trust[vid] = 10;
  Game.startConvo(vid);
  const kOpen = s.kcal; // after the named 10-kcal open charge
  Game.convoTurn(vid, 'ask:gossip');
  Game.endConvo(vid, 'left');
  check('F3: in-conversation gossip ask costs 0 extra kcal (was silent +10)', s.kcal === kOpen,
    `kcal ${kOpen}->${s.kcal}`);
  // standalone verb keeps its honest cost
  const kBefore = s.kcal;
  Game.askAbout(vid, 'gossip');
  check('F3: standalone askAbout still charges its 10-kcal verb cost', s.kcal === kBefore - 10,
    `kcal ${kBefore}->${s.kcal}`);

  // ---- F4: casual help no longer blocks the formal vow ----
  Game.startConvo(vid);
  const c = Game.convoGet(vid);
  Game.convoTurn(vid, 'dlg:help'); // engine path, as if the offer beat offered it
  check('F4: dlg:help does not set offeredHelp', c.offeredHelp === false, `offeredHelp=${c.offeredHelp}`);
  check('F4: dlg:help grants no tracked promise by itself', !((v.promises || {})[vid] && !(v.promises[vid].kept)),
    '');
  Game.endConvo(vid, 'left');

  // ---- syntax sanity on edited files ----
  for (const f of ['src/js/conversation.js', 'src/js/convo-dialogue.js', 'src/js/game.js', 'src/js/abilityActions.js']) {
    try { new (require('vm').Script)(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
    catch (e) { check(`syntax ${f}`, false, String(e).slice(0, 100)); }
  }
  check('syntax: all edited files parse', true);

  console.log(`\nRESULT: ${fails === 0 ? 'ALL PROOFS PASS' : fails + ' FAILURES'}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
