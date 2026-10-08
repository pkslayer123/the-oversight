#!/usr/bin/env node
// Telegraph VISUAL PROOF — monsters missing proof as of 2026-10-06 (Steve 2026-10-07):
// belltoad, white_noise_heron, hummice, nightlight_catfish, voice_mimic_radio,
// mirror_stag, review_drone, ducks_in_a_row  (known + unknown knowledge states),
// plus no-telegraph-by-design documentation for hushwolf, speedbump_turtle,
// warranty_caller (rush/ambush never declare — Steve 2026-10-06).
// SCRIPTS ONLY: does not edit any tracked game file.
// Method: same proven pattern as scripts/render-telegraph-wave2new.js —
// drive REAL combat in node (day1 base -> re-seat monster adjacent ->
// Game.startCombat -> drive turns until m.telegraph declares), then render
// the grid through the REAL tbAllTelegraphCells() bucket routing extracted
// verbatim from src/js/app.js, rasterized with cairosvg at 390px wide.
// nevermore / nightcourt / statickite are in committed monsters.json but a
// sibling DELETED them from the worktree file (dirty, must not touch) —
// they are reported as gaps, not rendered.
// Run: node scripts/render-telegraph-20261007.js [only <name>...]
// Output: evidence/2026-10-07/tg-<name>.{svg,png} + telegraph-proof-20261007.json
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'evidence', '2026-10-07');
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

const BUCKETS = ['burst', 'charge', 'encircle', 'biHot', 'sbLock', 'line', 'single',
  'direct', 'dozeLane', 'pepBurst', 'swarmHum', 'resonantBurst', 'flashBurst',
  'beam', 'heronStrike'];

const TARGETS = [
  { name: 'belltoad-unknown', monster: 'belltoad', label: 'Belltoad — Resonant Croak (burst·resonant)', expected: 'resonantBurst' },
  { name: 'belltoad-known', monster: 'belltoad', learn: true, label: 'Belltoad — Resonant Croak (burst·resonant)', expected: 'resonantBurst' },
  { name: 'heron-unknown', monster: 'white_noise_heron', label: 'White-Noise Heron — Spearfish Strike (line)', expected: 'heronStrike' },
  { name: 'heron-known', monster: 'white_noise_heron', learn: true, label: 'White-Noise Heron — Spearfish Strike (line)', expected: 'heronStrike' },
  { name: 'hummice-unknown', monster: 'hummice', label: 'Hummice — Swarm Hum (burst·swarm)', expected: 'swarmHum' },
  { name: 'hummice-known', monster: 'hummice', learn: true, label: 'Hummice — Swarm Hum (burst·swarm)', expected: 'swarmHum' },
  // SPECIAL: phase-based telegraphs that never set m.telegraph — the generic
  // bucket routing is blind to them (code gap). Proof reads the dedicated
  // game surfaces: Game.catfishTellCell() and Game.duckLaneKeys().
  { name: 'catfish-unknown', monster: 'nightlight_catfish', special: 'catfish', scenario: 'nightlight', label: 'Nightlight Catfish — Lure and Grasp (phase tell)', expected: 'catfishTell' },
  { name: 'catfish-known', monster: 'nightlight_catfish', special: 'catfish', scenario: 'nightlight', learn: true, label: 'Nightlight Catfish — Lure and Grasp (phase tell)', expected: 'catfishTell' },
  { name: 'voicemimic-unknown', monster: 'voice_mimic_radio', label: 'Voice Mimic Radio — Distress Call (direct)', expected: 'direct' },
  { name: 'voicemimic-known', monster: 'voice_mimic_radio', learn: true, label: 'Voice Mimic Radio — Distress Call (direct)', expected: 'direct' },
  { name: 'mirrorstag-unknown', monster: 'mirror_stag', label: 'Mirror Stag — Confrontation (charge)', expected: 'charge' },
  { name: 'mirrorstag-known', monster: 'mirror_stag', learn: true, label: 'Mirror Stag — Confrontation (charge)', expected: 'charge' },
  { name: 'reviewdrone-unknown', monster: 'review_drone', label: 'Review Drone — Scored Assessment (beam)', expected: 'beam' },
  { name: 'reviewdrone-known', monster: 'review_drone', learn: true, label: 'Review Drone — Scored Assessment (beam)', expected: 'beam' },
  { name: 'ducks-unknown', monster: 'ducks_in_a_row', special: 'ducks', label: 'Ducks in a Row — Coordinated Nip (aim lane)', expected: 'duckLane' },
  { name: 'ducks-known', monster: 'ducks_in_a_row', special: 'ducks', learn: true, label: 'Ducks in a Row — Coordinated Nip (aim lane)', expected: 'duckLane' },
];

