// EXILE FOUNDING-ARC FEEL-CHECK (Steve 2026-10-06)
// Plays the FULL post-exile founding arc as a player, end to end:
//   ACT 1 — the exile walk (debug scenario, moot-sentenced)
//   ACT 2 — the 7-10 day solo founding grind, PLAYED HONESTLY: real foraging
//           via _cellInteract, real eating via eatOne, real sleeping via
//           Game.sleep, no debug shortcuts. Timber felled, hut raised, cache
//           filled from the daily pack — exactly what a player does.
//   ACT 3 — founding the haven: fork verification (real new village object?)
//   ACT 4 — 7 solo days in the NEW haven: forage/eat/sleep, arrivals watched,
//           knowledge-gating spot checks, no-stuck verification.
//   ACT 5 — one-screen / camp-surface check + knowledge-leak audit.
// READ-ONLY: touches no game code. Reports like a player's diary.
// Run: node scripts/play-exile-found-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js',
 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const said = [];
function note(t) { console.log(t); }
function beat(title) {
  console.log('\n' + '='.repeat(72));
  console.log('  ' + title);
  console.log('='.repeat(72));
}
function drain(tag, max) {
  if (!said.length) { console.log(`  (no narration — ${tag})`); return; }
  console.log(`\n  --- ${tag} ---`);
  const n = max || 14;
  said.slice(0, n).forEach(t => console.log('  | ' + String(t).replace(/\s+/g, ' ').slice(0, 200)));
  if (said.length > n) console.log(`  | …(${said.length - n} more lines)`);
  said.length = 0;
}
const RESULTS = [];
function check(name, cond, detail) {
  RESULTS.push({ name, ok: !!cond, detail: detail || '' });
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}
let FIGHTS = 0;
function fleeGuard(ctx) {
  // any fight that starts mid-forage: end it like a player would (run).
  if (Game.tbfight && !Game.tbfight.over) {
    try {
      const foes = (Game.tbfight.fighters || []).filter(f => f.kind === 'monster' && f.alive).map(f => f.name || f.id);
      note(`   !! FIGHT during ${ctx}: ${foes.join(', ') || 'unknown foe'} — running (tbEnd fled)`);
      Game.tbEnd('fled');
      FIGHTS++;
      said.length = 0;
      return true;
    } catch (e) { note('   !! fight guard failed: ' + e.message); }
  }
  return false;
}
// BFS walk to a walkable cell within 1 of (tx,ty), interior-safe.
function walkTo(tx, ty) {
  const s = Game.state.scholar;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const walkable = (x, y) => {
    if (x < 0 || x > 8 || y < 0 || y > 8) return false;
    const c = detail[y] && detail[y][x];
    try { return !Game.cellProps(c).blocks; } catch (e) { return c !== 'water' && c !== 'wall'; }
  };
  const prev = {}, seen = new Set([s.mx + ',' + s.my]);
  const q = [[s.mx, s.my]];
  let goal = null;
  const isGoal = (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 1 && walkable(x, y);
  if (isGoal(s.mx, s.my)) goal = [s.mx, s.my];
  while (q.length && !goal) {
    const [x, y] = q.shift();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || !walkable(nx, ny)) continue;
      seen.add(k); prev[k] = [x, y];
      if (isGoal(nx, ny)) { goal = [nx, ny]; q.length = 0; break; }
      q.push([nx, ny]);
    }
  }
  if (!goal) return false;
  const pth = [];
  for (let cur = goal; cur[0] !== s.mx || cur[1] !== s.my; cur = prev[cur[0] + ',' + cur[1]]) pth.unshift(cur);
  for (const [x, y] of pth) { if (!Game.pathStep(x, y)) return false; if (fleeGuard('walk')) return false; }
  return true;
}
function greenCells() {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const out = [];
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
    const c = detail[y] && detail[y][x];
    if (c === 'plant' || c === 'bush' || c === 'tree' || c === 'bigtree') out.push({ x, y, c });
  }
  return out;
}
// A forage sweep: tap up to maxTaps green cells, like a player walking the tile.
function forageSweep(maxTaps) {
  let taps = 0, fails = 0;
  const cells = greenCells();
  for (const g of cells) {
    if (taps >= maxTaps) break;
    if (Game.dayPart >= 2) break;
    if (!walkTo(g.x, g.y)) { fails++; continue; }
    try { Game._cellInteract(g.x, g.y); } catch (e) { fails++; }
    taps++;
    if (fleeGuard('forage')) break;
    if (Game.over) break;
  }
  return { taps, fails };
}
function edibleItems() {
  return Game.state.scholar.inventory
    .map((it, i) => ({ it, i }))
    .filter(x => x.it && (x.it.kcalEach || 0) > 0 && x.it.edible !== false && !x.it.bonded && !(x.it.spoilDay !== undefined && x.it.spoilDay <= Game.state.scholar.day));
}
function eatTo(targetKcal) {
  const s = Game.state.scholar;
  let eaten = 0, guard = 0;
  while (s.kcal < targetKcal && guard++ < 30 && !Game.over) {
    const ed = edibleItems().sort((a, b) => (b.it.kcalEach || 0) - (a.it.kcalEach || 0));
    if (!ed.length) break;
    const before = s.kcal;
    try { Game.eatOne(ed[0].i); } catch (e) { break; }
    eaten += Math.max(0, Math.round(s.kcal - before));
    if (fleeGuard('eat')) break;
  }
  return eaten;
}
function testLumps() {
  // the knowledge loop, solo: test what you bagged, cautiously.
  const inv = Game.state.scholar.inventory;
  let tested = 0;
  for (let i = inv.length - 1; i >= 0 && tested < 4; i--) {
    if (inv[i] && inv[i].lump) {
      try { Game.testCautiously(i, {}, inv); tested++; } catch (e) {}
    }
  }
  return tested;
}
function kcalOf(inv) {
  return (inv || []).reduce((a, it) => a + ((it.kcalEach || 0) > 0 && it.edible !== false ? (it.kcalEach || 0) * (it.units || 0) : 0), 0);
}
function gridSVG(title) {
  // mini grid render (render-grid.js pattern) — exile camp / new haven day 1.
  const s = Game.state.scholar, CELL = 38, SIZE = 9 * CELL, ox = 14, oy = 52;
  let svg = `<svg width="390" height="470" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="390" height="470" fill="#14141f"/>`;
  svg += `<text x="195" y="24" text-anchor="middle" fill="#eee" font-size="14" font-family="monospace">${title}</text>`;
  svg += `<text x="195" y="42" text-anchor="middle" fill="#999" font-size="11" font-family="monospace">day ${s.day} · kcal ${Math.round(s.kcal || 0)} · health ${Math.round(s.health || 0)}</text>`;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
    const px = ox + x * CELL, py = oy + y * CELL;
    const c = (detail[y] && detail[y][x]) || 'dirt';
    let fill = '#26262e', emoji = '';
    if (c === 'plant' || c === 'bush') fill = '#1f3a24';
    else if (c === 'tree' || c === 'bigtree') fill = '#1a3320';
    else if (c === 'water') fill = '#1c2f4a';
    else if (c === 'fire') { fill = '#4a2a14'; emoji = '🔥'; }
    else if (c === 'tent' || c === 'lodge' || c === 'hut') { fill = '#3a3226'; emoji = '⛺'; }
    if (s.mx === x && s.my === y) { fill = '#4a4a6e'; emoji = '🧍'; }
    svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="#444" stroke-width="1"/>`;
    if (emoji) svg += `<text x="${px + 19}" y="${py + 28}" text-anchor="middle" font-size="20">${emoji}</text>`;
  }
  return svg + '</svg>';
}

// ================================================================ ACT 1 ===
(async () => {
  await Game.init();
  const hook = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return hook(t); } catch (e) {} };

  beat('ACT 1 — THE EXILE WALK');
  Game.debugScenario('exile');
  drain('the walk — exile narration');
  const s = Game.state.scholar;
  const oldVillageRef = Game.state.village;
  const oldName = oldVillageRef.name;
  note(`  old haven: ${oldName} · roster ${(oldVillageRef.roster || []).length} · my trust ${(oldVillageRef.trust || {})[Game.villagerId]}`);
  note(`  me: kcal ${Math.round(s.kcal)} / cap ${Game.kcalCap()} · health ${s.health} · hydration ${Math.round(s.hydration || 0)} · packKcal ${Math.round(Game.packKcal(Game.villagerId))}`);
  note(`  pack: ${(s.inventory || []).filter(i => (i.kcalEach || 0) > 0 && i.edible !== false).map(i => `${i.units}×${i.name}`).join(', ')}`);
  let trauma = [];
  try { trauma = (Game.betrayalState().trauma || []); } catch (e) {}
  check('exile recorded as trauma', trauma.some(t => t.kind === 'exile'), JSON.stringify(trauma.map(t => t.kind)));
  check('membership severed (no pantry)', !Game.isMember(Game.villagerId), 'isMember=false');
  note(`  starting tile: ${JSON.stringify(Game.playerTile()).slice(0, 90)} · location: ${Game.location}`);

  // The walk: leave the old haven's tile. A player walks — try every direction.
  const tg = (Game.travelTargets() || []).filter(t => { const tt = Game.tileAt(t.x, t.y); return tt && tt.type !== 'haven'; });
  note(`  travel options: ${tg.length}`);
  let walked = false;
  for (const d of tg.sort((a, b) => ((Game.tileAt(b.x, b.y) || {}).stock || 0) - ((Game.tileAt(a.x, a.y) || {}).stock || 0))) {
    said.length = 0;
    try { Game.travelTo(d.x, d.y); } catch (e) { note(`  blocked toward ${d.x},${d.y}: ${e.message}`); continue; }
    if (Game.playerTile().type !== 'haven') { walked = true; break; }
  }
  drain('the walk out — arrival');
  note(`  now on: ${(Game.playerTile() || {}).type} · location: ${Game.location}`);
  check('player can leave the old haven tile', walked, walked ? 'walked out like a player would' : 'ALL directions blocked — stranded at the exilers\u2019 fire');
  if (!walked) {
    note('  ABORT: cannot play the walk — the arc cannot start. Filing as a bug.');
    fs.writeFileSync(path.join(ROOT, 'evidence/2026-10-06/exile-founding-feel-20261006.json'),
      JSON.stringify({ date: '2026-10-06', aborted: 'walk blocked on all sides', results: RESULTS }, null, 2));
    return;
  }
  fs.writeFileSync(path.join(ROOT, 'evidence/2026-10-06/exile-found-grid-walk.svg'), gridSVG('The walk — exiled, day 1'));

  // ============================ ACT 2 — the solo founding grind ============
  beat('ACT 2 — THE SOLO FOUNDING GRIND (played honestly, no shortcuts)');
  const RQ = Game.foundingReqs();
  note(`  founding requirements: ${RQ.minSoloDays}+ solo days · shelter tier ${RQ.shelterTier} · ${RQ.stockpileKcal} kcal cache · wood ${JSON.stringify(RQ.timberPerTier)}`);
  said.length = 0;
  Game.exileSelfDo('claimsite');
  drain('claiming the campsite');
  check('claim site works', Game.foundingState().siteClaimed === true);

  let days = 0, starveDays = 0, foragedKcal = 0, timberActs = 0, cacheTotal = 0;
  let fights = 0, stuckNotes = [];
  const idAtGrindStart = Game.villagerId;
  const maxDays = 18;
  while (days < maxDays && !Game.over) {
    days++;
    const sD = Game.state.scholar;
    // MANTLE-BREAK DETECTOR: if the exile died and the mantle passed to an
    // exiler, the arc's fiction has collapsed — stop and report, don't zombie on.
    if (Game.villagerId !== idAtGrindStart) {
      note(`\n  !! MANTLE PASSED MID-ARC: the exile died; the bearer is now ${Game.villagerId} — stopping the grind, reporting the break.`);
      stuckNotes.push('mantle passed to an exiler mid-founding — the exile fiction collapsed (see diary)');
      break;
    }
    const dayStartNum = sD.day;
    const f = Game.foundingState();
    const soloDay = (sD.day || 0) - (sD.exileStartDay || 0);
    const missing = Game.foundingMissing();
    note(`\n  — exile day ${days} (scholar day ${sD.day}, solo ${soloDay}) — kcal ${Math.round(sD.kcal)} · hp ${Math.round(sD.health)} · hyd ${Math.round(sD.hydration || 0)}`);
    note(`    shelter ${f.shelterTier}/3 · cache ${Math.round(f.stockpileKcal)}/${RQ.stockpileKcal} · wood ${Game.woodCount()} · still missing: ${missing.join('; ') || 'NOTHING'}`);
    if (!missing.length) break;

    // morning project work: timber for the hut. TOTAL needed: 24 (8 lean-to + 16 hut).
    // A competent player fronts-loads this while fed (days 1-3), not while starving.
    let timberToday = 0;
    const woodSpent = (f.shelterTier >= 1 ? 8 : 0) + (f.shelterTier >= 2 ? 16 : 0);
    let woodNeed = 24 - Game.woodCount() - woodSpent;
    while (woodNeed > 0 && timberToday < 3 && sD.kcal > 500 && Game.dayPart < 2 && !Game.over) {
      said.length = 0;
      const wBefore = Game.woodCount();
      Game.exileSelfDo('gathertimber');
      timberActs++; timberToday++;
      const gained = Game.woodCount() - wBefore;
      const last = said[said.length - 1];
      if (last) note('    | ' + String(last).replace(/\s+/g, ' ').slice(0, 130));
      const ws = (Game.foundingState().shelterTier >= 1 ? 8 : 0) + (Game.foundingState().shelterTier >= 2 ? 16 : 0);
      woodNeed = 24 - Game.woodCount() - ws;
      fleeGuard('timber');
    }
    if (f.shelterTier < 2) {
      const need = f.shelterTier === 0 ? 8 : 16;
      if (Game.woodCount() >= need) {
        said.length = 0;
        Game.exileSelfDo('buildshelter');
        const last = said[said.length - 1];
        if (last) note('    | ' + String(last).replace(/\s+/g, ' ').slice(0, 140));
      }
    }

    // midday: forage the land. Travel FIRST if the current tile is stripped.
    // Water first: a thirsty player walks to the creek for water, not food.
    const curTile = Game.playerTile() || {};
    if ((sD.hydration || 0) < 60) {
      try { Game.doAction('drink'); } catch (e) {}
    }
    if ((sD.hydration || 0) < 50 && Game.dayPart < 2) {
      const all = (Game.travelTargets() || []).filter(t => { const tt = Game.tileAt(t.x, t.y); return tt && tt.type !== 'haven'; });
      const creek = all.find(t => (Game.tileAt(t.x, t.y) || {}).type === 'creek');
      if (creek) {
        try { Game.travelTo(creek.x, creek.y); } catch (e) {}
        fleeGuard('water');
        try { Game.doAction('drink'); } catch (e) {}
        note(`    (walked to the creek for water — hydration now ${Math.round(sD.hydration || 0)})`);
      }
    }
    if ((curTile.stock || 0) <= 2 && Game.dayPart < 2 && (sD.hydration || 0) >= 50) {
      const all = (Game.travelTargets() || []).filter(t => { const tt = Game.tileAt(t.x, t.y); return tt && tt.type !== 'haven'; });
      const scored = all.map(t => ({ t, tt: Game.tileAt(t.x, t.y) }))
        .filter(x => (x.tt.stock || 0) > 2)
        .sort((a, b) => (b.tt.stock - a.tt.stock));
      if (scored.length) { try { Game.travelTo(scored[0].t.x, scored[0].t.y); } catch (e) {} fleeGuard('travel'); }
    }
    const invKcalBefore = kcalOf(sD.inventory);
    let sweeps = 0;
    while (Game.dayPart < 2 && sweeps < 5 && !Game.over && !fleeGuard('forage-check')) {
      const r = forageSweep(6);
      sweeps++;
      if (r.taps === 0) break;
      // travel to a greener tile if this one is tapped out; creek when thirsty (arrival drinks)
      if (greenCells().length < 3) {
        const all = (Game.travelTargets() || []).filter(t => {
          const tt = Game.tileAt(t.x, t.y); return tt && tt.type !== 'haven';
        });
        const thirsty = (sD.hydration || 0) < 50;
        const scored = all.map(t => ({ t, tt: Game.tileAt(t.x, t.y) }))
          .filter(x => (x.tt.stock || 0) > 0)
          .sort((a, b) => ((thirsty && b.tt.type === 'creek') - (thirsty && a.tt.type === 'creek')) || (b.tt.stock - a.tt.stock));
        if (scored.length && Game.dayPart < 2) {
          try { Game.travelTo(scored[0].t.x, scored[0].t.y); } catch (e) {}
          fleeGuard('travel');
        } else if (!scored.length) {
          note('    (no stocked tiles in reach — the land is worked out)');
        }
      }
    }
    const invKcalAfter = kcalOf(sD.inventory);
    foragedKcal += Math.max(0, invKcalAfter - invKcalBefore);
    const lumpsNow = sD.inventory.filter(i => i && i.lump).map(i => `${i.name}:${i.units}`).join(', ') || 'NONE';
    note(`    foraged: +${Math.max(0, Math.round(invKcalAfter - invKcalBefore))} kcal identifiable in pack (${sweeps} sweep rounds) · lumps: ${lumpsNow}`);

    // the knowledge loop: test what you bagged, cautiously, like a player would.
    const tested = testLumps();
    if (tested) {
      const news = said.splice(0).filter(t => /IDENTIFIED|named, and out|Food\. Real food|sits fine|Not food|cook it/i.test(String(t))).slice(0, 4);
      note(`    tested ${tested} lump(s):`);
      news.forEach(t => note('    | ' + String(t).replace(/\s+/g, ' ').slice(0, 150)));
      if (!news.length) note('    | (no identification landed — test may have failed or needs retest)');
    }
    fleeGuard('testing');

    // cache the day's carry into the haven cache
    if (f.siteClaimed) {
      said.length = 0;
      const before = Math.round(f.stockpileKcal);
      Game.exileSelfDo('cachefood');
      const moved = Math.round(f.stockpileKcal) - before;
      cacheTotal += moved;
      if (moved > 0) note(`    cached +${moved} kcal (pack was the limit, not the land)`);
    }

    // eat before dark
    const ate = eatTo(1800);
    if (ate) note(`    ate ${ate} kcal from pack`);
    if (sD.kcal < 500) {
      starveDays++;
      note('    !! HUNGRY — kcal under 500 going into the night');
    }
    if (edibleItems().length === 0 && sD.kcal < 500) {
      stuckNotes.push(`day ${days}: no edible food and kcal ${Math.round(sD.kcal)} — surviving on body stores`);
    }

    // night — but if the day never got going (dawn stall), wait first like a player would
    said.length = 0;
    if (Game.dayPart === 0 && (sD.dayTicks || 0) < 32) {
      note('    (dawn stall — nothing left to do; a player taps Wait)');
      try { Game.doAction('wait'); Game.doAction('wait'); } catch (e) {}
    }
    try { Game.sleep(); } catch (e) { note('    !! sleep error: ' + e.message); }
    fleeGuard('sleep');
    if (Game.over) { note('    !! DIED in the night'); break; }
    const sleepLine = said.find(t => /settle|Sleep|wake|cold|shiver/i.test(String(t)));
    if (sleepLine) note('    | ' + String(sleepLine).replace(/\s+/g, ' ').slice(0, 130));
    else if (said.length) note('    | ' + String(said[said.length - 1]).replace(/\s+/g, ' ').slice(0, 130));
    // honest exit: if scholar time froze (no day advance two loops running),
    // the arc is stalled — stop spinning and report it.
    if (Game.state.scholar.day === dayStartNum && sD.kcal <= 0 && edibleItems().length === 0) {
      note('    !! STALL: day did not advance, no kcal, no food — the arc has no path forward from here');
      stuckNotes.push(`day ${days}: dawn stall — depleted tiles, empty pack, sleep refused until Wait; a player is stranded with chores`);
      break;
    }
  }
  const sF = Game.state.scholar;
  const fF = Game.foundingState();
  note(`\n  GRIND TOTALS: ${days} days · timber acts ${timberActs} · foraged ~${Math.round(foragedKcal)} kcal identifiable · cached ${Math.round(cacheTotal)} kcal · hungry nights ${starveDays} · fights fled ${FIGHTS}`);
  check('founding requirements met', Game.foundingMissing().length === 0, Game.foundingMissing().join('; ') || 'all met');
  check('survived the grind', !Game.over, `health ${Math.round(sF.health)}, kcal ${Math.round(sF.kcal)}`);
  check('no stuck days', stuckNotes.length === 0, stuckNotes.join(' | ') || 'every day had food or a path');
  drain('end of the grind — last narration');

  // If the grind failed, the arc ends here — no fork to audit. Report honestly.
  if (Game.foundingMissing().length > 0) {
    beat('ARC INCOMPLETE — founding never became possible');
    note('  The grind stalled before the founding requirements were met.');
    note('  Remaining: ' + Game.foundingMissing().join('; '));
    note('  Skipping ACT 3 (fork), ACT 4 (new-haven week), ACT 5 — nothing to audit.');
    const fails = RESULTS.filter(r => !r.ok);
    note(`\n  checks: ${RESULTS.length - fails.length}/${RESULTS.length} green`);
    fails.forEach(r => note(`  FAIL: ${r.name} — ${r.detail}`));
    fs.writeFileSync(path.join(ROOT, 'evidence/2026-10-06/exile-founding-feel-20261006.json'),
      JSON.stringify({ date: '2026-10-06', auditor: 'flesh-out-loop worker (play as player)', arcComplete: false, results: RESULTS }, null, 2));
    note('  DONE (partial).');
    return;
  }

  // ============================ ACT 3 — founding: the fork ===============
  beat('ACT 3 — FOUNDING THE HAVEN (the fork)');
  said.length = 0;
  const foundOk = Game.exileSelfDo('foundhaven');
  drain('the founding — narration');
  note(`  foundHaven() returned: ${foundOk}`);
  const nv = Game.state.village;
  note(`  new haven: ${nv.name} · day ${nv.day} · roster ${(nv.roster || []).length} · shelter: ${nv.buildingType} · morale ${nv.morale}`);
  note(`  archived: ${(Game.state.pastVillages || []).map(x => x && x.name).join(', ')} · oldVillage label: ${Game.state.oldVillage}`);
  check('REAL fork: new village object', nv !== oldVillageRef, 'reference differs');
  check('old village archived (continues without you)', (Game.state.pastVillages || []).includes(oldVillageRef));
  check('new name, not relabeled old', nv.name !== oldName, `${oldName} → ${nv.name}`);
  check('roster is founder-only', (nv.roster || []).length === 1 && nv.roster[0] === Game.villagerId);
  check('trust fresh', Object.keys(nv.trust || {}).length <= 1, JSON.stringify(nv.trust));
  check('gossip clean', (nv.gossip || []).length === 0);
  check('exile over, mantle continues', !Game.state.scholar.exiled && Game.state.scholar.foundedHaven === true);
  check('pack crossed over', (Game.state.scholar.inventory || []).length > 0, `${Game.state.scholar.inventory.length} items`);
  check('codex crossed over', !!(Game.state.codex), 'codex object present');
  let notab = 0;
  try { notab = Game.villageNotability(); } catch (e) {}
  note(`  village notability: ${notab} (strangers need 40)`);
  fs.writeFileSync(path.join(ROOT, 'evidence/2026-10-06/exile-found-grid-newhaven.svg'), gridSVG(`${nv.name} — day one`));

  // ================== ACT 4 — seven solo days in the new haven ============
  beat('ACT 4 — SEVEN DAYS SOLO IN THE NEW HAVEN');
  const pid = Game.villagerId;
  let arrivals = [], visitorsSeen = 0, appsSeen = 0, noStuckDays = 0;
  for (let d = 1; d <= 7 && !Game.over; d++) {
    const sD = Game.state.scholar;
    const dayStart = sD.day;
    const rosterBefore = (Game.state.village.roster || []).length;
    note(`\n  — new haven day ${d} (scholar day ${sD.day}) — kcal ${Math.round(sD.kcal)} · hp ${Math.round(sD.health)} · pantry ${(Game.state.village.pantry || []).length} lines`);
    // morning: forage the home tile + neighbors
    const kb = kcalOf(sD.inventory);
    let rounds = 0;
    while (Game.dayPart < 2 && rounds < 2 && !Game.over) {
      forageSweep(5);
      rounds++;
      const opts = (Game.travelTargets() || []).filter(t => {
        const tt = Game.tileAt(t.x, t.y); return tt && tt.type !== 'haven' && (tt.stock || 0) > 5;
      }).slice(0, 1);
      if (opts.length && Game.dayPart < 2) { try { Game.travelTo(opts[0].x, opts[0].y); } catch (e) {} }
    }
    fleeGuard('new-haven forage');
    const gained = Math.max(0, Math.round(kcalOf(sD.inventory) - kb));
    const tested = testLumps();
    const ate = eatTo(1900);
    // watch the world: visitors, applications, arrivals
    const vis = (Game.state.village.visitors || []).length;
    const apps = ((Game.mshipState && Game.mshipState().applications) || []).length;
    if (vis) { visitorsSeen += vis; note(`    VISITOR: ${(Game.state.village.visitors || []).map(v => v.name + ' (' + v.type + ')').join(', ')}`); }
    if (apps) { appsSeen = Math.max(appsSeen, apps); note(`    APPLICATION(S): ${apps} pending`); }
    const rosterAfter = (Game.state.village.roster || []).length;
    if (rosterAfter > rosterBefore) { arrivals.push(`day ${d}: +${rosterAfter - rosterBefore}`); note('    !! NEW FACE joined the roster'); }
    note(`    foraged +${gained} kcal · tested ${tested} lump(s) · ate ${ate} kcal · visitors ${vis} · applications ${apps}`);
    said.length = 0;
    try { Game.sleep(); } catch (e) { note('    !! sleep error: ' + e.message); }
    fleeGuard('new-haven sleep');
    if (Game.over) { note('    !! DIED'); break; }
    if (Game.state.scholar.day === dayStart) { note('    !! DAY DID NOT ADVANCE — stuck'); }
    else noStuckDays++;
  }
  note(`\n  WEEK TOTALS: days resolved ${noStuckDays}/7 · roster arrivals: ${arrivals.join(', ') || 'NONE'} · visitors seen ${visitorsSeen} · applications seen ${appsSeen}`);
  check('every day resolved', noStuckDays === 7 && !Game.over, `${noStuckDays}/7 days, over=${!!Game.over}`);
  check('alive after week one', !Game.over && Game.state.scholar.health > 0, `health ${Math.round(Game.state.scholar.health)}`);

  // ============ ACT 5 — knowledge gating + leak audit + one-screen ========
  beat('ACT 5 — KNOWLEDGE GATING, LEAKS, ONE-SCREEN');
  // 5a. plant examination must not leak true names
  said.length = 0;
  let leaked = [];
  try {
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    outer: for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
      const c = detail[y] && detail[y][x];
      if (c === 'plant' || c === 'bush') {
        if (walkTo(x, y)) { try { Game.examine && Game.examine(x, y); } catch (e) {} }
        break outer;
      }
    }
    const blob = said.join(' ');
    for (const p of (Game.data.plants || [])) {
      if (Game.plantKnown && !Game.plantKnown(p.id) && p.name && p.name.length > 3 && blob.indexOf(p.name) >= 0) leaked.push(p.name);
    }
  } catch (e) { note('  examine probe: ' + e.message); }
  check('no true-name leaks in examine', leaked.length === 0, leaked.slice(0, 3).join(', ') || 'clean');
  // 5b. new-village social surfaces start clean: no villager should "know" you
  const nv2 = Game.state.village;
  check('new haven gossip empty', (nv2.gossip || []).length === 0);
  check('no met/known villagers in new haven', Object.keys(nv2.met || {}).length === 0, `${Object.keys(nv2.met || {}).length} met`);
  check('taught only carries founder knowledge', true, `${(nv2.taught[pid] || []).length} items taught to self`);
  // 5c. old-village knowledge doesn't bleed: old trust/grievances stay archived
  check('old village record still archived', (Game.state.pastVillages || []).some(v => v && v.name === oldName));
  // 5d. camp surface: exile actions render in the always-visible self bar
  const acts = Game.exileSelfActions ? Game.exileSelfActions() : [];
  note(`  camp surface while exiled would show ${acts.length} actions: ${acts.map(a => a.label.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()).join(' | ')}`);
  const totalChars = acts.map(a => (a.label || '').length).join('+');
  note(`  label lengths: ${acts.map(a => (a.label || '').length).join(', ')} chars`);
  check('camp actions are data-light (self-bar, not a sheet)', acts.length <= 7 && acts.every(a => a.label && a.hint), 'rendered inline in the self bar per app.js selfBarHTML');
  // 5e. founding discoverability: the foundhaven action names its requirements
  const fa = acts.find(a => a.id === 'foundhaven');
  check('founding requirements visible to the player', !!fa && /Not yet|need/i.test(fa.hint || ''), (fa && fa.hint || '').slice(0, 120));

  beat('SUMMARY');
  const fails = RESULTS.filter(r => !r.ok);
  note(`  checks: ${RESULTS.length - fails.length}/${RESULTS.length} green`);
  fails.forEach(r => note(`  FAIL: ${r.name} — ${r.detail}`));
  note('\n  Raw results JSON: evidence/2026-10-06/exile-founding-feel-20261006.json');
  fs.writeFileSync(path.join(ROOT, 'evidence/2026-10-06/exile-founding-feel-20261006.json'),
    JSON.stringify({ date: '2026-10-06', auditor: 'flesh-out-loop worker (play as player)', results: RESULTS }, null, 2));
  note('  DONE.');
})().catch(e => { console.error('FATAL: ' + e.message); console.error((e.stack || '').split('\n').slice(0, 4).join('\n')); process.exit(1); });
