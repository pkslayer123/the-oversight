// Blocked travel is never silent. Usage: node scripts/test-blocked-travel-feedback.js
// Explorer loop 2026-10-05: travelTo() against a blockage returned the block
// object and said nothing; clearBlockage() on a hard-creek crossing returned
// false silently. Steve's rule: no silent actions — every tap explains itself.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  if (Game.log) Game.log.length = 0;
}

(async () => {
  await Game.init();
  freshGame();

  // find a neighbor tile with a blockFrom (fallen tree / rubble / washed out)
  const px = Game.map.px, py = Game.map.py;
  let blocked = null;
  for (const t of Game.travelTargets()) {
    const b = Game.travelBlockage(t.x, t.y);
    if (b && b.kind === 'blockage' && b.blockType !== 'creek') { blocked = t; break; }
  }
  // force one of each if the map didn't oblige
  if (!blocked) {
    const t = Game.travelTargets()[0];
    Game.tileAt(t.x, t.y).blockFrom = { dx: -(Math.sign(t.x - px)), dy: -(Math.sign(t.y - py)), type: 'rubble' };
    blocked = t;
  }
  // Deterministic: always force the hard creek on a separate neighbor tile,
  // and strip swimmer from BOTH ability lists (a swimmer just walks across).
  {
    const t = Game.travelTargets().find(x => !(x.x === blocked.x && x.y === blocked.y)) || Game.travelTargets()[0];
    const d = Game.tileAt(t.x, t.y);
    d.type = 'creek'; d.needsBridge = true; d.bridged = false; delete d.blockFrom;
    var creek = t;
  }
  const stripSwim = (l) => (l || []).filter(a => (a.id || a) !== 'swimmer');
  Game.state.scholar.abilities = stripSwim(Game.state.scholar.abilities);
  Game.state.scholar.backgroundAbilities = stripSwim(Game.state.scholar.backgroundAbilities);

  // 1. travelTo into a blocked tile: returns the blockage AND says something.
  said.length = 0;
  const res = Game.travelTo(blocked.x, blocked.y);
  ok('blocked travel returns blockage', res && res.kind === 'blockage');
  ok('blocked travel says what blocks you', said.length > 0 && /tree|rubble|washed|block/i.test(said.join(' ')));
  ok('blocked travel does not move you', Game.map.px === px && Game.map.py === py);

  // 2. travelTo into a hard creek: says the creek reason.
  said.length = 0;
  const res2 = Game.travelTo(creek.x, creek.y);
  ok('creek travel returns blockage', res2 && res2.kind === 'blockage' && res2.blockType === 'creek');
  ok('creek travel names the creek', said.length > 0 && /creek/i.test(said.join(' ')));
  ok('creek travel does not move you', Game.map.px === px && Game.map.py === py);

  // 3. clearBlockage on a hard creek: no longer silent.
  said.length = 0;
  const cr = Game.clearBlockage(creek.x, creek.y);
  ok('clearBlockage on creek returns false', cr === false);
  ok('clearBlockage on creek says bridge/swim', said.length > 0 && /bridge|swim/i.test(said.join(' ')));
  ok('creek blockage still in place', Game.travelBlockage(creek.x, creek.y) !== null);

  // 4. clearBlockage on clear ground: says "nothing to clear", not silence.
  said.length = 0;
  const plain = Game.travelTargets().find(t => !Game.travelBlockage(t.x, t.y) && !(t.x === creek.x && t.y === creek.y));
  if (plain) {
    const pr = Game.clearBlockage(plain.x, plain.y);
    ok('clearBlockage on clear ground returns false', pr === false);
    ok('clearBlockage on clear ground says so', said.length > 0 && /nothing to clear/i.test(said.join(' ')));
  }

  // 5. a real blockFrom still clears properly (no regression).
  said.length = 0;
  const dt = Game.tileAt(blocked.x, blocked.y);
  if (dt.blockFrom && (dt.blockFrom.type === 'rubble' || dt.blockFrom.type === 'fallen_tree')) {
    Game.clearBlockage(blocked.x, blocked.y);
    ok('rubble/tree blockage clears', !Game.tileAt(blocked.x, blocked.y).blockFrom);
    ok('clearing says the path is clear', /path is clear/i.test(said.join(' ')));
  } else {
    ok('rubble/tree blockage clears (skipped: washed_out needs bridge)', true);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
