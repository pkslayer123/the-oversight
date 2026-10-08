#!/usr/bin/env node
// Telegraph VISUAL PROOF — wave-2C + glasswing/sunbasker + deer benchmark + wave-1 comparisons (Steve 2026-10-06).
// SCRIPTS ONLY: does not edit any tracked game file.
// NOTE: headless Chrome --screenshot hangs on every page load in this VM
// (verified 2026-10-06: even data: URLs hang; sibling verified the same and
// switched to cairosvg). So this drives REAL combat in node, captures REAL
// telegraphs at declare time via the same bucket routing renderDetail uses
// (tbAllTelegraphCells extracted from app.js), and rasterizes with cairosvg.
// Run: node scripts/render-telegraph-proof.js [only <name>...]
// Output: evidence/2026-10-06/tg-<name>.{svg,png}
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'evidence', '2026-10-06');
fs.mkdirSync(OUT, { recursive: true });

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

// REAL bucket routing, extracted from app.js (same fn renderDetail uses).
const _tbSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8')
  .match(/function tbAllTelegraphCells\(\) \{[\s\S]*?\n  \}\n/)[0]
  .replace(/^function tbAllTelegraphCells/, 'function');
const tbAllTelegraphCells = eval('(' + _tbSrc + ')');

// name, scenario, monsterId, learn?, label
const TARGETS = [
  { name: 'deer-unknown', scenario: 'headlight', monster: 'gallowdeer', label: 'Highbeam Deer — benchmark, unknown pattern' },
  { name: 'deer-known', scenario: 'headlight', monster: 'gallowdeer', learn: true, label: 'Highbeam Deer — benchmark, pattern learned' },
  { name: 'inspiration-unknown', scenario: 'inspiration', monster: 'bright_idea', label: 'Inspiration (wave-2C) — unknown' },
  { name: 'inspiration-known', scenario: 'inspiration', monster: 'bright_idea', learn: true, label: 'Inspiration (wave-2C) — known' },
  { name: 'inspiration-bihot', scenario: 'inspiration', monster: 'bright_idea', learn: true, untilHot: true,
    label: 'Inspiration (wave-2C) — known, WHITE-HOT final tick (biHot, turnsLeft<=1)' },
  { name: 'nostalgia-unknown', scenario: 'nostalgia', monster: 'memory_projector', label: 'Nostalgia (wave-2C) — unknown' },
  { name: 'nostalgia-known', scenario: 'nostalgia', monster: 'memory_projector', learn: true, label: 'Nostalgia (wave-2C) — known' },
  { name: 'glasswing-unknown', scenario: 'glasswing', monster: 'glasswing', label: 'Glasswing Darter — dive shadow, unknown' },
  { name: 'glasswing-known', scenario: 'glasswing', monster: 'glasswing', learn: true, label: 'Glasswing Darter — dive shadow, known' },
  { name: 'sunbasker-unknown', scenario: 'sunbasker', monster: 'sunbasker', label: 'Sunbasker — heat halo, unknown' },
  { name: 'sunbasker-known', scenario: 'sunbasker', monster: 'sunbasker', learn: true, label: 'Sunbasker — heat halo, known' },
  { name: 'bulldozer', scenario: 'bulldozer', monster: 'bulldozer', label: 'Bulldozer (wave-1 charge) — comparison' },
  { name: 'lockpick', scenario: 'lockpick', monster: 'lockpick_raccoon', noDrive: true,
    note: 'thief: steals-and-bolts, declares NO grid telegraph by design — the tell is the opening narration ("looking at your pack")',
    label: 'Lockpick (wave-1 thief) — opening tell, no declare' },
  { name: 'flashbulb', scenario: 'flashbulb', monster: 'mirrormoth', label: 'Flashbulb Moth (wave-1 burst) — comparison' },
];

function def(id) {
  const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const mlist = Array.isArray(md) ? md : md.monsters;
  return mlist.find(m => m.id === id) || {};
}
function monsters() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function learn(id) {
  const atkName = ((def(id).attack) || {}).name;
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  const c = Game.state.codex.monsters[id] || (Game.state.codex.monsters[id] = {});
  c.patterns = c.patterns || {};
  if (atkName) c.patterns[atkName] = 'proof-learned';
  return atkName;
}

