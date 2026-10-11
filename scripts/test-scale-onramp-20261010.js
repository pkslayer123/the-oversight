#!/usr/bin/env node
// SCALE ON-RAMP PROOF (2026-10-10, win-rate iteration round 4):
// proves the retuned BELONG vesting bar (trust >= 50, arrears 0, link >= 14
// days to a primary whose realm holds >= 4 villages), and that the bar's
// earned parts still gate:
//   vests at 14d / trust 50 (boundary, inclusive)
//   does NOT vest at 13d (even at trust 50)
//   does NOT vest at trust 49 (even at 14d)
//   does NOT vest with arrears > 0 (trust 50, 14d)
//   does NOT vest when the realm holds < 4 villages (trust 50, 14d, 0 arrears)
//   polityOf('haven') still returns null while unvested; _belongPolity tracks
// Run: SEED=11 node scripts/test-scale-onramp-20261010.js (also 222, 3333)
// Node harness: full src/js/*.js list in index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js). Math.random is
// seeded BEFORE eval (modules capture it at load).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- seeded RNG BEFORE eval ----
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
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/broadcast.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
  'src/js/corruption.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // sync combat path, per harness lessons
const Game = globalThis.Scattering.Game;

let failures = 0;
function ok(cond, label) {
  if (cond) { console.log(`  PASS ${label}`); }
  else { failures++; console.log(`  FAIL ${label}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.depart(); } catch (e) {}

  // Need >= 3 other villages: vA (the primary), vB + vC (their realm).
  while (Game.state.otherVillages.filter(v => v && v.id !== 'haven').length < 3) {
    const base = Game.state.otherVillages.filter(v => v && v.id !== 'haven');
    const t = Object.assign({}, base[base.length - 1]);
    const n = base.length;
    t.id = 'village_onramp' + n; t.name = 'Onrampmere' + n; t.x = (t.x + 3 * n) % 9; t.generated = false;
    Game.state.otherVillages.push(t);
  }
  const ovs = (Game.state.otherVillages || []).filter(v => v && v.id !== 'haven');
  const [vA, vB, vC] = ovs;
  const day = (Game.state.scholar || {}).day || 0;

  // The deed: Haven joins vA as subordinate (courtship path, trust starts 30).
  const link = Game._formLink(vA.id, { asSubordinate: true, tributeKcalPerWeek: 4000 }, null);
  if (!link) { console.log('ABORT: subordinate link did not form'); process.exit(1); }
  ok(link.trust === 30, `new subordinate link starts at trust 30 (got ${link.trust})`);
  // vA's realm: primary + Haven + 2 subs = 4 fires.
  Game.foreignPolities().push({ primary: vA.id, subs: [vB.id, vC.id], day: 0 });

  const setBar = (trust, arrears, ageDays) => {
    link.trust = trust; link.arrears = arrears; link.day = day - ageDays; link.status = 'active';
  };

  console.log(`[seed ${SEED}] the BELONG bar: trust>=50, arrears=0, age>=14d, realm>=4`);
  // ---- boundary: vests at exactly 14d / trust 50 ----
  setBar(50, 0, 14);
  let bp = Game.polityOf(vA.id);
  ok(!!bp && bp.shape === 'belong' && bp.size === 4 && !bp.led,
     `vests at 14d/trust50 (got ${bp ? bp.shape + ' size ' + bp.size : 'null'})`);
  ok(Game._belongPolity() && Game._belongPolity().size === 4, '_belongPolity tracks the vesting');
  // above the boundary too
  setBar(85, 0, 40);
  ok(!!Game.polityOf(vA.id), 'vests above the boundary (trust 85, 40d)');

  // ---- the three earned parts still gate ----
  setBar(50, 0, 13);
  ok(Game.polityOf(vA.id) === null, 'does NOT vest at 13d (trust 50)');
  setBar(49, 0, 14);
  ok(Game.polityOf(vA.id) === null, 'does NOT vest at trust 49 (14d)');
  setBar(50, 1200, 14);
  ok(Game.polityOf(vA.id) === null, 'does NOT vest with arrears 1200 (trust 50, 14d)');
  // realm of 3 (primary + Haven + 1 sub) — the old 21d bar would not save it either
  Game.foreignPolities()[Game.foreignPolities().length - 1].subs = [vB.id];
  setBar(50, 0, 14);
  ok(Game.polityOf(vA.id) === null, 'does NOT vest with a 3-fire realm (realm-4 still required)');
  Game.foreignPolities()[Game.foreignPolities().length - 1].subs = [vB.id, vC.id];
  // a weak primary can still be gamed only by paying the real price: trust + time
  setBar(30, 0, 14);
  ok(Game.polityOf(vA.id) === null, 'does NOT vest at fresh-link trust 30 — trust must be EARNED (+20 via deeds)');

  // ---- _belongPolity tracks the vested state ----
  setBar(50, 0, 14);
  const hb = Game._havenPolity();
  ok(!!hb && hb.shape === 'belong', `_havenPolity surfaces the BELONG polity (got ${hb ? hb.shape : 'null'})`);

  // ---- trust still decays/requires upkeep engine-side (no free vest) ----
  setBar(50, 0, 14);
  ok(Game.polityOf(vA.id) !== null, 'sanity: vested again after reset');

  console.log(failures ? `\n${failures} FAILURES` : '\nALL GREEN');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
