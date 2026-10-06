// run-batch-C.js — BATCH C: system debug scenarios.
// Runs each scenario in its own child process (isolation + 60s wall-clock guard),
// saves raw JSON to results/, then writes batch-C-systems.md.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.env.HOME, 'workspace/the-scattering/hidden_files/debug-sweep-20261005');
const RESULTS = path.join(DIR, 'results');
const SCENARIOS = ['day7', 'uprising', 'day1', 'language', 'night', 'liars', 'starving'];
const TIMEOUT_MS = 60000;

function runOne(name) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn('node', [path.join(DIR, 'one-scenario-C.js'), name], {
      cwd: DIR, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ scenario: name, timedOut: true, ms: Date.now() - t0 });
    }, TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      let parsed = null;
      try { parsed = JSON.parse(out); } catch (e) { /* keep null */ }
      resolve({ scenario: name, timedOut: false, ms: Date.now() - t0, exitCode: code, result: parsed, rawOut: out, stderr: err });
    });
  });
}

function esc(s) { return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>'); }
function short(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; }

(async () => {
  fs.mkdirSync(RESULTS, { recursive: true });
  const outcomes = [];
  for (const name of SCENARIOS) {
    console.log('running', name, '...');
    const o = await runOne(name);
    outcomes.push(o);
    if (o.result) fs.writeFileSync(path.join(RESULTS, 'batchC-' + name + '.json'), JSON.stringify(o.result, null, 2));
    console.log('  ->', o.timedOut ? 'TIMED OUT' : ('exit=' + o.exitCode + ' returned=' + (o.result && o.result.returned) + ' ms=' + o.ms));
  }

  const rows = outcomes.map(o => {
    if (o.timedOut) return `| ${o.scenario} | TIMED OUT (>60s) | — | — | process killed; possible infinite loop |`;
    const r = o.result;
    if (!r) return `| ${o.scenario} | NO JSON OUTPUT | exit=${o.exitCode} stderr: ${esc(short(o.stderr, 300))} | — | harness failure |`;
    const loads = r.loadOk ? 'yes' : ('NO — ' + esc(short(r.loadError, 200)));
    const err = r.scenarioError ? 'THREW: ' + esc(short(r.scenarioError, 300))
      : (r.failLines && r.failLines.length ? 'soft-fail in log: ' + esc(short(r.failLines.join(' | '), 300)) : '—');
    const prem = r.premise || {};
    const bits = [];
    bits.push(`returned=${r.returned}`);
    bits.push(`day=${prem.scholarDay} roster=${prem.rosterCount} villagers=${prem.villagersCount} tbfight=${prem.tbfightActive}`);
    // scenario-specific one-liners
    if (o.scenario === 'day7') bits.push(`dayIs7=${prem.dayIs7} armed=${prem.day7Armed} systemArrived=${prem.systemArrived} trust=${prem.trustEntries} names=${prem.knownNames} pantryKcal=${prem.pantryKcal}`);
    if (o.scenario === 'uprising') bits.push(`startUprising=${prem.startVillageUprisingExists} hostiles=${prem.hostileCount} uprisingFlag=${prem.uprisingFlagCount} playerHp=${prem.playerHp}`);
    if (o.scenario === 'day1') bits.push(`dayIs1=${prem.dayIs1} kcal=${prem.kcal} pantryKcal=${prem.pantryKcal}`);
    if (o.scenario === 'language') bits.push(`bgLangs=${prem.bgLangsCount} anyEnglish=${prem.anyEnglish} namesCleared=${prem.knownNamesCleared} sample=${esc(short(JSON.stringify(prem.bgLangsSample), 160))}`);
    if (o.scenario === 'night') bits.push(`night=${prem.dayPartIsNight} animal=${esc(short(JSON.stringify(prem.animal), 120))} weapon=${esc(short(JSON.stringify(prem.weapon), 120))} outside=${prem.insideHavenFalse}`);
    if (o.scenario === 'liars') bits.push(`liarCount=${prem.liarCount} npcLies=${prem.npcLiesExists} sample=${esc(short(JSON.stringify(prem.liesSample), 260))}`);
    if (o.scenario === 'starving') bits.push(`dayIs4=${prem.dayIs4} kcal=${prem.kcal} energy=${prem.energy} hydration=${prem.hydration} pantryKcalTotal=${prem.pantryKcalTotal} pantryField=${prem.pantryKcalField} trust=${esc(short(JSON.stringify(prem.trustValues), 80))}`);
    if (r.log && r.log.length) bits.push('log:<br>' + esc(r.log.map(l => short(l, 200)).join('\n')));
    return `| ${o.scenario} | ${loads} | ${err} | ? | ${bits.join('<br>')} |`;
  });

  const md = `# Batch C — system debug scenarios (2026-10-05)

Headless Node sweep. Each scenario run in its own child process with a 60s wall-clock guard.
**Nothing was fixed, nothing committed. This is inventory only.**

Scenarios: \`day7\` (Day 7 System transition), \`uprising\` (village uprising), \`day1\` (fresh spawn),
\`language\` (language barrier), \`night\` (night hunt), \`liars\` (liar's den), \`starving\` (starving village).

| scenario | loads? | error (if any) | premise holds? | notes |
|---|---|---|---|---|
${rows.join('\n')}

## Verdicts

(To be filled by the sweep author after reading the raw JSON in results/batchC-*.json.)
`;
  fs.writeFileSync(path.join(DIR, 'batch-C-systems.md'), md);
  console.log('wrote batch-C-systems.md (verdicts pending manual review)');
})();
