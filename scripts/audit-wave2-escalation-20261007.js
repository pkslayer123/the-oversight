#!/usr/bin/env node
// Wave-2 escalation audit — "wave 2 on its own terms" (Steve 2026-10-06/07).
// The Highbeam Deer is wave-1 and CANNOT be the wave-2 bar. This script scores
// every wave-2 monster (discovered dynamically via m.wave === 2) on 7
// escalation dimensions and renders a PASS / NEEDS-WORK verdict per monster.
//
// Dimensions:
//   1. band      — HP/damage range vs the wave-2 band published in
//                  docs/MONSTER-WAVES.md (HP 30-170, damage 12-34). Seeded
//                  Monte Carlo (mulberry32) reports expected rolled values.
//   2. telegraph — distinct (no duplicates across the roster), bespoke length,
//                  no leaked template placeholders.
//   3. phases    — visible windup->action->recovery phase system + badges.
//   4. audio     — bespoke encounter audio hooks that resolve to real synths
//                  in app.js (vs silent/missing or the deerAggro fallback).
//   5. codex     — codexStages 3/3, knownCue, knownTactics (knowledge-gated
//                  coaching after the pattern is learned).
//   6. pattern   — attack.pattern distinctness vs wave-1 monsters sharing the
//                  same pattern type (bare {"type":"direct"} with no params is
//                  the wave-1-ducks signature, not a wave-2 signature).
//   7. defense   — armor / resistances present and fiction-sensible.
//
// Usage:
//   node scripts/audit-wave2-escalation-20261007.js [--file <monsters.json>]
//       [--appjs <app.js>] [--seed N] [--json]
// Defaults read the repo-local files; --file/--appjs let you audit a pristine
// HEAD extract (e.g. from `git archive HEAD`) without touching the worktree.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const MONSTERS_FILE = opt('--file', path.join(ROOT, 'src', 'data', 'monsters.json'));
const APPJS_FILE = opt('--appjs', path.join(ROOT, 'src', 'js', 'app.js'));
const SEED = parseInt(opt('--seed', '20261007'), 10);
const AS_JSON = args.includes('--json');

// Wave-2 band per docs/MONSTER-WAVES.md (HP 30-170, damage 8-48 as of the
// 2026-10-09 hardening + vector additions; was 12-34).
const BAND = { hpLo: 30, hpHi: 170, dmgLo: 8, dmgHi: 48 };

// --- seeded RNG (mulberry32) -------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const rollInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// --- load data ----------------------------------------------------------------
const raw = JSON.parse(fs.readFileSync(MONSTERS_FILE, 'utf8'));
const monsters = Array.isArray(raw) ? raw : (raw.monsters || Object.values(raw));
const wave2 = monsters.filter(m => m.wave === 2);
const wave1 = monsters.filter(m => (m.wave || 1) === 1);
if (!wave2.length) { console.error('no wave-2 monsters found in ' + MONSTERS_FILE); process.exit(2); }

