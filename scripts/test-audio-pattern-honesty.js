// Proof test: pattern-honest audio dispatch (break-it audio r5, 2026-10-10).
//
// For every monster attack pattern type, the telegraph (windup) voice and the
// impact (resolve) voice must come from the SAME voice family. A line-pattern
// attack that winds up as a machine beam and resolves as a line strike is a
// coherence violation: the ear learns the wrong cue.
//
// The test does NOT hardcode dispatch rules. It extracts the ordered
// branch conditions from telegraph()/impact() in src/js/app.js and the
// `beam` flag expressions from the game.js fire sites, then simulates the
// dispatch for each pattern type used in src/data/monsters.json.
//
// Usage: node scripts/test-audio-pattern-honesty.js [repoRoot]
// Exit 0 = all patterns wind up and resolve in the same family.
'use strict';
const fs = require('fs');
const path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
const gameJs = fs.readFileSync(path.join(root, 'src/js/game.js'), 'utf8');
const monsters = JSON.parse(fs.readFileSync(path.join(root, 'src/data/monsters.json'), 'utf8'));

// ---- 1. extract ordered dispatch branches from a hook body ----
function extractDispatch(src, hookName) {
  const m = src.match(new RegExp(hookName + '\\(d\\) \\{([\\s\\S]*?)\\n      \\},'));
  if (!m) throw new Error('hook not found: ' + hookName);
  const body = m[1];
  const branches = [];
  // match: if (COND) voice(...)  /  else if (COND) voice(...)
  const re = /(?:if|else if)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*\{?\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let hit;
  while ((hit = re.exec(body))) branches.push({ cond: hit[1].trim(), voice: hit[2] });
  return branches;
}
// voice family: map each dispatch voice to its pattern family
function family(voice) {
  const m = {
    beamCharge: 'beam', beamTechWindup: 'beam', beamFire: 'beam', droneBeam: 'beam',
    burstWindup: 'burst', burstDetonate: 'burst',
    chargeWindup: 'charge', chargeImpact: 'charge',
    lockonTick: 'direct', lockonHit: 'direct',
    rushWindup: 'rush', rushHit: 'rush',
    diveWindup: 'single', diveImpact: 'single',
    ambushSnap: 'ambush',
    lineWindup: 'line', lineStrike: 'line',
  }[voice];
  if (!m) throw new Error('unmapped voice: ' + voice);
  return m;
}
// evaluate a branch condition against d = {pattern, beam, highbeam, windupTick}
function atomTrue(a0, d) {
  const a = a0.trim().replace(/^\(+/, '').replace(/\)+$/, '').trim();
  let mm;
  if ((mm = a.match(/^pat === '([a-z]+)'$/))) return d.pattern === mm[1];
  if (a === 'd') return !!d;
  if (a === 'd.beam') return !!d.beam;
  if (a === 'd.highbeam') return !!d.highbeam;
  if (a === 'd.windupTick') return !!d.windupTick;
  if ((mm = a.match(/^\(d && d\.([a-zA-Z]+)\)$/))) return !!d[mm[1]];
  throw new Error('unparseable condition atom: ' + a);
}
function condTrue(cond, d) {
  const c = cond.replace(/\s+/g, ' ');
  return c.split('||').some(part => part.split('&&').every(a => atomTrue(a, d)));
}
function dispatch(branches, d) {
  for (const b of branches) {
    if (condTrue(b.cond, d)) return b.voice;
  }
  return '(fallthrough)';
}

const teleBranches = extractDispatch(appJs, 'telegraph');
const impBranches = extractDispatch(appJs, 'impact');
// sanity: known voices present
for (const v of ['beamCharge', 'beamTechWindup', 'lineWindup', 'lineStrike', 'burstDetonate', 'chargeImpact', 'rushHit', 'diveImpact', 'ambushSnap', 'lockonTick', 'lockonHit', 'droneBeam']) {
  if (!teleBranches.concat(impBranches).some(b => b.voice === v)) {
    console.log('WARN: voice not found in dispatch: ' + v);
  }
}

// ---- 2. fire-site beam flags from game.js ----
// telegraph generic declare (sweep-capable path):
const teleSite = gameJs.match(/audioEvent\('telegraph', \{ urgency: m\.telegraph\.turnsLeft, pattern: pat\.type, beam: ([^,}]+),/);
if (!teleSite) throw new Error('telegraph fire site not found');
const teleBeamExpr = teleSite[1].trim();
// impact pattern-honest resolve:
const impSite = gameJs.match(/audioEvent\('impact', \{ pattern: _rpt, beam: ([^,}]+),/);
if (!impSite) throw new Error('impact fire site not found');
const impBeamExpr = impSite[1].trim();
console.log('telegraph beam flag:', teleBeamExpr);
console.log('impact    beam flag:', impBeamExpr);

function evalBeamFlag(expr, pattern) {
  // known shapes compare a pattern accessor against literals; evaluate directly
  const e = expr.replace(/pat\.type|_rpt/g, JSON.stringify(pattern));
  // eslint-disable-next-line no-eval
  return !!eval(e);
}

// ---- 3. patterns actually used in monsters.json ----
const used = new Set();
const list = Array.isArray(monsters) ? monsters : (monsters.monsters || Object.values(monsters));
for (const m of list) {
  const atk = (m && (m.mdef || {}).attack) || m.attack;
  const pat = atk && atk.pattern;
  const t = pat && (typeof pat === 'string' ? pat : pat.type);
  if (t) used.add(t);
}
console.log('patterns in use:', [...used].sort().join(', '));

// ---- 4. simulate ----
let failures = 0;
for (const p of [...used].sort()) {
  const td = { pattern: p, beam: evalBeamFlag(teleBeamExpr, p), highbeam: false, urgency: 1 };
  const id = { pattern: p, beam: evalBeamFlag(impBeamExpr, p), highbeam: false };
  const w = dispatch(teleBranches, td);
  const r = dispatch(impBranches, id);
  // 'ambush' is silent on windup BY DESIGN (turtleSnap is the resolve) — the
  // telegraph dispatch deliberately has no ambush branch.
  const wNorm = (w === '(fallthrough)' && p === 'ambush') ? 'ambushSnap' : w;
  if (w === '(fallthrough)' && p !== 'ambush') { console.log(`FAIL pattern=${p} windup falls through dispatch`); failures++; continue; }
  if (r === '(fallthrough)') { console.log(`FAIL pattern=${p} resolve falls through dispatch`); failures++; continue; }
  const wf = family(wNorm), rf = family(r);
  const ok = wf === rf;
  console.log(`${ok ? 'PASS' : 'FAIL'} pattern=${p} windup=${w} (${wf}) resolve=${r} (${rf}) beamFlag tele=${td.beam} impact=${id.beam}`);
  if (!ok) failures++;
}
if (failures) {
  console.log(`\n${failures} pattern(s) wind up and resolve in different voice families.`);
  process.exit(1);
}
console.log('\nAll patterns wind up and resolve in the same voice family.');
