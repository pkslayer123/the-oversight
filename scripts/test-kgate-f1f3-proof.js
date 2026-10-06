// ============================================================================
// PROOF TEST — knowledge-gating fixes F1–F3 (Steve 2026-10-06).
//
// Steve's law: "If you don't know, it doesn't show."
//
// What it proves (before/after):
//   BEFORE (pre-fix files): examine names "Pine", proximity hints say
//     "A pine. There might be nuts." / "A mature pine...", and no amount of
//     studying teaches the tree — pine is a permanent mystery.
//   AFTER (fixed files):    unknown pine reads as "a tree" / "an old giant" /
//     "A nut tree", and 3 careful deep-studies teach "pine" — the gate opens,
//     it doesn't vanish.
//
// Run AFTER:  node scripts/test-kgate-f1f3-proof.js
// Run BEFORE: build a pre-fix tree once with
//   git worktree add /tmp/kgate-before 8de8310^   (never commit in it)
//   KGATE_SRC=/tmp/kgate-before node scripts/test-kgate-f1f3-proof.js
// Expected: BEFORE shows the leaks (asserts fail, quoted verbatim);
//           AFTER is all green.
// ============================================================================
const fs = require('fs');
const path = require('path');
const ROOT = process.env.KGATE_SRC ? path.resolve(process.env.KGATE_SRC) : path.join(__dirname, '..');
const BEFORE = !!process.env.KGATE_SRC;
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond, evidence) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       evidence: ${evidence}`); }
}
const seen = [];
function asPlayer(label, lines) {
  console.log(`\n--- PLAYER SEES: ${label} ---`);
  lines.forEach(l => console.log(`  "${l}"`));
  seen.push(...lines);
}

(async () => {
  console.log(`kgate F1–F3 proof — ${BEFORE ? 'BEFORE (pre-fix tree at ' + ROOT + ')' : 'AFTER (fixed tree)'}`);
  await Game.init();
  const said = [];
  const origSay = Game.say;
  Game.say = function (t) { said.push(String(t)); return origSay.call(this, t); };

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const S = Game.state.scholar;
  const tile = Game.playerTile();
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  tile.modifiers = tile.modifiers || {};
  const pineMod = () => ({ species: 'pine', health: 'healthy', ivy: false, known: false });

  // Stage: unknown pine at (4,3), player at (4,4), 3x3 cleared.
  S.mx = 4; S.my = 4;
  detail[3][4] = 'tree';
  tile.modifiers['4,3'] = pineMod();
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = 4 + dx, y = 4 + dy;
    if (x < 0 || x > 8 || y < 0 || y > 8 || (x === 4 && y === 3)) continue;
    detail[y][x] = 'grass';
  }

  // 1. Walking up: what do the proximity hints whisper?
  const hints = Game.perceptionHints().filter(t => !/stash|village/i.test(t));
  asPlayer('walking up to the tree (perceive hints)', hints);
  check('F2: tree resource hint does not name unknown pine', !hints.some(t => /pine/i.test(t)),
    JSON.stringify(hints));

  // 2. First examine (surface).
  said.length = 0;
  Game.examineCell(4, 3);
  const surface = said.join(' ');
  asPlayer('first examine (surface)', [surface]);
  check('F1a: surface examine does not name unknown pine', !/pine/i.test(surface), surface.slice(0, 120));

  // 3. Second examine (deep).
  said.length = 0;
  Game.examineCell(4, 3);
  const deep = said.join(' ');
  asPlayer('second examine (deep)', [deep]);
  check('F1b: deep examine does not name unknown pine', !/pine/i.test(deep), deep.slice(0, 120));

  // 4. Bigtree variant of the same tree.
  detail[3][4] = 'bigtree';
  const bigHints = Game.perceptionHints().filter(t => !/stash|village/i.test(t));
  asPlayer('walking up to the big tree (perceive hints)', bigHints);
  check('F3: bigtree hint does not name unknown pine', !bigHints.some(t => /pine/i.test(t)),
    JSON.stringify(bigHints));
  detail[3][4] = 'tree';

  // 5. The learn path: study the tree carefully, three times.
  Game.state.codex.treeStudy = {};
  detail[3][5] = 'tree';
  tile.modifiers['5,3'] = pineMod();
  said.length = 0;
  Game.examineCell(5, 3); // surface — no study
  Game.examineCell(5, 3); // deep study 1
  Game.examineCell(5, 3); // deep study 2 — "the name of this one is close"
  const mid = said.join(' ');
  Game.examineCell(5, 3); // deep study 3 — learns
  const learned = said.join(' ');
  asPlayer('studying the tree three times (learning beat)', [mid.slice(-160), learned.slice(-200)]);
  check('LEARN: no permanent mystery — 3 deep studies teach pine',
    Game.treeName('pine') === 'pine', `treeName(pine)=${Game.treeName('pine')}`);

  // 6. The gate opens: known pine is named everywhere.
  S.mx = 5; S.my = 4; // stand next to the now-known pine at (5,3)
  said.length = 0;
  Game.examineCell(5, 3);
  const knownExamine = said.join(' ');
  const knownHints = Game.perceptionHints().filter(t => !/stash|village/i.test(t));
  asPlayer('after learning (examine + hints)', [knownExamine, ...knownHints]);
  check('LEARN: known pine is named by examine', /pine/i.test(knownExamine), knownExamine.slice(0, 120));
  check('LEARN: known pine is named by proximity hints', knownHints.some(t => /pine/i.test(t)),
    JSON.stringify(knownHints));

  console.log(`\nkgate F1–F3 proof: ${pass} pass, ${fail} fail (${BEFORE ? 'BEFORE' : 'AFTER'})`);
  console.log(BEFORE
    ? 'Expected: failures above ARE the documented leaks (evidence/2026-10-06/kgate-audit-20261006-muse.md).'
    : 'All green — the gate holds for strangers and opens for students.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