// --- audio hook resolution ----------------------------------------------------
// A hook "resolves" when it names a real synth: either a registry entry
// (6-space method shorthand in the audio object) or a function definition.
// Aliases (e.g. hecklerLaugh -> hecklerTaunt) count — the registry is the
// dispatch table.
const appSrc = fs.readFileSync(APPJS_FILE, 'utf8');
const registry = new Set();
for (const m of appSrc.matchAll(/^\s{6}([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)) registry.add(m[1]);
const fnDefs = new Set();
for (const m of appSrc.matchAll(/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) fnDefs.add(m[1]);
const resolves = (h) => registry.has(h) ? 'registry' : (fnDefs.has(h) ? 'fn-only' : 'MISSING');

// --- telegraph duplicate census -----------------------------------------------
const teleCount = {};
for (const m of monsters) {
  const t = (m.attack && m.attack.telegraph || '').trim();
  if (t) teleCount[t] = (teleCount[t] || 0) + 1;
}

// --- wave-1 pattern signatures by type -----------------------------------------
const w1Sigs = {}; // type -> Set of param-key signatures
for (const m of wave1) {
  const p = m.attack && m.attack.pattern;
  if (!p || !p.type) continue;
  const sig = Object.keys(p).filter(k => k !== 'type').sort().join(',');
  (w1Sigs[p.type] = w1Sigs[p.type] || new Set()).add(sig);
}

// --- escalation theses (one line each, grounded in the data) ------------------
const THESIS = {
  voice_mimic_radio: 'Weaponized trust — the lure IS the telegraph; you walk into the ambush yourself.',
  mirror_stag: 'The deer, iterated — same chassis, but the charge wants you to SEE it coming; the wheel punishes the dodge.',
  review_drone: 'The exam you cannot cram for — a 3-turn countdown with the firing line pre-drawn on the dirt.',
  bright_idea: 'Greed as a targeting laser — the longer you admire it, the closer the detonation.',
  memory_projector: 'Homesickness with a firing solution — it holds you still with what you miss.',
  warranty_caller: 'The call you cannot hang up on — it dials stationary targets; stillness is the tell.',
  understudy: 'Your own build, turned around — it learns your favorite move and performs it back.',
  landlord: 'The ground is the monster — leased tiles tax every round you stand still.',
  heckler: 'Morale damage — shame stacks and the swing is incidental; answer back or end it fast.',
  paparazzo: 'Four shots to the money shot — every photo makes the next one undodgeable.',
  union_rep: 'It does not fight, it organizes — the picket line is the damage.',
  moderator: 'Wave-2 apex — content enforcement: muting and shadowban before removal.',
  statickite: 'Marked for broadcast — the scan zone is the telegraph; the dip is the melee window.',
  giant_mosquito: 'The shock is that it is just a mosquito — a hit-and-run drinker carrying alien viruses (Eurika / East Nile).',
  alien_tick: 'Patience is its whole plan — it quests, latches, and feeds; the latch can carry Lemons disease.',
};

// --- per-monster audit ----------------------------------------------------------
const results = [];
for (const m of wave2) {
  const atk = m.attack || {};
  const pat = atk.pattern || {};
  const enc = m.encounter || {};
  const dims = {};

  // 1. band (Monte Carlo expected values + range compliance)
  const N = 20000;
  let hpSum = 0, dmgSum = 0;
  for (let i = 0; i < N; i++) {
    hpSum += rollInt(m.hp[0], m.hp[1]);
    dmgSum += rollInt(atk.damage[0], atk.damage[1]);
  }
  const bandOk = m.hp[0] >= BAND.hpLo && m.hp[1] <= BAND.hpHi &&
                 atk.damage[0] >= BAND.dmgLo && atk.damage[1] <= BAND.dmgHi;
  dims.band = {
    status: bandOk ? 'PASS' : 'FAIL',
    detail: `hp [${m.hp}] dmg [${atk.damage}] vs band HP ${BAND.hpLo}-${BAND.hpHi} / dmg ${BAND.dmgLo}-${BAND.dmgHi}` +
            ` | E[hp]=${(hpSum / N).toFixed(1)} E[dmg]=${(dmgSum / N).toFixed(1)} (seed ${SEED}, n=${N})`,
  };

  // 2. telegraph
  const tg = (atk.telegraph || '').trim();
  const tgIssues = [], tgWarns = [];
  if (!tg) tgIssues.push('missing telegraph');
  if (tg && teleCount[tg] > 1) tgIssues.push(`duplicated x${teleCount[tg]}`);
  if (tg && tg.length < 50) tgWarns.push(`terse (${tg.length}ch) — distinct but terse`);
  if (/\{[a-z]+\}/.test(tg)) tgIssues.push('leaked template placeholder');
  if (!m.unknown) tgIssues.push('missing unknown-descriptor');
  dims.telegraph = {
    status: tgIssues.length ? 'FAIL' : (tgWarns.length ? 'WARN' : 'PASS'),
    detail: (tgIssues.length ? tgIssues.join('; ') : tgWarns.join('; ')) ||
      `bespoke, ${tg.length}ch, unique across ${monsters.length} monsters`,
  };

  // 3. phases
  const phases = enc.phases || [];
  const badges = enc.phaseBadges || {};
  const phaseIssues = [];
  if (phases.length < 3) phaseIssues.push(`only ${phases.length} phases`);
  if (phases.length && phases.some(p => !badges[p])) phaseIssues.push('phase(s) missing badges');
  dims.phases = {
    status: phaseIssues.length ? 'WARN' : 'PASS',
    detail: phaseIssues.length ? phaseIssues.join('; ')
      : `${phases.length} phases [${phases.join(' → ')}]${enc.phaseMap ? ' + phaseMap' : ''}`,
  };

  // 4. audio
  const hookKinds = ['noticeAudio', 'declareAudio', 'aggroAudio', 'resolveAudio'];
  const hooks = hookKinds.map(k => ({ kind: k, name: enc[k] || null }));
  const hookRes = hooks.map(h => h.name ? `${h.kind}=${h.name}(${resolves(h.name)})` : `${h.kind}=-`);
  const aggro = enc.aggroAudio;
  const aggroOk = aggro && resolves(aggro) !== 'MISSING';
  const nResolved = hooks.filter(h => h.name && resolves(h.name) !== 'MISSING').length;
  const audioIssues = [];
  if (!aggroOk) audioIssues.push(aggro ? `aggroAudio '${aggro}' MISSING (silent or deerAggro fallback)` : 'no aggroAudio (falls back to deerAggro)');
  if (nResolved < 2) audioIssues.push(`only ${nResolved}/4 encounter beats have resolving audio`);
  dims.audio = {
    status: !aggroOk ? 'FAIL' : (audioIssues.length ? 'WARN' : 'PASS'),
    detail: (audioIssues.length ? audioIssues.join('; ') + ' | ' : '') + hookRes.join(' '),
  };

  // 5. codex
  const cs = m.codexStages || {};
  const codexIssues = [];
  if (!(cs.unknown && cs.observed && cs.slain)) codexIssues.push('codexStages incomplete');
  if (!enc.knownCue) codexIssues.push('missing knownCue');
  const tacticsMissing = !enc.knownTactics;
  if (tacticsMissing) codexIssues.push('missing knownTactics (no learned-pattern coaching)');
  dims.codex = {
    status: codexIssues.some(i => i.startsWith('missing knownTactics')) && codexIssues.length === 1 ? 'WARN'
      : codexIssues.length ? 'FAIL' : 'PASS',
    detail: codexIssues.length ? codexIssues.join('; ')
      : `stages 3/3 + knownCue + knownTactics`,
  };

  // 6. pattern distinctness vs wave-1 same type
  // Rush is special: app.js documents that rush patterns NEVER declare, so no
  // grid telegraph can ever paint for them — params would be inert. For rush,
  // the escalation check is whether the encounter documents a non-grid tell
  // (the ring / notice text) instead of pattern params.
  const pKeys = Object.keys(pat).filter(k => k !== 'type');
  const bare = pKeys.length === 0;
  const sig = pKeys.sort().join(',');
  const w1HasBare = w1Sigs[pat.type] && w1Sigs[pat.type].has('');
  const styleFields = ['chargeStyle', 'burstStyle', 'sweep', 'chargeDesc', 'burstDesc'].filter(k => pat[k]);
  const patIssues = [];
  let patStatus = 'PASS', patDetail = '';
  if (pat.type === 'rush' || pat.type === 'single') {
    // rush never declares and the tick's bespoke single-pattern latch never
    // declares (no grid telegraph by engine design) — the tell is textual.
    const tell = enc.noticeText || enc.proximityText || enc.knownCue;
    if (bare && tell) {
      patDetail = `${pat.type} never declares (no grid telegraph by engine design) — tell is textual: "${String(tell).slice(0, 80)}..."`;
    } else if (bare) {
      patIssues.push(`bare ${pat.type} with no documented non-grid tell`);
    }
  } else {
    if (bare && w1HasBare) patIssues.push(`bare {"type":"${pat.type}"} — identical data signature to wave-1 (${pat.type} w/o params)`);
    else if (bare) patIssues.push(`bare {"type":"${pat.type}"} — no params, no grid-visual distinctness`);
    if (!bare && !styleFields.length && !pat.windup && !pat.range && !pat.radius && !pat.length)
      patIssues.push('params present but no style/windup/range/radius/length shaping the visual');
  }
  if (!patDetail) {
    patStatus = patIssues.length ? (bare ? 'FAIL' : 'WARN') : 'PASS';
    patDetail = patIssues.length ? patIssues.join('; ')
      : `${pat.type} {${sig || 'bare'}}${styleFields.length ? ' + ' + styleFields.join(',') : ''} — distinct vs wave-1 ${pat.type}s`;
  }
  dims.pattern = { status: patStatus, detail: patDetail };

  // 7. defense
  const res = m.resistances || {};
  const defOk = (m.armor || 0) > 0 || Object.keys(res).length > 0;
  dims.defense = {
    status: defOk ? 'PASS' : 'WARN',
    detail: defOk ? `armor ${m.armor || 0}, res ${JSON.stringify(res)}` : 'no armor, no resistances',
  };

  const order = ['band', 'telegraph', 'phases', 'audio', 'codex', 'pattern', 'defense'];
  const fails = order.filter(k => dims[k].status === 'FAIL');
  const warns = order.filter(k => dims[k].status === 'WARN');
  const verdict = fails.length || warns.length > 1 ? 'NEEDS-WORK' : 'PASS';
  results.push({
    id: m.id, name: m.name, verdict, thesis: THESIS[m.id] || '(no thesis)',
    dims: order.map(k => ({ dim: k, status: dims[k].status, detail: dims[k].detail })),
    fails, warns,
  });
}

// --- report ---------------------------------------------------------------------
if (AS_JSON) {
  console.log(JSON.stringify({ seed: SEED, band: BAND, base: { monstersFile: MONSTERS_FILE }, results }, null, 1));
} else {
  console.log(`Wave-2 escalation audit — ${wave2.length} monsters (seed ${SEED})`);
  console.log(`Band: HP ${BAND.hpLo}-${BAND.hpHi}, damage ${BAND.dmgLo}-${BAND.dmgHi} (docs/MONSTER-WAVES.md)`);
  console.log('='.repeat(100));
  for (const r of results) {
    console.log(`\n[${r.verdict}] ${r.id} — ${r.name}`);
    console.log(`  thesis: ${r.thesis}`);
    for (const d of r.dims) console.log(`  ${d.status.padEnd(4)} ${d.dim.padEnd(9)} ${d.detail}`);
  }
  const np = results.filter(r => r.verdict === 'PASS').length;
  console.log('\n' + '='.repeat(100));
  console.log(`PASS: ${np}/${results.length} | NEEDS-WORK: ${results.length - np}/${results.length}`);
  console.log('NEEDS-WORK: ' + results.filter(r => r.verdict !== 'PASS').map(r => r.id).join(', '));
}
