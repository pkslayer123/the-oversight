#!/usr/bin/env node
// Wave-2 escalation verification (2026-10-08).
// Proof that the wave-2 roster (13 monsters) sits at the escalation bar
// ("wave 2 on its own terms", Steve 2026-10-06): each monster is scored on the
// same 7 escalation dimensions as the 2026-10-07 audit (band, telegraph,
// phases, audio, codex, pattern, defense) with the same verdict rule:
// any FAIL, or more than one WARN, => NEEDS-WORK.
//
// Reads committed data: monsters.json is taken from `git show HEAD:` (hot
// shared tree — never trust the worktree copy). app.js is scraped from the
// working copy for the synth registry (parse already verified by node --check).
//
// Seeded RNG: mulberry32, fixed default seed 20261008, SEED env override.
// Unseeded aggregate assertions are flaky by construction; this one is not.
//
// Usage: node scripts/test-w2-escalation-verify-20261008.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

// --- seeded PRNG (mulberry32) -------------------------------------------------
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const rollInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// --- committed data ------------------------------------------------------------
// Read monsters.json from HEAD (stale-worktree guard): the proof is about
// what's committed, not what's sitting in the checkout.
let raw;
try {
  raw = execSync('git show HEAD:src/data/monsters.json', { cwd: ROOT, encoding: 'utf8' });
} catch (e) {
  console.error('FATAL: cannot read HEAD:src/data/monsters.json — ' + e.message);
  process.exit(2);
}
const all = JSON.parse(raw);
const wave2 = all.filter(m => m.wave === 2);
const wave1 = all.filter(m => (m.wave || 1) === 1);

