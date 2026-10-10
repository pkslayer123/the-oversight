#!/usr/bin/env node
// scan-weird-c.js — weirdness scanner for Worker C long-sim world histories
// (2026-10-10). Reads OUTDIR/weird-c-*.json and checks invariants:
//
//   timeline        telemetry days non-decreasing
//   death-cause     every death has a real cause string (kind+who+cause)
//   dead-never-act  dead villagers never act again; dead flag matches a death event
//   unique-names    no duplicate living villager names or ids within a run
//   gossip-prov     every gossip entry has provenance (day + partKey)
//   rep-trust-law   trust events never cite gossip/rumor as reason (Trust != reputation)
//   rep-bounds      rep dims are finite, within sane bounds
//   tribute-prov    tribute entries have provenance
//   monster-wave    combat_start wave matches monsters.json; wave-2+ never before its day gate
//   disease-pools   disease ids map to the DISEASES.md roster; pools never mix
//   contest-gate    no contest before day 14
//   pantry-sanity   pantry never negative; no teleport-scale single jumps
//   system-persona  System lines flagged for mechanical/game-y language
//   phantom-village world villages that never act
//
// A scanner finding nothing is a result, not a failure — report what held.
// Usage: OUTDIR=/tmp/weird-c node scripts/scan-weird-c.js
'use strict';
const fs = require('fs');
const path = require('path');
const OUTDIR = process.env.OUTDIR || '/tmp/weird-c';
const ROOT = path.join(__dirname, '..');
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const waveOf = {};
for (const m of (monsters.monsters || monsters)) waveOf[m.id] = m.wave || 1;

const DISEASE_POOLS = {
  gutrot: 'mundane', trichinosis: 'mundane', disease: 'mundane', lockjaw: 'mundane',
  wound_fever: 'mundane', trembles: 'mundane',
  howlbelly: 'alien', gristlefit: 'alien', croakbelly: 'alien', shellgut: 'alien',
  witness_maw: 'alien', flockmind: 'alien', eurika: 'alien', east_nile: 'alien', lemons: 'alien',
};
const SYS_BAD = /\b(tutorial|quest (added|updated|complete)|objective (added|complete)|skill point|achievement unlocked)\b|\bpress \w+ to \w|\bclick to \w|\btap to \w|\+\d+\s*xp\b/i;

const files = fs.readdirSync(OUTDIR).filter(f => f.startsWith('weird-c-') && f.endsWith('.json'));
if (!files.length) { console.error('no run files in ' + OUTDIR); process.exit(1); }

const findings = [];
const holds = {};
function flag(run, check, kind, detail) {
  findings.push({ run, check, kind, detail: String(detail).slice(0, 300) });
}
function hold(check) { holds[check] = (holds[check] || 0) + 1; }

