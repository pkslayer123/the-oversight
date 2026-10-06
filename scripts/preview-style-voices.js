#!/usr/bin/env node
// SYNTHETIC style-voice previews (Steve 2026-10-06).
// The tbAllTelegraphCells style routing (app.js) is blocked by a sibling's
// dirty tree, so the real end-to-end proof re-run must wait. This script
// captures REAL telegraph geometry from live debug-scenario combat (learned
// patterns) and remaps the generic buckets to the new style buckets using
// the EXACT formulas the pending app.js patch uses (dozeAngle first->last,
// swarmSrc = declaring monster tiles). The SVG styling mirrors main.css
// 1:1 (same colors, same repeating gradients approximated as SVG).
// Judge: are the five voices distinct at a glance at 390px?
// Run: node scripts/preview-style-voices.js
// Output: ~/workspace/goals/the-scattering-roguelite-survival-game/hidden_files/fleshout-20261006/style-voices-preview.{svg,png}
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(process.env.HOME, 'workspace/goals/the-scattering-roguelite-survival-game/hidden_files/fleshout-20261006');
fs.mkdirSync(OUT, { recursive: true });

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

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
  if (atkName) c.patterns[atkName] = 'preview-learned';
}
function driveToTelegraph() {
  for (let r = 0; r < 60; r++) {
    if (!Game.tbfight || Game.tbfight.over) return false;
    if (monsters().some(m => m.telegraph)) return true;
    if (Game.tbIsPlayerTurn()) endTurn();
    else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { return false; } }
  }
  return monsters().some(m => m.telegraph);
}

const CASES = [
  { id: 'bulldozer', scenario: 'bulldozer', style: 'dozeLane', generic: 'charge', label: 'DOZE LANE — bulldozer: brown dust wall, arrows ride charge dir' },
  { id: 'hype_horn', scenario: 'motivationalspeaker', style: 'pepBurst', generic: 'burst', label: 'PEP BURST — hype horn: magenta sound rings' },
  { id: 'hummice', scenario: 'hummice', style: 'swarmHum', generic: 'burst', label: 'SWARM HUM — hummice: dotted bodies, rings on declarers' },
  { id: 'belltoad', scenario: 'choir', style: 'resonantBurst', generic: 'burst', label: 'RESONANT BURST — belltoad: green croak rings' },
  { id: 'mirrormoth', scenario: 'flashbulb', style: 'flashBurst', generic: 'burst', label: 'FLASH BURST — mirrormoth: hard silver blink (static: pale)' },
];

function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

