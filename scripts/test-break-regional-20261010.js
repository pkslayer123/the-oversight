#!/usr/bin/env node
// BREAK-IT REGIONAL 2026-10-10 — proof for two catches:
//   A. EXPLOIT: a subordinate's tribute is MINTED from thin air. linkTick's
//      primary-side branch pushes tributeKcalPerWeek (x1.25 national) into
//      Haven's pantry without ever debiting the subordinate village's
//      pantryKcal — a starving village pays 4,000-8,750 kcal/week forever.
//      (Sibling of the 2026-10-10 covenant-pour fix, which debits every
//      fire's own stores; the tribute path was never fixed.)
//   B. SOFTLOCK: the Regional Dawn restage ("the moment survives",
//      accordUnanswered) is UNREACHABLE from the UI. breakLink() never
//      clears state.pendingAccord, and the accord buttons render only for
//      ACTIVE links (app.js) — so answerAccord's dead-link branch can never
//      fire, pendingAccord points at a dead link forever, and the next link
//      never restages the moment.
//   C. HONESTY (minor): the defense-call button promises "two villagers"
//      but _musterAway(2) can return 1 — the engine sends one and the say
//      line is honest, but the button over-promises.
// Run: SEED=11 node scripts/test-break-regional-20261010.js (also 222, 3333)
// Node harness: full src/js/*.js list in index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js). Math.random is
// seeded BEFORE eval (modules capture it at load).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '11', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at LOAD; deleted before play
[
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/convo-scene.js', 'src/js/examine.js',
  'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/broadcast.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/corruption.js',
  'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/villager-agency.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/comms.js', 'src/js/safetynets.js', 'src/js/debug-scenarios.js',
  'src/js/build.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // sync combat path, per harness lessons
const Game = globalThis.Scattering.Game;

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function saidHas(re) { return says.some(t => re.test(t)); }
function saidClear() { says.length = 0; }

let failures = 0, passes = 0;
function ok(cond, label) {
  if (cond) { passes++; console.log(`  PASS ${label}`); }
  else { failures++; console.log(`  FAIL ${label}`); }
}
function pantryKcal() {
  return (Game.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.depart(); } catch (e) {}
  Game.state.scholar.day = 10;

  const ov = () => (Game.state.otherVillages || []).find(v => v && v.id !== 'haven');
  const sub = ov();
  sub.generated = true; sub.opinion = 50; sub.rumored = true;
  sub.roster = [{ id: 'spk1', name: 'Test Speaker', alive: true }];
  if (typeof Game.knowsVillage === 'function') { /* rumor/visit flags set above */ }

  console.log('== A. subordinate tribute must come from THEIR stores ==');
  // form a link where HAVEN is primary (they bow to us)
  const link = Game._formLink(sub.id, { asSubordinate: false, tributeKcalPerWeek: 4000 }, null);
  link.trust = 100; // trust roll always pays
  saidClear();
  // the subordinate's pantry is nearly EMPTY — 500 kcal for a whole village
  sub.pantryKcal = 500;
  const havenBefore = pantryKcal();
  // force the weekly tick to run this week
  const m = Game.mshipState();
  m.lastLinkWeek = -1;
  Game.linkTick();
  const havenGained = pantryKcal() - havenBefore;
  console.log(`  sub pantry before=500 after=${Math.round(sub.pantryKcal || 0)}; haven gained=${Math.round(havenGained)}`);
  ok((sub.pantryKcal || 0) < 500, 'subordinate pantry was debited (their fields paid)');
  ok(havenGained <= 500 * 1.25 + 1, 'haven gained at most what their stores held (no minting)');
  ok(saidHas(/thin|empty|short/i), 'shortfall said aloud');

  console.log('== A2. a FAT subordinate still pays in full ==');
  saidClear();
  Game.breakLink(link.id, 'severed'); // isolate: only the fat link ticks now
  const link2 = Game._formLink('village_1', { asSubordinate: false, tributeKcalPerWeek: 4000 }, null);
  link2.trust = 100;
  const sub2 = (Game.state.otherVillages || []).find(v => v && v.id === 'village_1');
  sub2.generated = true; sub2.roster = [{ id: 'spk2', name: 'Fat Speaker', alive: true }];
  sub2.pantryKcal = 50000;
  const hb2 = pantryKcal();
  m.lastLinkWeek = -1;
  Game.linkTick();
  const hg2 = pantryKcal() - hb2;
  console.log(`  fat sub pantry after=${Math.round(sub2.pantryKcal || 0)}; haven gained=${Math.round(hg2)}`);
  ok(Math.round(sub2.pantryKcal || 0) === 50000 - 4000, 'fat subordinate debited exactly 4,000');
  ok(Math.round(hg2) === 4000, 'haven received exactly 4,000 (no national mult yet)');
  ok((link2.history || []).some(h => h.kind === 'tribute'), 'full payment written to the link history');

  console.log('== B. first-link break must restage the Regional Dawn ==');
  saidClear();
  // fresh state for the dawn: reset the flags the earlier links set
  Game.state.networkLive = false;
  Game.state.accordUnanswered = false;
  Game.state.pendingAccord = null;
  const first = Game._formLink(sub.id, { asSubordinate: true, tributeKcalPerWeek: 4000 }, null);
  ok(!!Game.state.pendingAccord, 'first link staged the accord (pendingAccord set)');
  ok(Game.state.networkLive === true, 'networkLive on after first link');
  // break it BEFORE answering — the gesture dies unmade
  Game.breakLink(first.id, 'gambit');
  ok(!Game.state.pendingAccord, 'breakLink cleared the dead pendingAccord');
  ok(Game.state.accordUnanswered === true, 'breakLink set accordUnanswered');
  ok(saidHas(/dies unmade|unmade/i), 'the death of the moment said aloud');
  // the next link must restage the moment
  const second = Game._formLink(sub.id, { asSubordinate: true, tributeKcalPerWeek: 4000 }, null);
  ok(!!Game.state.pendingAccord && Game.state.pendingAccord.linkId === second.id,
     'second link restaged the accord on the NEW link');
  ok(Game.state.accordUnanswered === false, 'accordUnanswered cleared by the restage');

  console.log('== C. defense-call button must not promise two villagers ==');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok(!/Send two villagers/.test(appSrc), 'no button promises "two villagers" anymore');

  console.log('== D. trade-favor repayment comes from THEIR stores ==');
  saidClear();
  const tsub = (Game.state.otherVillages || []).find(v => v && v.id === 'village_1');
  tsub.pantryKcal = 200; // nearly bare
  const tlink = Game._formPeerLink(tsub.id, { kind: 'trade' });
  tlink.trust = 80;
  tlink.pendingTradeCall = { day: Game.state.scholar.day };
  const sentHow = Game.answerTradeCall(tlink.id, 'send');
  ok(sentHow === 'sent', 'favor party sent (' + sentHow + ')');
  // the return line must name the village, not "them"
  Game.state.scholar.day += 4;
  const hbD = pantryKcal();
  Game.awayPartiesReturnTick();
  const hgD = pantryKcal() - hbD;
  console.log(`  payer pantry after=${Math.round(tsub.pantryKcal || 0)}; haven gained=${Math.round(hgD)}`);
  ok(Math.round(tsub.pantryKcal || 0) === 0, 'payer pantry debited what it had (200)');
  ok(Math.round(hgD) === 200, 'haven received exactly the 200 repaid (no minting)');
  ok(saidHas(/nearly bare/), 'short repayment said aloud');
  ok(!saidHas(/at them, days served/), 'return line names the village, never "at them"');
  ok(saidHas(new RegExp(tsub.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))), 'return line names ' + tsub.name);

  console.log(`\n${passes} passed, ${failures} failed (seed ${SEED})`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
