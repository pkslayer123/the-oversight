// Break-it alien-players r11, 2026-10-10 — DEEPER than r10 (which fixed
// activation/deactivation/event-feed/codex naming leaks + the beam flag).
// Hostile-player attacks: exploits, softlocks, honesty, dead code.
//
// CATCHES (pre-fix expectations marked [PRE-FIX-FAILS]):
//  H1 HONESTY: group chain says "The next one steps out of the treeline"
//     BEFORE the chained apStartEncounter confirms — a refused/throwing
//     start leaves the line hanging over an empty treeline.
//  H2 HONESTY: apGroupBanter grants +5 fight favor for "survived a group
//     encounter setup" at FIGHT START — nothing has been survived yet.
//  H3 HONESTY: Wren's feed line promises "stay away from the northern
//     treeline TOMORROW" — a named timeline with no backing mechanic
//     (same class r7 flagged for contact warnings: promise no mechanic,
//     name no timeline).
//  H4 KNOWLEDGE LEAK: apGroupBanter names personas outright pre-reveal
//     (Vex Marlowe, Countess Sable, "K'thari Expeditionary"...) — there are
//     NO cover names in the data; p.name IS the alien truth (fighter card
//     says "Stranger", intro stays silent pre-reveal). Same class as this
//     morning's T1/T2/T3 — banter was assumed safe and missed.
// HELD (green pre- and post-fix):
//  S1 SOFTLOCK: chain consume-first — fled/lost disperses, failed chained
//     start leaves no dangling alienGroup.
//  E1 EXPLOIT: old_tam bond farm is bounded (lifeline 7d/40%, dead drop 3d).
//  E2 EXPLOIT: trackedBy never locks encounters (sporting rules beat x3).
//  E3 EXPLOIT: persona-package 6-day global cooldown, no multi-fire.
//  D1 DEAD-CODE: all 74 exported methods have a runtime call site.
const H = require('./break-alien-harness.js');
const assert = require('assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
let N = 0, FAILS = [];
function ok(c, m) { N++; if (c) { console.log('ok ' + N + ' - ' + m); } else { FAILS.push(N + ': ' + m); console.log('FAIL ' + N + ' - ' + m); } }

async function main() {
  await H.boot();
  const Game = H.Game;
  const seeds = [20261010, 777, 424242];
  for (const seed of seeds) {
    H.RNG.reset(seed);
    runSuite('seed ' + seed);
  }
  console.log('\n' + (N - FAILS.length) + '/' + N + ' checks passed.');
  if (FAILS.length) { console.log('FAILURES:'); FAILS.forEach(f => console.log('  ' + f)); process.exit(1); }
}

function runSuite(tag) {
  const Game = H.Game;

  // ---------- H1: group-chain announce-before-confirm ----------
  {
    const s = H.fresh(45);
    Game.state.systemArrived = true;
    const ap = Game.apState();
    ap.met['vex_marlowe'] = { encounters: 3, bond: 0, lastDay: 45 };
    ap.met['countess_sable'] = { encounters: 2, bond: 0, lastDay: 45 };
    // Build a minimal live fight: player alive, vex dead (we won).
    const pf = { key: 'p', kind: 'player', name: 'You', hp: 80, maxHp: 100, alive: true, fled: false, mx: 4, my: 4 };
    const vf = Game.apBuildFighter('vex_marlowe', 5, 4);
    vf.alive = false; vf.hp = 0;
    Game.tbfight = { fighters: [pf, vf], over: false };
    Game.tbFighter = Game.tbFighter || function (k) { return (Game.tbfight.fighters || []).find(f => f.key === k) || null; };
    Game.state.alienGroup = { pids: ['vex_marlowe', 'countess_sable'], current: 0 };
    // Sabotage the chained start: refused, no fight begins.
    const origStart = Game.apStartEncounter;
    Game.apStartEncounter = function () { return false; };
    H.clearLog();
    try { Game.tbEnd('won'); } catch (e) { console.log('  (tbEnd threw: ' + e.message + ')'); }
    Game.apStartEncounter = origStart;
    const t = H.allText();
    ok(!t.includes('The next one steps out of the treeline'),
      '[' + tag + '] H1: no "next one steps out" when the chained start was refused [PRE-FIX-FAILS]');
    ok(!Game.state.alienGroup,
      '[' + tag + '] H1: alienGroup consumed, not re-armed, after refused chain');
    Game.tbfight = null;
  }

  // ---------- H4: group banter names personas pre-reveal ----------
  {
    H.fresh(45);
    Game.state.systemArrived = true;
    const ap = Game.apState();
    ap.met['vex_marlowe'] = { encounters: 2, bond: 0, lastDay: 45 };   // met twice: group-eligible...
    ap.met['countess_sable'] = { encounters: 2, bond: 0, lastDay: 45 }; // ...but NOT revealed (reveal at 3)
    ok(!Game.apKnowsAlien('vex_marlowe') && !Game.apKnowsAlien('countess_sable'),
      '[' + tag + '] H4 setup: both personas group-eligible yet unrevealed');
    H.clearLog();
    Game.apGroupBanter(['vex_marlowe', 'countess_sable']);
    const t = H.allText();
    ok(!t.includes('Vex Marlowe') && !t.includes('Countess Sable'),
      '[' + tag + '] H4: banter names no persona pre-reveal [PRE-FIX-FAILS]');
    ok(!t.includes("K'thari") && !t.includes('Meridian'),
      '[' + tag + '] H4: banter leaks no alien titles pre-reveal [PRE-FIX-FAILS]');
    // Post-reveal the banter keeps its personality.
    Game.apRevealAlien('vex_marlowe', 'test');
    Game.apRevealAlien('countess_sable', 'test');
    H.clearLog();
    Game.apGroupBanter(['vex_marlowe', 'countess_sable']);
    const t2 = H.allText();
    ok(t2.includes('Vex Marlowe') && t2.includes('Countess Sable'),
      '[' + tag + '] H4: banter keeps persona names once known');
  }

  // ---------- H2: "survived" favor at fight start ----------
  {
    H.fresh(45);
    Game.state.systemArrived = true;
    let whySeen = null;
    const origAdj = Game.apAdjustFavor;
    Game.apAdjustFavor = function (n, why, lane) { whySeen = String(why || ''); return origAdj.call(Game, n, why, lane); };
    try { Game.apGroupBanter(['vex_marlowe', 'countess_sable']); } catch (e) {}
    Game.apAdjustFavor = origAdj;
    ok(whySeen && !/survived/i.test(whySeen),
      '[' + tag + '] H2: group-setup favor does not claim survival before the fight [PRE-FIX-FAILS]');
  }

  // ---------- H3: Wren feed "tomorrow" timeline ----------
  {
    const src = fs.readFileSync(path.join(H.ROOT, 'src/js/alienPlayers.js'), 'utf8');
    ok(!/northern treeline tomorrow/.test(src),
      '[' + tag + '] H3: no feed warning names a "tomorrow" timeline with no backing event [PRE-FIX-FAILS]');
  }

  // ---------- S1: chain dispersal on fled/lost ----------
  {
    H.fresh(45);
    Game.state.systemArrived = true;
    const mk = (pid) => {
      const pf = { key: 'p', kind: 'player', name: 'You', hp: 80, maxHp: 100, alive: true, fled: false, mx: 4, my: 4 };
      const vf = Game.apBuildFighter(pid, 5, 4); vf.alive = false; vf.hp = 0;
      Game.tbfight = { fighters: [pf, vf], over: false };
    };
    const origStart = Game.apStartEncounter;
    Game.apStartEncounter = function () { return true; }; // would chain if asked
    for (const result of ['fled', 'lost']) {
      mk('vex_marlowe');
      Game.state.alienGroup = { pids: ['vex_marlowe', 'countess_sable'], current: 0 };
      H.clearLog();
      try { Game.tbEnd(result); } catch (e) {}
      ok(!Game.state.alienGroup, '[' + tag + '] S1: group disperses on ' + result + ' (no ambush on retreat/death)');
      ok(!H.allText().includes('The next one steps out'), '[' + tag + '] S1: no chain line on ' + result);
    }
    Game.apStartEncounter = origStart;
    Game.tbfight = null;
  }

  // ---------- E1: old_tam bond farm is bounded ----------
  {
    H.fresh(20);
    Game.state.systemArrived = true;
    const ap = Game.apState();
    // 30 days of beating old_tam every 2 days (sporting rules), always "won".
    let lifelines = 0, drops = 0;
    for (let d = 20; d < 50; d += 2) {
      Game.state.scholar.day = d;
      Game.apOnCombatEnd('old_tam', 'won', { killed: true });
      const rec = ap.met['old_tam'] || {};
      // lifeline needs bond>=2 + 7d cooldown + 40% roll: just count eligibility, not RNG
      if ((rec.bond || 0) >= 2 && d - (ap.lastLifelineDay || -999) >= 7) lifelines++;
    }
    const bond = (ap.met['old_tam'] || {}).bond || 0;
    ok(bond === 15, '[' + tag + '] E1: 15 wins -> bond 15 (grows, no cap exploit needed)');
    // Dead drops: global 3-day gate, max over 30 days
    const realR = Math.random;
    for (let d = 20; d < 50; d++) {
      Game.state.scholar.day = d;
      Math.random = () => 0.01; // force the 0.5 "careful" roll to pass
      try { if (Game.apDeadDrop()) drops++; } catch (e) {}
    }
    Math.random = realR;
    ok(drops <= 10, '[' + tag + '] E1: dead drops bounded by 3-day gate over 30d (' + drops + ' <= 10)');
  }

  // ---------- E2: trackedBy never locks encounters ----------
  {
    H.fresh(30);
    Game.state.systemArrived = true;
    Game.state.scholar.flags = Game.state.scholar.flags || {};
    Game.state.scholar.flags.trackedBy = 'vex_marlowe';
    const ap = Game.apState();
    ap.met['vex_marlowe'] = { encounters: 3, bond: 0, lastDay: 20 };
    ap.lastHuntDay['vex_marlowe'] = 29; // fought yesterday: sporting window
    Game.state.scholar.day = 30;
    Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
    Game.map = Game.map || {}; Game.map.px = 0; Game.map.py = 0;
    let trackedInsideWindow = 0, rolls = 0;
    const realR = Math.random;
    for (let i = 0; i < 60; i++) {
      Math.random = realR; // real seeded RNG for the roll
      const pid = Game.apRollEncounter();
      rolls++;
      if (pid === 'vex_marlowe') trackedInsideWindow++;
    }
    Math.random = realR;
    ok(trackedInsideWindow === 0,
      '[' + tag + '] E2: tracked rival never re-rolled inside 2-day sporting window (' + trackedInsideWindow + '/60)');
  }

  // ---------- E3: persona-package global cooldown ----------
  {
    H.fresh(30);
    Game.state.systemArrived = true;
    const ap = Game.apState();
    ap.met['vex_marlowe'] = { encounters: 3, bond: 0, lastDay: 30 };
    ap.met['old_tam'] = { encounters: 3, bond: 3, lastDay: 30 };
    const realR = Math.random;
    Math.random = () => 0.01; // force the 0.3 package roll to pass
    let fired = 0;
    for (let i = 0; i < 5; i++) { try { if (Game.apPersonaPackage()) fired++; } catch (e) {} }
    Math.random = realR;
    ok(fired === 1, '[' + tag + '] E3: persona package fires once per 6-day global cooldown (' + fired + '/5 forced)');
  }

  // ---------- D1: dead-code census — every export has a runtime call site ----------
  {
    const src = fs.readFileSync(path.join(H.ROOT, 'src/js/alienPlayers.js'), 'utf8');
    const defs = [];
    const re = /^\s{4}([a-zA-Z0-9_]+): function/gm;
    let m;
    while ((m = re.exec(src))) { if (/^ap/.test(m[1])) defs.push(m[1]); }
    ok(defs.length >= 70, '[' + tag + '] D1: census found ' + defs.length + ' ap* methods');
    const dead = [];
    for (const fn of defs) {
      // runtime call sites: this.fn( inside the module, or fn( in another src/js file / index.html
      const internal = (src.match(new RegExp('this\\.' + fn + '\\(', 'g')) || []).length;
      let external = 0;
      try {
        const out = execSync('grep -rl "\\b' + fn + '\\b" src/js/ 2>/dev/null | grep -v alienPlayers.js || true',
          { cwd: H.ROOT }).toString().trim();
        external = out ? out.split('\n').length : 0;
      } catch (e) {}
      if (internal === 0 && external === 0) dead.push(fn);
    }
    ok(dead.length === 0, '[' + tag + '] D1: no dead exports' + (dead.length ? ' (' + dead.join(',') + ')' : ''));
  }
}

main().catch(e => { console.error('HARNESS FAIL:', e); process.exit(2); });
