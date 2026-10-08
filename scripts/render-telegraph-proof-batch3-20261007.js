#!/usr/bin/env node
// Telegraph VISUAL PROOF — batch 3 (Steve 2026-10-07).
// Covers HEAD monsters that lack a known/unknown proof PAIR:
//   nevermore (no proof at all), nightcourt (no proof at all),
//   bulldozer (learned-only single), mirrormoth (learned-only single).
// lockpick_raccoon is EXCLUDED: tbLockpickTurn never declares a grid
// telegraph (theft loop; its existing single is formation-only).
// SCRIPTS ONLY: does not edit any tracked game file.
//
// Engine is loaded from a pristine `git archive HEAD` snapshot (env VPROOT),
// never the dirty worktree. Output (env VPOUT, default repo
// evidence/2026-10-07/telegraphs): tg-<id>-known/unknown.{svg,png}.
// Headless Chrome hangs in this VM; drives REAL combat in node, captures REAL
// telegraphs at declare time via the same bucket routing renderDetail uses
// (tbAllTelegraphCells extracted from app.js), rasterizes with cairosvg.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.env.VPROOT || path.join(__dirname, '..');
const OUT = process.env.VPOUT || path.join(path.join(__dirname, '..'), 'evidence', '2026-10-07', 'telegraphs');
fs.mkdirSync(OUT, { recursive: true });

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

// FULL production module list, index.html order, minus DOM-only
// (app.js, sprites.js, tile-scenes.js, move-anim.js). window stubbed for the
// eval phase only (equipment.js needs window at load), deleted before playing
// so combat takes the sync path (standing lesson 2026-10-06).
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
 // drama.js excluded: touches `document` at load-time (DOM-only side effect),
// cannot run in the node harness. All telegraph/declarations live elsewhere.
delete global.window;
const Game = globalThis.Scattering.Game;

// REAL bucket routing, extracted from app.js (same fn renderDetail uses).
const _tbSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8')
  .match(/function tbAllTelegraphCells\(\) \{[\s\S]*?\n  \}\n/)[0]
  .replace(/^function tbAllTelegraphCells/, 'function');
const tbAllTelegraphCells = eval('(' + _tbSrc + ')');

const TARGETS = [
  { name: 'tg-nevermore-unknown', id: 'nevermore', scenario: 'nevermore', learn: false,
    label: 'Nevermore — STRAFE declare (line lane), first contact' },
  { name: 'tg-nevermore-known', id: 'nevermore', scenario: 'nevermore', learn: true,
    label: 'Nevermore — STRAFE declare (line lane), pattern learned' },
  { name: 'tg-nightcourt-unknown', id: 'nightcourt', scenario: 'nightcourt', learn: false,
    label: 'Night Court — DIVE declare (single moon-shadow tile), first contact' },
  { name: 'tg-nightcourt-known', id: 'nightcourt', scenario: 'nightcourt', learn: true,
    label: 'Night Court — DIVE declare (single moon-shadow tile), pattern learned' },
  { name: 'tg-bulldozer-unknown', id: 'bulldozer', scenario: 'bulldozer', learn: false,
    label: 'Bulldozer — CHARGE declare (charge lane), first contact' },
  { name: 'tg-bulldozer-known', id: 'bulldozer', scenario: 'bulldozer', learn: true,
    label: 'Bulldozer — CHARGE declare (charge lane), pattern learned' },
  { name: 'tg-mirrormoth-unknown', id: 'mirrormoth', scenario: 'flashbulb', learn: false,
    label: 'Flashbulb Moth — FLASH declare (burst), first contact' },
  { name: 'tg-mirrormoth-known', id: 'mirrormoth', scenario: 'flashbulb', learn: true,
    label: 'Flashbulb Moth — FLASH declare (burst), pattern learned' },
];

function def(id) {
  const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const mlist = Array.isArray(md) ? md : md.monsters;
  return mlist.find(m => m.id === id) || {};
}
function monsters() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive); }
// Strike/wait-free: burn the player's turn without moving (interior tile, no
// edge-flee risk). endTurn-only-if-still-player-turn pattern (standing lesson).
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

const driveLog = [];
const sayLog = [];
let curTarget = null;

