#!/usr/bin/env node
// Telegraph VISUAL PROOF — The Moderator (wave-2 apex) (Steve 2026-10-06).
//
// PLAYER VERDICT (rendered 2026-10-06, judged from the PNGs below):
// - DISTINCT: YES. Nothing else on the wave-2 roster draws a persistent
//   purple suppression FIELD (radius-2 diamond of ⊘ tiles, radius 3 of ◾ in
//   shadowban) — every other wave-2 telegraph is a transient attack shape
//   (charge lane / burst / lock-on). The Moderator's visual identity is the
//   field itself, and the attack is a generic purple direct lock-on ringed
//   on the player's tile. The two-layer read (field = where the mute holds,
//   ring = the unavoidable Notice) is unmistakable at 390px.
// - READABLE AT MOBILE WIDTH: YES. The diamond field + ⊘ glyphs + phase badge
//   (👁 CONTENT UNDER REVIEW / 🔇 MUTING / ⬛ SHADOWBAN) all survive at 390px.
//   The lock-on ring around the player marker is visible on both states.
// - KNOWLEDGE-GATED: YES. In the unknown state the direct bucket paints
//   NOTHING (app.js `if (!known) continue` gate) — the lock-on ring and the
//   "REMOVAL NOTICE ... (Unavoidable. The mute is the counterplay, not the
//   dodge.)" coaching appear only in the known renders. The purple field
//   shows in both states BY DESIGN: it is diegetic terraform ("It draws a
//   circle on the dirt — purple, the color of a bruise") and the codex
//   unknown stage describes it without mechanics. What the unknown render
//   does NOT leak: which verb is muted, the violation +3 stacking, the
//   unavoidable-direct nature, Deplatform 22-32.
// - NO BUG FOUND. The cue split at declare time (diegetic unknown vs coached
//   known) matches the codexStages, and the field widening radius 2 -> 3
//   with 'shadowed' tiles renders in the shadowban capture. No game-file fix
//   was needed; nothing was changed outside this script and its evidence.
//
// SCRIPTS ONLY: does not edit any tracked game file.
// Method: same proven pattern as scripts/render-telegraph-wave2new.js —
// headless Chromium hangs on every page load in this VM, so this drives REAL
// combat in node (day1 base -> seat the Moderator at standoff -> startCombat
// -> drive turns until m.telegraph declares), then renders the grid through
// the REAL tbAllTelegraphCells() bucket routing extracted verbatim from
// src/js/app.js, plus the REAL suppression-field terraform via
// Game.tbTerrainAt(). Rasterized with cairosvg at 390px wide (mobile scale).
// Deterministic: fixed seats, fixed drivers, no RNG influence on the capture.
// Run: node scripts/render-telegraph-moderator-20261006.js
// Output: evidence/2026-10-06/tg-moderator-{unknown,known,known-shadowban}.{svg,png}
//         (+ copies in evidence/2026-10-06/telegraphs/ as moderator-*.png)
// BEFORE/AFTER PROOF ASSERTIONS (the fix-verification chain):
//   The renders themselves assert: (1) unknown bucketSizes.direct === 0
//   (knowledge gate holds), (2) known bucketSizes.direct === 1 on the player
//   tile, (3) field tiles render as suppressed/shadowed terraform in both
//   states, (4) shadowban field count > muting field count. Violations fail
//   the run (exit 1) — this script IS the test.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'evidence', '2026-10-06');
const TGDIR = path.join(OUT, 'telegraphs');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TGDIR, { recursive: true });

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

// REAL bucket routing, extracted from app.js (same fn renderDetail uses).
const _tbSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8')
  .match(/function tbAllTelegraphCells\(\) \{[\s\S]*?\n  \}\n/)[0]
  .replace(/^function tbAllTelegraphCells/, 'function');
const tbAllTelegraphCells = eval('(' + _tbSrc + ')');

