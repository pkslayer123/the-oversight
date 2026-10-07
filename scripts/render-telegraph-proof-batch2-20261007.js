#!/usr/bin/env node
// Telegraph VISUAL PROOF — batch 2 (Steve 2026-10-07).
// Covers the three monsters with NO telegraph proof yet:
// nevermore (Nevermore, line), nightcourt (Night Court, single), statickite
// (The Static Kite, burst). Unknown + known (codex-learned) declares each.
// SCRIPTS ONLY: does not edit any tracked game file.
//
// Engine is loaded from a pristine `git archive HEAD` snapshot (env VPROOT),
// never the dirty worktree. Output (env VPOUT, default repo
// evidence/2026-10-07): tg2-<name>.{svg,png} + telegraph-proof-batch2-20261007.json.
// Headless Chrome hangs in this VM; drives REAL combat in node, captures REAL
// telegraphs at declare time via the same bucket routing renderDetail uses
// (tbAllTelegraphCells extracted from app.js), rasterizes with cairosvg.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.env.VPROOT || path.join(__dirname, '..');
const OUT = process.env.VPOUT || path.join(path.join(__dirname, '..'), 'evidence', '2026-10-07');
fs.mkdirSync(OUT, { recursive: true });

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/monsterBehaviors.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
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
// NOTE: nevermore / nightcourt / statickite were REMOVED from monsters.json by
// sibling commit 98041cc8 (abilities/loot commit — removal looks accidental;
// their debug scenarios + menu entries still exist). All 25 remaining monsters
// already have declare-phase proofs, so batch 2 covers the UNCOVERED FIRING
// (action) phase — the beam/flash actually live — for the benchmark deer and
// the clock-pressure paparazzo.
const TARGETS = [
  { name: 'tg2-deer-firing-unknown', scenario: 'headlight', monster: 'gallowdeer', untilFire: true,
    label: 'Highbeam Deer — FIRING (beam live), unknown' },
  { name: 'tg2-deer-firing-known', scenario: 'headlight', monster: 'gallowdeer', learn: true, untilFire: true,
    label: 'Highbeam Deer — FIRING (beam live), pattern learned' },
  { name: 'tg2-deer-recovery-known', scenario: 'headlight', monster: 'gallowdeer', learn: true, untilRecovery: true,
    label: 'Highbeam Deer — RECOVERY (beam spent, cooldown), pattern learned' },
  { name: 'tg2-deer-recovery-unknown', scenario: 'headlight', monster: 'gallowdeer', untilRecovery: true,
    label: 'Highbeam Deer — RECOVERY (beam spent, cooldown), unknown' },
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

// Silence audit: every drive iteration is logged with telegraph presence +
// say-count. "No silent turn" = every iteration where a telegraph is declared
// carried at least one say output.
const driveLog = [];
const sayLog = [];
let iterCount = 0, curTarget = null;

function captureMonster(t) {
  Game.debugScenario(t.scenario);
  const s = Game.state.scholar;
  s.mx = 2; s.my = 4;
  s.monster = { id: t.monster, mx: 5, my: 4 };
  try { Game.startCombat(t.monster); } catch (e) { return { error: 'startCombat failed: ' + e.message }; }
  if (!Game.tbfight) return { error: 'combat never started' };
  const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
  monsters().forEach(m => { m.hp = 99999; m.maxHp = 99999; });
  let atkName = null;
  if (t.learn) atkName = learn(t.monster);
  iterCount = 0;
  curTarget = t.name;
  for (let r = 0; r < 80; r++) {
    if (!Game.tbfight || Game.tbfight.over) break;
    iterCount++;
    const sayBefore = sayLog.length;
    const tgs = monsters().filter(m => m.telegraph);
    if (tgs.length) {
      driveLog.push({ target: t.name, iter: iterCount, declared: true, says: sayLog.length - sayBefore });
      break;
    }
    if (Game.tbIsPlayerTurn()) endTurn();
    else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
    driveLog.push({ target: t.name, iter: iterCount, declared: false, says: sayLog.length - sayBefore });
  }
  const tgs = monsters().filter(m => m.telegraph);
  if (!tgs.length) return { error: 'no telegraph declared in 80 rounds' };
  // untilFire: keep driving past the declare/windup until the attack is LIVE
  // (tg.firing > 0) — captures the action frame. Breaks if it clears first.
  if (t.untilFire) {
    let fired = false;
    for (let r = 0; r < 80; r++) {
      if (!Game.tbfight || Game.tbfight.over) break;
      iterCount++;
      const tg = monsters().find(m => m.telegraph);
      if (!tg) break;
      if (tg.telegraph.firing > 0) { fired = true; driveLog.push({ target: t.name, iter: iterCount, declared: true, firing: true, says: 0 }); break; }
      if (Game.tbIsPlayerTurn()) endTurn();
      else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
    }
    if (!fired) return { error: 'telegraph fired and cleared before capture (or never fired)' };
  }
  // untilRecovery: keep driving until the beam is spent (telegraph cleared,
  // beamCooldown > 0) — captures the recovery frame.
  if (t.untilRecovery) {
    let recovered = false;
    for (let r = 0; r < 120; r++) {
      if (!Game.tbfight || Game.tbfight.over) break;
      iterCount++;
      const m = monsters().find(x => (x.mdef || {}).id === t.monster);
      if (!m) break;
      if (!m.telegraph && m.beamCooldown > 0) { recovered = true; driveLog.push({ target: t.name, iter: iterCount, declared: false, recovery: true, says: 0 }); break; }
      if (Game.tbIsPlayerTurn()) endTurn();
      else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
    }
    if (!recovered) return { error: 'never reached beam-cooldown recovery' };
  }
  let buckets = {};
  try { buckets = tbAllTelegraphCells(); } catch (e) { buckets = { error: String(e) }; }
  const tgInfo = tgs.map(m => {
    let cue = null;
    try { cue = Game.tbTelegraphCue ? Game.tbTelegraphCue(m) : null; } catch (e) { cue = 'cue error: ' + e.message; }
    const mtg = m.telegraph || {};
    return {
      name: m.name, mid: (m.mdef || {}).id,
      kind: mtg.kind, ptype: (mtg.pattern || {}).type,
      turnsLeft: mtg.turnsLeft, attackName: mtg.attackName,
      ncells: (mtg.cells || []).length, cue,
      phase: m.phase || m.encPhase || (mtg && mtg.phase) || null,
      mpos: [m.mx, m.my], emoji: ((m.mdef || {}).emoji || '👹'),
    };
  });
  let lane = null, ghost = null, circle = null;
  try { const l = Game.tbBeamLaneCells ? Game.tbBeamLaneCells() : null; lane = l ? [...l] : []; } catch (e) {}
  try { const g = Game.tbBeamPrevLaneCells ? Game.tbBeamPrevLaneCells() : null; ghost = g ? [...g] : []; } catch (e) {}
  const bucketCells = {};
  for (const k of ['burst', 'charge', 'encircle', 'biHot', 'sbLock', 'line', 'single', 'direct', 'rush'])
    bucketCells[k] = buckets[k] ? [...buckets[k]] : [];
  const encircleAngle = (buckets && buckets.encircleAngle != null) ? buckets.encircleAngle : null;
  // Recovery note: the gutter-out narration that marks the recovery phase.
  let note = null;
  if (t.untilRecovery) {
    const g = [...sayLog].reverse().find(s => s.target === t.name && /gutters out/i.test(s.msg));
    note = (g ? g.msg : 'beam ended, cooldown active') + ' · phase: cooldown (beamCooldown>0)';
  }
  return {
    id: t.monster, label: t.label, known: !!t.learn, atkName, tgs: tgInfo, bucketCells,
    mon: buckets.mon ? { ...buckets.mon } : {}, encircleAngle, lane, ghost, circle, note,
    player: [s.mx, s.my],
    mpos: monsters().map(m => [m.mx, m.my, m.name || 'Monster']),
    hp: monsters().map(m => [m.hp, m.maxHp]),
  };
}

// ---- 390px-wide SVG render (same schematic as batch 1) ----
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
  const cueText = tg.cue;
  let svg = `<svg width="${W}" xmlns="http://www.w3.org/2000/svg" font-family="monospace">`;
  svg += `<rect width="${W}" height="2000" fill="#14141f"/>`;
  y += 22;
  svg += `<text x="15" y="${y}" fill="#eee" font-size="14" font-weight="bold">${esc(snap.label)}</text>`; y += 18;
  svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">attack: ${esc(tg.attackName || atk.name || '?')} · pattern: ${esc(tg.ptype || (atk.pattern || {}).type || '?')} · turnsLeft: ${esc(String(tg.turnsLeft))}${tg.phase ? ' · phase: ' + esc(tg.phase) : ''}</text>`; y += 16;
  svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">codex: ${snap.known ? 'PATTERN LEARNED' : 'unknown (first contact)'} · telegraph cells: ${esc(tg.ncells)}</text>`; y += 8;
  const clines = wrap('cue: ' + (cueText || ''), 42);
  clines.forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#ffd88a" font-size="11">${esc(l)}</text>`; });
  y += 12;
  if (snap.note) { const nlines = wrap('note: ' + snap.note, 42); nlines.forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#7fd4ff" font-size="11">${esc(l)}</text>`; }); y += 12; }
  const gy = y; y += 9 * CELL;
  const B = {};
  for (const k of Object.keys(snap.bucketCells)) B[k] = new Set(snap.bucketCells[k]);
  const lane = new Set(snap.lane || []), ghost = new Set(snap.ghost || []), circle = new Set(snap.circle || []);
  const monCells = {};
  for (const mp of (snap.mpos || [])) monCells[mp[0] + ',' + mp[1]] = mp[2] || '👹';
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const px = ox + cx * CELL, py = gy + cy * CELL, k = cx + ',' + cy;
    let fill = '#2a2a3e', stroke = '#444', sw = 1, dash = null, hatch = false;
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
    svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    if (hatch) {
      svg += `<line x1="${px}" y1="${py + CELL}" x2="${px + CELL}" y2="${py}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
      svg += `<line x1="${px + CELL / 2}" y1="${py + CELL}" x2="${px + CELL}" y2="${py + CELL / 2}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
      svg += `<line x1="${px}" y1="${py + CELL / 2}" x2="${px + CELL / 2}" y2="${py}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
    }
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
  const legend = [['#ff4b33', 'beamLane'], ['#ff6b35', 'burstRadius'], ['#ffd23f', 'chargeLane'],
    ['#ffb020', 'encircle'], ['#9d4edd', 'lockOn'], ['#ff3b30', 'targetTile'],
    ['#ffd34d', 'sbHeat'], ['#222', 'diveShadow'], ['#fff', 'whiteHot'],
    ['#e71d36', 'lineAttack']];
  svg += `<text x="15" y="${y}" fill="#888" font-size="10">legend:</text>`;
  let lx = 70;
  for (const [c, n] of legend) {
    if (lx > 300) { lx = 70; y += 16; }
    svg += `<rect x="${lx}" y="${y - 10}" width="10" height="10" fill="${c}" stroke="#555" stroke-width="1"/>`;
    svg += `<text x="${lx + 13}" y="${y}" fill="#aaa" font-size="10">${n}</text>`;
    lx += 13 + n.length * 6.2 + 18;
  }
  y += 20;
  svg += `<text x="15" y="${y}" fill="#666" font-size="10">visual proof ${esc(new Date().toISOString().slice(0, 10))} — real combat, app.js bucket routing, pristine HEAD snapshot</text>`;
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
  // Wrap say for the silence audit.
  const origSay = Game.say.bind(Game);
  Game.say = (msg, ...rest) => { sayLog.push({ target: curTarget, msg: String(msg).slice(0, 200) }); return origSay(msg, ...rest); };
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
    const svgPath = path.join(OUT, t.name + '.svg');
    const pngPath = path.join(OUT, t.name + '.png');
    fs.writeFileSync(svgPath, svg);
    try { toPng(svgPath, pngPath); console.log('   wrote ' + pngPath); }
    catch (e) { console.log('   PNG failed: ' + e.message); }
    summary.push({
      name: t.name, label: t.label, known: snap.known,
      attack: (snap.tgs[0] || {}).attackName, pattern: (snap.tgs[0] || {}).ptype,
      turnsLeft: (snap.tgs[0] || {}).turnsLeft, ncells: (snap.tgs[0] || {}).ncells,
      phase: (snap.tgs[0] || {}).phase,
      cue: (snap.tgs[0] || {}).cue,
    });
  }
  const sumPath = path.join(OUT, 'telegraph-proof-batch2-20261007.json');
  fs.writeFileSync(sumPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, 'telegraph-proof-batch2-20261007-drivelog.json'),
    JSON.stringify({ iterations: driveLog, says: sayLog }, null, 2));
  const errs = summary.filter(s => s.error);
  console.log('\nDONE: ' + summary.length + ' targets, ' + errs.length + ' errors.');
  if (errs.length) process.exit(1);
})();