for (const f of files) {
  const rec = JSON.parse(fs.readFileSync(path.join(OUTDIR, f), 'utf8'));
  const run = `${rec.policy}/seed${rec.seed}`;
  const tele = rec.telemetry || [];
  const d = rec.digest || {};
  let clean = {};

  // --- timeline ---
  let lastDay = -1, tlineOk = true;
  for (const ev of tele) {
    const dy = ev.day == null ? -1 : ev.day;
    if (dy >= 0 && dy < lastDay - 0.01) { tlineOk = false; flag(run, 'timeline', 'logic', `day goes backward: ${lastDay} -> ${dy} (${ev.type})`); break; }
    if (dy >= 0) lastDay = dy;
  }
  if (tlineOk) hold('timeline');

  // --- death cause ---
  const deaths = tele.filter(e => e.type === 'death');
  let dcOk = true;
  for (const ev of deaths) {
    if (!ev.cause || ev.cause === '?' || !ev.who || ev.who === '?') {
      dcOk = false;
      flag(run, 'death-cause', 'data', `death without cause/who: kind=${ev.kind} who=${ev.who} cause=${ev.cause}`);
    }
  }
  if (dcOk) hold('death-cause');

  // --- dead-never-act ---
  const deadDay = {}; // who -> first death day
  for (const ev of deaths) {
    if (ev.who && !(ev.who in deadDay)) deadDay[ev.who] = ev.day == null ? 1e9 : ev.day;
  }
  let dnaOk = true;
  for (const ev of tele) {
    if (ev.type === 'death') continue;
    const who = ev.who || ev.vid || ev.subject;
    if (who && deadDay[who] != null && ev.day != null && ev.day > deadDay[who] + 0.01 &&
        ['trust', 'villager_grant', 'disease', 'eat'].includes(ev.type)) {
      dnaOk = false;
      flag(run, 'dead-never-act', 'logic', `dead ${who} (died day ${deadDay[who]}) has ${ev.type} event at day ${ev.day}`);
    }
  }
  // digest-vs-telemetry: dead flag must match a death event and vice versa
  for (const p of (d.people || [])) {
    const evDeath = deaths.some(e => String(e.who) === p.id);
    if (p.dead && !evDeath) { dnaOk = false; flag(run, 'dead-never-act', 'data', `${p.name} (${p.id}) flagged dead but no death event`); }
    if (!p.dead && evDeath) { dnaOk = false; flag(run, 'dead-never-act', 'data', `${p.name} (${p.id}) alive in digest but has a death event`); }
  }
  if (dnaOk) hold('dead-never-act');

  // --- unique names ---
  let unOk = true;
  const seenNames = {}, seenIds = {};
  for (const p of (d.people || [])) {
    if (p.dead) continue;
    if (seenIds[p.id]) { unOk = false; flag(run, 'unique-names', 'data', `duplicate id ${p.id}`); }
    seenIds[p.id] = 1;
    if (p.name && p.name !== '?' && seenNames[p.name]) {
      unOk = false; flag(run, 'unique-names', 'data', `duplicate living name "${p.name}" (${p.id} vs ${seenNames[p.name]})`);
    }
    if (p.name && p.name !== '?') seenNames[p.name] = p.id;
  }
  if (unOk) hold('unique-names');

  // --- gossip provenance ---
  let gpOk = true;
  for (const g of (d.gossip || [])) {
    if (g.day == null || !g.partKey) {
      gpOk = false; flag(run, 'gossip-prov', 'data', `gossip entry missing provenance: action=${g.action} day=${g.day} partKey=${g.partKey}`);
    }
    if (!Array.isArray(g.heard)) { gpOk = false; flag(run, 'gossip-prov', 'data', `gossip action=${g.action} has no heard array`); }
  }
  if (gpOk) hold('gossip-prov');

  // --- Trust != reputation ---
  let trOk = true;
  for (const ev of tele.filter(e => e.type === 'trust')) {
    const r = String(ev.reason || '');
    if (/gossip|rumor|rumour/i.test(r)) { trOk = false; flag(run, 'rep-trust-law', 'canon', `trust event moved by gossip: who=${ev.who} delta=${ev.delta} reason=${r}`); }
    if (r === '?' || r === '') { /* weak provenance, counted below */ }
  }
  const weakTrust = tele.filter(e => e.type === 'trust' && (e.reason === '?' || e.reason === '')).length;
  if (trOk) hold('rep-trust-law');
  if (weakTrust) flag(run, 'trust-provenance', 'edge', `${weakTrust} trust events with unknown reason (honest edge if from legacy call sites)`);

  // --- rep bounds ---
  let rbOk = true;
  for (const [vid, r] of Object.entries(d.rep || {})) {
    for (const [dim, val] of Object.entries(r || {})) {
      if (!Number.isFinite(val)) { rbOk = false; flag(run, 'rep-bounds', 'data', `rep ${vid}.${dim} non-finite`); }
      else if (Math.abs(val) > 500) { rbOk = false; flag(run, 'rep-bounds', 'logic', `rep ${vid}.${dim}=${val} beyond sane bounds`); }
    }
  }
  if (rbOk) hold('rep-bounds');

  // --- tribute provenance ---
  let tbOk = true;
  const trib = d.tribute;
  if (trib && typeof trib === 'object') {
    for (const [k, t] of Object.entries(trib)) {
      const o = t && typeof t === 'object' ? t : null;
      if (o && (o.day == null) && !o.origin && !o.reason) {
        tbOk = false; flag(run, 'tribute-prov', 'data', `tribute entry "${k}" has no provenance`);
      }
    }
  }
  if (tbOk) hold('tribute-prov');

  // --- monster wave gating ---
  let mwOk = true;
  for (const ev of tele.filter(e => e.type === 'combat_start')) {
    const mid = ev.vs;
    const canonWave = waveOf[mid];
    if (canonWave == null) { mwOk = false; flag(run, 'monster-wave', 'data', `combat_start vs unknown monster id "${mid}"`); continue; }
    if (ev.wave != null && ev.wave !== canonWave) {
      mwOk = false; flag(run, 'monster-wave', 'data', `combat_start wave=${ev.wave} but monsters.json wave=${canonWave} for ${mid}`);
    }
    // day gates: w2 day 8+, w3 day 25+, w4/w5 scale-gated (can't check scale here — day only)
    const gate = { 2: 8, 3: 25 }[canonWave];
    if (gate && ev.day != null && ev.day < gate) {
      mwOk = false; flag(run, 'monster-wave', 'canon', `${mid} (wave ${canonWave}) fought day ${ev.day}, before day-${gate} gate`);
    }
    if (canonWave >= 4) flag(run, 'monster-wave-scale', 'info', `${mid} (wave ${canonWave}) day ${ev.day} — scale gate not checkable from telemetry`);
  }
  if (mwOk) hold('monster-wave');

  // --- disease pools ---
  let dpOk = true;
  for (const ev of tele.filter(e => e.type === 'disease')) {
    const canonPool = DISEASE_POOLS[ev.id];
    if (canonPool == null) { dpOk = false; flag(run, 'disease-pools', 'data', `unknown disease id "${ev.id}" target=${ev.target} source=${ev.source}`); }
    else if (ev.pool && ev.pool !== canonPool) {
      dpOk = false; flag(run, 'disease-pools', 'canon', `${ev.id} reported pool=${ev.pool}, DISEASES.md says ${canonPool}`);
    }
    if (canonPool === 'alien' && ev.source && !/monster|mosquito|tick|bite|meat|fight/i.test(String(ev.source))) {
      dpOk = false; flag(run, 'disease-pools', 'canon', `alien disease ${ev.id} from non-vector source "${ev.source}"`);
    }
  }
  if (dpOk) hold('disease-pools');

  // --- contest gate ---
  let cgOk = true;
  for (const ev of tele.filter(e => e.type === 'contest_fired')) {
    if (ev.day != null && ev.day < 14) { cgOk = false; flag(run, 'contest-gate', 'canon', `contest fired day ${ev.day} (show starts ~day 14-21)`); }
  }
  if (cgOk) hold('contest-gate');

  // --- pantry sanity ---
  let psOk = true;
  const pantry = (rec.samples && rec.samples.pantry) || [];
  let prev = null;
  for (const [day, kcal] of pantry) {
    if (kcal < 0) { psOk = false; flag(run, 'pantry-sanity', 'logic', `pantry negative at day ${day}: ${kcal}`); }
    if (prev != null && Math.abs(kcal - prev) > 200000) {
      psOk = false; flag(run, 'pantry-sanity', 'edge', `pantry teleport jump day ${day}: ${prev} -> ${kcal} kcal`);
    }
    prev = kcal;
  }
  if (psOk) hold('pantry-sanity');

  // --- system persona ---
  let spOk = true;
  for (const l of (rec.sysLines || [])) {
    if (SYS_BAD.test(l.msg)) {
      spOk = false; flag(run, 'system-persona', 'canon', `System line sounds mechanical (day ${l.day}): "${l.msg.slice(0, 140)}"`);
    }
  }
  if (spOk) hold('system-persona');

  // --- phantom villages ---
  let pvOk = true;
  if (Array.isArray(d.worldVillages)) {
    for (const v of d.worldVillages) {
      if (v.lastDay == null) { pvOk = false; flag(run, 'phantom-village', 'data', `village ${v.name || v.id} has no activity timestamp`); }
    }
  }
  if (pvOk) hold('phantom-village');
}

console.log(`\n=== scanned ${files.length} runs ===\n`);
console.log('INVARIANTS THAT HELD (runs with zero flags):');
for (const [k, n] of Object.entries(holds).sort()) console.log(`  ${k}: ${n}/${files.length}`);
console.log(`\nFINDINGS: ${findings.length}`);
const byCheck = {};
for (const fl of findings) {
  byCheck[fl.check] = byCheck[fl.check] || [];
  byCheck[fl.check].push(fl);
}
for (const [check, list] of Object.entries(byCheck).sort()) {
  console.log(`\n## ${check} (${list.length})`);
  const seen = new Set();
  for (const fl of list) {
    const key = fl.detail;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  [${fl.kind}] ${fl.run}: ${fl.detail}`);
    if (seen.size >= 12) { console.log(`  ... +${list.length - 12} more`); break; }
  }
}
