#!/usr/bin/env node
// EXPLORER RUN 2026-10-06 22:30 CDT: live-fire the follow-through-boundary
// fix (bug 2) — place a following monster on the old tile, travel, and
// verify the composed line reads well for (a) unknown descriptor, (b) a
// 'something'-fallback descriptor, (c) a fully named monster.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('EVAL FAIL', f, e.message); process.exit(2); } });
delete global.window;
const Game = globalThis.Scattering.Game;
// Deterministic RNG: travelTo uses Math.random for arrival texture;
// seed so the follow-through path is reproducible.
let _seed = 123456789;
Math.random = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  ok: ' + label); }
  else { fail++; console.log('  FAIL: ' + label + (extra ? ' -- ' + extra : '')); }
}
let diag = {};

function setupWith(monsterId, known) {
  return Game.init().then(() => {
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const fromX = Game.map.px, fromY = Game.map.py;
    // drop a following monster on the CURRENT tile
    Game.state.worldMonsters = Game.state.worldMonsters || [];
    Game.state.worldMonsters.push({ id: monsterId, tx: fromX, ty: fromY, mx: 4, my: 4, lostSight: 0 });
    if (known) {
      Game.state.codex.monsters = Game.state.codex.monsters || {};
      Game.state.codex.monsters[monsterId] = { villageName: null, encounters: 99 };
      Game.state.systemArrived = true; // true names show mdef.name
    }
    const says = [];
    Game.say = (t) => { says.push(String(t)); };
    // Pick a real, unblocked target — some travelTargets are blocked by a
    // creek/fallen tree/rubble (RNG layout); the UI handles that with the
    // blockage card, but this test needs an actual crossing. Try targets
    // until one isn't blocked.
    const targets = (Game.travelTargets() || []).filter(t => t.x !== fromX || t.y !== fromY);
    let tgt = null, moved = null;
    for (const cand of targets) {
      says.length = 0;
      const r = Game.travelTo(cand.x, cand.y);
      if (r && r.kind === 'blockage') continue; // blocked — try the next
      tgt = cand; moved = r; break;
    }
    const line = says.find(s => /followed you/.test(String(s)));
    const actuallyMoved = (Game.map.px !== fromX || Game.map.py !== fromY);
    diag = { moved: (moved === null || moved === undefined) ? String(moved) : (moved === true ? 'true' : typeof moved + ':' + String(JSON.stringify(moved)).slice(0, 80)),
             tgt: tgt ? tgt.x + ',' + tgt.y : 'none',
             pxpy: Game.map.px + ',' + Game.map.py,
             nTargets: targets.length,
             firstSays: says.slice(0, 2).map(s => String(s).slice(0, 90)) };
    return { moved, actuallyMoved, line: line ? String(line) : null, says, tgt };
  });
}

(async () => {
  // Run one case per process: pass 'a', 'b', or 'c' as argv. Sequential
  // Game.init() cycles in one process leak state and make (c) flaky.
  const which = process.argv[2] || 'a';
  if (which === 'a') {
    // (a) bulldozer unknown: desc "something huge, rooting in the underbrush"
    const r = await setupWith('bulldozer', false);
    console.log('    actual: ' + JSON.stringify(r.line));
    check('travel happened', r.actuallyMoved || r.line, JSON.stringify(r.says.slice(0, 3)));
    check('a: no "The something huge" composition', !!r.line && !/The something huge/i.test(r.line), r.line);
    check('a: head-noun kept, clause dropped', !!r.line && /Something huge is here/.test(r.line), r.line);
  } else if (which === 'b') {
    // (b) warranty_caller unknown: "a phone ringing in the trees, and no phone anywhere"
    const r = await setupWith('warranty_caller', false);
    console.log('    actual: ' + JSON.stringify(r.line));
    check('b: clause dropped, noun kept', !!r.line && /The phone ringing in the trees is here/.test(r.line), r.line);
  } else {
    // (c) bulldozer KNOWN (named): should compose "The Bulldozer is here."
    const r = await setupWith('bulldozer', true);
    console.log('    actual: ' + JSON.stringify(r.line));
    check('c: named composes "The Bulldozer is here."', !!r.line && /The Bulldozer is here/.test(r.line), r.line);
  }

  console.log(`\nfollow-message(${which}): ${pass} pass, ${fail} fail`);
  if (fail) console.log('DIAG: ' + JSON.stringify(diag, null, 1));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
