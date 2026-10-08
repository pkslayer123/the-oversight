#!/usr/bin/env node
// TEST (2026-10-07): Game.nodeDetail() at haven returns a real text.
// Regression: be3b5f2 (2026-10-05) migrated ARRIVAL pools from {title, text}
// to {title, texts:[]} and updated travelTo + the non-haven nodeDetail branch,
// but the haven branch kept reading `arr.text` — which no longer exists.
// Result: nodeDetail().text === undefined for haven (latent: the field is
// not rendered in app.js today, but the contract is broken).
// Fix: haven branch reads this.arrivalTextFor(t), same as every other tile.
// Harness: HEAD-frozen engine (/tmp/explorer-head) + fixed game.js, seeded.
// Run: node scripts/test-haven-nodedetail-text-20261007.js [SEED]
const fs = require('fs');
const path = require('path');
const ROOT = '/tmp/explorer-head';
if (!fs.existsSync(ROOT)) { console.error('missing /tmp/explorer-head extract'); process.exit(2); }

const SEED = parseInt(process.env.SEED || process.argv[2] || '20261007', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at load
// FULL production script list (index.html order), minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js and drama.js (top-level document).
const SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of SCRIPTS) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`FAILED loading ${f}: ${e.message}`); process.exit(2); }
}
delete global.window;

const Game = globalThis.Scattering.Game;
let failures = 0;
const fail = (m) => { failures++; console.log('  FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const tile = Game.playerTile();
  if (!tile || tile.type !== 'haven') { fail(`expected to start at haven, at ${tile && tile.type}`); }
  else ok('newGame starts at haven tile');

  const nd = Game.nodeDetail();
  if (nd.type !== 'haven' || !nd.isHaven) fail(`nodeDetail not haven: ${JSON.stringify({ type: nd.type, isHaven: nd.isHaven })}`);
  else ok('nodeDetail() reports haven');
  if (nd.text === undefined || nd.text === null || nd.text === '') fail(`nodeDetail().text is ${JSON.stringify(nd.text)} (the arr.text regression)`);
  else ok(`nodeDetail().text: "${String(nd.text).slice(0, 60)}..."`);
  const pool = Game.data.arrivalText.tiles.haven.texts;
  if (nd.text && !pool.includes(nd.text)) fail('nodeDetail().text not drawn from the haven pool');
  else ok('text drawn from the haven pool (roll-and-pin contract)');

  // arrivalTextFor pins: second call agrees with first
  const again = Game.nodeDetail();
  if (again.text !== nd.text) fail('haven arrival text not pinned across nodeDetail() calls');
  else ok('haven arrival text pinned per tile');

  if (failures) { console.log(`\n${failures} FAILURES (seed ${SEED})`); process.exit(1); }
  console.log(`\nALL GREEN (seed ${SEED})`);
})().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
