#!/usr/bin/env node
// Telegraph visual proof (Steve 2026-10-08) — wave-2 monsters + Highbeam Deer.
// READ-ONLY on src/: loads engine/combat.js geometry (S.combat.patternCells —
// the engine's own telegraph-cell math) and monsters.json, then reproduces
// app.js tbAllTelegraphCells bucket routing EXACTLY (base bucket per pattern
// type + W2A_IDS overlays + mpBeam tint + biHot + STYLE_BUCKETS fallthroughs).
// Renders each monster's telegraph as SVG at mobile width (390px), then PNG
// via cairosvg. Assumes pattern LEARNED (codex) — unknown patterns render NO
// telegraph at all (Steve 2026-10-05: "They don't show up.").

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'evidence', '2026-10-08', 'telegraphs');

// Load ONLY the combat geometry helper (read-only, no src edits).
eval(fs.readFileSync(path.join(ROOT, 'src/js/engine/combat.js'), 'utf8'));
const patternCells = (globalThis.Scattering && globalThis.Scattering.combat)
  ? globalThis.Scattering.combat.patternCells : null;
if (!patternCells) { console.error('FATAL: could not load patternCells'); process.exit(1); }

const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const byId = Object.fromEntries(monsters.map(m => [m.id, m]));

// ---------- scene table ----------
// player at (4,4); monster pos chosen so telegraph geometry is canonical:
// beam/charge aim at player; bursts centered on monster (engine centers
// burst on attacker); direct attacks lock the player's tile; rush = none.
const PX = 4, PY = 4;
const SCENES = [
  { id: 'gallowdeer',       mpos: [4, 0], voice: 'beamLane — harsh red beam sweep (benchmark)' },
  { id: 'mirror_stag',      mpos: [4, 0], voice: 'chargeLane + w2aStag — yellow stripes + mirror-shimmer' },
  { id: 'review_drone',     mpos: [4, 0], voice: 'beamLane + w2aDrone — cyan dotted projection' },
  { id: 'memory_projector', mpos: [4, 0], voice: 'beamLane + mpBeam — warm amber home-light' },
  { id: 'voice_mimic_radio',mpos: [4, 1], voice: 'lockOn + w2aStatic — purple lock, violet ripple' },
  { id: 'bright_idea',      mpos: [4, 2], voice: 'burstRadius — generic orange burst (windup)' },
  { id: 'paparazzo',        mpos: [4, 2], voice: 'burstRadius — burstRadius — exposure style UNMAPPED' },
  { id: 'statickite',       mpos: [4, 2], voice: 'burstRadius — generic orange burst' },
  { id: 'understudy',       mpos: [4, 2], voice: 'lockOn — generic purple direct' },
  { id: 'landlord',         mpos: [6, 4], voice: 'lockOn — generic purple direct' },
  { id: 'heckler',          mpos: [2, 4], voice: 'lockOn — generic purple direct' },
  { id: 'union_rep',        mpos: [5, 5], voice: 'lockOn — generic purple direct' },
  { id: 'moderator',        mpos: [4, 0], voice: 'lockOn — generic purple direct' },
  { id: 'warranty_caller',  mpos: [4, 2], voice: 'NO TELEGRAPH — rush declares nothing by design' },
];

// Replicates app.js tbAllTelegraphCells bucket routing for these scenes.
function routeScene(mdef, scene) {
  const atk = mdef.attacks || mdef.attack;
  const pat = (atk && atk.pattern) || {};
  const ptype = pat.type || 'single';
  const buckets = new Set();       // base buckets
  const overlays = new Set();      // w2a / mpBeam / biHot
  let cells = [];
  const mid = mdef.id;
  if (ptype === 'rush') {
    // rush declares no cells (game.js 25237: hushwolf NO telegraph).
  } else if (ptype === 'direct') {
    buckets.add('direct');
    cells = [{ cx: PX, cy: PY }]; // tg.kind='direct', targetKey=player
  } else {
    const [mx, my] = scene.mpos;
    cells = patternCells(pat, mx, my, PX, PY);
    if (ptype === 'beam') buckets.add('beam');
    else if (ptype === 'charge') buckets.add('charge');
    else if (ptype === 'burst') buckets.add('burst');
    else if (ptype === 'line') buckets.add('line');
    else buckets.add('single');
  }
  // W2A_IDS (app.js 13504): mirror_stag, review_drone, camera_swarm, voice_mimic_radio
  const W2A = { mirror_stag: 'w2aStag', review_drone: 'w2aDrone', voice_mimic_radio: 'w2aStatic' };
  if (W2A[mid] && cells.length) overlays.add(W2A[mid]);
  // mpBeam (game.js 21829): memory projector's warm amber film-beam
  if (mid === 'memory_projector' && ptype === 'beam') overlays.add('mpBeam');
  // STYLE_BUCKETS (app.js 13512): bulldozer/pep/swarm/resonant/flash only.
  // mirror_stag 'mirror', bright_idea 'detonation', paparazzo 'exposure' have
  // NO entry -> fall through to the generic bucket (faithful, and a gap).
  return { buckets, overlays, cells, ptype };
}

