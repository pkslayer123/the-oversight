// Proof test: traveler rumors arrive BEFORE first approach (2026-10-07).
// BUG: the rumor roll lived inside simVillageDay, which only runs during the
// catch-up sim triggered by approaching — so a rumor could only ever fire AS
// you walked in. The design comment always said travelers bring word to YOU
// first ("how you find the village 2 tiles north pretty early — not by
// stumbling into it, but because someone told you").
// FIX: maybeVillageRumor() runs from endDay() for every unvisited village.
// Seeded mulberry32 (default 20261007, SEED env override). Exits nonzero on failure.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261007', 10);
const realRandom = Math.random;
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;

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
  catch (e) { console.error(`FAILED loading ${f}: ${e.message}`); process.exit(2); }
}
delete global.window;

const Game = globalThis.Scattering.Game;
let failures = 0, checks = 0;
const fail = (msg) => { failures++; console.log('  FAIL: ' + msg); };
const ok = (cond, msg) => { checks++; if (cond) console.log('  ok: ' + msg); else fail(msg); };
// force the next Math.random() calls to a fixed value (restores seeded PRNG after)
const rig = (v, fn) => { Math.random = () => v; try { return fn(); } finally { Math.random = mulberry32(SEED); } };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const villages = Game.state.otherVillages || [];
  ok(villages.length >= 2, `generated ${villages.length} distant villages`);
  const v = villages[0];
  ok(!v.generated && !v.rumored, 'village starts unvisited and unrumored');

  // 1. maybeVillageRumor fires when rigged, queues a well-formed rumor
  const n0 = (Game.state.scholar.rumors || []).length;
  const fired = rig(0, () => Game.maybeVillageRumor(v));
  ok(fired === true, 'maybeVillageRumor returns true on success');
  ok(v.rumored === true, 'village marked rumored');
  ok(v.rumorDay === Game.state.scholar.day, `rumorDay = scholar day (${v.rumorDay})`);
  const rs = Game.state.scholar.rumors || [];
  ok(rs.length === n0 + 1, 'exactly one rumor queued');
  const r = rs[rs.length - 1];
  ok(r.type === 'village' && r.villageId === v.id && /traveler passed through/i.test(r.text) && r.text.includes(v.name),
    `rumor text names the village: "${String(r.text).slice(0, 70)}..."`);

  // 2. no double-fire: second call (even rigged) does nothing
  const fired2 = rig(0, () => Game.maybeVillageRumor(v));
  ok(fired2 === false, 'no second rumor for an already-rumored village');
  ok((Game.state.scholar.rumors || []).length === n0 + 1, 'rumor count unchanged');

  // 3. endDay integration: an unrumored, unvisited village can rumor via endDay
  const v2 = villages[1];
  const unrumoredBefore = villages.filter(x => !x.rumored && !x.generated).map(x => x.id);
  const n1 = (Game.state.scholar.rumors || []).length;
  rig(0, () => Game.endDay());
  const rs2 = Game.state.scholar.rumors || [];
  ok(v2.rumored === true, 'endDay rolled a rumor for the second village');
  ok(rs2.length === n1 + unrumoredBefore.length, `endDay queued one rumor per unrumored village (${unrumoredBefore.length})`);
  ok(rs2[rs2.length - 1].villageId === v2.id || unrumoredBefore.includes(rs2[rs2.length - 1].villageId),
    'endDay rumors point at real unvisited villages');

  // 4. OLD behavior is gone: approaching an unrumored village does NOT rumor via catchUpSim.
  //    Reset v2 to unrumored, teleport next to it, catch up — no rumor should appear.
  v2.rumored = false;
  const n2 = (Game.state.scholar.rumors || []).length;
  Game.map.px = v2.x; Game.map.py = v2.y;
  Game.catchUpSim(v2);
  const afterSim = (Game.state.scholar.rumors || []).filter(x => x.villageId === v2.id && !x._pre).length;
  ok(v2.generated === true, 'catchUpSim still generates the village');
  ok(v2.rumored === false, 'catchUpSim no longer marks rumored');
  ok((Game.state.scholar.rumors || []).length === n2, 'approach sim queues no rumor (travelers come via endDay now)');
  void afterSim;

  // 5. visited villages never rumor again (rumorDay stays null-ish)
  const fired3 = rig(0, () => Game.maybeVillageRumor(v2));
  ok(fired3 === false, 'generated (visited) village never rumors');

  console.log(failures ? `\n${failures}/${checks} FAILURES` : `\nALL GREEN (${checks} checks)`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH: ' + (e && e.stack || e)); process.exit(2); });
