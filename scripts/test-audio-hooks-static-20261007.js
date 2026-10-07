// test-audio-hooks-static-20261007.js — audio hook wiring audit, static analysis (Steve 2026-10-07).
//
// NOTE: a sibling owns scripts/test-audio-hooks-20261007.js (their untracked
// re-audit + synth-verification proof). This file is the STATIC wiring audit
// from the flesh-out loop audio-hooks assignment; the name differs on purpose
// so the two files never collide.
//
// Builds two inventories from the engine source and cross-matches them:
//   1. FIRED hooks: every audio hook name the engine can fire at runtime —
//      literal audioEvent('name') call sites, data-driven names from
//      src/data/monsters.json encounter.*Audio fields, contest composite
//      beats (CX_BEAT_DEFS, lazily registered at runtime), the tbFifoBreather
//      specs table, direct Game.audio.* references, and encAudio() calls.
//   2. DEFINED voices: every method in the CombatAudio registry export block
//      in src/js/app.js (Game.audio).
//
// A hook that is FIRED but not DEFINED goes silent at runtime: audioEvent()
// (game.js) is a guarded no-op when this.audio[name] is not a function, and
// encAudio() falls back to ENC_AUDIO_FALLBACK composition. Silence, not a
// throw — so these gaps are invisible without this audit.
//
// Exit contract:
//   0 — the fired-but-undefined set EXACTLY matches the documented KNOWN_GAPS
//       (all accounted for in evidence/2026-10-07/audio-hooks-audit-20261007.md).
//   1 — a NEW fired-but-undefined hook appeared, or a known gap resolved /
//       moved without the backlog being updated. Fix the engine or update the
//       backlog, then re-run.
//
// Source root: the repo's src/ by default. Set HEAD_EXTRACT=/path to audit a
// git-archive extract instead (used for the read-only HEAD audit).
// Deterministic: pure static analysis, no RNG, no browser, no audio hardware.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.HEAD_EXTRACT || path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const JS = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

let failures = 0;
const fail = (m) => { failures++; console.log('  FAIL ' + m); };
const note = (m) => console.log('  note ' + m);

// ---------------------------------------------------------------------------
// KNOWN_GAPS: fired-but-undefined hooks with file:line evidence, accounted for
// in the audit note. The script stays green only while this set is EXACT — a
// new gap fails, and a fixed gap fails too (update the backlog instead).
// ---------------------------------------------------------------------------
const KNOWN_GAPS = {
  // Status-effect system audio: fired on every apply/cure, no synths exist.
  statusApplied: 'src/js/statusEffects.js:167 (this.audioEvent on effect apply)',
  statusCured: 'src/js/statusEffects.js:257 (this.audioEvent on cure)',
  // Data-declared monster aggro/declare voices with no registry entry. These
  // are WORSE than generic: the value is truthy, so the `|| 'deerAggro'`
  // fallback never fires — the declare goes fully silent.
  kiteUnfold: 'src/data/monsters.json statickite.encounter.aggroAudio',
  nevermoreUnfold: 'src/data/monsters.json nevermore.encounter.aggroAudio',
  nightcourtTurn: 'src/data/monsters.json nightcourt.encounter.aggroAudio',
  nightcourtDive: 'src/data/monsters.json nightcourt.encounter.declareAudio',
};

