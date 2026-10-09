// Break-it alien-players r4: copy-vs-engine sweep (G + leftovers).
// G1: specimen_scanner desc promised "Fenwick adapts — the longer you fight
//     one way, the better he reads you" with ZERO mechanics (pass 2 claimed
//     a reword; the promise survived). Must be non-promissory flavor.
// G2: crystal_lattice "the more scared you are, the harder she hits" —
//     engine is binary fear +8. Copy must be binary-honest.
// G3: "The odds on your next fight just shifted" (apFeedMessage/apEventFeed)
//     — stale odds language; the contest-engine pass (7ef1946) reworded 4
//     sibling lines to performance language but missed these two.
// G4: JSON descs and the alienPlayers.js fallback table must agree.
const H = require('./break-alien-harness.js');
const assert = require('assert');
const fs = require('fs'), path = require('path');
let N = 0;
function ok(c, m) { N++; assert(c, m); console.log('ok ' + N + ' - ' + m); }
const SRC = path.join(__dirname, '..', 'src', 'js', 'alienPlayers.js');
const JSONP = path.join(__dirname, '..', 'src', 'data', 'alienPlayers.json');

(async () => {
  await H.boot();
  const src = fs.readFileSync(SRC, 'utf8');
  const data = JSON.parse(fs.readFileSync(JSONP, 'utf8'));
  const byId = {};
  data.forEach(p => { byId[p.id] = p; });

  function techDesc(pid, tid) {
    const fromJson = (byId[pid].alienTech || []).find(t => t.id === tid);
    return fromJson ? fromJson.desc : null;
  }

  // ---- G1: specimen_scanner is flavor, not a promise ----
  const spec = techDesc('dr_fenwick', 'specimen_scanner');
  ok(!!spec, 'specimen_scanner desc exists');
  ok(!/adapt|reads you|better he|learns your/i.test(spec),
    `specimen_scanner makes no mechanical promise (got: "${spec.slice(0, 80)}...")`);

  // ---- G2: crystal_lattice is binary-honest ----
  const lattice = techDesc('countess_sable', 'crystal_lattice');
  ok(!!lattice, 'crystal_lattice desc exists');
  ok(!/more scared|the harder/i.test(lattice),
    `crystal_lattice doesn't promise graded scaling (got: "${lattice.slice(0, 80)}...")`);

  // ---- implemented tech still promises exactly what it does ----
  const dread = techDesc('countess_sable', 'dread_projector');
  ok(/Afraid/i.test(dread), 'dread_projector promises the Afraid status (implemented: encounters.js applies fear)');
  const stasis = techDesc('rax_dentist', 'stasis_field');
  ok(/flee/i.test(stasis), 'stasis_field promises flee-blocking (implemented: tbBarrierExit wrap)');
  const plate = techDesc('sarge', 'veteran_plate');
  ok(/damage by 2|reduces/i.test(plate), 'veteran_plate promises -2 damage (implemented: tbDamage wrap)');
  const cam = techDesc('pip_quindle', 'tourist_cam');
  ok(/stronger the longer/i.test(cam), 'tourist_cam promises scaling (implemented: +1/2 turns, cap +6)');

  // ---- G3: no stale "odds" language on player-facing alien lines ----
  const oddsLines = src.split('\n').filter(l => /odds/i.test(l) && !/^\s*\/\//.test(l) && /say\(|sysSay\(|msgs\.push/.test(l));
  ok(oddsLines.length === 0,
    `no player-facing "odds" copy in alienPlayers.js say/sysSay lines (found ${oddsLines.length})`);

  // ---- G4: JSON and fallback table agree ----
  const G = H.Game;
  for (const pid of ['vex_marlowe', 'countess_sable', 'rax_dentist', 'pip_quindle', 'sarge', 'dr_fenwick']) {
    const fromCode = (G.apAlienTech(pid) || []).map(t => t.id + '|' + t.desc).sort().join(';;');
    const fromJson = ((byId[pid].alienTech) || []).map(t => t.id + '|' + t.desc).sort().join(';;');
    ok(fromCode === fromJson, `${pid}: fallback table matches JSON tech descs`);
  }

  // ---- ability kits are real pool ids (pass-3 fix holds) ----
  const abilities = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'abilities.json'), 'utf8'));
  const pool = new Set((abilities.abilities || abilities).map(a => a.id));
  for (const p of data) {
    for (const aid of (p.abilityKit || [])) {
      ok(pool.has(aid), `${p.id}: kit ability ${aid} is a real pool id`);
    }
  }

  console.log(`\nPASS: ${N} asserts (tech copy honesty)`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
