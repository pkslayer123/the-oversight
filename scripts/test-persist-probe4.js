// PROBE 4: QUOTA + CROSS-TAB honesty.
// (a) quota-full: save() must return false (never throw, never silent true).
// (b) cross-tab: tab B saves newer -> tab A's save() refuses 'stale', no clobber.
'use strict';
let fails = 0;
function check(name, cond, extra) {
  if (!cond) { fails++; console.log('FAIL:', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); }
  else console.log('ok:', name);
}
freshGame();
// (a) quota
storage.quota = 100; // absurdly small: every save fails
let r = null, threw = false;
try { r = G.save(); } catch (e) { threw = true; }
check('quota-full save does not throw', !threw);
check('quota-full save returns false (honest)', r === false, r);
storage.quota = Infinity;
r = G.save();
check('save recovers after quota clears', r === true, r);

// (b) cross-tab staleness: simulate tab B by bumping the disk blob's saveSeq
G.save();
const key = G.state.runKey;
const disk = JSON.parse(storage.getItem(key));
disk.saveSeq = (G.state.saveSeq || 1) + 5; // tab B saved 5 more times
disk.scholar.kcal = 9999; // tab B's progress
storage.setItem(key, JSON.stringify(disk));
G.state.scholar.kcal = 1111; // tab A's stale in-memory copy
const r2 = G.save();
check('stale tab save refused with stale', r2 === 'stale', r2);
const diskAfter = JSON.parse(storage.getItem(key));
check('stale save did not clobber newer disk data', diskAfter.scholar.kcal === 9999, diskAfter.scholar.kcal);
// after "reloading" (fresh load), saves work again
G.load(key);
check('post-reload save works', G.save() === true);
console.log(fails === 0 ? 'PROBE4 ALL GREEN' : `PROBE4 ${fails} FAILURES`);
process.exit(fails ? 1 : 0);
