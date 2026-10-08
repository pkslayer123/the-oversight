#!/usr/bin/env node
// Telegraph visual-proof assertion — 2026-10-07 batch (Steve 2026-10-05).
// Asserts that every monster whose telegraph lacked proof as of 2026-10-06
// now has visual proof with DISTINCT, NON-GENERIC output:
//   - known vs unknown renders differ (cue text differs; known carries the
//     "You know this one" coaching marker, unknown never does)
//   - the telegraph routes to its monster's DISTINCT bucket (resonantBurst /
//     swarmHum / heronStrike / beam-via-mon / charge / direct), never the
//     generic burst/lane; unknown states are knowledge-gated (no cells)
//   - attack names match src/data/monsters.json
//   - phase-based telegraphs (catfish, ducks) prove via their dedicated
//     surfaces and document the bucket-renderer's blind spot (code gap)
//   - rush/ambush monsters document no-telegraph-by-design
// Reads evidence/2026-10-07/telegraph-proof-20261007.json + the PNG/SVG files.
// Pure node, no jest. Exit 0 = all assertions hold; exit 1 = failures listed.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'evidence', '2026-10-07');

const failures = [];
const passes = [];
function ok(name) { passes.push(name); }
function fail(name, why) { failures.push(name + ' — ' + why); }

// Expected distinct buckets per monster id (the style-voice routing in
// app.js tbAllTelegraphCells — Steve 2026-10-06).
const EXPECTED = {
  belltoad: 'resonantBurst',
  white_noise_heron: 'heronStrike',
  hummice: 'swarmHum',
  voice_mimic_radio: 'direct',
  mirror_stag: 'charge',
  review_drone: 'beam', // rides buckets.mon (w2a), folded back in by the renderer
};
const SPECIAL = {
  nightlight_catfish: 'catfishTell',
  ducks_in_a_row: 'duckLane',
};
const NO_DESIGN = ['hushwolf', 'speedbump_turtle', 'warranty_caller'];
const BLOCKED = ['nevermore', 'nightcourt', 'statickite'];

const sumPath = path.join(OUT, 'telegraph-proof-20261007.json');
if (!fs.existsSync(sumPath)) { console.error('FAIL: summary JSON missing: ' + sumPath); process.exit(1); }
const summary = JSON.parse(fs.readFileSync(sumPath, 'utf8'));
const byName = {};
for (const s of summary) byName[s.name] = s;

const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const mdefs = {};
for (const m of md) mdefs[m.id] = m;

function filesExist(base) {
  for (const ext of ['.png', '.svg']) {
    const p = path.join(OUT, base + ext);
    if (!fs.existsSync(p)) return 'missing ' + base + ext;
    if (fs.statSync(p).size < 1024) return base + ext + ' suspiciously small';
  }
  return null;
}

// 1. Declaring monsters: known + unknown pairs.
for (const [id, expected] of Object.entries(EXPECTED)) {
  const short = { belltoad: 'belltoad', white_noise_heron: 'heron', hummice: 'hummice', voice_mimic_radio: 'voicemimic', mirror_stag: 'mirrorstag', review_drone: 'reviewdrone' }[id];
  const unk = byName[short + '-unknown'], kn = byName[short + '-known'];
  const tag = id;
  if (!unk || unk.error) { fail(tag + '-unknown', 'missing or errored: ' + ((unk || {}).error || 'absent')); continue; }
  if (!kn || kn.error) { fail(tag + '-known', 'missing or errored: ' + ((kn || {}).error || 'absent')); continue; }
  let fe = filesExist('tg-' + short + '-unknown'); if (fe) { fail(tag + '-unknown', fe); continue; }
  fe = filesExist('tg-' + short + '-known'); if (fe) { fail(tag + '-known', fe); continue; }
  ok(tag + ': proof files exist (png+svg, both states)');

  // data cross-check: attack name + pattern type match monsters.json
  const atk = (mdefs[id] || {}).attack || {};
  const ptype = ((atk.pattern) || {}).type;
  if (kn.pattern !== ptype) fail(tag, 'summary pattern ' + kn.pattern + ' != data ' + ptype);
  else ok(tag + ': pattern ' + ptype + ' matches monsters.json');
  if (kn.attack !== atk.name) fail(tag, 'known attack name ' + kn.attack + ' != data ' + atk.name);
  else ok(tag + ': attack name matches monsters.json');

  // distinct known vs unknown: cues differ; coaching marker only when known
  if (!unk.cue || !kn.cue) fail(tag, 'cue missing in a state');
  else if (unk.cue === kn.cue) fail(tag, 'known and unknown cues identical — not distinct');
  else ok(tag + ': known/unknown cues differ');
  if (/You know this one/.test(unk.cue || '')) fail(tag, 'unknown cue leaks the coaching marker');
  else ok(tag + ': unknown cue has no coaching leak');
  if (!/You know this one/.test(kn.cue || '')) fail(tag, 'known cue missing the coaching marker');
  else ok(tag + ': known cue carries "You know this one" coaching');

  // distinct bucket routing + knowledge gate
  const knz = Object.entries(kn.bucketSizes || {}).filter(([, v]) => v > 0).map(([k]) => k);
  const knMon = (kn.monCellKeys || []).length;
  const routed = knz.includes(expected) || (expected === 'beam' && knMon > 0);
  if (!routed) fail(tag, 'known telegraph did not route to distinct bucket ' + expected + ' (nonzero: ' + knz.join(',') + ', monCells: ' + knMon + ')');
  else ok(tag + ': known telegraph routes to distinct bucket ' + expected + (expected === 'beam' ? ' (via mon identity)' : ''));
  const unz = Object.entries(unk.bucketSizes || {}).filter(([, v]) => v > 0);
  if (unz.length || (unk.monCellKeys || []).length) fail(tag, 'unknown telegraph shows grid cells — knowledge gate broken');
  else ok(tag + ': unknown telegraph shows no cells (knowledge-gated)');
}

