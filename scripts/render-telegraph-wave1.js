#!/usr/bin/env node
// Telegraph VISUAL PROOF pass — wave-1 + remaining monsters (Steve 2026-10-06).
// SCRIPTS ONLY: does not edit any tracked game file.
// Drives REAL combat from debug scenarios, captures REAL telegraphs at declare
// time, and renders the app.js bucket routing (the same logic renderDetail uses)
// as SVG + PNG for visual audit.
// Run: node scripts/render-telegraph-wave1.js
// Output (evidence stays OUT of the repo):
//   ~/workspace/goals/the-scattering-roguelite-survival-game/hidden_files/fleshout-20261006/tele-<id>.{svg,png}
//   .../fleshout-20261006/telegraph-captures-20261006.json
// Also renders the WAVE 1 STYLE VOICES (Steve 2026-10-06): dozeLane, pepBurst,
// swarmHum (+◎ on each declaring mouse), resonantBurst, flashBurst — the
// burstStyle/chargeStyle routing in tbAllTelegraphCells. Pre-routing, those
// buckets are empty and the monsters render their generic fallbacks.
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

// Extract the REAL tbAllTelegraphCells from app.js (same fn renderDetail uses).
const _tbSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8')
  .match(/function tbAllTelegraphCells\(\) \{[\s\S]*?\n  \}\n/)[0]
  .replace(/^function tbAllTelegraphCells/, 'function');
const tbAllTelegraphCells = eval('(' + _tbSrc + ')');

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
}

const TARGETS = [
  { id: 'sunbasker', scenario: 'sunbasker', label: 'Sunbasker' },
  { id: 'hype_horn', scenario: 'motivationalspeaker', label: 'Hype Horn (Motivational Speaker)' },
  { id: 'hummice', scenario: 'hummice', label: 'Hummice' },
  { id: 'mirror_stag', scenario: 'griefcounselor', label: 'Mirror Stag (Grief Counselor)' },
  { id: 'hushwolf', scenario: 'hushpuppy', label: 'Hushwolf pack' },
  { id: 'bulldozer', scenario: 'bulldozer', label: 'Bulldozer' },
  { id: 'review_drone', scenario: 'reviewdrone', label: 'Review Drone (Performance Review)' },
  { id: 'camera_swarm', scenario: 'influencer', label: 'Camera Swarm (Influencer)' },
  { id: 'voice_mimic_radio', scenario: 'static', label: 'Voice Mimic (Static)' },
  { id: 'belltoad', scenario: 'choir', label: 'Belltoad (Choir Toad)' },
  { id: 'glasswing', scenario: 'glasswing', label: 'Glasswing Darter' },
  { id: 'mirrormoth', scenario: 'flashbulb', label: 'Mirrormoth (Flashbulb)' },
];

// RUSH patterns never declare a telegraph — by design ("gives no warning —
// it just moves and hits"; service_mimic: "No telegraph on the rush —
// that's the point"). Nothing can render the rushIndicator bucket with the
// current roster. Record formation + a by-design note instead of erroring.
const RUSH_NO_TELEGRAPH = { hushwolf: 1, service_mimic: 1 };

function captureMonster(t) {
  Game.debugScenario(t.scenario);
  // Sunbasker: the approach pathing can walk it into tree-shade and the fight
  // fizzles ("no sun, no fight"). Proof needs the bask/bite loop — shadeless grid.
  let savedGenDetail = null;
  if (t.id === 'sunbasker') {
    savedGenDetail = Game.genDetail;
    Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  }
  try {
    // Deterministic start: place the monster next to the player and start
    // combat directly (approach RNG made monsterTurn loops flaky).
    const s = Game.state.scholar;
    s.mx = 4; s.my = 4;
    s.monster = { id: t.id, mx: 6, my: 4 };
    try { Game.startCombat(t.id); } catch (e) { return { id: t.id, error: 'startCombat failed: ' + e.message }; }
    if (!Game.tbfight) return { id: t.id, error: 'combat never started' };
    try {
      const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
      monsters().forEach(m => { m.hp = 99999; m.maxHp = 99999; });
    } catch (e) {}
    learn(t.id);
    if (RUSH_NO_TELEGRAPH[t.id]) {
      // Drive a few rounds so pack formation/AI shows, then capture by-design state.
      for (let r = 0; r < 6; r++) {
        if (!Game.tbfight || Game.tbfight.over) break;
        if (Game.tbIsPlayerTurn()) endTurn(); else break;
      }
      const snap = snapTelegraph(t);
      snap.noTelegraphByDesign = true;
      return snap;
    }
    let snap = null;
    for (let r = 0; r < 60 && !snap; r++) {
      if (!Game.tbfight || Game.tbfight.over) break;
      const tgs = monsters().filter(m => m.telegraph);
      if (tgs.length) { snap = snapTelegraph(t); break; }
      if (Game.tbIsPlayerTurn()) endTurn();
      else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
    }
    if (!snap) return { id: t.id, error: 'no telegraph declared in 60 rounds' };
    return snap;
  } finally {
    if (savedGenDetail) Game.genDetail = savedGenDetail;
  }
}

