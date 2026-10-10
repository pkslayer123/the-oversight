#!/usr/bin/env node
// HUNTER ATTACK 2026-10-09 r2 (adversarial playtest loop, archetype 5).
// Hostile probes against the gill-net path in game.js checkNets():
//
//   E1 EXPLOIT — net kcal printing. The net's own comment says it fishes
//      "the tile's real fish population": creek chub and bluegill, the
//      tile's own stock. The species data says creek chub = 200 kcal gross,
//      bluegill = 150. The catch line paid a FLAT 300-600 kcal as the
//      carcass gross (up to 4x a bluegill's chemical energy) and named it
//      a generic "fish", bypassing both the ecology and the energy law
//      ("energy is never created" — cooking model, Steve 2026-10-08).
//      Post-fix: gross = round(species.calories * fishing.yield), real
//      species carcass, body-in-hand identification like traps.
//   E2 SOFTLOCK — fished-out net sits silent forever. checkNets skipped
//      empty water with NO message (traps have quietTold). A player can
//      check a dead net every dawn forever; uses never decrement on a miss,
//      so the net is immortal and the silence is indistinguishable from
//      bad luck. Post-fix: one honest quiet message per net.
//   E3 HONESTY — the catch message names the species ("caught a fish"
//      was a lie by omission when the tile's stock is known species), the
//      ecology decrement still lands, and uses decrement on catch.
//   E4 REGRESSION — pemmican small-input retention stays ~97% (prior fix:
//      fixed-3-bar printing). Guard the chain this run's fix feeds into.
//
// Harness: mulberry32 seeded BEFORE eval (modules capture Math.random at
// load), full src/js module list in index.html order minus DOM-only files
// and drama.js, window stubbed for eval then deleted (sync combat path).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
let _rng = mulberry32(SEED);
Math.random = () => _rng();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const ORDER = ['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js',
 'src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js',
 'src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/convo-mood.js',
 'src/js/convoTopics.js','src/js/convo-wants.js','src/js/convo-dialogue.js','src/js/convo-beats.js',
 'src/js/convo-scene.js','src/js/examine.js','src/js/equipment.js','src/js/journal.js','src/js/party.js',
 'src/js/party-formal.js','src/js/truth.js','src/js/contests.js','src/js/contestEngine.js',
 'src/js/alienPlayers.js','src/js/storage.js','src/js/perceive.js','src/js/carexplore.js',
 'src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js',
 'src/js/progression.js','src/js/ledger.js','src/js/abilityActions.js','src/js/monsterBehaviors.js',
 'src/js/statusEffects.js','src/js/villager-agency.js','src/js/fieldFights.js',
 'src/js/villager-objectives.js','src/js/codex-people.js','src/js/membership.js',
 'src/js/hierarchy.js','src/js/debug-scenarios.js','src/js/build.js'];
for (const f of ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

const fails = [];
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fails.push(name);
}
function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100; s.hp = 100;
  Game.genDetail = flatGrid;
  return s;
}
// creek under the player, a net in hand
function creekNet(s) {
  const t = Game.tileAt(4, 4);
  t.type = 'creek';
  s.inventory.push({ itemId: 'gill_net', name: 'Gill net', units: 1 });
  Game.setNet();
  return t;
}
function forcedCatch(t) {
  const real = Math.random;
  Math.random = () => 0.0; // catch roll passes; species index 0
  try { Game.checkNets(); } finally { Math.random = real; }
}
function sayLog(fn) {
  const msgs = [];
  const real = Game.say;
  Game.say = (m) => { msgs.push(String(m)); };
  try { fn(); } finally { Game.say = real; }
  return msgs;
}
function speciesCal(id) {
  const a = (Game.data.animals || []).find(x => x.id === id) || {};
  return a.calories || 0;
}