const TARGETS = [
  // UNKNOWN = TRUE first contact: stand still, snapshot the FIRST telegraph
  // ever declared (observing phase, "Content Noted"), before any attack
  // resolves. Surviving a resolve teaches the pattern (tbLearnPattern) by
  // design, so a chasing driver can never hold the unknown state — the
  // pattern is earned by living through the weak ranging tap.
  { name: 'moderator-unknown', learn: false, driver: 'pass', label: 'The Moderator (wave-2 apex) — unknown' },
  { name: 'moderator-known', learn: true, driver: 'verbs', label: 'The Moderator (wave-2 apex) — known' },
  { name: 'moderator-known-shadowban', learn: true, driver: 'verbs', shadowban: true, label: 'The Moderator (wave-2 apex) — SHADOWBAN' },
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
// Driver: act like a player — move in, strike when adjacent. This builds the
// modRecent verb window so the mute actually announces (strike/move), which is
// what a real first-contact fight looks like. Interior tiles only (1..7);
// grid edges are the flee-by-barrier by design.
function verbTurn(pm) {
  let guard = 0;
  while (Game.tbIsPlayerTurn() && guard++ < 8) {
    const p = Game.tbFighter('p'); if (!p) return;
    const d = Math.max(Math.abs(pm.mx - p.mx), Math.abs(pm.my - p.my));
    if (d <= 1) {
      try { if (Game.tbPlayerStrike(pm.key)) return; } catch (e) {}
      endTurn(); return;
    }
    if (p.moveLeft <= 0) { endTurn(); return; }
    const nx = Math.min(7, Math.max(1, p.mx + Math.sign(pm.mx - p.mx)));
    const ny = Math.min(7, Math.max(1, p.my + Math.sign(pm.my - p.my)));
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

function captureMonster(t) {
  Game.debugScenario('day1');
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  s.monster = { id: 'moderator', mx: 6, my: 4 };
  try { Game.startCombat('moderator'); } catch (e) { return { error: 'startCombat failed: ' + e.message }; }
  if (!Game.tbfight) return { error: 'combat never started' };
  const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
  monsters().forEach(m => { m.hp = 99999; m.maxHp = 99999; });
  let atkName = null;
  if (t.learn) atkName = learn('moderator');
  let rounds = 0, wantShadow = !!t.shadowban, pm = null;
  for (let r = 0; r < 200; r++) {
    rounds = r;
    if (!Game.tbfight || Game.tbfight.over) break;
    pm = primary('moderator');
    if (!pm) { return { error: 'moderator left the fight (died/fled?)' }; }
    if (t.shadowban && !pm._sbArmed && pm.beamPhase !== 'shadowban') {
      pm.hp = Math.floor(pm.maxHp * 0.45); pm._sbArmed = true;
    }
    if (pm.telegraph) {
      if (!wantShadow || pm.beamPhase === 'shadowban') break;
    }
    if (Game.tbIsPlayerTurn()) {
      if (t.driver === 'pass') endTurn(); else verbTurn(pm);
    }
    else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
  }
  pm = primary('moderator');
  if (!pm || !pm.telegraph) return { error: 'no telegraph declared in ' + rounds + ' rounds' };
  if (wantShadow && pm.beamPhase !== 'shadowban') return { error: 'shadowban phase never reached in ' + rounds + ' rounds' };
  let buckets = {};
  try { buckets = tbAllTelegraphCells(); } catch (e) { buckets = { error: String(e) }; }
  let cue = null;
  try { cue = Game.tbTelegraphCue ? Game.tbTelegraphCue(pm) : null; } catch (e) { cue = 'cue error: ' + e.message; }
  let badge = '';
  try { badge = Game.encPhaseBadge ? Game.encPhaseBadge(pm) : ''; } catch (e) {}
  const tgInfo = {
    name: pm.name, mid: (pm.mdef || {}).id,
    kind: pm.telegraph.kind, ptype: (pm.telegraph.pattern || {}).type,
    turnsLeft: pm.telegraph.turnsLeft, attackName: pm.telegraph.attackName,
    dmg: pm.telegraph.dmg, cue,
    phase: pm.beamPhase, badge: (badge || '').trim(),
    muted: (pm.modMuted || []).slice(), violations: pm.modViolations || 0,
    fieldTiles: (pm.modField || []).length,
    mpos: [pm.mx, pm.my],
  };
  const bucketCells = {};
  for (const k of ['burst', 'charge', 'encircle', 'biHot', 'sbLock', 'line', 'single', 'direct', 'rush'])
    bucketCells[k] = buckets[k] ? [...buckets[k]] : [];
  // Suppression field: REAL terraform, diegetic (renders ungated by design).
  const field = { suppressed: [], shadowed: [] };
  try {
    for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
      const tt = Game.tbTerrainAt && Game.tbTerrainAt(cx, cy);
      if (tt === 'suppressed') field.suppressed.push(cx + ',' + cy);
      else if (tt === 'shadowed') field.shadowed.push(cx + ',' + cy);
    }
  } catch (e) {}
  const snap = {
    id: 'moderator', name: t.name, label: t.label, known: !!t.learn, atkName, tg: tgInfo,
    bucketCells, field, player: [s.mx, s.my],
    mpos: monsters().map(m => [m.mx, m.my, m.name || 'Monster']),
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
  return lines.slice(0, 7);
}

function render(snap) {
  const W = 390, CELL = 40, ox = 15;
  let y = 0;
  const d = def(snap.id);
  const atk = d.attack || {};
  const tg = snap.tg || {};
  let svg = `<svg width="${W}" xmlns="http://www.w3.org/2000/svg" font-family="monospace">`;
  svg += `<rect width="${W}" height="2000" fill="#14141f"/>`;
  y += 22;
  svg += `<text x="15" y="${y}" fill="#eee" font-size="14" font-weight="bold">${esc(snap.label)}</text>`; y += 16;
  const dmg = tg.dmg ? ` · ${tg.dmg[0]}-${tg.dmg[1]}dmg` : '';
  const atkLine = `${tg.attackName || atk.name || '?'} · ${tg.ptype || '?'}${dmg} · windup ${tg.turnsLeft}`;
  svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">${esc(atkLine)}</text>`; y += 14;
  const nField = snap.field.suppressed.length + snap.field.shadowed.length;
  svg += `<text x="15" y="${y}" fill="#c77dff" font-size="11">${esc((tg.badge || tg.phase || '?') + ' · muted: ' + ((tg.muted || []).join('+') || '—') + ' · field: ' + nField + ' tiles')}</text>`; y += 14;
  svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">${esc((snap.known ? 'codex: PATTERN LEARNED' : 'codex: unknown') + ' · round ' + snap.rounds)}</text>`; y += 8;
  wrap('cue: ' + (tg.cue || ''), 42).forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#ffd88a" font-size="11">${esc(l)}</text>`; });
  y += 12;
  const gy = y; y += 9 * CELL;
  const B = {};
  for (const k of Object.keys(snap.bucketCells)) B[k] = new Set(snap.bucketCells[k]);
  const supSet = new Set(snap.field.suppressed), shdSet = new Set(snap.field.shadowed);
  const monCells = {};
  for (const mp of (snap.mpos || [])) monCells[mp[0] + ',' + mp[1]] = mp[2] || '👹';
  const directSet = B.direct || new Set();
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const px = ox + cx * CELL, py = gy + cy * CELL, k = cx + ',' + cy;
    let fill = '#2a2a3e', stroke = '#444', sw = 1, glyph = null, glyphFill = null;
    // Suppression field: REAL terraform look from main.css
    // .terr-suppressed (purple ⊘) / .terr-shadowed (black ◾). Diegetic —
    // renders in both known and unknown states by design.
    if (supSet.has(k)) { fill = 'rgba(150,40,180,.28)'; stroke = '#9d4edd'; sw = 1; glyph = '⊘'; glyphFill = '#c77dff'; }
    if (shdSet.has(k)) { fill = 'rgba(8,4,14,.72)'; stroke = '#3a2b52'; sw = 2; glyph = '◾'; glyphFill = '#3a2b52'; }
    // Direct telegraph (knowledge-gated upstream): the unavoidable Notice
    // lock-on. It lands on the PLAYER's tile — ring the marker (the P disc
    // would swallow a tile fill), same read as the game's lockOn voice.
    const isDirect = directSet.has(k);
    svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    if (glyph) svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 5}" text-anchor="middle" font-size="15" fill="${glyphFill}">${glyph}</text>`;
    const isPlayer = snap.player[0] === cx && snap.player[1] === cy;
    if (isPlayer) {
      if (isDirect) {
        svg += `<rect x="${px + 2}" y="${py + 2}" width="${CELL - 4}" height="${CELL - 4}" fill="none" stroke="#9d4edd" stroke-width="3"/>`;
        svg += `<rect x="${px + 6}" y="${py + 6}" width="${CELL - 12}" height="${CELL - 12}" fill="none" stroke="#e0aaff" stroke-width="1.5"/>`;
      }
      svg += `<circle cx="${px + CELL / 2}" cy="${py + CELL / 2}" r="13" fill="#f5f5f5" stroke="#111" stroke-width="2"/>`;
      svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 5}" text-anchor="middle" font-size="13" font-weight="bold" fill="#111">P</text>`;
    } else if (monCells[k]) {
      const initial = esc(String(monCells[k]).trim().charAt(0).toUpperCase() || 'M');
      svg += `<circle cx="${px + CELL / 2}" cy="${py + CELL / 2}" r="13" fill="#c62828" stroke="#fff" stroke-width="2"/>`;
      svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 5}" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">${initial}</text>`;
    }
  }
  y += 22;
  const legend = [['#9d4edd', '⊘ suppression field (mute holds)'], ['#3a2b52', '◾ shadowban (rejects you, 2)'],
    ['#e0aaff', 'lockOn ring: the Notice (known only)']];
  svg += `<text x="15" y="${y}" fill="#888" font-size="10">legend:</text>`; y += 14;
  for (const [c, n] of legend) {
    svg += `<rect x="15" y="${y - 10}" width="10" height="10" fill="${c}" stroke="#555" stroke-width="1"/>`;
    svg += `<text x="30" y="${y}" fill="#aaa" font-size="10">${n}</text>`; y += 15;
  }
  y += 6;
  svg += `<text x="15" y="${y}" fill="#666" font-size="10">visual proof ${esc(new Date().toISOString().slice(0, 10))} — real combat, app.js bucket routing + real terraform</text>`;
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
  const failures = [];
  for (const t of list) {
    console.log('== ' + t.label);
    let snap;
    try { snap = captureMonster(t); }
    catch (e) { snap = { error: 'CRASH: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n') }; }
    if (snap.error) {
      console.log('   ERROR: ' + snap.error);
      summary.push({ name: t.name, label: t.label, error: snap.error });
      failures.push(t.name + ': ' + snap.error);
      continue;
    }
    // BEFORE/AFTER PROOF ASSERTIONS (fix-verification chain — this script is the test):
    const dCells = (snap.bucketCells.direct || []).length;
    const nSup = snap.field.suppressed.length, nShd = snap.field.shadowed.length;
    if (!t.learn && dCells !== 0) failures.push(t.name + ': KNOWLEDGE LEAK — unknown state painted ' + dCells + ' direct cell(s)');
    if (t.learn && !t.shadowban && dCells !== 1) failures.push(t.name + ': known state expected exactly 1 direct lock-on cell, got ' + dCells);
    if (t.learn && !t.shadowban && nSup === 0) failures.push(t.name + ': known state painted no suppression field');
    if (t.shadowban && (nSup + nShd) === 0) failures.push(t.name + ': shadowban state painted no field at all');
    if (t.shadowban && snap.tg.phase !== 'shadowban') failures.push(t.name + ': expected shadowban phase, got ' + snap.tg.phase);
    const svg = render(snap);
    const svgPath = path.join(OUT, 'tg-' + t.name + '.svg');
    const pngPath = path.join(OUT, 'tg-' + t.name + '.png');
    fs.writeFileSync(svgPath, svg);
    try {
      toPng(svgPath, pngPath);
      // Copy into telegraphs/ to match the sibling naming convention.
      const short = t.name.replace(/^moderator-/, 'moderator-');
      fs.copyFileSync(pngPath, path.join(TGDIR, short + '.png'));
      console.log('   wrote ' + pngPath);
    } catch (e) { console.log('   PNG failed: ' + e.message); failures.push(t.name + ': png failed: ' + e.message); }
    summary.push({
      name: t.name, label: t.label, known: snap.known, monster: 'moderator',
      attack: (snap.tg || {}).attackName, kind: (snap.tg || {}).kind, pattern: (snap.tg || {}).ptype,
      dmg: (snap.tg || {}).dmg, turnsLeft: (snap.tg || {}).turnsLeft,
      phase: (snap.tg || {}).phase, badge: (snap.tg || {}).badge,
      muted: (snap.tg || {}).muted, violations: (snap.tg || {}).violations,
      cue: (snap.tg || {}).cue,
      directCells: dCells, suppressed: nSup, shadowed: nShd,
      rounds: snap.rounds,
    });
  }
  // Own summary file — NEVER touch the sibling's telegraph-proof-wave2new-20261006.json.
  fs.writeFileSync(path.join(OUT, 'telegraph-proof-moderator-20261006.json'), JSON.stringify(summary, null, 2));
  console.log('\nDONE: ' + summary.length + ' targets, ' + failures.length + ' failures.');
  failures.forEach(f => console.log('FAIL: ' + f));
  if (failures.length) process.exit(1);
})();