function captureMonster(t) {
  Game.debugScenario(t.scenario);
  const s = Game.state.scholar;
  try { Game.startCombat(t.id); } catch (e) { return { error: 'startCombat failed: ' + e.message }; }
  if (!Game.tbfight) return { error: 'combat never started' };
  const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
  monsters().forEach(m => { m.hp = 99999; m.maxHp = 99999; });
  let atkName = null;
  if (t.learn) atkName = learn(t.id);
  curTarget = t.name;
  for (let r = 0; r < 80; r++) {
    if (!Game.tbfight || Game.tbfight.over) break;
    const sayBefore = sayLog.length;
    const tgs = monsters().filter(m => m.telegraph);
    if (tgs.length) {
      driveLog.push({ target: t.name, iter: r + 1, declared: true, says: sayLog.length - sayBefore });
      break;
    }
    if (Game.tbIsPlayerTurn()) endTurn();
    else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
    driveLog.push({ target: t.name, iter: r + 1, declared: false, says: sayLog.length - sayBefore });
  }
  const tgs = monsters().filter(m => m.telegraph);
  if (!tgs.length) return { error: 'no telegraph declared in 80 rounds' };
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
      phase: m.phase || m.encPhase || null,
      mpos: [m.mx, m.my],
    };
  });
  const bucketCells = {};
  for (const k of ['burst', 'charge', 'encircle', 'biHot', 'sbLock', 'line', 'single', 'direct', 'rush',
    'dozeLane', 'pepBurst', 'swarmHum', 'resonantBurst', 'flashBurst', 'beam', 'heronStrike'])
    bucketCells[k] = buckets[k] ? [...buckets[k]] : [];
  return {
    id: t.id, label: t.label, known: !!t.learn, atkName, tgs: tgInfo, bucketCells,
    player: [s.mx, s.my],
    mpos: monsters().map(m => [m.mx, m.my, m.name || 'Monster']),
  };
}

// ---- 390px-wide SVG render (same schematic as batches 1–2) ----
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
  const gy = y; y += 9 * CELL;
  const B = {};
  for (const k of Object.keys(snap.bucketCells)) B[k] = new Set(snap.bucketCells[k]);
  const monCells = {};
  for (const mp of (snap.mpos || [])) monCells[mp[0] + ',' + mp[1]] = mp[2] || '👹';
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const px = ox + cx * CELL, py = gy + cy * CELL, k = cx + ',' + cy;
    let fill = '#2a2a3e', stroke = '#444', sw = 1;
    const has = (set) => set && set.has(k);
    if (has(B.burst)) { fill = 'rgba(255,107,53,.25)'; stroke = '#ff6b35'; sw = 2; }
    if (has(B.charge)) { fill = 'rgba(255,210,63,.25)'; stroke = '#ffd23f'; sw = 2; }
    if (has(B.dozeLane)) { fill = 'rgba(255,210,63,.30)'; stroke = '#ffd23f'; sw = 3; }
    if (has(B.flashBurst)) { fill = 'rgba(255,255,255,.30)'; stroke = '#ffffff'; sw = 2; }
    if (has(B.line)) { fill = 'rgba(231,29,54,.22)'; stroke = '#e71d36'; sw = 2; }
    if (has(B.single)) { fill = 'rgba(255,59,48,.30)'; stroke = '#ff3b30'; sw = 3; }
    svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
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
  const legend = [['#ff6b35', 'burstRadius'], ['#ffd23f', 'chargeLane/dozeLane'],
    ['#e71d36', 'lineAttack'], ['#ff3b30', 'targetTile'], ['#fff', 'flashBurst']];
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
  const origSay = Game.say.bind(Game);
  Game.say = (msg, ...rest) => { sayLog.push({ target: curTarget, msg: String(msg).slice(0, 200) }); return origSay(msg, ...rest); };
  const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const list = only.length ? TARGETS.filter(t => only.includes(t.name)) : TARGETS;
  const summary = [];
  for (const t of list) {
    console.log('== ' + t.label);
    let snap;
    try { snap = captureMonster(t); }
    catch (e) { snap = { error: 'CRASH: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join(' | ') }; }
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
  fs.writeFileSync(path.join(OUT, 'telegraph-proof-batch3-20261007.json'), JSON.stringify(summary, null, 2));
  const errs = summary.filter(s => s.error);
  console.log('\nDONE: ' + summary.length + ' targets, ' + errs.length + ' errors.');
  if (errs.length) process.exit(1);
})();
