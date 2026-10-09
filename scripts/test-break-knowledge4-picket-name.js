// BREAK-IT knowledge 4th pass — HONESTY: the Union Rep's PICKET LINE summon
// (game.js, tbMonsterTurn) speaks the summoned wave-1 monster's TRUE name via
// pick.name — while the fighter itself is named through the gated
// monsterDisplayName. Pre-System / pre-naming, the player gets only strange
// descriptors; this say-line breaks that law for any wave-1 monster.
//
// BEFORE: `"PICKET LINE!" A <TRUE NAME> lumbers in...` (e.g. "A Hushpuppy
// lumbers in, holding a tiny sign").
//
// AFTER: the line uses the gated monsterNoun(pick.id) — descriptor until the
// village names it, true name only once earned.
'use strict';
const h = require('./break-monsters-harness.js');
const SEEDS = [20261008, 7, 424242, 555, 999];

async function run(seed) {
  global.window = global;
  const G = await h.freshGame(seed);
  G.say = () => {};
  G.state.systemArrived = false;
  G.state.codex.monsters = {}; // nothing named
  const lines = [];
  G.say = (l) => { lines.push(String(l)); };

  const rep = (G.data.monsters || []).find(m => m.id === 'union_rep');
  if (!rep) return { seed, skip: 'no union_rep' };
  // fabricate a union-rep fighter mid-fight at the picket-line trigger point
  const px = G.state.scholar.mx ?? 4, py = G.state.scholar.my ?? 4;
  const m = {
    key: 'm_ur', kind: 'monster', monsterId: 'union_rep', mdef: rep,
    name: G.monsterDisplayName('union_rep'), emoji: rep.emoji || '👹',
    hp: 100, maxHp: 100, speed: 3, mx: px + 1, my: py, alive: true,
    fled: false, telegraph: null, acted: false, moveLeft: 3,
    urOrgTurns: 1, urSummoned: false, hesitate: 0, blind: 0, stunned: 0,
    threatQueue: [],
  };
  G.tbfight = {
    fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 100, maxHp: 100, speed: 5,
        mx: px, my: py, alive: true, fled: false, moveLeft: 3, acted: false },
      m,
    ],
    order: ['p', 'm_ur'], over: false,
  };
  let err = null;
  try { G.tbMonsterTurn(m); } catch (e) { err = String((e && e.message) || e); }
  if (err) return { seed, error: err };

  const pline = lines.find(l => /PICKET LINE/i.test(l));
  if (!pline) return { seed, skip: 'picket line did not fire' };
  const trueNames = (G.data.monsters || [])
    .filter(x => (x.wave || 1) === 1 && x.id !== 'bulldozer' && x.id !== 'gallowdeer')
    .map(x => x.name);
  const leaked = trueNames.filter(n => pline.includes(n));
  return {
    seed,
    fired: true,
    noTrueName: leaked.length === 0,
    detail: `leaked=[${leaked.join(',')}] line=${JSON.stringify(pline.slice(0, 80))}`,
  };
}

async function main() {
  let fails = 0, ran = 0, skipped = 0;
  for (const seed of SEEDS) {
    const r = await run(seed);
    if (r.skip) { console.log(`SKIP seed ${r.seed}: ${r.skip}`); skipped++; continue; }
    if (r.error) { console.log(`ERROR seed ${r.seed}: ${r.error}`); fails++; continue; }
    ran++;
    const ok = !!r.noTrueName;
    console.log(`${ok ? 'PASS' : 'FAIL'} | seed ${r.seed} | noTrueName | ${r.detail}`);
    if (!ok) fails++;
  }
  console.log(fails ? `\n${fails} CHECK(S) FAILED (${ran} ran, ${skipped} skipped)` : `\nALL CHECKS PASSED (${ran} seeds, ${skipped} skipped)`);
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