const EMOJI_FONT = 'Noto Color Emoji';
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function wrapText(text, maxChars, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
    else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, maxLines);
}

const CELL = 36, GRID = 9 * CELL, OX = (390 - GRID) / 2, OY = 108;

// SVG defs for the game's CSS textures.
const DEFS = `
<defs>
  <pattern id="chargeStripes" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)">
    <rect width="9" height="9" fill="rgba(255,210,63,0.10)"/>
    <rect width="4.5" height="9" fill="rgba(255,210,63,0.25)"/>
  </pattern>
  <linearGradient id="stagShimmer" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="rgba(191,233,255,0.30)"/>
    <stop offset="0.5" stop-color="rgba(191,233,255,0.08)"/>
    <stop offset="1" stop-color="rgba(191,233,255,0.30)"/>
  </linearGradient>
  <radialGradient id="lockGlow" cx="0.5" cy="0.5" r="0.7">
    <stop offset="0" stop-color="rgba(179,136,255,0.55)"/>
    <stop offset="1" stop-color="rgba(179,136,255,0.0)"/>
  </radialGradient>
</defs>`;

// Per-bucket paint: [fill, outlineColor, outlineWidth]. Overlays REPLACE the
// base bucket's paint exactly as app.js does (!important / inline-style win),
// rather than stacking a second outline on top.
function cellPaint(buckets, overlays) {
  let L = null;
  if (buckets.has('beam')) {
    L = { fill: 'rgba(255,60,40,0.28)', stroke: '#ff3b30', sw: 2 };
  }
  if (buckets.has('charge')) {
    L = { fill: 'url(#chargeStripes)', stroke: '#ffd23f', sw: 2 };
  }
  if (buckets.has('burst')) {
    L = { fill: 'rgba(255,107,53,0.25)', stroke: '#ff6b35', sw: 2 };
  }
  if (buckets.has('line')) {
    L = { fill: 'rgba(231,29,54,0.22)', stroke: '#e71d36', sw: 2 };
  }
  if (buckets.has('single')) {
    L = { fill: 'rgba(255,59,48,0.30)', stroke: '#ff3b30', sw: 3 };
  }
  if (buckets.has('direct')) {
    L = { fill: 'rgba(157,78,221,0.20)', stroke: '#9d4edd', sw: 2, inner: true };
  }
  // Overlays (replace, mirroring app.js !important / inline precedence)
  if (overlays.has('w2aDrone')) {
    L = { fill: 'rgba(77,243,255,0.16)', stroke: '#4df3ff', sw: 2, dotted: true };
  }
  if (overlays.has('mpBeam')) {
    L = { fill: 'rgba(255,190,110,0.16)', stroke: '#ffca7a', sw: 2, innerGlow: true };
  }
  if (overlays.has('w2aStag')) {
    L = { fill: 'url(#stagShimmer)', stroke: '#bfe9ff', sw: 2 };
  }
  if (overlays.has('w2aStatic')) {
    // w2aStatic overrides outline + adds violet glow; purple lockOn bg stays.
    L = { fill: 'rgba(157,78,221,0.20)', stroke: '#b388ff', sw: 2, violetGlow: true };
  }
  if (overlays.has('biHot')) {
    L = { fill: 'rgba(255,255,255,0.42)', stroke: '#ffffff', sw: 3, hot: true };
  }
  return L ? [L] : [];
}

