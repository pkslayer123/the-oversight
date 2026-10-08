#!/usr/bin/env node
// Telegraph AFTER-render (Steve 2026-10-08) — wave-2 telegraph distinctness.
// Replicates the FIXED app.js tbAllTelegraphCells routing (STYLE_BUCKETS
// exposure/detonation + W2A_IDS w2b* voices + biHot precedence + boosted
// w2aStatic) and paints each voice's CSS texture as SVG, rasterized with
// cairosvg at 390px mobile width. Player at (4,4); patterns LEARNED.
// Usage: node scripts/render-telegraphs-after-20261008.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'evidence', '2026-10-08', 'telegraphs');

eval(fs.readFileSync(path.join(ROOT, 'src/js/engine/combat.js'), 'utf8'));
const patternCells = (globalThis.Scattering && globalThis.Scattering.combat)
  ? globalThis.Scattering.combat.patternCells : null;
if (!patternCells) { console.error('FATAL: could not load patternCells'); process.exit(1); }

const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const byId = Object.fromEntries(monsters.map(m => [m.id, m]));

// Verify routing assumptions against the REAL app.js before rendering.
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
for (const s of ['exposure: \'pzFlash\'', 'detonation: \'ideaHeat\'', 'targetSet !== out.biHot']) {
  if (!appSrc.includes(s)) { console.error('FATAL: app.js missing: ' + s); process.exit(1); }
}

const PX = 4, PY = 4;
const SCENES = [
  { id: 'understudy',        mpos: [4, 2], voice: 'w2bUnder — THE MIMIC: dark plum, WHITE dashed outline, ◐ half-face' },
  { id: 'landlord',          mpos: [6, 4], voice: 'w2bLord — EVICTION NOTICE: red caution stripes + §' },
  { id: 'heckler',           mpos: [2, 4], voice: 'w2bHeck — THE TAUNT: jeering hot-pink glow + ‼' },
  { id: 'union_rep',         mpos: [5, 5], voice: 'w2bUnion — GRIEVANCE FILED: ledger blue, ruled like a form' },
  { id: 'moderator',         mpos: [4, 0], voice: 'w2bMod — REMOVAL NOTICE: heavy dark-red stamp + ✕' },
  { id: 'voice_mimic_radio', mpos: [4, 1], voice: 'w2aStatic — VOICE-RIPPLE: violet ripple ring + ≋ glyph (boosted)' },
  { id: 'paparazzo',         mpos: [4, 2], voice: 'pzFlash — EXPOSURE: near-black cell, white strobe, viewfinder brackets' },
  { id: 'bright_idea',       mpos: [4, 2], voice: 'ideaHeat — EUREKA WARM-UP: radial ember glow (windup ticks)' },
  { id: 'statickite',        mpos: [4, 2], voice: 'burstRadius — generic orange burst (unchanged reference)' },
  { id: 'mirror_stag',       mpos: [4, 0], voice: 'w2aStag — mirror-shimmer lane (regression check)' },
  { id: 'review_drone',      mpos: [4, 0], voice: 'w2aDrone — cyan dotted projection (regression check)' },
];

// Fixed routing (mirrors current app.js tbAllTelegraphCells).
function routeScene(mdef, scene, opts) {
  const atk = mdef.attacks || mdef.attack;
  const pat = (atk && atk.pattern) || {};
  const ptype = pat.type || 'single';
  let cells = [], voice = null, base = null;
  if (ptype === 'direct') {
    cells = [{ cx: PX, cy: PY }];
    voice = { understudy: 'w2bUnder', landlord: 'w2bLord', heckler: 'w2bHeck', union_rep: 'w2bUnion', moderator: 'w2bMod', voice_mimic_radio: 'w2aStatic' }[mdef.id] || null;
    base = 'direct';
  } else {
    const [mx, my] = scene.mpos;
    cells = patternCells(pat, mx, my, PX, PY);
    base = ptype;
    if (ptype === 'charge' && pat.chargeStyle === 'mirror') voice = 'w2aStag';
    if (ptype === 'beam' && mdef.id === 'review_drone') voice = 'w2aDrone';
    if (ptype === 'burst' && pat.burstStyle === 'exposure') voice = 'w2bPz';
    if (ptype === 'burst' && pat.burstStyle === 'detonation') voice = 'w2bIdea';
  }
  if (opts && opts.biHot) { voice = 'biHot'; base = 'burst'; }
  return { cells, voice, base, ptype };
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function wrapText(text, maxChars, maxLines) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, maxLines);
}