// --- audio hook resolution (scrape app.js synth registry) ---------------------
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const registry = new Set();
for (const m of appSrc.matchAll(/^\s{6}([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)) registry.add(m[1]);
const fnDefs = new Set();
for (const m of appSrc.matchAll(/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) fnDefs.add(m[1]);
const resolves = (h) => registry.has(h) || fnDefs.has(h);

// --- global telegraph census (uniqueness across the whole bestiary) ------------
const teleCount = {};
for (const m of all) {
  const t = (m.attack && m.attack.telegraph || '').trim();
  if (t) teleCount[t] = (teleCount[t] || 0) + 1;
}

// --- wave-1 pattern signatures by type -----------------------------------------
const w1Sigs = {};
for (const m of wave1) {
  const p = m.attack && m.attack.pattern;
  if (!p || !p.type) continue;
  const sig = Object.keys(p).filter(k => k !== 'type').sort().join(',');
  (w1Sigs[p.type] = w1Sigs[p.type] || new Set()).add(sig);
}

const EXPECTED_13 = ['voice_mimic_radio', 'mirror_stag', 'review_drone', 'bright_idea',
  'memory_projector', 'warranty_caller', 'understudy', 'landlord', 'heckler',
  'paparazzo', 'union_rep', 'moderator', 'statickite'];

let pass = 0, fail = 0;
const failures = [];
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; failures.push(label); } };

// --- roster shape ---------------------------------------------------------------
ok(wave2.length === 13, `exactly 13 wave-2 monsters at HEAD (got ${wave2.length})`);
const missingIds = EXPECTED_13.filter(id => !wave2.find(m => m.id === id));
ok(missingIds.length === 0, `all 13 expected ids present (missing: ${missingIds.join(',')})`);

// --- per-monster escalation bar -------------------------------------------------
const N = 20000;
for (const m of wave2) {
  const atk = m.attack || {};
  const pat = atk.pattern || {};
  const enc = m.encounter || {};
  const warns = [], fails = [];

  // 1. band: raw ranges inside HP 30-170 / dmg 12-34; seeded E[.] inside too
  let hpSum = 0, dmgSum = 0;
  for (let i = 0; i < N; i++) { hpSum += rollInt(m.hp[0], m.hp[1]); dmgSum += rollInt(atk.damage[0], atk.damage[1]); }
  const eHp = hpSum / N, eDmg = dmgSum / N;
  if (!(m.hp[0] >= 30 && m.hp[1] <= 170 && atk.damage[0] >= 12 && atk.damage[1] <= 34 &&
        eHp >= 30 && eHp <= 170 && eDmg >= 12 && eDmg <= 34))
    fails.push(`out of band: hp [${m.hp}] dmg [${atk.damage}] E[hp]=${eHp.toFixed(1)} E[dmg]=${eDmg.toFixed(1)} (seed ${SEED}, n=${N})`);

  // 2. telegraph: bespoke, unique, no template leaks, has unknown-descriptor
  const tg = (atk.telegraph || '').trim();
  if (!tg) fails.push('missing telegraph');
  else {
    if (teleCount[tg] > 1) fails.push(`telegraph duplicated x${teleCount[tg]}`);
    if (/\{[a-z]+\}/.test(tg)) fails.push('telegraph leaked template placeholder');
    if (tg.length < 50) warns.push(`terse telegraph (${tg.length}ch) — distinct but terse`);
  }
  if (!m.unknown) fails.push('missing unknown-descriptor');

  // 3. phases: windup → action → recovery visible to the player
  const phases = enc.phases || [];
  const badges = enc.phaseBadges || {};
  if (phases.length < 3) warns.push(`only ${phases.length} phases`);
  if (phases.length && phases.some(p => !badges[p])) warns.push('phase(s) missing badges');

  // 4. audio: aggro beat resolves to a real synth; at least 2 of 4 beats wired
  const hookKinds = ['noticeAudio', 'declareAudio', 'aggroAudio', 'resolveAudio'];
  const aggro = enc.aggroAudio;
  const nResolved = hookKinds.filter(k => enc[k] && resolves(enc[k])).length;
  if (!(aggro && resolves(aggro))) fails.push(aggro ? `aggroAudio '${aggro}' MISSING (silent or deerAggro fallback)` : 'no aggroAudio (falls back to deerAggro)');
  else if (nResolved < 2) warns.push(`only ${nResolved}/4 encounter beats have resolving audio`);

  // 5. codex: 3 stages + knownCue + knownTactics coaching
  const cs = m.codexStages || {};
  if (!(cs.unknown && cs.observed && cs.slain)) fails.push('codexStages incomplete');
  if (!enc.knownCue) fails.push('missing knownCue');
  if (!enc.knownTactics) warns.push('missing knownTactics (no learned-pattern coaching)');

  // 6. pattern: grid-visual distinctness vs wave-1 same-type (rush exempt:
  //    rush never declares, so the escalation check is a documented text tell)
  const pKeys = Object.keys(pat).filter(k => k !== 'type');
  const bare = pKeys.length === 0;
  if (pat.type === 'rush') {
    if (bare && !(enc.noticeText || enc.proximityText || enc.knownCue)) fails.push('bare rush with no documented non-grid tell');
  } else if (bare) {
    fails.push(`bare {"type":"${pat.type}"} — no params, no grid-visual distinctness`);
  } else if (!(pat.windup || pat.range || pat.radius || pat.length ||
               ['chargeStyle', 'burstStyle', 'sweep', 'chargeDesc', 'burstDesc'].some(k => pat[k]))) {
    fails.push('pattern params present but nothing shapes the visual');
  }

  // 7. defense: armor or resistances that make sense for the fiction
  const res = m.resistances || {};
  if (!((m.armor || 0) > 0 || Object.keys(res).length > 0)) warns.push('no armor, no resistances');

  // verdict rule (same as the audit): any FAIL, or >1 WARN, => NEEDS-WORK
  const verdict = (fails.length || warns.length > 1) ? 'NEEDS-WORK' : 'PASS';
  if (verdict === 'PASS') pass++;
  else { fail++; failures.push(`${m.id}: ${fails.concat(warns).join('; ')}`); }
}

// --- drift guards (audit 2026-10-07 drift notes, cleaned 2026-10-08) -----------
// 1. W2A_IDS in app.js must not route any retired wave-2 id
const RETIRED = ['camera_swarm', 'hype_horn', 'service_mimic', 'contract_golem'];
const w2aMatch = appSrc.match(/const W2A_IDS = \{([^}]*)\}/);
ok(!!w2aMatch, 'W2A_IDS declaration found in app.js');
if (w2aMatch) {
  const listed = w2aMatch[1];
  const stale = RETIRED.filter(id => new RegExp(`\\b${id}\\b`).test(listed));
  ok(stale.length === 0, `W2A_IDS lists no retired id (found: ${stale.join(',')})`);
}
// 2. docs/MONSTER-WAVES.md lists the real 13-monster roster, not retired names
const doc = fs.readFileSync(path.join(ROOT, 'docs/MONSTER-WAVES.md'), 'utf8');
const staleNames = ['Influencer', 'Motivational Speaker', 'Customer Service', 'Terms & Conditions', 'Middle Manager']
  .filter(n => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(doc));
ok(staleNames.length === 0, `MONSTER-WAVES.md has no retired names (found: ${staleNames.join(',')})`);
const missingNames = EXPECTED_13.filter(id => {
  const m = wave2.find(x => x.id === id);
  return m && !new RegExp(m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(doc);
});
ok(missingNames.length === 0, `MONSTER-WAVES.md names all 13 (missing: ${missingNames.join(',')})`);
// 3. scripts/test-wave2.js references no retired id
const t2 = fs.readFileSync(path.join(ROOT, 'scripts/test-wave2.js'), 'utf8');
const staleInTest = RETIRED.filter(id => new RegExp(`['"]${id}['"]`).test(t2));
ok(staleInTest.length === 0, `test-wave2.js references no retired id (found: ${staleInTest.join(',')})`);

console.log(`\nw2 escalation verify: ${pass} pass, ${fail} fail (seed ${SEED})`);
if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log('  -', f)); }
process.exit(fail ? 1 : 0);
