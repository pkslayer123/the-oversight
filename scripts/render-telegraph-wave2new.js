#!/usr/bin/env node
// Telegraph VISUAL PROOF — 5 NEW wave-2 monsters (Steve 2026-10-06):
// understudy, landlord, heckler, paparazzo, union_rep.
// SCRIPTS ONLY: does not edit any tracked game file.
// Method: same proven pattern as scripts/render-telegraph-proof.js —
// headless Chromium hangs on every page load in this VM, so this drives REAL
// combat in node (day1 base -> re-seat monster adjacent -> Game.startCombat ->
// drive turns until m.telegraph declares -> hold windup), then renders the
// grid through the REAL tbAllTelegraphCells() bucket routing extracted
// verbatim from src/js/app.js, rasterized with cairosvg at 390px wide.
// The understudy is special: it only declares after SEEING the player's
// weapon twice (usSeen>=2), so its driver hunts (move+strike with a real
// spear via Game.tbPlayerStrike) instead of passing turns.
// Run: node scripts/render-telegraph-wave2new.js [only <name>...]
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

// name, monsterId, driver, label
// driver 'hunt': chase and strike with a real spear (understudy needs usSeen>=2).
// driver 'pass': stand still, pass turns (landlord/heckler come to you;
// paparazzo backs off to range then shoots; union_rep holds and organizes).
const TARGETS = [
  { name: 'understudy-unknown', monster: 'understudy', driver: 'hunt', label: 'The Understudy (wave-2 NEW) — unknown' },
  { name: 'understudy-known', monster: 'understudy', driver: 'hunt', learn: true, label: 'The Understudy (wave-2 NEW) — known' },
  { name: 'landlord-unknown', monster: 'landlord', driver: 'pass', label: 'The Landlord (wave-2 NEW) — unknown' },
  { name: 'landlord-known', monster: 'landlord', driver: 'pass', learn: true, label: 'The Landlord (wave-2 NEW) — known' },
  { name: 'heckler-unknown', monster: 'heckler', driver: 'pass', label: 'The Heckler (wave-2 NEW) — unknown' },
  { name: 'heckler-known', monster: 'heckler', driver: 'pass', learn: true, label: 'The Heckler (wave-2 NEW) — known' },
  { name: 'paparazzo-unknown', monster: 'paparazzo', driver: 'pass', label: 'The Paparazzo (wave-2 NEW) — unknown' },
  { name: 'paparazzo-known', monster: 'paparazzo', driver: 'pass', learn: true, label: 'The Paparazzo (wave-2 NEW) — known' },
  { name: 'unionrep-unknown', monster: 'union_rep', driver: 'pass', label: 'The Union Rep (wave-2 NEW) — unknown' },
  { name: 'unionrep-known', monster: 'union_rep', driver: 'pass', learn: true, label: 'The Union Rep (wave-2 NEW) — known' },
];

function def(id) {
  const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const mlist = Array.isArray(md) ? md : md.monsters;
  return mlist.find(m => m.id === id) || {};
}
function monsters() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive); }
function primary(id) { return monsters().find(m => ((m.mdef || {}).id) === id) || null; }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
// Understudy driver: chase the monster, strike when adjacent (real combat —
// tbPlayerStrike records the weapon in usSeen; the understudy only declares
// after seeing a weapon twice). tbPlayerStrike ends the turn itself.
function huntTurn(target) {
  let guard = 0;
  while (Game.tbIsPlayerTurn() && guard++ < 12) {
    const p = Game.tbFighter('p'); if (!p) return;
    const d = Math.max(Math.abs(target.mx - p.mx), Math.abs(target.my - p.my));
    if (d <= 1) {
      if (!Game.tbPlayerStrike(target.key)) endTurn();
      return;
    }
    if (p.moveLeft <= 0) { endTurn(); return; }
    const nx = p.mx + Math.sign(target.mx - p.mx), ny = p.my + Math.sign(target.my - p.my);
    let moved = false;
    try { moved = Game.tbPlayerMove(nx, ny); } catch (e) { moved = false; }
    if (!moved) { endTurn(); return; }
  }
}
function learn(id) {
  const atkName = ((def(id).attack) || {}).name;
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  const c = Game.state.codex.monsters[id] || (Game.state.codex.monsters[id] = {});
  c.patterns = c.patterns || {};
  if (atkName) c.patterns[atkName] = 'proof-learned';
  return atkName;
}
// Inline replicate of debug-scenarios' giveWeapon (module-local there) —
// script-side state setup only, no game edits.
function grantSpear() {
  const s = Game.state.scholar;
  const idef = (Game.data.items || []).find(i => i.id === 'fire_hardened_spear') || {};
  s.inventory = s.inventory || [];
  s.inventory.push({ itemId: 'fire_hardened_spear', units: 1, kcalEach: 0, kg: 0.5, name: idef.name || 'fire_hardened_spear', bonded: true, bond: 0, bondOffered: [], enhancements: [] });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: idef.name || 'fire_hardened_spear' };
}