function snapTelegraph(t) {
  let buckets = {};
  try { buckets = tbAllTelegraphCells(); } catch (e) { buckets = { error: String(e) }; }
  const tgs = monsters().filter(m => m.telegraph).map(m => {
    let cue = null;
    try { cue = Game.tbTelegraphCue ? Game.tbTelegraphCue(m) : null; } catch (e) {}
    return {
      name: m.name, mid: (m.mdef || {}).id,
      kind: m.telegraph.kind, ptype: (m.telegraph.pattern || {}).type,
      turnsLeft: m.telegraph.turnsLeft, attackName: m.telegraph.attackName,
      ncells: (m.telegraph.cells || []).length, cue,
      mpos: [m.mx, m.my],
    };
  });
  let gwTrap = null, circle = null, lane = null, ghost = null, live = false, source = null, halo = null;
  try { gwTrap = Game.glasswingTrapCells ? Game.glasswingTrapCells() : null; } catch (e) {}
  try { const c = Game.beastCircleKeys ? Game.beastCircleKeys() : null; circle = c ? [...c] : null; } catch (e) {}
  try { const l = Game.tbBeamLaneCells ? Game.tbBeamLaneCells() : null; lane = l ? [...l] : null; } catch (e) {}
  try { const g = Game.tbBeamPrevLaneCells ? Game.tbBeamPrevLaneCells() : null; ghost = g ? [...g] : null; } catch (e) {}
  try { live = !!(Game.tbBeamIsFiring && Game.tbBeamIsFiring()); } catch (e) {}
  try { source = Game.tbBeamSourceCell ? Game.tbBeamSourceCell() : null; } catch (e) {}
  try { const h = Game.tbBeamHaloCells ? Game.tbBeamHaloCells() : null; halo = h ? [...h] : null; } catch (e) {}
  const bsum = {};
  for (const k of ['burst', 'charge', 'encircle', 'biHot', 'sbLock', 'line', 'single', 'direct', 'dozeLane', 'pepBurst', 'swarmHum', 'resonantBurst', 'flashBurst', 'beam'])
    bsum[k] = buckets[k] ? buckets[k].size : 0;
  bsum.beamCells = lane ? lane.length : 0;
  // WING/BASK overlays (not buckets): sunbasker heat halo + glasswing dive shadow
  let sbHeat = null, gwDive = null;
  try { sbHeat = Game.sbHeatKeys ? Game.sbHeatKeys() : null; } catch (e) {}
  try { gwDive = Game.gwDiveShadow ? Game.gwDiveShadow() : null; } catch (e) {}
  const w2a = [];
  for (const [k, v] of Object.entries(buckets.mon || {})) w2a.push(k + '=' + v);
  const s = Game.state.scholar;
  const snapOut = {
    id: t.id, label: t.label, tgs, buckets: bsum, w2a,
    gwTrap: gwTrap ? { tile: gwTrap.tile, turns: gwTrap.turns, splash: (gwTrap.splash || []).length } : null,
    sbHeat: sbHeat ? { charge: sbHeat.charge, monster: sbHeat.monster, ring: (sbHeat.ring || []).length } : null,
    gwDive: gwDive ? { phase: gwDive.phase, tile: gwDive.tile, turnsLeft: gwDive.turnsLeft, streak: (gwDive.streak || []).length, monster: gwDive.monster } : null,
    circle: circle ? circle.length : 0, beamLive: live, beamSource: source,
    player: [s.mx, s.my], mpos: monsters().map(m => [m.mx, m.my, (m.mdef || {}).emoji || '']),
  };
  snapOut._sbHeatRaw = sbHeat; snapOut._gwDiveRaw = gwDive;
  return snapOut;
}

