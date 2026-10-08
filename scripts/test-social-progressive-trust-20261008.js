// PROOF: progressive trust was designed (Steve 2026-10-07) but NEVER WIRED.
// trustGainProgressive (game.js) had 0 callers; Game.trustGain (conversation.js)
// had 0 callers. Every live trust write used FLAT gains: a private 'full'
// food gift gave +24 trust at trust 95 exactly as at trust 10.
// Fixed behavior (this test): gains diminish with current trust —
// 0-50 full, 50-75 half, 75-90 quarter, 90-100 one point at a time (and only
// for acts of base >= 5; small acts give 0 up there).
// FAILS on pre-fix code (flat gains), PASSES after wiring.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require(path.join(ROOT, 'scripts', 'harness-detective.js'));
const { Game, fresh, say } = H;

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra !== undefined ? ': ' + JSON.stringify(extra) : ''}`); }
}

(async () => {
await Game.init();
fresh();
const s = Game.state.scholar;
const v = Game.state.village;
const vid = (v.roster || []).find(id => id !== s.villagerId);
if (!vid) { console.log('FAIL setup: no NPC villager'); process.exit(1); }

// stock the player with plenty of real food
s.inventory.push({ name: 'Dried meat', kcalEach: 400, units: 300, spoilDay: 9999 });
say();

function giftGainAt(trustLevel) {
  v.trust = v.trust || {}; v.trust[vid] = trustLevel;
  const r = Game.giveFood(vid, 'bite'); // base 4 (x1.5 if private)
  say();
  return r && r.ok ? (r.trustGain || 0) : null;
}

// 1. flat vs progressive: same gift must give LESS at trust 80 than at trust 10
const g10 = giftGainAt(10);
const g80 = giftGainAt(80);
ok('gift@10>0', g10 !== null && g10 > 0, g10);
ok('gift@80 < gift@10 (diminishing)', g80 !== null && g10 !== null && g80 < g10, { g10, g80 });

// 2. 90+: small acts give at most 1 (private bite = 6 after x1.5, which
// qualifies as "extraordinary" under the >=5 rule — 1 point, no more)
const g95small = giftGainAt(95);
ok('gift(bite)@95 <= 1', g95small !== null && g95small <= 1, g95small);

// 3. 90+: an extraordinary act (full gift, base 16+) moves exactly ~1
v.trust[vid] = 95;
const rFull = Game.giveFood(vid, 'full'); say();
const g95big = rFull && rFull.ok ? rFull.trustGain : null;
ok('gift(full)@95 is exactly 1 (extraordinary act)', g95big === 1, g95big);

// 4. donateToPantry is progressive too (was flat +10 per 5000 kcal at any level)
function donateGainAt(trustLevel) {
  const pid = s.villagerId;
  v.trust[pid] = trustLevel;
  s.inventory.push({ name: 'Smoked fish', kcalEach: 500, units: 10, spoilDay: 9999 }); // 5000 kcal
  const before = v.trust[pid];
  Game.donateToPantry(s.inventory.length - 1); say();
  return v.trust[pid] - before;
}
const d10 = donateGainAt(10), d80 = donateGainAt(80);
ok('donate@80 < donate@10', d10 > 0 && d80 < d10, { d10, d80 });

// 5. bumpTrust (the general conduit: moot votes, task rewards) is progressive
v.trust[vid] = 10; const b10 = (() => { const b = v.trust[vid]; Game.bumpTrust(vid, 6); say(); return v.trust[vid] - b; })();
v.trust[vid] = 95; const b95 = (() => { const b = v.trust[vid]; Game.bumpTrust(vid, 6); say(); return v.trust[vid] - b; })();
ok('bumpTrust(+6)@95 < bumpTrust(+6)@10', b10 > 0 && b95 < b10, { b10, b95 });
ok('bumpTrust(+6)@95 <= 1', b95 <= 1, b95);

// 6. losses are NOT softened: punishment lands whole even at high trust
v.trust[vid] = 95; const l0 = v.trust[vid]; Game.bumpTrust(vid, -20); say();
eq('loss(-20)@95 lands whole', v.trust[vid], l0 - 20);

// 7. trust never exceeds 100 and never drops below 0
v.trust[vid] = 99; Game.bumpTrust(vid, 6); say();
ok('clamped at 100', v.trust[vid] <= 100, v.trust[vid]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
