// Proof: wave-2 damage hardening (Steve 2026-10-09: "Wave 2 should be both harder and scarier").
// Asserts every wave-2 monster's damage rose by the 1.4x hardening, wave-1 is untouched,
// and wave-2 max now clearly exceeds wave-1 max.
const fs = require('fs');
const path = require('path');
const monsters = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'monsters.json'), 'utf8'));

const OLD2NEW = {
  voice_mimic_radio: [[16, 24], [22, 34]],
  mirror_stag:       [[20, 30], [28, 42]],
  review_drone:      [[18, 28], [25, 39]],
  bright_idea:       [[22, 34], [31, 48]],
  memory_projector:  [[16, 26], [22, 36]],
  warranty_caller:   [[14, 22], [20, 31]],
  understudy:        [[14, 20], [20, 28]],
  landlord:          [[18, 26], [25, 36]],
  heckler:           [[12, 18], [17, 25]],
  paparazzo:         [[12, 18], [17, 25]],
  union_rep:         [[14, 20], [20, 28]],
  moderator:         [[12, 18], [17, 25]],
  statickite:        [[12, 18], [17, 25]],
  giant_mosquito:    [[10, 16], [14, 22]],
  alien_tick:        [[6, 10],  [8, 14]],
};
// Wave-1 values Steve set — must not move.
const WAVE1_PINNED = {
  hushwolf: [14, 20], bulldozer: [20, 28], gallowdeer: [22, 32],
  belltoad: [12, 18], lockpick_raccoon: [12, 18],
};

const byId = {};
for (const m of monsters) byId[m.id] = m;
let fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg); };

// 1. Every wave-2 entry hardened exactly as specified.
for (const [id, [oldD, newD]] of Object.entries(OLD2NEW)) {
  const got = byId[id] && byId[id].attack && byId[id].attack.damage;
  ok(!!got, `${id} has damage array`);
  ok(got && got[0] === newD[0] && got[1] === newD[1],
     `${id}: [${got}] === expected [${newD}] (was [${oldD}])`);
  ok(got && got[0] > oldD[0] && got[1] > oldD[1], `${id}: strictly harder than before`);
}
// 2. No wave-2 monster missed: file's wave-2 set must equal our table's key set.
const fileW2 = monsters.filter(m => m.wave === 2).map(m => m.id).sort();
const tableW2 = Object.keys(OLD2NEW).sort();
ok(JSON.stringify(fileW2) === JSON.stringify(tableW2),
   `wave-2 roster fully covered (${fileW2.length} entries, none missed, none extra)`);
// 3. Wave-1 untouched.
for (const [id, dmg] of Object.entries(WAVE1_PINNED)) {
  const got = byId[id].attack.damage;
  ok(got[0] === dmg[0] && got[1] === dmg[1], `wave-1 ${id} untouched at [${dmg}]`);
}
// 4. Wave-2 max clearly exceeds wave-1 max.
const w2max = Math.max(...monsters.filter(m => m.wave === 2).map(m => m.attack.damage[1]));
const w1max = Math.max(...monsters.filter(m => m.wave === 1).map(m => m.attack.damage[1]));
ok(w2max > w1max, `wave-2 max ${w2max} > wave-1 max ${w1max}`);
// 5. Wave-2 typical sits around wave-1 max: median wave-2 max >= wave-1 max - 4.
const w2maxes = monsters.filter(m => m.wave === 2).map(m => m.attack.damage[1]).sort((a, b) => a - b);
const median = w2maxes[Math.floor(w2maxes.length / 2)];
ok(median >= w1max - 4, `wave-2 median max ${median} sits near wave-1 max ${w1max}`);

if (fails.length) { console.error(`\n${fails.length} FAILURES`); process.exit(1); }
console.log('\nAll wave-2 hardening checks green.');