function renderScene(mdef, scene, opts) {
  const atk = mdef.attacks || mdef.attack;
  const r = routeScene(mdef, scene);
  let voiceLabel = scene.voice;
  if (opts && opts.biHot) { r.overlays.add('biHot'); r.buckets.clear(); r.buckets.add('burst'); voiceLabel = 'biHot — white-hot final windup tick'; }
  const cellMap = {};
  for (const c of r.cells) cellMap[c.cx + ',' + c.cy] = true;
  const layers = cellPaint(r.buckets, r.overlays);
  const tgText = (atk && atk.telegraph) || 'No telegraph text.';
  const atkName = (atk && atk.name) || 'attack';
  const title = `${mdef.name} — ${atkName}`;
  const [mx, my] = scene.mpos;

  let s = `<svg width="390" height="740" xmlns="http://www.w3.org/2000/svg">` + DEFS;
  s += `<rect width="390" height="640" fill="#1a1a2e"/>`;
  // Title
  s += `<text x="195" y="30" text-anchor="middle" fill="#eee" font-size="17" font-family="monospace, 'Noto Color Emoji'" font-weight="bold">${esc(title.slice(0, 38))}</text>`;
  s += `<text x="195" y="52" text-anchor="middle" fill="#8af" font-size="11" font-family="monospace, 'Noto Color Emoji'">pattern: ${esc(r.ptype)}${atk && atk.pattern && atk.pattern.windup ? ` (windup ${atk.pattern.windup})` : ''} · learned = shown</text>`;
  s += `<text x="195" y="70" text-anchor="middle" fill="#fd8" font-size="11" font-family="monospace">${esc('voice: ' + voiceLabel)}</text>`;

  // Grid
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const px = OX + x * CELL, py = OY + y * CELL;
    s += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="#2a2a3e" stroke="#444" stroke-width="1"/>`;
    const k = x + ',' + y;
    if (cellMap[k]) {
      for (const L of layers) {
        const pad = 1;
        const dash = L.dotted ? ' stroke-dasharray="3,2"' : '';
        s += `<rect x="${px + pad}" y="${py + pad}" width="${CELL - 2 * pad}" height="${CELL - 2 * pad}" fill="${L.fill}" stroke="${L.stroke}" stroke-width="${L.sw}"${dash}/>`;
        if (L.inner) s += `<rect x="${px + 7}" y="${py + 7}" width="${CELL - 14}" height="${CELL - 14}" fill="none" stroke="${L.stroke}" stroke-width="1" opacity="0.6"/>`;
        if (L.innerGlow) s += `<rect x="${px + 5}" y="${py + 5}" width="${CELL - 10}" height="${CELL - 10}" fill="none" stroke="${L.stroke}" stroke-width="3" opacity="0.45"/>`;
        if (L.violetGlow) s += `<rect x="${px + 4}" y="${py + 4}" width="${CELL - 8}" height="${CELL - 8}" fill="none" stroke="#b388ff" stroke-width="2" opacity="0.55"/>`;
        if (L.hot) s += `<rect x="${px + 6}" y="${py + 6}" width="${CELL - 12}" height="${CELL - 12}" fill="rgba(255,255,255,0.95)" opacity="0.5"/>`;
      }
    }
  }

  // Tokens: monster + player
  const mpx = OX + mx * CELL + CELL / 2, mpy = OY + my * CELL + CELL / 2;
  s += `<text x="${mpx}" y="${mpy + 10}" text-anchor="middle" font-size="26" font-family="${EMOJI_FONT}">${mdef.emoji || '👹'}</text>`;
  const ppx = OX + PX * CELL + CELL / 2, ppy = OY + PY * CELL + CELL / 2;
  s += `<text x="${ppx}" y="${ppy + 10}" text-anchor="middle" font-size="26" font-family="${EMOJI_FONT}">🧍</text>`;

  // Bottom: telegraph text + legend
  let ty = OY + GRID + 34;
  s += `<text x="20" y="${ty}" fill="#f88" font-size="12" font-family="monospace">⚠ telegraph</text>`;
  const lines = wrapText(tgText, 46, 4);
  lines.forEach((ln, i) => {
    s += `<text x="20" y="${ty + 20 + i * 17}" fill="#aaa" font-size="12" font-family="monospace" font-style="italic">“${esc(ln)}${i === lines.length - 1 ? '”' : ''}</text>`;
  });
  ty += 20 + lines.length * 17 + 14;
  const leg = r.cells.length
    ? `${r.cells.length} telegraph cell${r.cells.length === 1 ? '' : 's'} · grid IS the telegraph`
    : `no grid telegraph — text/audio cue only`;
  s += `<text x="20" y="${ty}" fill="#666" font-size="11" font-family="monospace">${esc(leg)}</text>`;
  s += `<text x="20" y="${ty + 17}" fill="#555" font-size="10" font-family="monospace">mobile scale: 390px</text>`;
  s += `<text x="20" y="${ty + 31}" fill="#555" font-size="10" font-family="monospace">rendered assuming pattern LEARNED (unknown patterns = hidden)</text>`;
  s += `</svg>`;
  return s;
}

fs.mkdirSync(OUT, { recursive: true });
const rendered = [];
for (const scene of SCENES) {
  const mdef = byId[scene.id];
  if (!mdef) { console.error('MISSING def:', scene.id); continue; }
  const svg = renderScene(mdef, scene, null);
  const base = `${scene.id}-telegraph`;
  fs.writeFileSync(path.join(OUT, base + '.svg'), svg);
  rendered.push({ base, scene, mdef });
}
// bright_idea: bonus last-tick white-hot variant
{
  const scene = SCENES.find(s => s.id === 'bright_idea');
  const svg = renderScene(byId.bright_idea, scene, { biHot: true });
  fs.writeFileSync(path.join(OUT, 'bright_idea-telegraph-bihot.svg'), svg);
  rendered.push({ base: 'bright_idea-telegraph-bihot', scene, mdef: byId.bright_idea });
}
console.log(`✅ ${rendered.length} SVGs written to ${OUT}`);
for (const r of rendered) console.log('  -', r.base + '.svg');