// No telegraph by design: rush/ambush never declare (Steve 2026-10-06).
const NO_TELEGRAPH = [
  { name: 'hushwolf', monster: 'hushwolf', label: 'Hushwolf — Silent Rush (rush)', reason: 'rush never declares; the telegraph is the silence ("The woods go silent — not quiet. Silent.")' },
  { name: 'speedbump', monster: 'speedbump_turtle', label: 'Speedbump Turtle — Snap Decision (ambush)', reason: 'ambush is no-warning by design ("No warning. There never is."); fair tells are the stillness cue + ROCK phase badge + codex knownCue' },
  { name: 'warrantycaller', monster: 'warranty_caller', label: 'Warranty Caller — The Pitch (rush)', reason: 'rush never declares; dialing: THE RUSH — "No telegraph — it just goes."' },
];

// Committed-but-worktree-deleted monsters: blocked by the dirty sibling file.
const BLOCKED = ['nevermore', 'nightcourt', 'statickite'];

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
// hunt driver: close to adjacent, strike (used by the catfish special —
// the still phase only fires when the player is within 3 tiles of the glow).
function huntTurn(target) {
  let guard = 0;
  while (Game.tbIsPlayerTurn() && guard++ < 12) {
    const p = Game.tbFighter('p'); if (!p) return;
    const d = Math.max(Math.abs(target.mx - p.mx), Math.abs(target.my - p.my));
    if (d <= 1) { endTurn(); return; }
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

function captureMonster(t) {
  Game.debugScenario('day1');
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  s.monster = { id: t.monster, mx: 6, my: 4 };
  const openLog = [];
  const origSay = Game.say && Game.say.bind(Game);
  try { Game.startCombat(t.monster); } catch (e) { return { error: 'startCombat failed: ' + e.message }; }
  if (!Game.tbfight) return { error: 'combat never started' };
  const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
  monsters().forEach(m => { m.hp = 99999; m.maxHp = 99999; });
  let atkName = null;
  if (t.learn) atkName = learn(t.monster);
  let rounds = 0, declaredEver = false;
  for (let r = 0; r < 120; r++) {
    rounds = r;
    if (!Game.tbfight || Game.tbfight.over) break;
    const pm = primary(t.monster);
    if (!pm) { return { error: 'primary monster left the fight (died/fled?)' }; }
    if (pm.telegraph) { declaredEver = true; break; }
    if (Game.tbIsPlayerTurn()) endTurn();
    else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
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
  for (const k of BUCKETS) bucketCells[k] = buckets[k] ? [...buckets[k]] : [];
  // BEAM (Steve 2026-10-06): beam cells live in buckets.mon (per-monster
  // identity, w2a CSS classes), not in a beam bucket — fold them back in.
  const monCellKeys = Object.keys(buckets.mon || {}).filter(k => buckets.mon[k] === t.monster);
  const snap = {
    id: t.monster, label: t.label, known: !!t.learn, atkName, tg: tgInfo, bucketCells,
    mon: buckets.mon ? { ...buckets.mon } : {}, monCellKeys, expectedBucket: t.expected,
    encircleAngle: (buckets && buckets.encircleAngle != null) ? buckets.encircleAngle : null,
    player: [s.mx, s.my],
    mpos: monsters().map(m => [m.mx, m.my, m.name || 'Monster']),
    rounds, declaredEver,
  };
  return snap;
}

// SPECIAL capture: phase-based telegraphs that never set m.telegraph.
// catfish: drive the player to the glow until beamPhase 'still'; the tell
// reads through Game.catfishTellCell() (knowledge-gated).
// ducks: wait for the head's line_up beat; the tell reads through
// Game.duckLaneKeys().
function captureSpecial(t) {
  Game.debugScenario(t.scenario || 'day1');
  const s = Game.state.scholar;
  if (t.special === 'ducks') { s.mx = 4; s.my = 4; s.monster = { id: t.monster, mx: 6, my: 4 }; }
  // nightlight scenario seats the catfish itself (water guarantee) — keep it.
  const said = [];
  const origSay = Game.say;
  Game.say = function (txt) { said.push(String(txt)); return origSay.call(this, txt); };
  try { Game.startCombat(t.monster); } catch (e) { Game.say = origSay; return { error: 'startCombat failed: ' + e.message }; }
  if (!Game.tbfight) { Game.say = origSay; return { error: 'combat never started' }; }
  const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
  monsters().forEach(m => { m.hp = 99999; m.maxHp = 99999; });
  let atkName = null;
  if (t.learn) atkName = learn(t.monster);
  let rounds = 0, phase = null, specialCells = [], telegraphNull = true, cue = null;
  for (let r = 0; r < 150; r++) {
    rounds = r;
    if (!Game.tbfight || Game.tbfight.over) break;
    const pm = primary(t.monster);
    if (!pm) { Game.say = origSay; return { error: 'primary monster left the fight (fled/despawned?)' }; }
    if (pm.telegraph) telegraphNull = false;
    if (t.special === 'catfish') {
      phase = pm.beamPhase || null;
      if (phase === 'still') break;
      if (Game.tbIsPlayerTurn()) huntTurn(pm);
      else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
    } else if (t.special === 'ducks') {
      const head = monsters().find(x => ((x.mdef || {}).id === t.monster) && x.isHead) || pm;
      phase = head.beamPhase || null;
      if (phase === 'line_up' && head.duckLinedUp) break;
      if (Game.tbIsPlayerTurn()) endTurn();
      else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
    }
  }
  const pm = primary(t.monster);
  if (!pm) { Game.say = origSay; return { error: 'primary monster left the fight' }; }
  if (t.special === 'catfish') {
    phase = pm.beamPhase || null;
    let tell = null;
    try { tell = Game.catfishTellCell ? Game.catfishTellCell() : null; } catch (e) { tell = { error: String(e) }; }
    if (tell && tell.x != null) specialCells = [tell.x + ',' + tell.y];
    const stillLines = said.filter(x => /still|glow|pretty|noticed/i.test(x));
    cue = stillLines.slice(-1)[0] || null;
    if (t.learn) {
      const kc = ((def(t.monster).encounter) || {}).knownCue;
      if (kc) cue = (cue ? cue + ' ' : '') + '[knownCue] ' + kc;
    }
    if (phase !== 'still') { Game.say = origSay; return { error: 'catfish never reached still phase in ' + rounds + ' rounds (phase: ' + phase + ')' }; }
  } else if (t.special === 'ducks') {
    const head = monsters().find(x => ((x.mdef || {}).id === t.monster) && x.isHead) || pm;
    phase = head.beamPhase || null;
    let lane = new Set();
    try { lane = Game.duckLaneKeys ? Game.duckLaneKeys() : new Set(); } catch (e) { lane = new Set(); }
    specialCells = [...lane];
    const lineLines = said.filter(x => /mill|line|aim|march|beak|row/i.test(x));
    cue = lineLines.slice(-2).join(' ') || null;
    if (t.learn) {
      const kc = ((def(t.monster).encounter) || {}).knownCue;
      if (kc) cue = (cue ? cue + ' ' : '') + '[knownCue] ' + kc;
    }
    if (phase !== 'line_up') { Game.say = origSay; return { error: 'ducks never reached line_up in ' + rounds + ' rounds (phase: ' + phase + ')' }; }
  }
  Game.say = origSay;
  return {
    id: t.monster, label: t.label, known: !!t.learn, atkName, special: t.special,
    expectedBucket: t.expected, specialCells, telegraphNull,
    codeGap: 'phase-based telegraph never sets m.telegraph — tbAllTelegraphCells() is blind to it; proof reads the dedicated surface (' +
      (t.special === 'catfish' ? 'Game.catfishTellCell()' : 'Game.duckLaneKeys()') + ')',
    cue, phase, rounds,
    player: [s.mx, s.my],
    mpos: monsters().map(m => [m.mx, m.my, m.name || 'Monster']),
  };
}

// Drive combat for a no-telegraph monster: confirm none ever declares.
function captureNoTelegraph(t) {
  Game.debugScenario('day1');
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  s.monster = { id: t.monster, mx: 5, my: 4 };
  const said = [];
  const origSay = Game.say;
  Game.say = function (txt) { said.push(String(txt)); if (origSay) return origSay.call(this, txt); };
  try { Game.startCombat(t.monster); } catch (e) { Game.say = origSay; return { error: 'startCombat failed: ' + e.message }; }
  Game.say = origSay;
  if (!Game.tbfight) return { error: 'combat never started' };
  const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
  monsters().forEach(m => { m.hp = 99999; m.maxHp = 99999; });
  let rounds = 0, declaredEver = false;
  for (let r = 0; r < 60; r++) {
    rounds = r;
    if (!Game.tbfight || Game.tbfight.over) break;
    const pm = primary(t.monster);
    if (!pm) { return { error: 'primary monster left the fight' }; }
    if (pm.telegraph) { declaredEver = true; break; }
    if (Game.tbIsPlayerTurn()) endTurn();
    else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
  }
  const pm = primary(t.monster);
  return {
    id: t.monster, label: t.label, known: false, noTelegraphByDesign: true,
    reason: t.reason, declaredEver, rounds,
    player: [s.mx, s.my],
    mpos: monsters().map(m => [m.mx, m.my, m.name || 'Monster']),
    openCues: said.filter(x => /silent|quiet|still|warning|moving|breath/i.test(x)).slice(0, 4),
    tg: null,
  };
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function wrap(s, n) {
  const words = String(s || '').split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n) { lines.push(cur.trim()); cur = w; } else cur = cur + ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, 6);
}

// Per-bucket visual voice (extends the wave2new palette).
function bucketStyle(k) {
  const S = {
    burst:        ['rgba(255,107,53,.25)', '#ff6b35', 2, null],
    charge:       ['rgba(255,210,63,.25)', '#ffd23f', 2, 'hatch'],
    encircle:     ['rgba(255,176,32,.18)', '#ffb020', 2, null],
    biHot:        ['rgba(255,255,255,.42)', '#ffffff', 3, null],
    sbLock:       ['rgba(255,211,77,.28)', '#ffd34d', 2, null],
    line:         ['rgba(231,29,54,.22)', '#e71d36', 2, null],
    single:       ['rgba(255,59,48,.30)', '#ff3b30', 3, null],
    direct:       ['rgba(157,78,221,.20)', '#9d4edd', 2, null],
    dozeLane:     ['rgba(201,162,39,.25)', '#c9a227', 2, 'hatch'],
    pepBurst:     ['rgba(255,47,179,.22)', '#ff2fb3', 2, 'dots'],
    swarmHum:     ['rgba(255,123,84,.22)', '#ff7b54', 2, 'dots'],
    resonantBurst:['rgba(57,211,83,.22)', '#39d353', 2, 'rings'],
    flashBurst:   ['rgba(248,249,250,.30)', '#f8f9fa', 3, null],
    beam:         ['rgba(255,45,0,.28)', '#ff2d00', 3, null],
    heronStrike:  ['rgba(232,244,255,.30)', '#e8f4ff', 2, 'dash'],
  };
  return S[k] || ['#2a2a3e', '#444', 1, null];
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
  wrap(snap.label, 40).forEach(l => { y += 16; svg += `<text x="15" y="${y}" fill="#eee" font-size="14" font-weight="bold">${esc(l)}</text>`; });
  y += 2;
  if (snap.noTelegraphByDesign) {
    svg += `<text x="15" y="${y}" fill="#ff9d4e" font-size="11">NO GRID TELEGRAPH — BY DESIGN (pattern never declares)</text>`; y += 16;
    svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">driven ${esc(String(snap.rounds))} rounds, declared: ${snap.declaredEver ? 'YES (UNEXPECTED)' : 'never'}</text>`; y += 8;
    const rlines = wrap('design: ' + snap.reason, 42);
    rlines.forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#ffd88a" font-size="11">${esc(l)}</text>`; });
    y += 4;
    const olines = wrap('combat cues: ' + (snap.openCues.join(' | ') || '—'), 42);
    olines.forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#9fd8ff" font-size="11">${esc(l)}</text>`; });
  } else if (snap.special) {
    const spName = snap.special === 'catfish' ? 'phase tell (Game.catfishTellCell)' : 'aim lane (Game.duckLaneKeys)';
    wrap(`special telegraph: ${spName} · phase: ${snap.phase || '?'}` , 46)
      .forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">${esc(l)}</text>`; });
    wrap(`codex: ${snap.known ? 'PATTERN LEARNED' : 'unknown (first contact)'} · m.telegraph declared: ${snap.telegraphNull ? 'never (code gap)' : 'YES'}`, 46)
      .forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">${esc(l)}</text>`; });
    const clines = wrap('cue: ' + (snap.cue || ''), 42);
    clines.forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#ffd88a" font-size="11">${esc(l)}</text>`; });
  } else {
    const cueText = tg.cue;
    wrap(`attack: ${tg.attackName || atk.name || '?'} · pattern: ${tg.ptype || (atk.pattern || {}).type || '?'} · turnsLeft: ${String(tg.turnsLeft)}${tg.phase ? ' · phase: ' + tg.phase : ''}`, 46)
      .forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">${esc(l)}</text>`; });
    wrap(`codex: ${snap.known ? 'PATTERN LEARNED' : 'unknown (first contact)'} · declared after ${String(snap.rounds)} rounds`, 46)
      .forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#aaa" font-size="11">${esc(l)}</text>`; });
    const clines = wrap('cue: ' + (cueText || ''), 42);
    clines.forEach(l => { y += 15; svg += `<text x="15" y="${y}" fill="#ffd88a" font-size="11">${esc(l)}</text>`; });
  }
  y += 12;
  const gy = y; y += 9 * CELL;
  const B = {};
  for (const k of Object.keys(snap.bucketCells || {})) B[k] = new Set(snap.bucketCells[k]);
  // Beam cells ride in buckets.mon — fold them into the expected bucket set.
  if (snap.expectedBucket && (snap.monCellKeys || []).length) {
    B[snap.expectedBucket] = B[snap.expectedBucket] || new Set();
    for (const k of snap.monCellKeys) B[snap.expectedBucket].add(k);
  }
  // Special telegraph cells (phase-based surfaces, not buckets).
  const SP = new Set(snap.specialCells || []);
  const spStyle = snap.special === 'catfish'
    ? ['rgba(57,211,83,.30)', '#39d353', 3, 'rings']
    : ['rgba(245,233,168,.25)', '#f5e9a8', 2, 'dots'];
  const monCells = {};
  for (const mp of (snap.mpos || [])) monCells[mp[0] + ',' + mp[1]] = mp[2] || '👹';
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const px = ox + cx * CELL, py = gy + cy * CELL, k = cx + ',' + cy;
    let fill = '#2a2a3e', stroke = '#444', sw = 1, deco = null;
    const has = (set) => set && set.has(k);
    for (const b of Object.keys(B)) {
      if (has(B[b])) {
        const st = bucketStyle(b);
        fill = st[0]; stroke = st[1]; sw = st[2]; deco = st[3];
      }
    }
    if (has(SP)) { fill = spStyle[0]; stroke = spStyle[1]; sw = spStyle[2]; deco = spStyle[3]; }
    let dash = null;
    if (deco === 'dash') dash = '5,3';
    if (deco === 'dots') dash = '1,4';
    svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}" stroke-linecap="round"` : ''}/>`;
    if (deco === 'hatch') {
      svg += `<line x1="${px}" y1="${py + CELL}" x2="${px + CELL}" y2="${py}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
      svg += `<line x1="${px + CELL / 2}" y1="${py + CELL}" x2="${px + CELL}" y2="${py + CELL / 2}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
      svg += `<line x1="${px}" y1="${py + CELL / 2}" x2="${px + CELL / 2}" y2="${py}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>`;
    }
    if (deco === 'rings') {
      svg += `<circle cx="${px + CELL / 2}" cy="${py + CELL / 2}" r="10" fill="none" stroke="${stroke}" stroke-width="1.5" opacity="0.7"/>`;
      svg += `<circle cx="${px + CELL / 2}" cy="${py + CELL / 2}" r="16" fill="none" stroke="${stroke}" stroke-width="1" opacity="0.4"/>`;
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
  const legend = [['#ff6b35', 'burst'], ['#39d353', 'resonant'], ['#ff7b54', 'swarmHum'],
    ['#f8f9fa', 'flashBurst'], ['#ff2fb3', 'pepBurst'], ['#ff2d00', 'beam'],
    ['#e8f4ff', 'heronStrike'], ['#ffd23f', 'chargeLane'], ['#9d4edd', 'lockOn(direct)'],
    ['#ff3b30', 'targetTile'], ['#39d353', 'tellCell'], ['#f5e9a8', 'duckLane']];
  svg += `<text x="15" y="${y}" fill="#888" font-size="10">legend:</text>`;
  let lx = 70;
  for (const [c, n] of legend) {
    if (lx > 290) { lx = 70; y += 16; }
    svg += `<rect x="${lx}" y="${y - 10}" width="10" height="10" fill="${c}" stroke="#555" stroke-width="1"/>`;
    svg += `<text x="${lx + 13}" y="${y}" fill="#aaa" font-size="10">${n}</text>`;
    lx += 13 + n.length * 6.2 + 18;
  }
  y += 20;
  svg += `<text x="15" y="${y}" fill="#666" font-size="10">visual proof ${esc(new Date().toISOString().slice(0, 10))} — real combat, app.js bucket routing</text>`;
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
  const onlyN = only.length ? NO_TELEGRAPH.filter(t => only.includes(t.name)) : NO_TELEGRAPH;
  const summary = [];
  for (const t of list) {
    console.log('== ' + t.label);
    let snap;
    try { snap = t.special ? captureSpecial(t) : captureMonster(t); }
    catch (e) { snap = { error: 'CRASH: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n') }; }
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
    if (snap.special) {
      summary.push({
        name: t.name, label: t.label, known: snap.known, monster: t.monster,
        special: snap.special, expectedBucket: t.expected,
        attack: snap.atkName, phase: snap.phase, cue: snap.cue,
        specialCells: snap.specialCells, telegraphNull: snap.telegraphNull,
        codeGap: snap.codeGap, rounds: snap.rounds,
      });
      continue;
    }
    const bucketSizes = {};
    for (const k of Object.keys(snap.bucketCells)) bucketSizes[k] = snap.bucketCells[k].length;
    summary.push({
      name: t.name, label: t.label, known: snap.known, monster: t.monster,
      expectedBucket: t.expected,
      attack: (snap.tg || {}).attackName, kind: (snap.tg || {}).kind, pattern: (snap.tg || {}).ptype,
      turnsLeft: (snap.tg || {}).turnsLeft, phase: (snap.tg || {}).phase,
      cue: (snap.tg || {}).cue,
      bucketSizes, monCellKeys: snap.monCellKeys || [], rounds: snap.rounds,
    });
  }
  for (const t of onlyN) {
    console.log('== ' + t.label + ' (no-telegraph by design)');
    let snap;
    try { snap = captureNoTelegraph(t); }
    catch (e) { snap = { error: 'CRASH: ' + e.message }; }
    if (snap.error) {
      console.log('   ERROR: ' + snap.error);
      summary.push({ name: t.name, label: t.label, error: snap.error });
      continue;
    }
    const svg = render(snap);
    const svgPath = path.join(OUT, 'tg-' + t.name + '-nodesign.svg');
    const pngPath = path.join(OUT, 'tg-' + t.name + '-nodesign.png');
    fs.writeFileSync(svgPath, svg);
    try { toPng(svgPath, pngPath); console.log('   wrote ' + pngPath); }
    catch (e) { console.log('   PNG failed: ' + e.message); }
    summary.push({
      name: t.name, label: t.label, monster: t.monster, noTelegraphByDesign: true,
      reason: t.reason, declaredEver: snap.declaredEver, rounds: snap.rounds,
      openCues: snap.openCues,
    });
  }
  // Blocked by the dirty sibling file: committed data exists, worktree deleted.
  for (const id of BLOCKED) {
    summary.push({
      name: id, label: id, monster: id, blocked: true,
      reason: 'present in committed monsters.json but deleted from the dirty worktree src/data/monsters.json by a sibling (uncommitted) — proof cannot be rendered against the current worktree without touching their file',
    });
  }
  const sumPath = path.join(OUT, 'telegraph-proof-20261007.json');
  fs.writeFileSync(sumPath, JSON.stringify(summary, null, 2));
  const errs = summary.filter(s => s.error);
  console.log('\nDONE: ' + summary.length + ' targets, ' + errs.length + ' errors, ' +
    summary.filter(s => s.noTelegraphByDesign).length + ' by-design, ' +
    summary.filter(s => s.blocked).length + ' blocked.');
  if (errs.length) process.exit(1);
})();