// ---- SVG rendering: mirrors app.js renderDetail class composition ----
function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function wrapText(s, n) {
  const words = String(s || '').split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > n) { lines.push(cur.trim()); cur = w; }
    else cur = cur + ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, 4);
}

function drawMonsterSnap(snap) {
  const CELL = 40, ox = 15, oy = 170, W = 390;
  const H = oy + 9 * CELL + 90;
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${W}" height="${H}" fill="#1a1a2e"/>`;
  const d = def(snap.id);
  const atk = (d.attack || {});
  svg += `<text x="15" y="22" fill="#eee" font-size="15" font-family="monospace" font-weight="bold">TELEGRAPH PROOF: ${escXml(snap.label)}</text>`;
  svg += `<text x="15" y="42" fill="#aaa" font-size="12" font-family="monospace">attack: ${escXml(atk.name || '?')} · pattern: ${escXml((atk.pattern || {}).type || '?')}${snap.tgs.length ? ` · turnsLeft: ${snap.tgs.map(g => g.turnsLeft).join('/')}` : ''}</text>`;
  const cue = (snap.tgs[0] && snap.tgs[0].cue) || atk.telegraph || '';
  const clines = wrapText('cue: ' + cue, 44);
  clines.forEach((l, i) => { svg += `<text x="15" y="${60 + i * 16}" fill="#ffd88a" font-size="11" font-family="monospace">${escXml(l)}</text>`; });
  if (snap.noTelegraphByDesign) {
    svg += `<text x="15" y="${60 + clines.length * 16 + 16}" fill="#ff8a80" font-size="11" font-family="monospace">NO TELEGRAPH BY DESIGN — rush: it just moves and hits</text>`;
  }
  const bparts = [];
  for (const k of ['burst', 'charge', 'encircle', 'biHot', 'sbLock', 'line', 'single', 'direct', 'dozeLane', 'pepBurst', 'swarmHum', 'resonantBurst', 'flashBurst']) if (snap.buckets[k]) bparts.push(`${k}×${snap.buckets[k]}`);
  if (snap.buckets.beamCells) bparts.push(`telegraphCells×${snap.buckets.beamCells}`); // tbBeamLaneCells — pre-fix this was ALL telegraph cells, not just beams
  if (snap.w2a.length) bparts.push('w2a:' + snap.w2a.join(','));
  if (snap.gwTrap) bparts.push(`gwTrap@${snap.gwTrap.tile ? snap.gwTrap.tile.x + ',' + snap.gwTrap.tile.y : '?'} t${snap.gwTrap.turns}`);
  if (snap.gwDive) bparts.push(`gwDive:${snap.gwDive.phase}${snap.gwDive.tile ? `@${snap.gwDive.tile.x},${snap.gwDive.tile.y}` : ''}${snap.gwDive.turnsLeft !== undefined ? ` tl${snap.gwDive.turnsLeft}` : ''}`);
  if (snap.sbHeat) bparts.push(`sbHeat:charge${snap.sbHeat.charge}${snap.sbHeat.ring ? ` ring×${snap.sbHeat.ring}` : ''}`);
  if (snap.circle) bparts.push(`circleRing×${snap.circle}`);
  svg += `<text x="15" y="${60 + clines.length * 16 + 14}" fill="#7fd4ff" font-size="11" font-family="monospace">buckets: ${escXml(bparts.join('  ') || '(none — telegraph has no cells or direct)')}</text>`;

  const pxy = snap.player;
  const monCells = {};
  for (const mp of (snap.mpos || [])) monCells[mp[0] + ',' + mp[1]] = mp[2] || '👹';
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const px = ox + cx * CELL, py = oy + cy * CELL;
    const k = cx + ',' + cy;
    let fill = '#2a2a3e', stroke = '#444', sw = 1, dash = null, arrow = null, arrowColor = '#ffb020', hatch = false;
    let dozeHatch = false, pepRings = false, swarmDots = false, resRings = false, pepNote = false;
    const has = (set) => set && set.has(k);
    const B = {};
    // beam lane (from game.js producers, like app.js)
    // NOTE: buckets.beam is always empty (app.js skips beam cells in buckets); lane comes via tbBeamLaneCells.
    if (snap._lane && snap._lane.has(k)) { fill = 'rgba(255,80,60,.35)'; stroke = '#ff4b33'; sw = 2; }
    if (snap._ghost && snap._ghost.has(k)) { fill = '#3a3a4a'; }
    if (has(bucketsOf(snap, 'burst'))) { fill = 'rgba(255,107,53,.25)'; stroke = '#ff6b35'; sw = 2; }
    if (has(bucketsOf(snap, 'charge'))) { fill = 'rgba(255,210,63,.25)'; stroke = '#ffd23f'; sw = 2; hatch = true; }
    if (has(bucketsOf(snap, 'encircle'))) { fill = 'rgba(255,176,32,.18)'; stroke = '#ffb020'; sw = 2; arrow = snap.encircleAngle || 0; }
    if (has(bucketsOf(snap, 'biHot'))) { fill = 'rgba(255,255,255,.42)'; stroke = '#ffffff'; sw = 3; }
    if (has(bucketsOf(snap, 'sbLock'))) { fill = 'rgba(255,211,77,.28)'; stroke = '#ffd34d'; sw = 2; }
    if (has(bucketsOf(snap, 'line'))) { fill = 'rgba(231,29,54,.22)'; stroke = '#e71d36'; sw = 2; }
    if (has(bucketsOf(snap, 'single'))) { fill = 'rgba(255,59,48,.30)'; stroke = '#ff3b30'; sw = 3; }
    if (has(bucketsOf(snap, 'direct'))) { fill = 'rgba(157,78,221,.20)'; stroke = '#9d4edd'; sw = 2; }
    // WAVE 1 STYLE VOICES (Steve 2026-10-06): mirrors the main.css classes.
    if (has(bucketsOf(snap, 'dozeLane'))) { fill = 'rgba(150,100,50,.38)'; stroke = '#8a5a2b'; sw = 2; dozeHatch = true; arrow = snap.dozeAngle || 0; arrowColor = '#c98a3d'; }
    if (has(bucketsOf(snap, 'pepBurst'))) { fill = 'rgba(255,45,149,.25)'; stroke = '#ff2d95'; sw = 2; pepRings = true; pepNote = true; }
    if (has(bucketsOf(snap, 'swarmHum'))) { fill = 'rgba(140,140,160,.28)'; stroke = '#d8d8e4'; sw = 2; dash = '2,2'; swarmDots = true; }
    if (has(bucketsOf(snap, 'resonantBurst'))) { fill = 'rgba(57,211,83,.22)'; stroke = '#39d353'; sw = 2; resRings = true; }
    if (has(bucketsOf(snap, 'flashBurst'))) { fill = 'rgba(232,244,255,.35)'; stroke = '#e8f4ff'; sw = 2; }
    const w2a = (snap._mon || {})[k];
    if (w2a === 'mirror_stag') { fill = 'rgba(191,233,255,.30)'; stroke = '#bfe9ff'; sw = 2; }
    if (w2a === 'review_drone') { fill = 'rgba(77,243,255,.16)'; stroke = '#4df3ff'; sw = 2; dash = '4,3'; }
    if (w2a === 'camera_swarm') { fill = 'rgba(255,255,255,.30)'; stroke = '#ffffff'; sw = 2; }
    if (w2a === 'voice_mimic_radio') { fill = 'rgba(179,136,255,.30)'; stroke = '#b388ff'; sw = 2; }
    if (snap.gwTrap && snap.gwTrap.tile && snap.gwTrap.tile.x === cx && snap.gwTrap.tile.y === cy) {
      const dark = [0.22, 0.42, 0.68][Math.min(3, Math.max(1, snap.gwTrap.turns || 1)) - 1];
      fill = `rgba(10,10,20,${dark})`; stroke = '#000'; sw = 2;
    }
    if (snap._circle && snap._circle.has(k) && fill === '#2a2a3e') { fill = 'rgba(255,176,32,.07)'; stroke = '#ffb020'; sw = 2; dash = '3,3'; }
    // WING/BASK overlays (not buckets — real renderDetail overlays)
    let diveMarker = false;
    const _sb = snap._sbHeatRaw;
    if (_sb && _sb.monster && cx === _sb.monster.x && cy === _sb.monster.y) {
      const _ch = Math.min(3, _sb.charge || 0);
      fill = `rgba(255,180,60,${[0.10, 0.18, 0.30, 0.45][_ch]})`; stroke = '#ffd34d'; sw = 2;
    }
    if (_sb && _sb.ring && _sb.ring.some(c => c.x === cx && c.y === cy) && fill === '#2a2a3e') {
      fill = 'rgba(255,211,77,.12)'; stroke = '#ffd34d'; sw = 1; dash = '2,2';
    }
    const _gwd = snap._gwDiveRaw;
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
    if (arrow !== null) {
      svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 6}" text-anchor="middle" font-size="16" fill="${arrowColor}" transform="rotate(${arrow} ${px + CELL / 2} ${py + CELL / 2})">➤</text>`;
    }
    if (dozeHatch) {
      // wide brown chevrons — the dust wall, not the deer's tight yellow hatch
      svg += `<line x1="${px}" y1="${py + CELL}" x2="${px + CELL}" y2="${py}" stroke="#8a5a2b" stroke-width="3" opacity="0.55"/>`;
      svg += `<line x1="${px + CELL / 2}" y1="${py + CELL}" x2="${px + CELL}" y2="${py + CELL / 2}" stroke="#8a5a2b" stroke-width="3" opacity="0.55"/>`;
      svg += `<line x1="${px}" y1="${py + CELL / 2}" x2="${px + CELL / 2}" y2="${py}" stroke="#8a5a2b" stroke-width="3" opacity="0.55"/>`;
    }
    if (pepRings) {
      // concentric sound rings + ♪ — the pep-burst's voice made visible
      const cxp = px + CELL / 2, cyp = py + CELL / 2;
      svg += `<circle cx="${cxp}" cy="${cyp}" r="6" fill="none" stroke="#ff2d95" stroke-width="1.6" opacity="0.8"/>`;
      svg += `<circle cx="${cxp}" cy="${cyp}" r="12" fill="none" stroke="#ff2d95" stroke-width="1.2" opacity="0.55"/>`;
      svg += `<circle cx="${cxp}" cy="${cyp}" r="18" fill="none" stroke="#ff2d95" stroke-width="1" opacity="0.35"/>`;
    }
    if (pepNote) {
      svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 5}" text-anchor="middle" font-size="13" fill="#ff8cc8">♪</text>`;
    }
    if (swarmDots) {
      // dotted "many small bodies" texture
      for (let dy = 5; dy < CELL; dy += 9) for (let dx = 5; dx < CELL; dx += 9) {
        svg += `<circle cx="${px + dx}" cy="${py + dy}" r="1.6" fill="rgba(240,240,250,.6)"/>`;
      }
    }
    if ((snap._swarmSrc || []).some(s => s.x === cx && s.y === cy)) {
      // ◎ hum ring on each declaring mouse — the hum's throats
      const cxp = px + CELL / 2, cyp = py + CELL / 2;
      svg += `<circle cx="${cxp}" cy="${cyp}" r="10" fill="none" stroke="#e8e8f2" stroke-width="2" opacity="0.9"/>`;
      svg += `<circle cx="${cxp}" cy="${cyp}" r="15" fill="none" stroke="#e8e8f2" stroke-width="1.2" opacity="0.45"/>`;
      svg += `<text x="${cxp}" y="${cyp + 5}" text-anchor="middle" font-size="13" fill="#e8e8f2">◎</text>`;
    }
    if (resRings) {
      // green concentric croak rings — the throat-pulse
      const cxp = px + CELL / 2, cyp = py + CELL / 2;
      svg += `<circle cx="${cxp}" cy="${cyp}" r="6" fill="none" stroke="#39d353" stroke-width="1.8" opacity="0.85"/>`;
      svg += `<circle cx="${cxp}" cy="${cyp}" r="13" fill="none" stroke="#39d353" stroke-width="1.2" opacity="0.5"/>`;
    }
    if (diveMarker) {
      svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 6}" text-anchor="middle" font-size="16" fill="rgba(255,255,255,.9)">▼</text>`;
    }
    let emoji = '';
    if (pxy[0] === cx && pxy[1] === cy) emoji = '🧍';
    else if (monCells[k]) emoji = monCells[k];
    if (emoji) svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 9}" text-anchor="middle" font-size="24">${emoji}</text>`;
  }
  // legend
  const ly = oy + 9 * CELL + 22;
  const legend = [
    ['#ff6b35', 'burstRadius'], ['#ffd23f', 'chargeLane'], ['#ffb020', 'encircle'],
    ['#fff', 'biHot'], ['#e71d36', 'line'], ['#ff3b30', 'targetTile'],
    ['#9d4edd', 'lockOn'], ['#bfe9ff', 'w2aStag'],
    ['#4df3ff', 'w2aDrone'], ['#b388ff', 'w2aStatic'], ['#ffd34d', 'sbLock'],
    ['#8a5a2b', 'dozeLane'], ['#ff2d95', 'pepBurst'], ['#d8d8e4', 'swarmHum'],
    ['#39d353', 'resonantBurst'], ['#e8f4ff', 'flashBurst'],
  ];
  let lx = 15;
  svg += `<text x="15" y="${ly}" fill="#888" font-size="10" font-family="monospace">legend:</text>`;
  lx = 70;
  for (const [c, n] of legend) {
    svg += `<rect x="${lx}" y="${ly - 10}" width="10" height="10" fill="${c}"/>`;
    svg += `<text x="${lx + 13}" y="${ly}" fill="#aaa" font-size="10" font-family="monospace">${n}</text>`;
    lx += 13 + n.length * 6.2 + 18;
    if (lx > 360) break;
  }
  svg += `<text x="15" y="${ly + 20}" fill="#666" font-size="10" font-family="monospace">proof render — mirrors app.js renderDetail bucket routing (real combat, learned pattern)</text>`;
  svg += `</svg>`;
  return { svg, height: H };
}

