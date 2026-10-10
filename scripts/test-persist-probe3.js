// PROBE 3: CORRUPTION — truncated JSON, corrupt index, versionless blobs.
// Hostile questions: does anything throw, blank-screen, or destroy data?
'use strict';
let fails = 0;
function check(name, cond, extra) {
  if (!cond) { fails++; console.log('FAIL:', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); }
  else console.log('ok:', name);
}
freshGame();
G.save();
const key = G.state.runKey;

// (a) truncated JSON blob
storage.setItem(key, '{"version":1,"village":{"day":9');
let listed = null;
try { listed = S.state.listSaves({ includeStale: true }); } catch (e) { check('listSaves does not throw on truncated blob', false, e.message); }
check('listSaves does not throw on truncated blob', Array.isArray(listed));
check('truncated blob not offered as loadable', !listed.some(i => i.key === key && !i.stale));
check('truncated blob quarantined, not destroyed',
  S.state.listQuarantines().some(q => q.origKey === key), S.state.listQuarantines().length);
const notice = S.state.takeQuarantineNotice();
check('one-shot quarantine notice exists', !!(notice && notice.key === key), notice);
check('notice is one-shot', S.state.takeQuarantineNotice() === null);
check('load() of truncated blob returns null, no throw', S.state.load(key) === null);

// (b) corrupt index: self-heal by adopting orphaned blobs
storage.clear();
freshGame(); G.save();
const key2 = G.state.runKey;
freshGame(); G.save(); // second run, different key
const key3 = G.state.runKey;
storage.setItem('scattering-saves-index', '###not-json###');
const healed = S.state.listSaves();
check('corrupt index self-heals (both blobs adopted)',
  healed.some(i => i.key === key2) && healed.some(i => i.key === key3),
  healed.map(i => i.key));
check('adopted entries flagged', healed.every(i => i.adopted === true));

// (c) versionless blob -> quarantined as untrustworthy, never loaded
storage.setItem('scattering-save-v1-ghost-1', '{"village":{"day":2}}');
const l2 = S.state.listSaves({ includeStale: true });
check('versionless blob not listed', !l2.some(i => i.key === 'scattering-save-v1-ghost-1'));
check('load() refuses versionless blob', S.state.load('scattering-save-v1-ghost-1') === null);

// (d) future-version blob -> refused, kept, surfaced stale
const future = JSON.stringify({ version: 999, village: { day: 1 }, scholar: { day: 1 }, codex: {}, run: { map: {} } });
storage.setItem('scattering-save-v1-future-1', future);
const l3 = S.state.listSaves({ includeStale: true });
const fst = l3.find(i => i.key === 'scattering-save-v1-future-1');
check('future-version blob surfaced as stale, not hidden', !!(fst && fst.stale), fst);
check('future-version blob not in default loadable list',
  !S.state.listSaves().some(i => i.key === 'scattering-save-v1-future-1'));
check('load() refuses future version', S.state.load('scattering-save-v1-future-1') === null);

// (e) quarantine restore round-trip: versionless snapshot must REFUSE with 'unusable'
const qs = S.state.listQuarantines();
const q0 = qs[0];
if (q0) {
  const rr = S.state.restoreQuarantine(q0.qkey);
  check("restoreQuarantine refuses never-loadable snapshot with 'unusable'", rr === 'unusable', rr);
  check('refused snapshot stays quarantined (not destroyed)', S.state.listQuarantines().some(q => q.qkey === q0.qkey));
} else check('quarantine list non-empty for restore test', false);

// (f) unparseable snapshot restore -> 'corrupt' (never throws, never "restores")
storage.setItem('scattering-save-v1-trunc-9', '{"version":1,"village":{"day":');
S.state.listSaves(); // triggers quarantine
const tq = S.state.listQuarantines().find(q => q.origKey === 'scattering-save-v1-trunc-9');
check('truncated blob quarantined', !!tq);
if (tq) check("restoreQuarantine refuses unparseable snapshot with 'corrupt'",
  S.state.restoreQuarantine(tq.qkey) === 'corrupt', S.state.restoreQuarantine(tq.qkey));
console.log(fails === 0 ? 'PROBE3 ALL GREEN' : `PROBE3 ${fails} FAILURES`);
process.exit(fails ? 1 : 0);