// ---------------------------------------------------------------------------
// INVENTORY 1: defined voices (CombatAudio registry export block, app.js)
// ---------------------------------------------------------------------------
function inventoryDefined(appSrc) {
  const start = appSrc.indexOf('const CombatAudio = (() => {');
  if (start < 0) { fail('CombatAudio IIFE not found in app.js'); return new Set(); }
  const retIdx = appSrc.indexOf('return {', start);
  if (retIdx < 0) { fail('CombatAudio export block not found'); return new Set(); }
  const body = appSrc.slice(retIdx);
  const end = body.indexOf('\n    };');
  const block = body.slice(0, end);
  const defined = new Set();
  const dupes = [];
  for (const line of block.split('\n')) {
    const m = /^      ([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(line);
    if (m) {
      if (defined.has(m[1])) dupes.push(m[1]);
      defined.add(m[1]);
    }
  }
  if (dupes.length) fail('duplicate registry keys (silent overwrite): ' + dupes.join(', '));
  return defined;
}

// ---------------------------------------------------------------------------
// INVENTORY 2: fired hooks
// ---------------------------------------------------------------------------
function jsFiles() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  walk(path.join(SRC, 'js'));
  return out;
}

const computed = []; // computed-hook expressions needing manual review

function inventoryFired() {
  const fired = new Map(); // name -> [evidence]
  const add = (name, ev) => {
    if (!fired.has(name)) fired.set(name, []);
    fired.get(name).push(ev);
  };

  for (const f of jsFiles()) {
    const rel = path.relative(ROOT, f);
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      // literal audioEvent('name') — but NOT string-concatenation forms like
      // audioEvent('wound' + suffix): those are computed hooks, handled below.
      for (const m of line.matchAll(/audioEvent\(\s*'([A-Za-z0-9_]+)'/g)) {
        if (/audioEvent\(name,\s*data\)\s*\{/.test(line)) continue; // the definition itself
        const after = line.slice(m.index + m[0].length);
        if (/^\s*\+/.test(after)) {
          computed.push(`${m[1]}*  (${rel}:${i + 1} — suffix is dynamic; resolve manually)`);
          continue;
        }
        add(m[1], `${rel}:${i + 1} literal audioEvent`);
      }
      // literal encAudio('name')
      for (const m of line.matchAll(/encAudio\(\s*'([A-Za-z0-9_]+)'/g)) {
        add(m[1], `${rel}:${i + 1} literal encAudio`);
      }
      // direct Game.audio.<voice> references (not the assignment)
      for (const m of line.matchAll(/Game\.audio\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        if (/Game\.audio\s*=/.test(line)) continue;
        add(m[1], `${rel}:${i + 1} direct Game.audio ref`);
      }
    });
  }

  // data-driven: monsters.json encounter.*Audio fields
  const mons = JSON.parse(JS('data/monsters.json'));
  for (const m of mons) {
    const enc = m.encounter || {};
    for (const [k, v] of Object.entries(enc)) {
      if (/udio/i.test(k) && typeof v === 'string') {
        add(v, `src/data/monsters.json ${m.id}.encounter.${k}`);
      }
    }
  }

  // contest composite beats: lazily registered on Game.audio at first fire
  // (contests.js _cxBeat) — by design, count keys as fired AND resolved.
  const contests = JS('js/contests.js');
  const beatBlock = /const CX_BEAT_DEFS = \{([\s\S]*?)\};/.exec(contests);
  const runtimeRegistered = new Set();
  const beatParts = new Set();
  if (!beatBlock) { fail('CX_BEAT_DEFS not found in contests.js'); }
  else {
    for (const m of beatBlock[1].matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*):/gm)) {
      runtimeRegistered.add(m[1]);
      add(m[1], 'src/js/contests.js CX_BEAT_DEFS (runtime-registered composite)');
    }
    for (const m of beatBlock[1].matchAll(/\['([A-Za-z_][A-Za-z0-9_]*)'\]/g)) beatParts.add(m[1]);
  }
  // beat composite parts ARE fired at runtime via _cxBeat's composed dispatch
  for (const p of beatParts) add(p, 'src/js/contests.js CX_BEAT_DEFS part (fired via composite beat)');

  // tbFifoBreather specs table (game.js): positional 5th-element audio values
  const game = JS('js/game.js');
  const specsBlock = /tbFifoBreather\(m\) \{([\s\S]*?)for \(const \[pred, field, phase, text, audio\] of specs\)/.exec(game);
  if (!specsBlock) { fail('tbFifoBreather specs table not found'); }
  else {
    const audios = [...specsBlock[1].matchAll(/,\s*'([A-Za-z_][A-Za-z0-9_]*)'\s*\],/g)].map((m) => m[1]);
    if (!audios.length) fail('tbFifoBreather specs audio extraction found nothing');
    for (const a of audios) add(a, 'src/js/game.js tbFifoBreather specs table');
  }

  // encAudio fallback composition keys (encounters.js): by design, resolved.
  const enc = JS('js/encounters.js');
  const fbBlock = /var ENC_AUDIO_FALLBACK = \{([\s\S]*?)\};/.exec(enc);
  const fallbackComposed = new Set();
  if (fbBlock) {
    for (const m of fbBlock[1].matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*):/gm)) {
      fallbackComposed.add(m[1]);
      add(m[1], 'src/js/encounters.js ENC_AUDIO_FALLBACK (documented composition)');
    }
  }

  return { fired, runtimeRegistered, fallbackComposed, beatParts };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
