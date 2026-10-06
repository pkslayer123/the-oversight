// Proof: duck snake splitting — low HP, independent halves, recursive fragments (Steve 2026-10-06)
// - Each duck has low individual HP [8,12]
// - Killing a middle duck splits the chain: both halves become independent snakes
// - Killing in multiple places yields as many fragments as possible (recursive)
// - No regrouping/rejoining — every fragment hunts on its own
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// 1. Low individual HP
const d = JSON.parse(fs.readFileSync('src/data/monsters.json', 'utf8'));
const ms = Array.isArray(d) ? d : d.monsters;
const duck = ms.find(m => m.id === 'ducks_in_a_row');
ok(duck.hp[0] === 8 && duck.hp[1] === 12, 'duck HP [8,12] (low individual health, 1-2 hits each)');
ok(duck.snake.segments === 14, 'still 14 segments');

// 2. Source: split logic
const game = fs.readFileSync('src/js/game.js', 'utf8');
ok(/tbSnakeSplit\(deadSeg\)/.test(game), 'tbSnakeSplit exists');
ok(/both halves hunt on their own/.test(game), 'split comment: independent halves');
ok(/as many snakes/.test(game) || /as many pieces/.test(game), 'split comment: recursive fragments');
// No regroup/rejoin behavior remains
ok(!/duckRegroup\s*=\s*true/.test(game), 'no duckRegroup = true (regroup behavior removed)');
ok(!/tbSnakeRejoin\(/.test(game), 'tbSnakeRejoin removed (no rejoining)');
ok(!/wants to rejoin/.test(game), 'no rejoin narration');
ok(!/march.*HOME|marches HOME/.test(game), 'no march-home behavior');
// Split narration reflects independence
ok(/both are coming for you/.test(game), 'split narration: both halves hunt');
// Head kill promotes next duck
ok(/takes the lead without breaking step/.test(game), 'head kill: next duck leads');
// Split fires on segment death
ok(/tbSnakeSplit\(t\)/.test(game), 'tbSnakeSplit called on segment death');

// 3. Recursive splitting logic: simulate via source inspection
// tbSnakeSplit filters by snakeId — each fragment gets a NEW snakeId,
// so killing within a fragment re-triggers the split for that fragment.
ok(/s\.snakeId = newSnakeId/.test(game), 'fragments get new snakeId (enables recursive splitting)');
ok(/s\.isHead = \(i === 0\)/.test(game), 'fragment head promoted (first segment becomes head)');
ok(/s\.segmentIndex = i/.test(game), 'fragments reindexed');

// 4. Codex tactics updated (no stale rejoin advice)
const kt = (duck.encounter || {}).knownTactics || '';
ok(!/rejoin/i.test(kt), 'knownTactics: no rejoin advice');
ok(/both halves|every fragment/i.test(kt), 'knownTactics: warns about independent fragments');

// 5. Enrage still per-fragment (2 ducks left in a fragment enrages that fragment)
ok(/dsegs\.length <= 2/.test(game), 'enrage threshold per fragment (2 ducks left)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
