#!/usr/bin/env node
// HOSTILE PLAYTEST (brawler archetype, 2026-10-08, run 2): play as an attacker.
// Combat was hit hard ~20h ago (free-XP, door-flee, honesty fixes all landed).
// Fresh angles: corpse economy double-dips, fled-target guards (regression),
// strike-number honesty vs armor, feastburn floors, intimidation farm limits,
// wait-stall vs telegraphs, and a full-fight feel pass.
// Run: SEED=N node scripts/attack-brawler-20261008.js
const H = require('./combat-break-harness.js');
const verdicts = [];
const attack = (name, broke, detail) => { verdicts.push([name, broke]); console.log(`[${broke ? 'BREAK' : 'HELD '} ] ${name}${detail ? ' — ' + detail : ''}`); };
const sayLines = (G) => { const l = (G.log || []).map(x => x.text || x); (G.log || []).length = 0; return l; };

(async () => {
  const Game = await H.newCombatReadyGame();
  const G = Game;
  console.log('== SEED ' + H.SEED + ' ==');
  // tbEnd nulls tbfight in a finally (cleanup guarantee) — record results via wrapper.
  let lastResult = null;
  const _tbEnd = G.tbEnd.bind(G);
  G.tbEnd = function (r) { lastResult = r; return _tbEnd(r); };

  // ---- A1: corpse loot double-dip ----
  // Kill a monster, loot the corpse twice. Items must be consumed, not duped.
  {
    const mk = H.synthFight(G, 'hushwolf', { mhp: 10, php: 500 });
    const s = G.state.scholar; s.mx = 4; s.my = 4;
    const m = G.tbfight.fightersByKey[mk]; m.mx = 5; m.my = 4;
    let guard = 0;
    while (G.tbfight && !G.tbfight.over && guard++ < 60) {
      const p = G.tbFighter('p');
      if (!p || !p.alive) break;
      if (G.tbIsPlayerTurn() && !p.acted) { G.tbPlayerStrike(mk); }
      else { try { G.tbAdvance(); } catch (e) { break; } }
      if (guard > 50) break;
    }
    const result = lastResult; lastResult = null;
    const corpses = (G.state.corpses || []).filter(c => c.kind === 'monster');
    let dup = false, detail = `result=${result} corpses=${corpses.length}`;
    if (corpses.length) {
      const c = corpses[corpses.length - 1];
      // stand on the corpse
      s.mx = c.mx != null ? c.mx : 4; s.my = c.my != null ? c.my : 4;
      G.map.px = c.node.x; G.map.py = c.node.y;
      const before = JSON.stringify(c.items.map(i => [i.plantId || i.name, i.units]));
      const unitsBefore = c.items.reduce((t, i) => t + (i.units || 0), 0);
      const invUnits = (pid) => s.inventory.filter(i => (i.plantId || i.name) === pid).reduce((t, i) => t + (i.units || 0), 0);
      const invBefore = c.items.map(i => invUnits(i.plantId || i.name));
      G.lootCorpse(c.id, true); sayLines(G);
      const mid = JSON.stringify(c.items.map(i => [i.plantId || i.name, i.units]));
      G.lootCorpse(c.id, true); sayLines(G);
      const after = JSON.stringify(c.items.map(i => [i.plantId || i.name, i.units]));
      // conservation: every unit that left the corpse must be in the pack (take-one-of-each per search is the design)
      const corpseNow = c.items.reduce((t, i) => t + (i.units || 0), 0);
      const invNow = c.items.map(i => invUnits(i.plantId || i.name));
      const gained = invNow.reduce((t, v, ix) => t + (v - invBefore[ix]), 0);
      const conserved = (unitsBefore - corpseNow) === gained;
      dup = !conserved;
      detail += ` itemsBefore=${before} after1=${mid} after2=${after} corpseUnits ${unitsBefore}->${corpseNow} invGained=${gained}`;
    }
    attack('A1 corpse-loot-double-dip', dup || result !== 'won', detail);
  }

  // ---- A2: strike a fled / downed target (regression: guards must hold) ----
  {
    const mk = H.synthFight(G, 'hushwolf', { mhp: 30, php: 500 });
    const m = G.tbfight.fightersByKey[mk]; m.mx = 5; m.my = 4;
    m.fled = true;
    const r1 = G.tbPlayerStrike(mk); const l1 = sayLines(G).join(' ');
    m.fled = false; m.alive = false; m.hp = 0;
    const r2 = G.tbPlayerStrike(mk); const l2 = sayLines(G).join(' ');
    const held = r1 === false && /fled|gone/i.test(l1) && r2 === false && /already down/i.test(l2);
    attack('A2 fled/downed-target-guards', !held, `fled->${r1} "${l1.slice(0, 60)}" downed->${r2} "${l2.slice(0, 50)}"`);
    G.tbfight = null;
  }

  // ---- A3: strike-number honesty vs armor ----
  // Capture the "STRIKE for N" line and compare to actual HP delta.
  {
    // pick an armored monster: check data for armor
    const armored = (G.data.monsters || []).find(m => m.armor && m.armor > 0);
    const mid = armored ? armored.id : 'hushwolf';
    const mk = H.synthFight(G, mid, { mhp: 200, php: 500 });
    const m = G.tbfight.fightersByKey[mk]; m.mx = 5; m.my = 4;
    sayLines(G);
    const hpBefore = m.hp;
    G.tbPlayerStrike(mk);
    const lines = sayLines(G);
    const strikeLine = lines.find(l => /STRIKE/i.test(l)) || '';
    const numM = strikeLine.match(/for (\d+)/);
    const claimed = numM ? parseInt(numM[1], 10) : null;
    const actual = hpBefore - m.hp;
    const honest = claimed === null || claimed === actual;
    attack('A3 strike-number-honesty', !honest, `monster=${mid} armor=${(m.mdef || {}).armor} claimed=${claimed} actual=${actual} line="${strikeLine.slice(0, 80)}"`);
    G.tbfight = null;
  }

  // ---- A4: feastburn floors ----
  // banked < 300 must return 0 with no burn and no say.
  {
    const s = G.state.scholar;
    s.kcal = 100; // low bank
    sayLines(G);
    const r = G.feastBurn();
    const lines = sayLines(G);
    const lied = r !== 0 || lines.some(l => /FEASTBURN/i.test(l));
    attack('A4 feastburn-low-bank', lied, `banked~100 returned=${r} said=${lines.length > 0}`);
    // topped-up: burn must state its own multiplier and match application
    s.kcal = 5000;
    sayLines(G);
    const r2 = G.feastBurn();
    const l2 = sayLines(G).join(' ');
    const mM = l2.match(/×([\d.]+)/);
    const stated = mM ? parseFloat(mM[1]) : null;
    attack('A4b feastburn-states-multiplier', !(r2 > 0 && stated === r2), `returned=${r2} stated=${stated}`);
  }

  // ---- A5: intimidation farm ----
  // Shake down the same cautious villager 6 times. Yields must stop (breaking point).
  {
    await H.newCombatReadyGame();
    const s = G.state.scholar; s.kcal = 2400; s.health = 500;
    const roster = (G.state.village.roster || []).filter(id => id !== G.villagerId);
    // find a cautious/withdrawn villager; fall back to first
    let vid = roster.find(id => { const t = G.npcTemper(id); return t === 'cautious' || t === 'withdrawn'; }) || roster[0];
    // give them food to take
    try { G.npcNeeds(vid); } catch (e) {}
    let yielded = 0, broke = 0, fled = 0, fought = 0, refused = 0;
    for (let i = 0; i < 6; i++) {
      if (!(G.state.village.roster || []).includes(vid)) { fled++; break; }
      try { G.packSpend(vid, -2000); } catch (e) {} // ensure they have food: negative spend adds? (probe)
      const r = G.intimidate(vid); sayLines(G);
      if (r === 'yielded') yielded++;
      else if (r === 'fight') fought++;
      else if (r === 'fled') fled++;
      else if (r === 'refused') refused++;
      else broke++;
      if (r === 'fight') break;
    }
    const infiniteFood = yielded >= 5;
    attack('A5 intimidation-farm', infiniteFood, `vid temper=${G.npcTemper ? 'n/a' : ''} yielded=${yielded}/6 fought=${fought} fled=${fled} refused=${refused} other=${broke}`);
  }

  // ---- A6: wait-stall vs telegraph ----
  // Wait while a telegraph is aimed at the player: waiting must NOT dodge it.
  {
    await H.newCombatReadyGame();
    const mk = H.synthFight(G, 'hushwolf', { mhp: 60, php: 500 });
    const m = G.tbfight.fightersByKey[mk]; m.mx = 6; m.my = 4;
    const p = G.tbFighter('p');
    const hpBefore = p.hp;
    // force a telegraph aimed at the player if the API exists
    let telegraphed = false;
    try {
      if (G.encSetTelegraph) { /* skip: data-driven */ }
      m.telegraph = { cells: [{ cx: 4, cy: 4 }], firing: 1, dmg: [8, 12], attackName: 'test beam' };
      telegraphed = true;
    } catch (e) {}
    sayLines(G);
    G.tbPlayerWait();
    const lines = sayLines(G).join(' ');
    const hpAfter = p.hp;
    attack('A6 wait-into-telegraph', telegraphed && hpAfter >= hpBefore, `telegraphed=${telegraphed} hp ${hpBefore}->${hpAfter}`);
    G.tbfight = null;
  }

  console.log('\n== verdicts: ' + verdicts.filter(v => v[1]).length + ' breaks / ' + verdicts.length + ' attacks ==');
})().catch(e => { console.error('HARNESS CRASH:', e.message, e.stack.split('\n').slice(0, 4).join(' | ')); process.exit(1); });