(async () => {
  await Game.init();
  const strips = [];
  for (const t of CASES) {
    Game.debugScenario(t.scenario);
    const s = Game.state.scholar;
    s.mx = 4; s.my = 4;
    s.monster = { id: t.id, mx: 6, my: 4 };
    Game.startCombat(t.id);
    const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
    monsters().forEach(m => { m.hp = 99999; m.maxHp = 99999; });
    learn(t.id);
    if (!driveToTelegraph()) { strips.push({ t, error: 'no telegraph' }); continue; }
    // Real generic-bucket geometry, remapped to the style bucket with the
    // exact formulas from the pending app.js patch.
    const cells = [];
    for (const m of monsters()) {
      if (!m.telegraph) continue;
      for (const c of (m.telegraph.cells || [])) cells.push({ x: c.cx, y: c.cy, mx: m.mx, my: m.my });
    }
    let dozeAngle = 0;
    if (t.style === 'dozeLane' && cells.length >= 2) {
      const a = cells[0], b = cells[cells.length - 1];
      dozeAngle = Math.round(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI);
    }
    const swarmSrc = [];
    if (t.style === 'swarmHum') {
      for (const m of monsters()) if (m.telegraph) swarmSrc.push({ x: m.mx, y: m.my });
    }
    strips.push({ t, cells, dozeAngle, swarmSrc, player: [s.mx, s.my], error: null });
  }

  // One 390px SVG, five labeled strips. Each strip shows a 9-wide slice of
  // the real captured geometry (bbox-cropped), styled per main.css.
  const W = 390;
  let svg = `<svg width="${W}" height="1180" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${W}" height="1180" fill="#1a1a2e"/>`;
  svg += `<text x="15" y="24" fill="#eee" font-size="14" font-family="monospace" font-weight="bold">STYLE VOICES PREVIEW (synthetic remap of real geometry)</text>`;
  let y = 48;
  for (const st of strips) {
    const { t } = st;
    svg += `<text x="15" y="${y}" fill="#ffd88a" font-size="11" font-family="monospace">${escXml(t.label)}</text>`;
    y += 8;
    if (st.error) { svg += `<text x="15" y="${y + 20}" fill="#ff8a80" font-size="11" font-family="monospace">capture failed: ${escXml(st.error)}</text>`; y += 60; continue; }
    // bbox crop
    const xs = st.cells.map(c => c.x), ys = st.cells.map(c => c.y);
    xs.push(st.player[0]); ys.push(st.player[1]);
    const x0 = Math.max(0, Math.min(...xs) - 0), x1 = Math.min(8, Math.max(...xs));
    const y0 = Math.max(0, Math.min(...ys) - 0), y1 = Math.min(8, Math.max(...ys));
    const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
    const CELL = Math.min(40, Math.floor(360 / Math.max(nw, nh)));
    const ox = 15, oy = y;
    const cellSet = new Set(st.cells.map(c => c.x + ',' + c.y));
    const srcSet = new Set((st.swarmSrc || []).map(s2 => s2.x + ',' + s2.y));
    const STYLE = {
      dozeLane: { fill: 'rgba(150,100,50,.38)', stroke: '#8a5a2b' },
      pepBurst: { fill: 'rgba(255,45,149,.25)', stroke: '#ff2d95' },
      swarmHum: { fill: 'rgba(140,140,160,.28)', stroke: '#d8d8e4' },
      resonantBurst: { fill: 'rgba(57,211,83,.22)', stroke: '#39d353' },
      flashBurst: { fill: 'rgba(232,244,255,.35)', stroke: '#e8f4ff' },
    }[t.style];
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const px = ox + (cx - x0) * CELL, py = oy + (cy - y0) * CELL;
      const k = cx + ',' + cy;
      const inStyle = cellSet.has(k);
      let fill = '#2a2a3e', stroke = '#444', sw = 1, dash = '';
      if (inStyle) { fill = STYLE.fill; stroke = STYLE.stroke; sw = 2; if (t.style === 'swarmHum') dash = ' stroke-dasharray="2,2"'; }
      svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
      const cxp = px + CELL / 2, cyp = py + CELL / 2;
      if (inStyle && t.style === 'dozeLane') {
        svg += `<line x1="${px}" y1="${py + CELL}" x2="${px + CELL}" y2="${py}" stroke="#8a5a2b" stroke-width="3" opacity="0.55"/>`;
        svg += `<text x="${cxp}" y="${cyp + 6}" text-anchor="middle" font-size="16" fill="#c98a3d" transform="rotate(${st.dozeAngle} ${cxp} ${cyp})">➤</text>`;
      }
      if (inStyle && t.style === 'pepBurst') {
        svg += `<circle cx="${cxp}" cy="${cyp}" r="${CELL * 0.16}" fill="none" stroke="#ff2d95" stroke-width="1.6" opacity="0.8"/>`;
        svg += `<circle cx="${cxp}" cy="${cyp}" r="${CELL * 0.32}" fill="none" stroke="#ff2d95" stroke-width="1.2" opacity="0.5"/>`;
        svg += `<text x="${cxp}" y="${cyp + 5}" text-anchor="middle" font-size="13" fill="#ff8cc8">♪</text>`;
      }
      if (inStyle && t.style === 'swarmHum') {
        for (let dy = 5; dy < CELL; dy += 9) for (let dx = 5; dx < CELL; dx += 9)
          svg += `<circle cx="${px + dx}" cy="${py + dy}" r="1.6" fill="rgba(240,240,250,.6)"/>`;
      }
      if (srcSet.has(k)) {
        svg += `<circle cx="${cxp}" cy="${cyp}" r="${CELL * 0.28}" fill="none" stroke="#e8e8f2" stroke-width="2" opacity="0.9"/>`;
        svg += `<text x="${cxp}" y="${cyp + 5}" text-anchor="middle" font-size="13" fill="#e8e8f2">◎</text>`;
      }
      if (inStyle && t.style === 'resonantBurst') {
        svg += `<circle cx="${cxp}" cy="${cyp}" r="${CELL * 0.16}" fill="none" stroke="#39d353" stroke-width="1.8" opacity="0.85"/>`;
        svg += `<circle cx="${cxp}" cy="${cyp}" r="${CELL * 0.34}" fill="none" stroke="#39d353" stroke-width="1.2" opacity="0.5"/>`;
      }
      let emoji = '';
      if (st.player[0] === cx && st.player[1] === cy) emoji = '🧍';
      if (emoji) svg += `<text x="${cxp}" y="${cyp + 9}" text-anchor="middle" font-size="24">${emoji}</text>`;
    }
    y = oy + nh * CELL + 34;
  }
  svg += `</svg>`;
  const svgPath = path.join(OUT, 'style-voices-preview.svg');
  const pngPath = path.join(OUT, 'style-voices-preview.png');
  fs.writeFileSync(svgPath, svg);
  execSync(`python3 -c "import cairosvg; cairosvg.svg2png(url='${svgPath}', write_to='${pngPath}', scale=2)"`, { stdio: 'pipe', timeout: 60000 });
  console.log('wrote ' + pngPath);
})().catch(e => { console.error('CRASH: ' + (e && e.stack || e)); process.exit(2); });