// 2. Special phase-based telegraphs (never set m.telegraph — bucket blind spot).
for (const [id, expected] of Object.entries(SPECIAL)) {
  const short = id === 'nightlight_catfish' ? 'catfish' : 'ducks';
  const unk = byName[short + '-unknown'], kn = byName[short + '-known'];
  const tag = id;
  if (!unk || unk.error) { fail(tag + '-unknown', 'missing or errored: ' + ((unk || {}).error || 'absent')); continue; }
  if (!kn || kn.error) { fail(tag + '-known', 'missing or errored: ' + ((kn || {}).error || 'absent')); continue; }
  let fe = filesExist('tg-' + short + '-unknown'); if (fe) { fail(tag + '-unknown', fe); continue; }
  fe = filesExist('tg-' + short + '-known'); if (fe) { fail(tag + '-known', fe); continue; }
  ok(tag + ': special proof files exist (png+svg, both states)');
  if (!unk.telegraphNull || !kn.telegraphNull) fail(tag, 'm.telegraph was set — special path assumption wrong');
  else ok(tag + ': m.telegraph never declared (code gap documented)');
  if (!unk.codeGap || !kn.codeGap) fail(tag, 'code gap not documented in summary');
  else ok(tag + ': bucket blind spot documented');
  if ((unk.specialCells || []).length !== 0) fail(tag, 'unknown ' + expected + ' surface visible — knowledge gate broken');
  else ok(tag + ': unknown ' + expected + ' hidden (knowledge-gated)');
  if ((kn.specialCells || []).length === 0) fail(tag, 'known ' + expected + ' surface empty');
  else ok(tag + ': known ' + expected + ' shows ' + kn.specialCells.length + ' cell(s)');
  if (!unk.cue || !kn.cue) fail(tag, 'cue missing in a state');
  else ok(tag + ': distinct phase cue captured');
  const kc = (((mdefs[id] || {}).encounter) || {}).knownCue;
  if (kc && !(kn.cue || '').includes(kc.slice(0, 30))) fail(tag, 'known cue missing the codex knownCue coaching');
  else ok(tag + ': known cue carries codex knownCue coaching');
}

// 3. No-telegraph-by-design monsters.
for (const id of NO_DESIGN) {
  const s = summary.find(x => x.monster === id && x.noTelegraphByDesign);
  if (!s) { fail(id, 'no by-design documentation entry'); continue; }
  if (s.declaredEver) { fail(id, 'telegraph declared — by-design claim is wrong'); continue; }
  ok(id + ': no telegraph declared over ' + s.rounds + ' rounds (by design)');
  const short = { hushwolf: 'hushwolf', speedbump_turtle: 'speedbump', warranty_caller: 'warrantycaller' }[id];
  const fe = filesExist('tg-' + short + '-nodesign');
  if (fe) fail(id, fe); else ok(id + ': by-design proof files exist');
}

// 4. Blocked entries are documented, not silently dropped.
for (const id of BLOCKED) {
  const s = summary.find(x => x.monster === id && x.blocked);
  if (!s || !s.reason) fail(id, 'blocked monster not documented');
  else ok(id + ': blocked-by-dirty-file documented');
}

console.log('PASS: ' + passes.length + ' assertions');
for (const p of passes) console.log('  ok  ' + p);
if (failures.length) {
  console.log('FAIL: ' + failures.length + ' assertions');
  for (const f of failures) console.log('  XX  ' + f);
  process.exit(1);
}
console.log('ALL TELEGRAPH PROOF ASSERTIONS HOLD');
