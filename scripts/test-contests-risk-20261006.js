// Contest risk rebalance + new styles proof (Steve 2026-10-06)
// Verifies: higher death odds on brave choices, 4 new contests playable,
// new contests in pool, coaching lines present.
const fs = require('fs');
const src = fs.readFileSync('src/js/contests.js', 'utf8');
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL:', name); }
}

// --- Risk rebalance: brave choices should have high die odds ---
check('pit Charge it die 0.20', src.includes("label: 'Charge it'") && src.includes('die: 0.20'));
check('pit Meet the rush die 0.30', src.includes("label: 'Meet the rush'") && src.includes('die: 0.30'));
check('hide Run die 0.32', src.includes("label: 'Run', sub: 'break cover'") && src.includes('die: 0.32'));
check('hide Confront it die 0.38', src.includes("label: 'Confront it'") && src.includes('die: 0.38'));
check('siege Hold the line die 0.30', src.includes("label: 'Hold the line'") && src.includes('die: 0.30'));
check('gauntlet All offense die 0.25', src.includes("label: 'All offense'") && src.includes('die: 0.25'));

// --- New contests in pool ---
for (const id of ['price', 'impress', 'exchange', 'auction']) {
  check(`pool has ${id}`, src.includes(`id: '${id}'`));
  check(`${id} registered in contestPlayable`, src.includes(`if (id === '${id}')`));
  check(`${id} has bespoke function`, src.includes(`_contest${id[0].toUpperCase() + id.slice(1)} = function`));
  check(`${id} has coaching line`, src.includes(`${id}: "`));
}

// --- New contests have 3 phases with WIN/LOSE ---
for (const fn of ['_contestPrice', '_contestImpress', '_contestExchange', '_contestAuction']) {
  const idx = src.indexOf(`G.${fn} = function`);
  check(`${fn} exists`, idx > 0);
  if (idx > 0) {
    const chunk = src.slice(idx, idx + 8000);
    check(`${fn} has WIN`, chunk.includes("next: 'WIN'"));
    check(`${fn} has LOSE`, chunk.includes("next: 'LOSE'"));
    check(`${fn} has prize`, chunk.includes('prize: true'));
  }
}

// --- Ontology documents the changes ---
check('ontology documents risk rebalance', src.includes('risk_rebalance_20261006'));
check('ontology documents new styles', src.includes('pool_expansion_20261006c'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
