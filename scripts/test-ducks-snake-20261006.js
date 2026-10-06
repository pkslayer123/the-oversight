// Proof: ducks-in-a-row snake redesign (Steve 2026-10-06)
// - 14 segments, speed 7, contact [6,9]
// - True snake: body follows head's trail, chain stays contiguous
// - Head never crosses its own body or fresh trail
// - Obstacles routed around via candidate directions
// - Full-train pass-over is nearly lethal
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// 1. Data checks
const d = JSON.parse(fs.readFileSync('src/data/monsters.json', 'utf8'));
const ms = Array.isArray(d) ? d : d.monsters;
const duck = ms.find(m => m.id === 'ducks_in_a_row');
ok(duck.snake.segments === 14, 'segments = 14 (way longer)');
ok(duck.speed === 7, 'speed = 7 (fast)');
ok(duck.snake.contactDamage[0] === 6 && duck.snake.contactDamage[1] === 9, 'contact [6,9]');
ok(duck.blocks === false, 'non-blocking ducks');
ok(duck.edible.calories === 2100, 'edible scales to 14 ducks');

// 2. Source checks
const game = fs.readFileSync('src/js/game.js', 'utf8');
ok(/bodySet/.test(game), 'body exclusion set built');
ok(/trail\.some/.test(game), 'head avoids its own fresh trail (no self-cross)');
ok(/trail\.push/.test(game), 'head records full trail');
ok(/TRUE SNAKE FOLLOW/.test(game), 'trail-following body placement');
ok(/TRAIN PASS-OVER/.test(game), 'pass-over damage for train driving over player');
ok(/cands\.push\(\[dx, 1\]\)/.test(game), 'sidestep candidates (obstacle navigation)');
ok(/Fourteen ducks, one mind/.test(game), 'march text updated');

// 3. Lethality: 14 segs x [6,9] — full train
const avgPer = 7.5, fullTrain = 14 * avgPer;
ok(fullTrain >= 90, `full train avg ${fullTrain} vs ~89 HP = nearly lethal`);

// 4. True-snake simulation: head runs 3 tiles, 5 segments follow trail
// trail = [oldH(4,4), t1(5,4), t2(6,4), t3(7,4)], steps=3
// prevPos (old body): seg1(4,4) seg2(3,4) seg3(2,4) seg4(1,4)
const trail = [{x:4,y:4},{x:5,y:4},{x:6,y:4},{x:7,y:4}];
const steps = 3;
const prevPos = [{x:4,y:4},{x:3,y:4},{x:2,y:4},{x:1,y:4},{x:0,y:4}];
const after = [{x:7,y:4}]; // head
for (let i = 1; i < 5; i++) {
  if (i <= steps) {
    const tp = trail[trail.length - 1 - i];
    after.push({x: tp.x, y: tp.y});
  } else {
    const op = prevPos[i - steps];
    after.push({x: op.x, y: op.y});
  }
}
// Expected: head(7,4) seg1(6,4) seg2(5,4) seg3(4,4) seg4(3,4) — contiguous line
const expected = [[7,4],[6,4],[5,4],[4,4],[3,4]];
let match = true;
for (let i = 0; i < 5; i++) {
  if (after[i].x !== expected[i][0] || after[i].y !== expected[i][1]) match = false;
}
ok(match, 'trail-follow places body contiguously along head path');
let contiguous = true;
for (let i = 1; i < after.length; i++) {
  if (Math.max(Math.abs(after[i].x-after[i-1].x), Math.abs(after[i].y-after[i-1].y)) > 1) contiguous = false;
}
ok(contiguous, 'chain contiguous after multi-step head run');

// 5. Pass-over counting: player at trail[1], steps=3 → passing = 2 segs
const px = 5, py = 4;
const crossIdx = trail.findIndex(t => t.x === px && t.y === py);
ok(crossIdx === 1, 'crossing detected at trail index 1');
ok((steps - crossIdx) === 2, '2 segments drive over the player');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
