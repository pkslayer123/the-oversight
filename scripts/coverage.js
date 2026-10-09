#!/usr/bin/env node
// coverage.js — what ISN'T being used? (Steve 2026-10-09: "Can we see what
// isn't being used?")
// Takes a sweep JSON (run with OUT_TELEMETRY=1 so per-run tele() streams are
// present) and reports per-content-ID fire counts, diffed against the full
// rosters: shows, monsters, diseases, abilities, contests.
// Usage: node scripts/coverage.js <sweep.json> [out.json]
// A "never fired" entry is a QUESTION, not a verdict — the report says
// "not reached in N seeds" (could be sim-clock gaps, scheduler rarity, or
// genuine unreachability). RARE = <3 hits.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RARE_CUTOFF = 3;

function allEvents(runs) {
  const out = [];
  for (const r of runs) {
    if (Array.isArray(r.telemetry)) {
      for (const e of r.telemetry) out.push({ ...e, _seed: r.seed, _policy: r.policy });
    }
  }
  return out;
}

function countBy(events, type, key) {
  const c = {};
  for (const e of events) {
    if (e.type !== type) continue;
    const k = e[key] == null ? '?' : String(e[key]);
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

// ---- rosters ----

// SHOW_BEATS lives in src/js/contests.js as G.SHOW_BEATS = {...} (pure data).
function showRoster() {
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  const m = src.match(/G\.SHOW_BEATS = \{([\s\S]*?)\n  \};/);
  if (!m) throw new Error('SHOW_BEATS block not found in contests.js');
  const G = {};
  eval('G.SHOW_BEATS = {' + m[1] + '\n  };');
  return Object.keys(G.SHOW_BEATS);
}

function monsterRoster() {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  return list.map(m => ({ id: m.id, wave: m.wave || '?' }));
}

function abilityRoster() {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
  return list.map(a => a.id).filter(Boolean);
}

function contestRoster() {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/contests.json'), 'utf8'));
  return list.map(c => ({ id: c.id, cat: c.cat || '?', risk: c.risk || '?' }));
}

// Disease roster: parse the two canon tables in docs/DISEASES.md.
// Mundane pool (6) and Alien pool (9) sections, markdown tables with | id | ... |.
function diseaseRoster() {
  const md = fs.readFileSync(path.join(ROOT, 'docs/DISEASES.md'), 'utf8');
  const out = [];
  const sections = md.split(/^## /m);
  for (const s of sections) {
    let pool = null;
    if (/^Mundane pool/.test(s)) pool = 'mundane';
    else if (/^Alien pool/.test(s)) pool = 'alien';
    else continue;
    for (const line of s.split('\n')) {
      const m = line.match(/^\|\s*([a-z_0-9]+)\s*\|/);
      if (m && m[1] !== 'id') out.push({ id: m[1], pool });
    }
  }
  return out;
}

// Skill roster: src/data/knowledge.json (learned → state.codex.skills).
function skillRoster() {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/knowledge.json'), 'utf8'));
  return list.map(k => k.id).filter(Boolean);
}

// Plant roster: src/data/plants.json (learned → state.codex.plants).
function plantRoster() {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/plants.json'), 'utf8'));
  return list.map(p => p.id).filter(Boolean);
}

// Alien loot roster: items with origin='alien' (dropped via alienLootGrant,
// the single shared path; picked up via corpseTakeItem).
function lootRoster() {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));
  return list.filter(i => i.origin === 'alien').map(i => ({ id: i.id, tier: i.lootTier || '?' }));
}

// ---- report ----

function categorize(rosterIds, counts) {
  const used = [], rare = [], never = [];
  for (const id of rosterIds) {
    const n = counts[id] || 0;
    if (n === 0) never.push(id);
    else if (n < RARE_CUTOFF) rare.push(`${id} (${n})`);
    else used.push(`${id} (${n})`);
  }
  // hits for ids NOT in the roster (data drift — content fired that the roster doesn't know)
  const unknown = Object.keys(counts).filter(k => !rosterIds.includes(k) && k !== '?');
  return { used, rare, never, unknown };
}

// differentiation(runs) — are villagers differentiating?
// A "build" = profile + sorted ability ids. Reports unique build count,
// ability-holding villagers, and XP-track spread, from the latest snapshot
// of each run (villagers who lived longest show the most differentiation).
function differentiation(runs) {
  const latest = [];
  for (const r of runs) {
    const snaps = (r.samples || {}).villagers || [];
    if (!snaps.length) continue;
    latest.push(snaps[snaps.length - 1][1]);
  }
  if (!latest.length) return { note: 'no villager snapshots in sweep (needs current sim-harness.js)' };
  let totalVillagers = 0, withAbilities = 0;
  const builds = new Set(), profiles = {}, occs = {};
  const xpMax = { t: 0, s: 0, b: 0 };
  let maxKills = 0;
  for (const snap of latest) {
    for (const v of snap) {
      totalVillagers++;
      const abs = (v.abilities || []).slice().sort();
      if (abs.length) withAbilities++;
      builds.add(`${v.profile}|${abs.join('+')}`);
      profiles[v.profile] = (profiles[v.profile] || 0) + 1;
      occs[v.occ] = (occs[v.occ] || 0) + 1;
      const xp = v.xp || {};
      xpMax.t = Math.max(xpMax.t, xp.t || 0);
      xpMax.s = Math.max(xpMax.s, xp.s || 0);
      xpMax.b = Math.max(xpMax.b, xp.b || 0);
      maxKills = Math.max(maxKills, v.kills || 0);
    }
  }
  return {
    runs: latest.length, totalVillagers,
    uniqueBuilds: builds.size,
    withAbilities,
    profiles, topOccs: Object.entries(occs).sort((a, b) => b[1] - a[1]).slice(0, 6),
    xpMax, maxKills,
  };
}

function main() {
  const inFile = process.argv[2];
  const outFile = process.argv[3] || null;
  if (!inFile) { console.error('usage: node scripts/coverage.js <sweep.json> [out.json]'); process.exit(1); }
  const sweep = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  const runs = sweep.runs || [];
  const withTele = runs.filter(r => Array.isArray(r.telemetry));
  if (!withTele.length) {
    console.error('no telemetry streams in this sweep JSON — re-run sweep.js with OUT_TELEMETRY=1');
    process.exit(1);
  }
  const ev = allEvents(withTele);
  const nSeeds = withTele.length;
  const days = sweep.summary && sweep.summary.days;

  const shows = categorize(showRoster(), countBy(ev, 'show_aired', 'id'));
  const monsters = monsterRoster();
  const mCounts = countBy(ev, 'combat_start', 'vs');
  const mons = categorize(monsters.map(m => m.id), mCounts);
  const monsByWave = {};
  for (const m of monsters) {
    const w = String(m.wave);
    monsByWave[w] = monsByWave[w] || { never: [] };
    if ((mCounts[m.id] || 0) === 0) monsByWave[w].never.push(m.id);
  }
  const diseases = diseaseRoster();
  const dCounts = countBy(ev, 'disease', 'id');
  const dis = categorize(diseases.map(d => d.id), dCounts);
  const disByPool = { mundane: { never: [] }, alien: { never: [] } };
  for (const d of diseases) {
    if ((dCounts[d.id] || 0) === 0) disByPool[d.pool].never.push(d.id);
  }
  const abilities = categorize(abilityRoster(), countBy(ev, 'ability_granted', 'id'));
  const contests = categorize(contestRoster().map(c => c.id), countBy(ev, 'contest_fired', 'id'));

  // SKILLS & PLANTS: end-state learned sets, unioned across runs (sampled in
  // sweep.js — no tele event needed, they're state not events).
  const learnedSkills = new Set(), learnedPlants = new Set();
  for (const r of withTele) {
    for (const s of (r.learnedSkills || [])) learnedSkills.add(s);
    for (const p of (r.learnedPlants || [])) learnedPlants.add(p);
  }
  const skillCounts = {}, plantCounts = {};
  for (const s of learnedSkills) skillCounts[s] = (skillCounts[s] || 0) + 1;
  for (const p of learnedPlants) plantCounts[p] = (plantCounts[p] || 0) + 1;
  const skills = categorize(skillRoster(), skillCounts);
  const plants = categorize(plantRoster(), plantCounts);

  // LOOT: dropped (alienLootGrant, the shared path) vs taken (corpseTakeItem).
  const lootR = lootRoster();
  const dropped = countBy(ev, 'loot_dropped', 'id');
  const taken = {};
  for (const e of ev) {
    if (e.type !== 'loot_taken' || !e.alien) continue;
    taken[e.id] = (taken[e.id] || 0) + 1;
  }
  const lootDropped = categorize(lootR.map(l => l.id), dropped);
  const lootTaken = categorize(lootR.map(l => l.id), taken);
  const lootByTier = {};
  for (const l of lootR) {
    const t = String(l.tier);
    lootByTier[t] = lootByTier[t] || { neverDropped: [] };
    if (!(dropped[l.id] > 0)) lootByTier[t].neverDropped.push(l.id);
  }

  // VILLAGER DIFFERENTIATION (Steve 2026-10-09): are villagers becoming
  // different people? From the 30-day snapshots in sweep samples.
  const diff = differentiation(withTele);

  const L = [];
  L.push(`COVERAGE — ${nSeeds} runs${days ? ` × ${days}d` : ''} (${ev.length} telemetry events)`);
  L.push(`"never" = not reached in these seeds — a question, not a verdict.`);
  L.push('');
  L.push(`SHOWS (${showRoster().length} in pool): used=${shows.used.length} rare=${shows.rare.length} never=${shows.never.length}`);
  if (shows.never.length) L.push(`  NEVER: ${shows.never.join(', ')}`);
  if (shows.rare.length) L.push(`  RARE: ${shows.rare.join(', ')}`);
  if (shows.unknown.length) L.push(`  UNKNOWN ids fired (roster drift?): ${shows.unknown.join(', ')}`);
  L.push('');
  L.push(`MONSTERS (${monsters.length} in data): used=${mons.used.length} rare=${mons.rare.length} never=${mons.never.length}`);
  for (const w of Object.keys(monsByWave).sort()) {
    if (monsByWave[w].never.length) L.push(`  wave ${w} NEVER fought: ${monsByWave[w].never.join(', ')}`);
  }
  if (mons.rare.length) L.push(`  RARE: ${mons.rare.join(', ')}`);
  if (mons.unknown.length) L.push(`  UNKNOWN ids fought: ${mons.unknown.join(', ')}`);
  L.push('');
  L.push(`DISEASES (${diseases.length} in canon): used=${dis.used.length} rare=${dis.rare.length} never=${dis.never.length}`);
  if (disByPool.mundane.never.length) L.push(`  mundane NEVER contracted: ${disByPool.mundane.never.join(', ')}`);
  if (disByPool.alien.never.length) L.push(`  alien NEVER contracted: ${disByPool.alien.never.join(', ')}`);
  if (dis.rare.length) L.push(`  RARE: ${dis.rare.join(', ')}`);
  if (dis.unknown.length) L.push(`  UNKNOWN ids contracted: ${dis.unknown.join(', ')}`);
  L.push('');
  L.push(`ABILITIES (${abilityRoster().length} in data): granted=${abilities.used.length} rare=${abilities.rare.length} never=${abilities.never.length}`);
  if (abilities.never.length) L.push(`  NEVER granted: ${abilities.never.slice(0, 40).join(', ')}${abilities.never.length > 40 ? ` (+${abilities.never.length - 40} more)` : ''}`);
  if (abilities.rare.length) L.push(`  RARE: ${abilities.rare.join(', ')}`);
  if (abilities.unknown.length) L.push(`  UNKNOWN ids granted: ${abilities.unknown.join(', ')}`);
  L.push('');
  L.push(`CONTESTS (${contestRoster().length} in data): used=${contests.used.length} rare=${contests.rare.length} never=${contests.never.length}`);
  if (contests.never.length) L.push(`  NEVER fired: ${contests.never.join(', ')}`);
  if (contests.rare.length) L.push(`  RARE: ${contests.rare.join(', ')}`);
  if (contests.unknown.length) L.push(`  UNKNOWN ids fired: ${contests.unknown.join(', ')}`);
  L.push('');
  L.push(`SKILLS (${skillRoster().length} in knowledge.json): learned=${skills.used.length} rare=${skills.rare.length} never=${skills.never.length}`);
  if (skills.never.length) L.push(`  NEVER learned: ${skills.never.slice(0, 30).join(', ')}${skills.never.length > 30 ? ` (+${skills.never.length - 30} more)` : ''}`);
  if (skills.rare.length) L.push(`  RARE: ${skills.rare.join(', ')}`);
  L.push('');
  L.push(`PLANTS (${plantRoster().length} in plants.json): learned=${plants.used.length} rare=${plants.rare.length} never=${plants.never.length}`);
  if (plants.never.length) L.push(`  NEVER learned: ${plants.never.slice(0, 30).join(', ')}${plants.never.length > 30 ? ` (+${plants.never.length - 30} more)` : ''}`);
  if (plants.rare.length) L.push(`  RARE: ${plants.rare.join(', ')}`);
  L.push('');
  L.push(`ALIEN LOOT (${lootR.length} items): dropped: used=${lootDropped.used.length} rare=${lootDropped.rare.length} never=${lootDropped.never.length} | taken: used=${lootTaken.used.length} never=${lootTaken.never.length}`);
  for (const t of Object.keys(lootByTier).sort()) {
    if (lootByTier[t].neverDropped.length) L.push(`  tier ${t} NEVER dropped: ${lootByTier[t].neverDropped.join(', ')}`);
  }
  if (lootDropped.unknown.length) L.push(`  UNKNOWN ids dropped: ${lootDropped.unknown.join(', ')}`);
  L.push('');
  L.push(`VILLAGER DIFFERENTIATION (latest snapshot per run):`);
  if (diff.note) { L.push(`  ${diff.note}`); }
  else {
    L.push(`  ${diff.totalVillagers} villagers across ${diff.runs} runs → ${diff.uniqueBuilds} unique builds (profile+abilities)`);
    L.push(`  villagers holding abilities: ${diff.withAbilities}/${diff.totalVillagers}`);
    L.push(`  profiles: ${JSON.stringify(diff.profiles)}`);
    L.push(`  top occupations: ${diff.topOccs.map(([o, n]) => `${o}(${n})`).join(', ')}`);
    L.push(`  max agency XP: tracking=${diff.xpMax.t} survival=${diff.xpMax.s} bravery=${diff.xpMax.b} | max monster kills by one villager: ${diff.maxKills}`);
  }

  const text = L.join('\n');
  console.log(text);
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify({
      meta: { runs: nSeeds, days, events: ev.length },
      shows, monsters: { ...mons, byWave: monsByWave },
      diseases: { ...dis, byPool: disByPool },
      abilities, contests, skills, plants,
      loot: { dropped: lootDropped, taken: lootTaken, byTier: lootByTier },
      differentiation: diff,
    }, null, 1));
    console.log(`\nwrote ${outFile}`);
  }
}

if (require.main === module) main();
module.exports = { showRoster, monsterRoster, abilityRoster, contestRoster, diseaseRoster, skillRoster, plantRoster, lootRoster, categorize, differentiation };