const CELL = 36, GRID = 9 * CELL, OX = (390 - GRID) / 2, OY = 108;
const DEFS = `
<defs>
  <pattern id="chargeStripes" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)">
    <rect width="9" height="9" fill="rgba(255,210,63,0.10)"/>
    <rect width="4.5" height="9" fill="rgba(255,210,63,0.25)"/>
  </pattern>
  <pattern id="lordStripes" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)">
    <rect width="12" height="12" fill="rgba(20,10,10,0.55)"/>
    <rect width="6" height="12" fill="rgba(255,90,90,0.42)"/>
  </pattern>
  <pattern id="unionRules" patternUnits="userSpaceOnUse" width="8" height="7">
    <rect width="8" height="7" fill="rgba(16,28,68,0.72)"/>
    <rect width="8" height="1" fill="rgba(122,162,255,0.30)"/>
  </pattern>
  <pattern id="kiteStatic" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(115)">
    <rect width="9" height="9" fill="rgba(30,27,75,0.55)"/>
    <rect width="4" height="9" fill="rgba(165,243,252,0.34)"/>
  </pattern>
  <linearGradient id="stagShimmer" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="rgba(191,233,255,0.30)"/>
    <stop offset="0.5" stop-color="rgba(191,233,255,0.08)"/>
    <stop offset="1" stop-color="rgba(191,233,255,0.30)"/>
  </linearGradient>
  <radialGradient id="heckGlow" cx="0.5" cy="0.5" r="0.7">
    <stop offset="0" stop-color="rgba(255,77,157,0.42)"/>
    <stop offset="1" stop-color="rgba(255,77,157,0.05)"/>
  </radialGradient>
  <radialGradient id="ideaEmber" cx="0.5" cy="0.5" r="0.7">
    <stop offset="0" stop-color="rgba(255,220,120,0.55)"/>
    <stop offset="0.55" stop-color="rgba(255,107,53,0.30)"/>
    <stop offset="1" stop-color="rgba(255,107,53,0.12)"/>
  </radialGradient>
</defs>`;

// Per-voice paint: [fill, outline, outlineWidth, dashed?, glyph?, extra?]
// Voices REPLACE the base bucket's paint, mirroring app.js !important precedence.
function voicePaint(r) {
  const v = r.voice;
  if (v === 'w2bUnder') return { fill: 'rgba(30,10,45,0.80)', stroke: '#f5f0ff', sw: 2, dashed: true, glyph: '◐', gfill: '#f5f0ff' };
  if (v === 'w2bLord') return { fill: 'url(#lordStripes)', stroke: '#ff5a5a', sw: 2, glyph: '§', gfill: '#ffd7d7' };
  if (v === 'w2bHeck') return { fill: 'url(#heckGlow)', stroke: '#ff4d9d', sw: 2, glyph: '‼', gfill: '#ffc2dd' };
  if (v === 'w2bUnion') return { fill: 'url(#unionRules)', stroke: '#7aa2ff', sw: 2 };
  if (v === 'w2bMod') return { fill: 'rgba(80,10,10,0.72)', stroke: '#e03131', sw: 3, glyph: '✕', gfill: '#ffb3b3', innerGlow: '#e03131' };
  if (v === 'w2aStatic') return { fill: 'rgba(88,40,140,0.55)', stroke: '#d9a7ff', sw: 3, glyph: '≋', gfill: '#e9cfff', ripple: true, innerGlow: '#d9a7ff' };
  if (v === 'w2bPz') return { fill: 'rgba(8,8,10,0.80)', stroke: '#ffffff', sw: 2, strobe: true, brackets: true };
  if (v === 'w2bIdea') return { fill: 'url(#ideaEmber)', stroke: '#ffb020', sw: 2 };
  if (v === 'w2bKite') return { fill: 'url(#kiteStatic)', stroke: '#a5f3fc', sw: 2, glyph: '↯', gfill: '#d9fbff' };
  if (v === 'w2aStag') return { fill: 'url(#stagShimmer)', stroke: '#bfe9ff', sw: 2 };
  if (v === 'w2aDrone') return { fill: 'rgba(77,243,255,0.16)', stroke: '#4df3ff', sw: 2, dashed: true };
  if (v === 'biHot') return { fill: 'rgba(255,255,255,0.42)', stroke: '#ffffff', sw: 3, hot: true };
  // generic fallthroughs (unchanged references)
  if (r.base === 'burst') return { fill: 'rgba(255,107,53,0.25)', stroke: '#ff6b35', sw: 2 };
  if (r.base === 'direct') return { fill: 'rgba(157,78,221,0.20)', stroke: '#9d4edd', sw: 2, inner: true };
  return null;
}

