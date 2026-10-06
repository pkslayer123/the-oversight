// run-batch-D.js — BATCH D: contest/show debug scenarios.
// Runs each scenario in its own child process (isolation + 60s wall-clock guard),
// then writes batch-D-contests.md.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.env.HOME, 'workspace/the-scattering/hidden_files/debug-sweep-20261005');
const SCENARIOS = ['contestPit', 'contestHide', 'contestForage', 'showWhyEat', 'contestEligible'];
const TIMEOUT_MS = 60000;

function runOne(name) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn('node', [path.join(DIR, 'one-scenario.js'), name], {
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

(async () => {
  const outcomes = [];
  for (const name of SCENARIOS) {
    console.log('running', name, '...');
    outcomes.push(await runOne(name));
  }

  const rows = outcomes.map(o => {
    if (o.timedOut) return `| ${o.scenario} | TIMED OUT (>60s) | — | — | process killed |`;
    const r = o.result;
    if (!r) return `| ${o.scenario} | NO JSON OUTPUT | exit=${o.exitCode} stderr: ${esc(o.stderr.slice(0,300))} | — | harness failure |`;
    const loads = r.loadOk ? 'yes' : 'no';
    const err = r.loadError ? 'LOAD: ' + esc(r.loadError) :
      (r.scenarioError ? 'RUN: ' + esc(r.scenarioError) :
        (r.resolveContestError ? 'RESOLVE: ' + esc(r.resolveContestError) : '—'));
    const interrupt = r.timedOut ? '—' :
      (!r.contestInterruptionExists ? 'Game.contestInterruption MISSING' :
        r.interruptionFired ? `yes (phase=${esc(r.interruptionPhase)})` :
          (r.resolveContestRan ? 'ran, no activeContest set' : 'n/a — no pendingContest to resolve'));
    const bits = [];
    bits.push(`returned=${r.returned}`);
    if (r.pendingContest) bits.push(`pending=${esc(JSON.stringify(r.pendingContest))}`);
    if (r.activeContest) bits.push(`active=${esc(JSON.stringify(r.activeContest))}`);
    if (r.notes.length) bits.push(esc(r.notes.join(' ')));
    if (r.logTail.length) bits.push('log tail:<br>' + esc(r.logTail.map(l => l.slice(0, 220)).join('\n')));
    return `| ${o.scenario} | ${loads} | ${err} | ${interrupt} | ${bits.join('<br>')} |`;
  });

  const md = `# Batch D — contest/show debug scenarios (2026-10-05)

Headless Node sweep. Each scenario run in its own child process with a 60s wall-clock guard.
**IMPORTANT: this run was NOT committed and does not touch git. Nothing was fixed.**

## Design context (Steve 2026-10-05)
Contests are UNAVOIDABLE interruptions: they grab you (or rarely offer a choice),
you go through the sequence even to refuse, and non-participants watch. The old
dice-roll \`resolveContest\` was just replaced by \`contestInterruption()\`, which
announces the interruption and sets \`state.activeContest\`. Playable contest
mechanics per contest type are the next build and are NOT expected to exist here.

## Results

| scenario | loads? | error (if any) | interruption fires? | notes |
|---|---|---|---|---|
${rows.join('\n')}

## Readout

- **What actually works:** scenarios that load, \`fireContest\` sets \`pendingContest\`,
  \`resolveContest\` routes into \`contestInterruption\` without throwing, and
  \`state.activeContest\` records phase \`intro\` (player picked) or \`watching\` (villager picked).
- **What is still missing (expected):** beyond the interruption announcement there is no
  playable contest gameplay — no arena, no choices UI, no watch-mode feed, no per-contest
  mechanics. The phase sits at \`intro\`/\`watching\` with nowhere to go.
- **Bugs vs junk:** see error column above.
`;
  const out = path.join(DIR, 'batch-D-contests.md');
  fs.writeFileSync(out, md);
  console.log('wrote', out);
  fs.writeFileSync(path.join(DIR, 'batch-D-contests.json'), JSON.stringify(outcomes.map(o => ({
    scenario: o.scenario, timedOut: o.timedOut, ms: o.ms, exitCode: o.exitCode, result: o.result,
  })), null, 2));
  console.log('done');
})();