function captureMonster(t) {
  Game.debugScenario('day1'); // neutral base: fresh game, no villagers
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  s.monster = { id: t.monster, mx: 6, my: 4 };
  if (t.driver === 'hunt') grantSpear();
  try { Game.startCombat(t.monster); } catch (e) { return { error: 'startCombat failed: ' + e.message }; }
  if (!Game.tbfight) return { error: 'combat never started' };
  const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
  monsters().forEach(m => { m.hp = 99999; m.maxHp = 99999; });
  let atkName = null;
  if (t.learn) atkName = learn(t.monster);
  let rounds = 0;
  for (let r = 0; r < 120; r++) {
    rounds = r;
    if (!Game.tbfight || Game.tbfight.over) break;
    const pm = primary(t.monster);
    if (!pm) { return { error: 'primary monster left the fight (died/fled?)' }; }
    if (pm.telegraph) break;
    if (Game.tbIsPlayerTurn()) {
      if (t.driver === 'hunt') huntTurn(pm); else endTurn();
    } else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
  }
  const pm = primary(t.monster);
  if (!pm || !pm.telegraph) return { error: 'no telegraph declared in ' + rounds + ' rounds' };
  let buckets = {};
  try { buckets = tbAllTelegraphCells(); } catch (e) { buckets = { error: String(e) }; }
  let cue = null;
  try { cue = Game.tbTelegraphCue ? Game.tbTelegraphCue(pm) : null; } catch (e) { cue = 'cue error: ' + e.message; }
  const tgInfo = {
    name: pm.name, mid: (pm.mdef || {}).id,
    kind: pm.telegraph.kind, ptype: (pm.telegraph.pattern || {}).type,
    turnsLeft: pm.telegraph.turnsLeft, attackName: pm.telegraph.attackName,
    ncells: (pm.telegraph.cells || []).length, cue,
    phase: pm.phase || pm.encPhase || (pm.telegraph && pm.telegraph.phase) || pm.beamPhase || null,
    mpos: [pm.mx, pm.my], emoji: ((pm.mdef || {}).emoji || '👹'),
  };
  const bucketCells = {};
  for (const k of ['burst', 'charge', 'encircle', 'biHot', 'sbLock', 'line', 'single', 'direct', 'rush'])
    bucketCells[k] = buckets[k] ? [...buckets[k]] : [];
  // Landlord terraform: the claim is its visual identity — count claimed tiles.
  let claimed = 0;
  try {
    for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++)
      if (Game.tbTerrainAt && Game.tbTerrainAt(cx, cy) === 'claimed') claimed++;
  } catch (e) {}
  const snap = {
    id: t.monster, label: t.label, known: !!t.learn, atkName, tg: tgInfo, bucketCells,
    mon: buckets.mon ? { ...buckets.mon } : {},
    encircleAngle: (buckets && buckets.encircleAngle != null) ? buckets.encircleAngle : null,
    claimed,
    player: [s.mx, s.my],
    mpos: monsters().map(m => [m.mx, m.my, m.name || 'Monster']),
    hp: monsters().map(m => [m.hp, m.maxHp]),
    rounds,
  };
  return snap;
}

