// sweep.js — run each scenario in an isolated child process (60s kill each),
// collect JSON results, write the markdown report.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SCENARIOS = ['deer', 'headlight', 'flashbulb', 'choir', 'lockpick', 'hummice', 'nightlight'];
const CHILD_TIMEOUT_MS = 60000;

const results = [];
for (const name of SCENARIOS) {
  const t0 = Date.now();
  let raw = null, err = null;
  try {
    raw = execFileSync(process.execPath, [path.join(DIR, 'run-one.js'), name], {
      timeout: CHILD_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    }).toString();
  } catch (e) {
    err = 'child failed: ' + (e.killed ? 'KILLED after timeout (' + CHILD_TIMEOUT_MS + 'ms)' : (e.message || e));
    if (e.stdout) { try { raw = e.stdout.toString(); } catch (_) {} }
  }
  let parsed = null;
  if (raw) {
    try { parsed = JSON.parse(raw); }
    catch (e) { err = (err ? err + ' | ' : '') + 'JSON parse failed: ' + e.message + '; raw tail: ' + raw.slice(-300); }
  }
  results.push({ name, ms: Date.now() - t0, parsed, err });
}

// ---- build markdown ----
const L = [];
L.push('# Batch A — combat monster scenarios (debug sweep)');
L.push('');
L.push('_Generated headlessly via `Game.debugScenario(name)` in Node, 2026-10-05. Each scenario ran in an isolated process (60s kill guard). After load, the harness force-starts combat via `Game.startCombat(monsterId)` if a monster was placed, then performs up to 3 player attack iterations (strike nearest alive monster on player turns, `tbAdvance()` for AI turns, capped at 60 advance calls). No fixes applied — inventory only._');
L.push('');
L.push('| scenario | loads? | scenario OK? | monster def | combat advances? | notes |');
L.push('|---|---|---|---|---|---|');

function esc(s) { return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>'); }

for (const r of results) {
  const p = r.parsed;
  let loads, ok, def, advances, notes = '';
  if (!p) {
    loads = 'NO'; ok = '—'; def = '—'; advances = '—';
    notes = esc(r.err || 'no output');
  } else {
    loads = p.loaded ? 'YES' : 'NO';
    ok = p.scenarioOk === true ? 'YES' : (p.scenarioOk === false ? 'NO' : '—');
    if (!p.loaded && p.loadError) notes += 'LOAD ERROR: ' + esc(String(p.loadError).split('\n').slice(0, 3).join(' ')) + ' ';
    if (p.scenarioOk === false) notes += 'debugScenario returned false. ';
    if (p.scenarioError) notes += 'ERROR: ' + esc(p.scenarioError.split('\n')[0]) + ' ';
    const md = p.monsterDef;
    if (md) {
      def = md.found === true ? md.id + ' ✓' : (md.found === false ? md.id + ' MISSING' : md.id + ' ?');
      if (md.missingCore && md.missingCore.length) notes += 'def missing core fields: ' + md.missingCore.join(',') + '. ';
      if (md.found === true) notes += `def: hp ${JSON.stringify(md.hp)}, speed ${md.speed}, pack ${md.pack}, risk ${md.risk}, encounter ${md.hasEncounter ? 'yes' : 'NO'}, attack ${md.hasAttack ? 'yes' : 'NO'}. `;
    } else def = 'n/a (no monster placed)';
    const c = p.combat;
    if (!c || !c.attempted) {
      advances = 'n/a';
      if (c && c.error) notes += 'combat error: ' + esc(c.error) + ' ';
      if (p.name === 'deer') notes += 'hunting scenario, not a monster fight — no tbfight expected. ';
    } else {
      const fs0 = c.finalState || {};
      if (fs0.over) advances = 'YES (fight ended: ' + esc(fs0.result || '?') + ')';
      else if (c.softLockSuspect) advances = 'SOFT-LOCK SUSPECT';
      else advances = 'partially (still fighting)';
      notes += `${c.fighters ? c.fighters.length : '?'} fighters (${c.monsterKeys ? c.monsterKeys.length : '?'} monster keys). `;
      const acts = (c.turns || []).map(t => `r${t.round} ${t.current || '?'}: ${t.action || t.actionError || '?'}`).join(' <br> ');
      notes += esc(acts) + ' ';
      if (fs0.logTail) notes += '<br>log: ' + esc(fs0.logTail.slice(-3).join(' | '));
      if (c.softLockSuspect) notes += ' **tbAdvance cap hit — AI turns may never return to player.**';
    }
    if (r.err) notes += ' harness note: ' + esc(r.err);
    notes += ` (${r.ms}ms)`;
  }
  L.push(`| ${r.name} | ${loads} | ${ok} | ${esc(def)} | ${advances} | ${notes} |`);
}

L.push('');
L.push('## Raw log tails (last ~10 lines of Game.log after scenario load)');
L.push('');
for (const r of results) {
  const p = r.parsed;
  L.push(`### ${r.name}`);
  if (p && p.logTail && p.logTail.length) {
    for (const line of p.logTail) L.push('- ' + String(line).replace(/\n/g, ' '));
  } else {
    L.push('- _(no log captured)_');
  }
  L.push('');
}

L.push('## Full error stacks (where present)');
L.push('');
for (const r of results) {
  const p = r.parsed;
  if (p && (p.loadError || p.scenarioError || (p.combat && p.combat.error))) {
    L.push(`### ${r.name}`);
    L.push('```');
    if (p.loadError) L.push('LOAD: ' + p.loadError);
    if (p.scenarioError) L.push('SCENARIO: ' + p.scenarioError);
    if (p.combat && p.combat.error) L.push('COMBAT: ' + p.combat.error);
    L.push('```');
    L.push('');
  }
}

const out = path.join(DIR, 'batch-A-combat-monsters.md');
fs.writeFileSync(out, L.join('\n'));
console.log('wrote ' + out);
for (const r of results) {
  const p = r.parsed;
  console.log(r.name, '| loaded:', p ? p.loaded : 'NO-PARSE', '| scenario:', p ? p.scenarioOk : 'n/a', '| combat:', p && p.combat && p.combat.attempted ? (p.combat.finalState && p.combat.finalState.over ? 'ended' : (p.combat.softLockSuspect ? 'SOFT-LOCK?' : 'ran')) : 'n/a');
}