// helper: rebuild Sets from capture (JSON-safe round trip keeps them as arrays)
function bucketsOf(snap, name) {
  const arr = snap._bucketCells && snap._bucketCells[name];
  return arr ? new Set(arr) : new Set();
}

const ANIMALS = ['timber_rattlesnake', 'striped_skunk', 'muskrat'];

function captureAnimal(id) {
  Game.debugScenario('opossum');
  const s = Game.state.scholar;
  s.animal = { id, mx: 5, my: 4, aware: 0.35, stamina: 1, pstate: 'wary', edgeTurns: 0 };
  const adef = Game.encAnimalDef ? Game.encAnimalDef(id) : null;
  let phase = null, label = null, tell = adef ? adef.tell : null, huntText = adef ? adef.huntText : null;
  try { phase = Game.encPreyPhase ? Game.encPreyPhase(s.animal) : null; } catch (e) {}
  try { label = Game.encAnimalLabel ? Game.encAnimalLabel(s.animal) : null; } catch (e) {}
  return {
    id, name: adef ? adef.name : id, emoji: adef ? adef.emoji : '🐾',
    player: [s.mx, s.my], apos: [s.animal.mx, s.animal.my],
    phase, label, tell, huntText,
  };
}

function drawAnimalSnap(snap) {
  const CELL = 40, ox = 15, oy = 130, W = 390;
  const H = oy + 9 * CELL + 40;
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${W}" height="${H}" fill="#1a1a2e"/>`;
  svg += `<text x="15" y="22" fill="#eee" font-size="15" font-family="monospace" font-weight="bold">ANIMAL PROOF: ${escXml(snap.name)} (${escXml(snap.id)})</text>`;
  svg += `<text x="15" y="42" fill="#aaa" font-size="12" font-family="monospace">phase: ${escXml(snap.phase || '—')} · label: "${escXml(snap.label || '—')}"</text>`;
  wrapText('tell: ' + (snap.tell || ''), 44).forEach((l, i) => {
    svg += `<text x="15" y="${60 + i * 16}" fill="#9fd4a0" font-size="11" font-family="monospace">${escXml(l)}</text>`;
  });
  const badge = ({ wary: '⚠', bolt: '💨', winded: '😮‍💨', playing_dead: '💀', taunt: '👀' })[snap.phase] || '';
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const px = ox + cx * CELL, py = oy + cy * CELL;
    let fill = '#2a2a3e', emoji = '';
    if (snap.player[0] === cx && snap.player[1] === cy) { fill = '#4a4a6e'; emoji = '🧍'; }
    if (snap.apos[0] === cx && snap.apos[1] === cy) { fill = '#4a3a2e'; emoji = snap.emoji; }
    svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="#444" stroke-width="1"/>`;
    if (emoji) {
      svg += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 9}" text-anchor="middle" font-size="24">${emoji}</text>`;
      if (badge && emoji !== '🧍') svg += `<text x="${px + CELL / 2}" y="${py + CELL - 4}" text-anchor="middle" font-size="12">${badge}</text>`;
    }
  }
  svg += `<text x="15" y="${oy + 9 * CELL + 22}" fill="#666" font-size="10" font-family="monospace">animals are world-view entities — no telegraph buckets; threat reads via tell text + prey-phase badge</text>`;
  svg += `</svg>`;
  return { svg, height: H };
}