// ---- 390px-wide SVG render (same visual language as render-telegraph-proof.js) ----
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
  const tg = snap.tg || {};
  const cueText = tg.cue;
  let svg = `<svg width="${W}" xmlns="http://www.w3.org/2000/svg" font-family="monospace">`;
  svg += `<rect width="${W}" height="2000" fill="#14141f"/>`;
  y += 22;
  svg += `<text x="15" y="${y}" fill="#eee" font-size="14" font-weight="bold">${esc(snap.label)}</text>`; y += 18;
  svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">attack: ${esc(tg.attackName || atk.name || '?')} · pattern: ${esc(tg.ptype || (atk.pattern || {}).type || '?')} · turnsLeft: ${esc(String(tg.turnsLeft))}${tg.phase ? ' · phase: ' + esc(tg.phase) : ''}</text>`; y += 16;
  svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">codex: ${snap.known ? 'PATTERN LEARNED' : 'unknown (first contact)'} · declared after ${esc(String(snap.rounds))} rounds${snap.claimed ? ' · claimed tiles: ' + snap.claimed : ''}</text>`; y += 8;
  const clines = wrap('cue: ' + (cueText || ''), 42);
  clines.forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#ffd88a" font-size="11">${esc(l)}</text>`; });
  y += 12;
  const gy = y; y += 9 * CELL;
  const B = {};
  for (const k of Object.keys(snap.bucketCells)) B[k] = new Set(snap.bucketCells[k]);
  const monCells = {};
  for (const mp of (snap.mpos || [])) monCells[mp[0] + ',' + mp[1]] = mp[2] || '👹';
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const px = ox + cx * CELL, py = gy + cy * CELL, k = cx + ',' + cy;
    let fill = '#2a2a3e', stroke = '#444', sw = 1, dash = null, hatch = false;
    const has = (set) => set && set.has(k);
    if (has(B.burst)) { fill = 'rgba(255,107,53,.25)'; stroke = '#ff6b35'; sw = 2; }
    if (has(B.charge)) { fill = 'rgba(255,210,63,.25)'; stroke = '#ffd23f'; sw = 2; hatch = true; }
    if (has(B.encircle)) { fill = 'rgba(255,176,32,.18)'; stroke = '#ffb020'; sw = 2; }
    if (has(B.biHot)) { fill = 'rgba(255,255,255,.42)'; stroke = '#ffffff'; sw = 3; }
    if (has(B.sbLock)) { fill = 'rgba(255,211,77,.28)'; stroke = '#ffd34d'; sw = 2; }
    if (has(B.line)) { fill = 'rgba(231,29,54,.22)'; stroke = '#e71d36'; sw = 2; }
    if (has(B.single)) { fill = 'rgba(255,59,48,.30)'; stroke = '#ff3b30'; sw = 3; }
    if (has(B.direct)) { fill = 'rgba(157,78,221,.20)'; stroke = '#9d4edd'; sw = 2; }
    if (has(B.rush)) { fill = 'rgba(6,255,165,.18)'; stroke = '#06ffa5'; sw = 2; }
    // Landlord's claim: claimed tiles render as a struck-through plot grid
    // (script-side overlay only — the claim itself is terraform, not a telegraph bucket).
    let claimedMark = false;
    if (snap.id === 'landlord' && snap.claimedCells && snap.claimedCells.has(k)) {
      claimedMark = true;
      if (fill === '#2a2a3e') { fill = 'rgba(139,90,43,.22)'; stroke = '#8b5a2b'; sw = 1; dash = '4,2'; }
    }
    svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    if (hatch) {
      svg += `<line x1="${px}" y1="${py + CELL}" x2="${px + CELL}" y2="${py}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
      svg += `<line x1="${px + CELL / 2}" y1="${py + CELL}" x2="${px + CELL}" y2="${py + CELL / 2}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
      svg += `<line x1="${px}" y1="${py + CELL / 2}" x2="${px + CELL / 2}" y2="${py}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
    }
    if (claimedMark) {
      svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 5}" text-anchor="middle" font-size="14" fill="rgba(255,220,150,.75)">§</text>`;
    }
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
  const legend = [['#ff6b35', 'burstRadius'], ['#ffd23f', 'chargeLane'],
    ['#ffb020', 'encircle'], ['#9d4edd', 'lockOn(direct)'], ['#ff3b30', 'targetTile'],
    ['#8b5a2b', 'claimed(§)']];
  svg += `<text x="15" y="${y}" fill="#888" font-size="10">legend:</text>`;
  let lx = 70;
  for (const [c, n] of legend) {
    if (lx > 300) { lx = 70; y += 16; }
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
    catch (e) { snap = { error: 'CRASH: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n') }; }
    if (snap.error) {
      console.log('   ERROR: ' + snap.error);
      summary.push({ name: t.name, label: t.label, error: snap.error });
      continue;
    }
    // Re-scan claimed cells for the render overlay (cheap, script-side).
    try {
      snap.claimedCells = new Set();
      if (t.monster === 'landlord')
        for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++)
          if (Game.tbTerrainAt && Game.tbTerrainAt(cx, cy) === 'claimed') snap.claimedCells.add(cx + ',' + cy);
    } catch (e) { snap.claimedCells = new Set(); }
    const svg = render(snap);
    const svgPath = path.join(OUT, 'tg-' + t.name + '.svg');
    const pngPath = path.join(OUT, 'tg-' + t.name + '.png');
    fs.writeFileSync(svgPath, svg);
    try { toPng(svgPath, pngPath); console.log('   wrote ' + pngPath); }
    catch (e) { console.log('   PNG failed: ' + e.message); }
    const bucketSizes = {};
    for (const k of Object.keys(snap.bucketCells)) bucketSizes[k] = snap.bucketCells[k].length;
    summary.push({
      name: t.name, label: t.label, known: snap.known, monster: t.monster,
      attack: (snap.tg || {}).attackName, kind: (snap.tg || {}).kind, pattern: (snap.tg || {}).ptype,
      turnsLeft: (snap.tg || {}).turnsLeft, phase: (snap.tg || {}).phase,
      cue: (snap.tg || {}).cue,
      bucketSizes, claimed: snap.claimed, rounds: snap.rounds,
    });
  }
  // Upsert into the wave-2-new summary (targeted runs must not destroy the baseline).
  const sumPath = path.join(OUT, 'telegraph-proof-wave2new-20261006.json');
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