function captureMonster(t) {
  Game.debugScenario(t.scenario);
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  s.monster = { id: t.monster, mx: 6, my: 4 };
  // SUNBASKER (sibling's proven fix): the approach pathing can walk it into
  // tree-shade and the fight fizzles ("no sun, no fight"). Shadeless grid.
  let savedGenDetail = null;
  if (t.monster === 'sunbasker') {
    savedGenDetail = Game.genDetail;
    Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  }
  try { Game.startCombat(t.monster); } catch (e) { if (savedGenDetail) Game.genDetail = savedGenDetail; return { error: 'startCombat failed: ' + e.message }; }
  if (!Game.tbfight) { if (savedGenDetail) Game.genDetail = savedGenDetail; return { error: 'combat never started' }; }
  const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
  monsters().forEach(m => { m.hp = 99999; m.maxHp = 99999; });
  let atkName = null;
  if (t.learn) atkName = learn(t.monster);
  let note = null;
  if (!t.noDrive) {
    for (let r = 0; r < 80; r++) {
      if (!Game.tbfight || Game.tbfight.over) break;
      const tgs = monsters().filter(m => m.telegraph);
      if (tgs.length) break;
      if (Game.tbIsPlayerTurn()) endTurn();
      else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
    }
  } else {
    note = t.note || 'captured at fight start (no declare phase)';
  }
  const tgs = monsters().filter(m => m.telegraph);
  if (!tgs.length && !t.noDrive) { if (savedGenDetail) Game.genDetail = savedGenDetail; return { error: 'no telegraph declared in 80 rounds' }; }
  // untilHot (Steve 2026-10-06): keep driving past declaration until the last
  // windup tick (turnsLeft<=1) — captures the white-hot biHot state.
  if (t.untilHot && !t.noDrive) {
    for (let r = 0; r < 80; r++) {
      if (!Game.tbfight || Game.tbfight.over) break;
      const tg = monsters().find(m => m.telegraph);
      if (!tg) break; // fired and cleared — capture would be stale
      if (tg.telegraph.turnsLeft <= 1) break;
      if (Game.tbIsPlayerTurn()) endTurn();
      else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
    }
  }
  let buckets = {};
  try { buckets = tbAllTelegraphCells(); } catch (e) { buckets = { error: String(e) }; }
  const tgInfo = tgs.map(m => {
    let cue = null;
    try { cue = Game.tbTelegraphCue ? Game.tbTelegraphCue(m) : null; } catch (e) { cue = 'cue error: ' + e.message; }
    return {
      name: m.name, mid: (m.mdef || {}).id,
      kind: m.telegraph.kind, ptype: (m.telegraph.pattern || {}).type,
      turnsLeft: m.telegraph.turnsLeft, attackName: m.telegraph.attackName,
      ncells: (m.telegraph.cells || []).length, cue,
      phase: m.phase || m.encPhase || (m.telegraph && m.telegraph.phase) || null,
      mpos: [m.mx, m.my], emoji: ((m.mdef || {}).emoji || '👹'),
    };
  });
  let gwDive = null, sbHeat = null, lane = null, ghost = null, circle = null;
  try { gwDive = Game.gwDiveShadow ? Game.gwDiveShadow() : null; } catch (e) {}
  try { sbHeat = Game.sbHeatKeys ? Game.sbHeatKeys() : null; } catch (e) {}
  try { const l = Game.tbBeamLaneCells ? Game.tbBeamLaneCells() : null; lane = l ? [...l] : []; } catch (e) {}
  try { const g = Game.tbBeamPrevLaneCells ? Game.tbBeamPrevLaneCells() : null; ghost = g ? [...g] : []; } catch (e) {}
  try { const c = Game.beastCircleKeys ? Game.beastCircleKeys() : null; circle = c ? [...c] : []; } catch (e) {}
  const bucketCells = {};
  for (const k of ['burst', 'charge', 'encircle', 'biHot', 'sbLock', 'line', 'single', 'direct', 'rush'])
    bucketCells[k] = buckets[k] ? [...buckets[k]] : [];
  const encircleAngle = (buckets && buckets.encircleAngle != null) ? buckets.encircleAngle : null;
  const snap = {
    id: t.monster, label: t.label, known: !!t.learn, atkName, tgs: tgInfo, bucketCells,
    mon: buckets.mon ? { ...buckets.mon } : {}, encircleAngle, note,
    lane, ghost, circle, gwDive, sbHeat,
    player: [s.mx, s.my],
    mpos: monsters().map(m => [m.mx, m.my, m.name || 'Monster']),
    hp: monsters().map(m => [m.hp, m.maxHp]),
  };
  if (savedGenDetail) Game.genDetail = savedGenDetail;
  return snap;
}