function toPng(svgPath, pngPath, height) {
  // Chrome --screenshot silently writes nothing in this VM (verified 2026-10-06);
  // cairosvg rasterizes reliably.
  execSync(`python3 -c "import cairosvg; cairosvg.svg2png(url='${svgPath}', write_to='${pngPath}', scale=2)"`, { stdio: 'pipe', timeout: 60000 });
}

(async () => {
  await Game.init();
  const captures = [];
  for (const t of TARGETS) {
    console.log(`== ${t.id} ==`);
    let snap;
    try { snap = captureMonster(t); }
    catch (e) { snap = { id: t.id, error: 'CRASH: ' + e.message }; }
    if (snap.error) {
      console.log('   ERROR: ' + snap.error);
      captures.push({ id: t.id, label: t.label, error: snap.error });
      continue;
    }
    // stash raw bucket cells for the renderer (JSON-safe)
    let buckets = {};
    try { buckets = tbAllTelegraphCells(); } catch (e) {}
    snap._bucketCells = {};
    for (const k of ['burst', 'charge', 'encircle', 'biHot', 'sbLock', 'line', 'single', 'direct', 'dozeLane', 'pepBurst', 'swarmHum', 'resonantBurst', 'flashBurst', 'beam'])
      snap._bucketCells[k] = buckets[k] ? [...buckets[k]] : [];
    snap._mon = buckets.mon ? { ...buckets.mon } : {};
    snap.encircleAngle = buckets.encircleAngle;
    snap.dozeAngle = buckets.dozeAngle;
    snap._swarmSrc = buckets.swarmSrc ? [...buckets.swarmSrc] : [];
    try { const l = Game.tbBeamLaneCells ? Game.tbBeamLaneCells() : null; snap._lane = new Set(l ? [...l] : []); } catch (e) { snap._lane = new Set(); }
    try { const g = Game.tbBeamPrevLaneCells ? Game.tbBeamPrevLaneCells() : null; snap._ghost = new Set(g ? [...g] : []); } catch (e) { snap._ghost = new Set(); }
    try { const c = Game.beastCircleKeys ? Game.beastCircleKeys() : null; snap._circle = new Set(c ? [...c] : []); } catch (e) { snap._circle = new Set(); }
    snap._mon = buckets.mon ? { ...buckets.mon } : {};
    const { svg, height } = drawMonsterSnap(snap);
    const svgPath = path.join(OUT, `tele-${t.id}.svg`);
    const pngPath = path.join(OUT, `tele-${t.id}.png`);
    fs.writeFileSync(svgPath, svg);
    try { toPng(svgPath, pngPath, height); console.log('   wrote ' + pngPath); }
    catch (e) { console.log('   PNG failed: ' + e.message); }
    captures.push({ id: t.id, label: t.label, tgs: snap.tgs, buckets: snap.buckets, w2a: snap.w2a, gwTrap: snap.gwTrap, sbHeat: snap.sbHeat, gwDive: snap.gwDive, cue: snap.tgs[0] && snap.tgs[0].cue, noTelegraphByDesign: !!snap.noTelegraphByDesign });
  }
  for (const id of ANIMALS) {
    console.log(`== animal ${id} ==`);
    let snap;
    try { snap = captureAnimal(id); }
    catch (e) { console.log('   CRASH: ' + e.message); continue; }
    const { svg, height } = drawAnimalSnap(snap);
    const svgPath = path.join(OUT, `tele-animal-${id}.svg`);
    const pngPath = path.join(OUT, `tele-animal-${id}.png`);
    fs.writeFileSync(svgPath, svg);
    try { toPng(svgPath, pngPath, height); console.log('   wrote ' + pngPath); }
    catch (e) { console.log('   PNG failed: ' + e.message); }
    captures.push({ animal: id, name: snap.name, phase: snap.phase, label: snap.label, tell: snap.tell });
  }
  fs.writeFileSync(path.join(OUT, 'telegraph-captures-20261006.json'), JSON.stringify(captures, null, 2));
  console.log('\nDONE. captures: ' + captures.length);
})();