function renderScene(mdef, scene, opts) {
  const atk = mdef.attacks || mdef.attack;
  const r = routeScene(mdef, scene, opts);
  const L = voicePaint(r);
  const voiceLabel = (opts && opts.biHot) ? 'biHot — white-hot final windup tick' : scene.voice;
  const cellMap = {};
  for (const c of r.cells) cellMap[c.cx + ',' + c.cy] = true;
  const tgText = (atk && atk.telegraph) || 'No telegraph text.';
  const atkName = (atk && atk.name) || 'attack';
  const title = `${mdef.name} — ${atkName}`;
  const [mx, my] = scene.mpos;

  let s = `<svg width="390" height="740" xmlns="http://www.w3.org/2000/svg">` + DEFS;
  s += `<rect width="390" height="740" fill="#1a1a2e"/>`;
  s += `<text x="195" y="30" text-anchor="middle" fill="#eee" font-size="17" font-family="monospace" font-weight="bold">${esc(title.slice(0, 38))}</text>`;
  s += `<text x="195" y="52" text-anchor="middle" fill="#8af" font-size="11" font-family="monospace">pattern: ${esc(r.ptype)} · learned = shown</text>`;
  s += `<text x="195" y="70" text-anchor="middle" fill="#fd8" font-size="11" font-family="monospace">${esc('voice: ' + voiceLabel)}</text>`;

  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const px = OX + x * CELL, py = OY + y * CELL;
    s += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="#2a2a3e" stroke="#444" stroke-width="1"/>`;
    const k = x + ',' + y;
    if (cellMap[k] && L) {
      const pad = 1;
      const dash = L.dashed ? ' stroke-dasharray="4,2"' : '';
      s += `<rect x="${px + pad}" y="${py + pad}" width="${CELL - 2 * pad}" height="${CELL - 2 * pad}" fill="${L.fill}" stroke="${L.stroke}" stroke-width="${L.sw}"${dash}/>`;
      if (L.inner) s += `<rect x="${px + 7}" y="${py + 7}" width="${CELL - 14}" height="${CELL - 14}" fill="none" stroke="${L.stroke}" stroke-width="1" opacity="0.6"/>`;
      if (L.innerGlow) s += `<rect x="${px + 4}" y="${py + 4}" width="${CELL - 8}" height="${CELL - 8}" fill="none" stroke="${L.innerGlow}" stroke-width="2" opacity="0.55"/>`;
      if (L.hot) s += `<rect x="${px + 6}" y="${py + 6}" width="${CELL - 12}" height="${CELL - 12}" fill="rgba(255,255,255,0.95)" opacity="0.5"/>`;
      if (L.ripple) s += `<circle cx="${px + CELL / 2}" cy="${py + CELL / 2}" r="10" fill="none" stroke="#d9a7ff" stroke-width="2" opacity="0.6"/>`;
      if (L.strobe) s += `<rect x="${px + 5}" y="${py + 5}" width="${CELL - 10}" height="${CELL - 10}" fill="rgba(255,255,255,0.85)" opacity="0.55"/>`;
      if (L.brackets) {
        s += `<path d="M ${px + 4} ${py + 12} L ${px + 4} ${py + 4} L ${px + 12} ${py + 4}" fill="none" stroke="#fff" stroke-width="3"/>`;
        s += `<path d="M ${px + CELL - 12} ${py + CELL - 4} L ${px + CELL - 4} ${py + CELL - 4} L ${px + CELL - 4} ${py + CELL - 12}" fill="none" stroke="#fff" stroke-width="3"/>`;
      }
      if (L.glyph) s += `<text x="${px + CELL / 2}" y="${py + CELL / 2 + 6}" text-anchor="middle" font-size="16" font-family="DejaVu Sans, sans-serif" fill="${L.gfill}">${L.glyph}</text>`;
    }
  }

  const mpx = OX + mx * CELL + CELL / 2, mpy = OY + my * CELL + CELL / 2;
  s += `<text x="${mpx}" y="${mpy + 10}" text-anchor="middle" font-size="26" font-family="Noto Color Emoji">${mdef.emoji || '👹'}</text>`;
  const ppx = OX + PX * CELL + CELL / 2, ppy = OY + PY * CELL + CELL / 2;
  s += `<text x="${ppx}" y="${ppy + 10}" text-anchor="middle" font-size="26" font-family="Noto Color Emoji">🧍</text>`;

  let ty = OY + GRID + 34;
  s += `<text x="20" y="${ty}" fill="#f88" font-size="12" font-family="monospace">⚠ telegraph</text>`;
  const lines = wrapText(tgText, 46, 4);
  lines.forEach((ln, i) => {
    s += `<text x="20" y="${ty + 20 + i * 17}" fill="#aaa" font-size="12" font-family="monospace" font-style="italic">“${esc(ln)}${i === lines.length - 1 ? '”' : ''}</text>`;
  });
  ty += 20 + lines.length * 17 + 14;
  s += `<text x="20" y="${ty}" fill="#666" font-size="11" font-family="monospace">${esc(r.cells.length + ' telegraph cells · grid IS the telegraph')}</text>`;
  s += `<text x="20" y="${ty + 17}" fill="#555" font-size="10" font-family="monospace">mobile scale: 390px · AFTER fix · learned = shown</text>`;
  s += `</svg>`;
  return s;
}

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const scene of SCENES) {
  const mdef = byId[scene.id];
  if (!mdef) { console.error('MISSING def:', scene.id); continue; }
  const svg = renderScene(mdef, scene, null);
  const base = `${scene.id}-telegraph-after`;
  const svgPath = path.join(OUT, base + '.svg');
  const pngPath = path.join(OUT, base + '.png');
  fs.writeFileSync(svgPath, svg);
  try {
    execSync(`python3 -c "import cairosvg; cairosvg.svg2png(url='${svgPath}', write_to='${pngPath}')"`, { stdio: 'pipe', timeout: 60000 });
  } catch (e) { console.error('PNG FAILED for', base, e.message); process.exit(1); }
  n++;
  console.log('  -', base + '.svg/.png');
}
{
  const scene = SCENES.find(s => s.id === 'bright_idea');
  const svg = renderScene(byId.bright_idea, scene, { biHot: true });
  const base = 'bright_idea-telegraph-bihot-after';
  const svgPath = path.join(OUT, base + '.svg');
  const pngPath = path.join(OUT, base + '.png');
  fs.writeFileSync(svgPath, svg);
  execSync(`python3 -c "import cairosvg; cairosvg.svg2png(url='${svgPath}', write_to='${pngPath}')"`, { stdio: 'pipe', timeout: 60000 });
  n++;
  console.log('  -', base + '.svg/.png');
}
console.log(`✅ ${n} AFTER renders written to ${OUT}`);