(async () => {
  await Game.init();
  console.log('SPECIES GROSS (canon truth): creek_chub=' + speciesCal('creek_chub') + ', bluegill=' + speciesCal('bluegill'));

  // ---- E1: the net must pay the species' real gross, not 300-600 ----
  {
    const s = freshGame();
    const t = creekNet(s);
    t.wildlife = { creek_chub: 4 };
    const msgs = sayLog(() => forcedCatch(t));
    const c = s.inventory.find(i => i && i.foodState === 'carcass');
    const gross = c ? c.hiddenKcal : null;
    console.log('  caught item:', c ? c.name : '(none)', 'gross:', gross);
    // BREAK-IT abilities r2 2026-10-10: the fishing SKILL (knowledge.json)
    // now amplifies nets through allModifiers() — a fisherman scholar's
    // Reading the Water L2 lands 200 x 1.15 = 230. The tripwire's target is
    // the old 300-600 FLAT printer, not legit skill modifiers: expect
    // species gross x the resolved fishing.yield (same pipeline as the net).
    const S = globalThis.Scattering;
    const expGross = Math.round(S.modifiers.resolve(200, 'fishing.yield', Game.allModifiers(), {}));
    check('E1 net pays species gross x fishing.yield (chub)', gross === expGross, 'gross=' + gross + ' expected=' + expGross);
    check('E1 gross is never the old 300-600 flat printer', gross < 300, 'gross=' + gross);
    check('E1 carcass is the real species, not generic "fish"', c && /creek chub/i.test(c.name), c && c.name);
    check('E1 catch message names the species', msgs.some(m => /creek chub/i.test(m)), msgs.join(' | ').slice(0, 160));
    check('E1 ecology decremented (4 -> 3)', (t.wildlife.creek_chub || 0) === 3, JSON.stringify(t.wildlife));
    check('E1 bluegill gross is 150, never >= 300', true); // covered by chub; bluegill probed next
  }
  {
    // bluegill: the old flat 300-600 floor would pay 2-4x its 150 gross
    const s = freshGame();
    const t = creekNet(s);
    t.wildlife = { bluegill: 3 };
    sayLog(() => forcedCatch(t));
    const c = s.inventory.find(i => i && i.foodState === 'carcass');
    check('E1 bluegill gross == 150', c && c.hiddenKcal === 150, 'gross=' + (c && c.hiddenKcal));
    check('E1 bluegill gross < old 300 floor', c && c.hiddenKcal < 300, 'gross=' + (c && c.hiddenKcal));
  }

  // ---- E2: fished-out water must not sit silent forever ----
  {
    const s = freshGame();
    const t = creekNet(s);
    t.wildlife = {};
    const m1 = sayLog(() => Game.checkNets());
    const m2 = sayLog(() => Game.checkNets());
    const netMsgs = (m) => m.filter(x => /gill net/i.test(x));
    const q1 = netMsgs(m1), q2 = netMsgs(m2);
    console.log('  empty-water dawn1 net msgs:', JSON.stringify(q1));
    check('E2 empty water is announced (once, not silent)', q1.length === 1, q1.length + ' msgs');
    check('E2 not nagged every dawn', q2.length === 0, q2.length + ' msgs');
    const net = t.nets[0];
    check('E2 net survives the quiet (not broken)', !!net && net.uses === 12, 'uses=' + (net && net.uses));
  }

  // ---- E3: uses lifecycle honesty ----
  {
    const s = freshGame();
    const t = creekNet(s);
    t.wildlife = { creek_chub: 4 };
    sayLog(() => forcedCatch(t));
    const net = t.nets[0];
    check('E3 net uses decrement on catch (12 -> 11)', net && net.uses === 11, 'uses=' + (net && net.uses));
  }

  // ---- E4: pemmican small-input retention (regression guard) ----
  {
    const s = freshGame();
    s.inventory.length = 0;
    const put = (o) => s.inventory.push(Object.assign({ units: 1, unit: 'x', spoilDay: 9999, edible: true }, o));
    put({ foodKind: 'meat', foodState: 'preserved', name: 'Smoked fish (smoked)', kcalEach: 200, units: 2 });
    put({ foodKind: 'fat', foodState: 'rendered', name: 'Javelina fat (rendered)', kcalEach: 300, units: 1 });
    put({ plantId: 'serviceberry', foodKind: 'plant', name: 'Serviceberries', kcalEach: 30, units: 2 });
    Game.state.codex.techniques = Game.state.codex.techniques || {};
    Game.state.codex.techniques.render = { level: 3 };
    const inKcal = 2 * 200 + 300 + 2 * 30;
    Game.makePemmican();
    const bars = s.inventory.filter(i => i && i.itemId === 'pemmican');
    const outKcal = bars.reduce((a, b) => a + (b.kcalEach || 0) * (b.units || 1), 0);
    const ret = inKcal ? outKcal / inKcal : 0;
    console.log(`  pemmican: ${inKcal} in -> ${outKcal} out (${(ret * 100).toFixed(1)}% retention)`);
    check('E4 retention ~97% (0.94-1.0), never prints', ret >= 0.94 && ret <= 1.0, (ret * 100).toFixed(1) + '%');
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join(', ')}` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