(function main() {
  console.log('== audio hook wiring audit ==');
  console.log('source root: ' + ROOT);

  const appSrc = JS('js/app.js');
  const defined = inventoryDefined(appSrc);
  const { fired, runtimeRegistered, fallbackComposed, beatParts } = inventoryFired();

  // By-design resolutions: contest composites + encAudio fallback compositions
  // are defined at runtime / documented, not missing registry entries.
  const resolvedByDesign = new Set([...runtimeRegistered, ...fallbackComposed]);
  const callSites = [...fired.values()].reduce((n, v) => n + v.length, 0);

  const firedUndefined = [...fired.keys()].filter(
    (n) => !defined.has(n) && !resolvedByDesign.has(n)
  );
  const gapNames = new Set(Object.keys(KNOWN_GAPS));
  const unexpected = firedUndefined.filter((n) => !gapNames.has(n));
  const resolved = [...gapNames].filter((n) => !firedUndefined.includes(n));

  console.log(`\ncall sites (incl. data-driven): ${callSites}`);
  console.log(`defined voices (Game.audio registry): ${defined.size}`);
  console.log(`fired-but-undefined: ${firedUndefined.length} (${unexpected.length} unexpected)`);

  for (const n of unexpected) {
    fail(`UNEXPECTED fired-but-undefined hook '${n}' — evidence: ${(fired.get(n) || []).slice(0, 3).join(' | ')}`);
  }
  for (const n of resolved) {
    fail(`KNOWN gap '${n}' no longer fires or is now defined — update KNOWN_GAPS + the audit backlog`);
  }
  for (const n of firedUndefined) {
    if (gapNames.has(n)) note(`known gap '${n}': ${KNOWN_GAPS[n]}`);
  }

  // beat composite parts must all resolve in the registry (else the composite
  // silently drops that layer — _cxBeat guards with typeof check).
  for (const p of beatParts) {
    if (!defined.has(p)) fail(`CX_BEAT composite part '${p}' not in Game.audio registry`);
  }

  // drama A/V sync path: schema exists, but is it wired?
  const dramaJs = JS('js/drama.js');
  const dramaFx = JSON.parse(JS('data/dramaEffects.json'));
  const audioForExists = /audioFor/.test(dramaJs);
  const nonNullAudio = Object.entries(dramaFx)
    .filter(([k, v]) => k !== '_schema' && k !== '_comment' && v && typeof v === 'object' && v.audio)
    .map(([k]) => k);
  console.log(`\ndrama subsystem: Drama.audioFor ${audioForExists ? 'EXISTS' : 'MISSING'}; ` +
    `dramaEffects.json non-null audio: ${nonNullAudio.length}`);
  if (!audioForExists) note('drama A/V sync audio path is dead code (game.js calls D.audioFor in try/catch) — see audit note');

  // defined-but-never-fired (informational; includes dispatcher internals)
  const unfired = [...defined].filter((n) => !fired.has(n));
  console.log(`\ndefined-never-fired: ${unfired.length}`);
  for (const n of unfired.sort()) console.log('   - ' + n);

  // generic-fallback census: monsters with no encounter audio declare with deerAggro
  const mons = JSON.parse(JS('data/monsters.json'));
  const noAudio = mons
    .filter((m) => !Object.keys(m.encounter || {}).some((k) => /udio/i.test(k)))
    .map((m) => m.id);
  console.log(`\nmonsters with NO encounter audio (declare via deerAggro fallback): ${noAudio.length}`);
  for (const id of noAudio) console.log('   - ' + id);

  if (computed.length) {
    console.log(`\ncomputed hook expressions (dynamic suffix — verify manually): ${computed.length}`);
    for (const c of computed) console.log('   - ' + c);
  }

  console.log(failures ? `\nRESULT: FAIL (${failures})` : '\nRESULT: PASS — no unaccounted fired-but-undefined hooks');
  process.exit(failures ? 1 : 0);
})();