// ---- 390px-wide SVG render ----
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function wrap(s, n) {
  const words = String(s || '').split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n) { lines.push(cur.trim()); cur = w; } else cur = cur + ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, 6);
}

function render(snap) {
  const W = 390, CELL = 40, ox = 15;
  let y = 0;
  const d = def(snap.id);
  const atk = d.attack || {};
  const tg = snap.tgs[0] || {};
  const cueText = tg.cue || (snap.note ? atk.telegraph : null);
  let svg = `<svg width="${W}" xmlns="http://www.w3.org/2000/svg" font-family="monospace">`;
  svg += `<rect width="${W}" height="2000" fill="#14141f"/>`;
  y += 22;
  svg += `<text x="15" y="${y}" fill="#eee" font-size="14" font-weight="bold">${esc(snap.label)}</text>`; y += 18;
  const hp = snap.hp[0] || [];
  svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">attack: ${esc(tg.attackName || atk.name || '?')} · pattern: ${esc(tg.ptype || (atk.pattern || {}).type || '?')} · turnsLeft: ${esc(String(tg.turnsLeft))}${tg.phase ? ' · phase: ' + esc(tg.phase) : ''}</text>`; y += 16;
  svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">codex: ${snap.known ? 'PATTERN LEARNED' : 'unknown (first contact)'} · telegraph cells: ${esc(tg.ncells)}</text>`; y += 8;
  if (snap.note) { const nlines = wrap('note: ' + snap.note, 42); nlines.forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#7fd4ff" font-size="11">${esc(l)}</text>`; }); y += 6; }
  const clines = wrap('cue: ' + (cueText || ''), 42);
  clines.forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#ffd88a" font-size="11">${esc(l)}</text>`; });
  y += 12;
  if (snap.gwDive) { svg += `<text x="15" y="${y}" fill="#9adcff" font-size="11">gwDiveShadow: phase=${esc(snap.gwDive.phase)} tile=${snap.gwDive.tile ? snap.gwDive.tile.x + ',' + snap.gwDive.tile.y : '?'} tl=${esc(snap.gwDive.turnsLeft)} streak=${esc((snap.gwDive.streak || []).length)}</text>`; y += 16; }
  if (snap.sbHeat) { svg += `<text x="15" y="${y}" fill="#ffd34d" font-size="11">sbHeat: charge=${esc(snap.sbHeat.charge)} ring=${esc((snap.sbHeat.ring || []).length)}</text>`; y += 16; }
  const gy = y; y += 9 * CELL;
  const B = {};
  for (const k of Object.keys(snap.bucketCells)) B[k] = new Set(snap.bucketCells[k]);
  const lane = new Set(snap.lane || []), ghost = new Set(snap.ghost || []), circle = new Set(snap.circle || []);
  const monCells = {};
  for (const mp of (snap.mpos || [])) monCells[mp[0] + ',' + mp[1]] = mp[2] || '👹';
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const px = ox + cx * CELL, py = gy + cy * CELL, k = cx + ',' + cy;
    let fill = '#2a2a3e', stroke = '#444', sw = 1, dash = null, arrow = null, hatch = false;
    const has = (set) => set && set.has(k);
    if (lane.has(k)) { fill = 'rgba(255,80,60,.35)'; stroke = '#ff4b33'; sw = 2; }
    if (ghost.has(k)) { fill = '#3a3a4a'; }
    if (has(B.burst)) { fill = 'rgba(255,107,53,.25)'; stroke = '#ff6b35'; sw = 2; }
    if (has(B.charge)) { fill = 'rgba(255,210,63,.25)'; stroke = '#ffd23f'; sw = 2; hatch = true; }
    if (has(B.encircle)) { fill = 'rgba(255,176,32,.18)'; stroke = '#ffb020'; sw = 2; }
    if (has(B.biHot)) { fill = 'rgba(255,255,255,.42)'; stroke = '#ffffff'; sw = 3; }
    if (has(B.sbLock)) { fill = 'rgba(255,211,77,.28)'; stroke = '#ffd34d'; sw = 2; }
    if (has(B.line)) { fill = 'rgba(231,29,54,.22)'; stroke = '#e71d36'; sw = 2; }
    if (has(B.single)) { fill = 'rgba(255,59,48,.30)'; stroke = '#ff3b30'; sw = 3; }
    if (has(B.direct)) { fill = 'rgba(157,78,221,.20)'; stroke = '#9d4edd'; sw = 2; }
    if (has(B.rush)) { fill = 'rgba(6,255,165,.18)'; stroke = '#06ffa5'; sw = 2; }
    if (circle.has(k) && fill === '#2a2a3e') { fill = 'rgba(255,176,32,.07)'; stroke = '#ffb020'; sw = 2; dash = '3,3'; }
    const _sb = snap.sbHeat;
    if (_sb && _sb.monster && cx === _sb.monster.x && cy === _sb.monster.y) {
      const _ch = Math.min(3, _sb.charge || 0);
      fill = `rgba(255,180,60,${[0.10, 0.18, 0.30, 0.45][_ch]})`; stroke = '#ffd34d'; sw = 2;
    }
    if (_sb && _sb.ring && _sb.ring.some(c => c.x === cx && c.y === cy) && fill === '#2a2a3e') {
      fill = 'rgba(255,211,77,.12)'; stroke = '#ffd34d'; sw = 1; dash = '2,2';
    }
    const _gwd = snap.gwDive;
    let diveMarker = false;
    if (_gwd) {
      if (_gwd.phase === 'circle' && _gwd.monster && cx === _gwd.monster.x && cy === _gwd.monster.y) {
        fill = 'rgba(10,10,20,0.28)'; stroke = '#333'; sw = 2;
      } else if (_gwd.phase === 'dive' && _gwd.tile) {
        if (cx === _gwd.tile.x && cy === _gwd.tile.y) {
          const _dark = (_gwd.turnsLeft || 1) <= 1 ? 0.72 : 0.45;
          fill = `rgba(10,10,20,${_dark})`; stroke = 'rgba(10,10,20,.85)'; sw = 2; diveMarker = true;
        } else if ((_gwd.streak || []).some(c => c.x === cx && c.y === cy)) {
          fill = 'rgba(10,10,20,0.14)';
        }
      }
    }
    svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    if (hatch) {
      svg += `<line x1="${px}" y1="${py + CELL}" x2="${px + CELL}" y2="${py}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
      svg += `<line x1="${px + CELL / 2}" y1="${py + CELL}" x2="${px + CELL}" y2="${py + CELL / 2}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
      svg += `<line x1="${px}" y1="${py + CELL / 2}" x2="${px + CELL / 2}" y2="${py}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
    }
    if (diveMarker) svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 6}" text-anchor="middle" font-size="16" fill="rgba(255,255,255,.9)">▼</text>`;
    let emoji = '';
    if (snap.player[0] === cx && snap.player[1] === cy) {
      svg += `<circle cx="${px + CELL / 2}" cy="${py + CELL / 2}" r="13" fill="#f5f5f5" stroke="#111" stroke-width="2"/>`;
      svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 5}" text-anchor="middle" font-size="13" font-weight="bold" fill="#111">P</text>`;
    } else if (monCells[k]) {
      const initial = esc(String(monCells[k]).trim().charAt(0).toUpperCase() || 'M');
      svg += `<circle cx="${px + CELL / 2}" cy="${py + CELL / 2}" r="13" fill="#c62828" stroke="#fff" stroke-width="2"/>`;
      svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 5}" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">${initial}</text>`;
    }
  }
  y += 22;
  // Encircle direction arrow: single arrow at centroid (no live producers — kept for future use).
  if (B.encircle.size && snap.encircleAngle != null) {
    let sx = 0, sy = 0;
    for (const k of B.encircle) { const [ax, ay] = k.split(',').map(Number); sx += ax; sy += ay; }
    const acx = ox + (sx / B.encircle.size + 0.5) * CELL, acy = gy + (sy / B.encircle.size + 0.5) * CELL;
    svg += `<text x="${acx}" y="${acy + 8}" text-anchor="middle" font-size="20" fill="#ffb020" transform="rotate(${snap.encircleAngle} ${acx} ${acy})">➤</text>`;
  }
  const legend = [['#ff4b33', 'beamLane'], ['#ff6b35', 'burstRadius'], ['#ffd23f', 'chargeLane'],
    ['#ffb020', 'encircle'], ['#9d4edd', 'lockOn'], ['#ff3b30', 'targetTile'],
    ['#ffd34d', 'sbHeat'], ['#222', 'diveShadow'], ['#fff', 'whiteHot']];
  svg += `<text x="15" y="${y}" fill="#888" font-size="10">legend:</text>`;
  let lx = 70, lrow = 0;
  for (const [c, n] of legend) {
    if (lx > 300) { lx = 70; y += 16; lrow++; }
    svg += `<rect x="${lx}" y="${y - 10}" width="10" height="10" fill="${c}" stroke="#555" stroke-width="1"/>`;
    svg += `<text x="${lx + 13}" y="${y}" fill="#aaa" font-size="10">${n}</text>`;
    lx += 13 + n.length * 6.2 + 18;
  }
  y += 20;
  svg += `<text x="15" y="${y}" fill="#666" font-size="10">visual proof ${esc(new Date().toISOString().slice(0, 10))} — real combat, app.js bucket routing</text>`;
  svg += `<rect x="0" y="0" width="${W}" height="${y + 12}" fill="none"/>`;
  svg = svg.replace('<rect width="390" height="2000" fill="#14141f"/>', `<rect width="390" height="${y + 12}" fill="#14141f"/>`);
  svg = svg.replace(`<svg width="${W}"`, `<svg width="${W}" height="${y + 12}"`);
  svg += `</svg>`;
  return svg;
}

function toPng(svgPath, pngPath) {
  execSync(`python3 -c "import cairosvg; cairosvg.svg2png(url='${svgPath}', write_to='${pngPath}')"`, { stdio: 'pipe', timeout: 60000 });
}

(async () => {
  await Game.init();
  const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const list = only.length ? TARGETS.filter(t => only.includes(t.name)) : TARGETS;
  const summary = [];
  for (const t of list) {
    console.log('== ' + t.label);
    let snap;
    try { snap = captureMonster(t); }
    catch (e) { snap = { error: 'CRASH: ' + e.message }; }
    if (snap.error) {
      console.log('   ERROR: ' + snap.error);
      summary.push({ name: t.name, label: t.label, error: snap.error });
      continue;
    }
    const svg = render(snap);
    const svgPath = path.join(OUT, 'tg-' + t.name + '.svg');
    const pngPath = path.join(OUT, 'tg-' + t.name + '.png');
    fs.writeFileSync(svgPath, svg);
    try { toPng(svgPath, pngPath); console.log('   wrote ' + pngPath); }
    catch (e) { console.log('   PNG failed: ' + e.message); }
    summary.push({
      name: t.name, label: t.label, known: snap.known,
      attack: (snap.tgs[0] || {}).attackName, pattern: (snap.tgs[0] || {}).ptype,
      turnsLeft: (snap.tgs[0] || {}).turnsLeft, ncells: (snap.tgs[0] || {}).ncells,
      phase: (snap.tgs[0] || {}).phase,
      cue: (snap.tgs[0] || {}).cue,
      gwDive: snap.gwDive ? snap.gwDive.phase + '@' + (snap.gwDive.tile ? snap.gwDive.tile.x + ',' + snap.gwDive.tile.y : '?') : null,
      sbHeat: snap.sbHeat ? 'charge' + snap.sbHeat.charge : null,
    });
  }
  // Upsert into the summary (Steve 2026-10-06): targeted runs must not
  // destroy the baseline from earlier runs — merge by target name.
  const sumPath = path.join(OUT, 'telegraph-proof-20261006.json');
  let merged = [];
  try { merged = JSON.parse(fs.readFileSync(sumPath, 'utf8')); } catch (e) { merged = []; }
  const seen = new Set(merged.map(s => s.name));
  for (const s of summary) {
    if (seen.has(s.name)) merged = merged.map(x => x.name === s.name ? s : x);
    else { merged.push(s); seen.add(s.name); }
  }
  fs.writeFileSync(sumPath, JSON.stringify(merged, null, 2));
  const errs = summary.filter(s => s.error);
  console.log('\nDONE: ' + summary.length + ' targets, ' + errs.length + ' errors.');
  if (errs.length) process.exit(1);
})();
