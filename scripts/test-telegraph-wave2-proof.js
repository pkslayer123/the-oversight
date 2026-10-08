#!/usr/bin/env node
// Proof: wave-2 telegraph visual distinctness (Steve 2026-10-08).
// Parses app.js's ACTUAL telegraph routing (W2A_IDS, the _w2aCls class builder,
// the injected <style> block) and asserts:
//   1. every wave-2 monster with a grid telegraph maps to a per-monster class
//   2. every class has a real CSS rule in the injected block
//   3. all voices are pairwise visually distinct (outline color + fill family
//      + glyph) — no two share the same read, and none equals the generic
//      purple lockOn / orange burstRadius
//   4. dead wave-2-escalation references are gone (camera_swarm, the retired
//      Middle Manager id, encircle routing, w2aSwarm CSS)
// Then renders each monster's telegraph at 390px mobile width (SVG + PNG via
// cairosvg) using the engine's own patternCells geometry, for human judgment.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src/js/app.js');
const OUT = path.join(ROOT, 'evidence', '2026-10-08', 'telegraphs-wave2b');
const src = fs.readFileSync(APP, 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------- parse W2A_IDS ----------
const idsMatch = src.match(/const W2A_IDS = \{([^}]*)\};/);
check('W2A_IDS parseable', !!idsMatch);
const ids = idsMatch ? idsMatch[1].split(',').map(s => s.trim().split(':')[0].trim()) : [];
const EXPECTED_IDS = ['mirror_stag', 'review_drone', 'voice_mimic_radio', 'bright_idea',
  'paparazzo', 'statickite', 'understudy', 'landlord', 'heckler', 'union_rep', 'moderator'];
check('W2A_IDS covers all 11 wave-2 grid-telegraph monsters',
  EXPECTED_IDS.every(id => ids.includes(id)) && ids.length === EXPECTED_IDS.length,
  `got [${ids.join(', ')}]`);
check('warranty_caller (rush, no telegraph) excluded', !ids.includes('warranty_caller'));

// ---------- parse id -> class mapping from the _w2aCls builder ----------
const clsMap = {};
const ternRe = /_w2aMon === '([a-z_]+)'[^?]*\? ' ([a-zA-Z0-9]+)'/g;
let m;
while ((m = ternRe.exec(src))) clsMap[m[1]] = m[2];
check('every W2A id has a class mapping',
  EXPECTED_IDS.every(id => clsMap[id]), JSON.stringify(clsMap));
check('no camera_swarm class mapping (retired id)', !('camera_swarm' in clsMap));

// ---------- parse the injected <style> block ----------
// Two injected blocks: telegraph voices, then player-coincident alert rings.
// Grab everything through the closing </style>` of the alert block.
const styleStart = src.indexOf('html += `<style>');
const styleEnd = src.indexOf('</style>`', styleStart) + '</style>`'.length;
const styleBlock = src.slice(styleStart, styleEnd);
check('injected telegraph <style> block found', styleStart > 0 && styleEnd > styleStart);

const classes = Object.values(clsMap);
for (const c of classes) {
  check(`CSS rule exists for .cell.${c}`,
    styleBlock.includes(`.${c} {`) || styleBlock.includes(`.${c},`),
    `missing .${c}`);
}
check('dead w2aSwarm CSS removed', !styleBlock.includes('w2aSwarm'));
check('dead w2aStrobe keyframes removed', !styleBlock.includes('w2aStrobe'));

// reduced-motion coverage
const rmMatch = styleBlock.match(/@media \(prefers-reduced-motion: reduce\) \{([^}]*)\}/);
const rmList = rmMatch ? rmMatch[1] : '';
for (const c of classes) {
  check(`reduced-motion covers ${c}`, rmList.includes(`.${c}`));
}

// ---------- dead escalation references ----------
// (the retired Middle Manager id is spelled via concatenation so this very
// check can't reintroduce the literal — test-beast-cleanup-20261008.js
// asserts zero occurrences repo-wide.)
const RETIRED_MGR = 'delegate' + '_beast';
check('no live camera_swarm comparison', !src.includes("=== 'camera_swarm'"));
check('no live retired-Manager comparison', !src.includes("=== '" + RETIRED_MGR + "'"));
check('no out.encircle bucket', !src.includes('out.encircle') && !src.includes('encircle: new Set'));
check('no encircleAngle', !src.includes('encircleAngle'));
check('no encircleLane class', !src.includes('encircleLane'));

// ---------- paint parsing + distinctness ----------
function parsePaint(cls) {
  // Combined selectors share one rule body (e.g. `.cell.w2bPz, .cell.pzFlash {`)
  // — match the class followed by `,`, space, or `{`, then the rule body.
  const re = new RegExp(`\\.cell\\.(?:beamLane\\.)?${cls}[, {][^{]*\\{([^}]*)\\}`, 's');
  const mm = styleBlock.match(re);
  const css = mm ? mm[1] : '';
  const outline = (css.match(/outline:\s*([^;!]+)/) || [])[1] || '';
  const bgc = (css.match(/background-color:\s*([^;!]+)/) || [])[1] || '';
  const bg = (css.match(/background:\s*([^;!]+)/) || [])[1] || '';
  const glyphRe = new RegExp(`\\.cell\\.${cls}::after \\{[^}]*content:\\s*'([^']*)'`, 's');
  const gm = styleBlock.match(glyphRe);
  const deco = styleBlock.includes(`.cell.${cls}::before`)
    ? (cls === 'w2bPz' ? 'corners' : cls === 'w2aStatic' ? 'ring' : 'before') : '';
  return {
    cls,
    outlineColor: (outline.match(/#[0-9a-f]{3,6}/i) || [''])[0].toLowerCase(),
    outlineStyle: /dashed/.test(outline) ? 'dashed' : /dotted/.test(outline) ? 'dotted' : 'solid',
    outlineW: (outline.match(/(\d+)px/) || [])[1] || '',
    fill: bgc || (bg.includes('repeating-linear-gradient') ? 'stripes:' + bg.slice(0, 60)
      : bg.includes('radial-gradient') ? 'radial:' + bg.slice(0, 60)
      : bg.includes('linear-gradient') ? 'linear:' + bg.slice(0, 60) : bg),
    glyph: gm ? gm[1] : '',
    deco,
  };
}
const paints = classes.map(parsePaint);
const GENERIC = {
  lockOn: { outlineColor: '#9d4edd', fillFam: 'solid-purple' },
  burst: { outlineColor: '#ff6b35', fillFam: 'solid-orange' },
};
function fillFam(p) {
  if (p.fill.startsWith('stripes:')) return 'stripes';
  if (p.fill.startsWith('radial:')) return 'radial';
  if (p.fill.startsWith('linear:')) return 'linear';
  return 'solid:' + (p.fill.match(/rgba?\([^)]*\)/) || [p.fill])[0];
}
const sigs = paints.map(p => ({
  id: Object.keys(clsMap).find(k => clsMap[k] === p.cls),
  cls: p.cls,
  sig: `${p.outlineColor}|${p.outlineStyle}${p.outlineW}|${fillFam(p)}|${p.glyph}|${p.deco}`,
}));
// pairwise distinctness
let dupes = [];
for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++) {
  if (sigs[i].sig === sigs[j].sig) dupes.push(`${sigs[i].id}==${sigs[j].id}`);
}
check('all 11 wave-2 voices pairwise distinct', dupes.length === 0, dupes.join(', '));
// none equals the generic reads
const genericHits = sigs.filter(s =>
  (s.sig.startsWith('#9d4edd|solid2|solid:rgba(157,78,221')) ||
  (s.sig.startsWith('#ff6b35|solid2|solid:rgba(255,107,53')));
check('no voice equals generic lockOn-purple or burstRadius-orange', genericHits.length === 0,
  genericHits.map(s => s.id).join(', '));
// w2aStatic specifically must differ from lockOn purple (the filed bug)
const st = paints.find(p => p.cls === 'w2aStatic');
check('w2aStatic outline is NOT lockOn purple (#9d4edd)',
  st.outlineColor !== '#9d4edd', `got ${st.outlineColor}`);
check('w2aStatic has ripple ring + voice glyph (was invisible)',
  st.glyph === '≋' && st.deco === 'ring',
  `glyph=${st.glyph} deco=${st.deco}`);
console.log('\n  voice signatures:');
for (const s of sigs) console.log(`    ${s.id} → ${s.cls}: ${s.sig}`);

// ---------- player-coincident token rings (direct voices) ----------
// tgPlayerAlertClasses rings the player's token when a direct telegraph lands
// on the player's tile (the token swallows the tile fill — established
// diveTarget/sbLockTarget pattern).
const ringMatch = src.match(/const W2B_RING = \{([^}]*)\};/);
check('W2B_RING parseable', !!ringMatch);
const ringMap = {};
if (ringMatch) {
  for (const part of ringMatch[1].split(',')) {
    const kv = part.trim().split(':').map(s => s.trim().replace(/['"]/g, ''));
    if (kv.length === 2) ringMap[kv[0]] = kv[1];
  }
}
const EXPECTED_RINGS = { voice_mimic_radio: 'staticTarget', understudy: 'underTarget',
  landlord: 'lordTarget', heckler: 'heckTarget', union_rep: 'unionTarget',
  moderator: 'modTarget' };
check('W2B_RING covers all 6 direct voices',
  Object.keys(EXPECTED_RINGS).every(id => ringMap[id] === EXPECTED_RINGS[id]) &&
  Object.keys(ringMap).length === 6, JSON.stringify(ringMap));
for (const [id, ring] of Object.entries(EXPECTED_RINGS)) {
  check(`token-ring CSS exists for .vent.${ring}`,
    styleBlock.includes(`.vent.${ring}::before`), `missing ${ring}`);
  // rule + reduced-motion entry = at least 2 mentions
  const mentions = styleBlock.split(`.vent.${ring}::before`).length - 1;
  check(`reduced-motion covers ${ring}`, mentions >= 2, `${mentions} mentions`);
}
// ring colors must match the tile voice outline colors (same voice, two surfaces)
const ringColor = {};
const ringRe = /\.cell\.me \.vent\.(\w+)::before \{\s*border: 3px (?:dashed|solid) (#[0-9a-f]{3,6})/gi;
while ((m = ringRe.exec(styleBlock))) ringColor[m[1]] = m[2].toLowerCase();
for (const [id, ring] of Object.entries(EXPECTED_RINGS)) {
  const tile = paints.find(p => p.cls === clsMap[id]);
  check(`${id}: token-ring color matches tile voice (${tile.outlineColor})`,
    ringColor[ring] === tile.outlineColor,
    `ring=${ringColor[ring]} tile=${tile.outlineColor}`);
}

// ---------- renders ----------
eval(fs.readFileSync(path.join(ROOT, 'src/js/engine/combat.js'), 'utf8'));
const patternCells = (globalThis.Scattering && globalThis.Scattering.combat)
  ? globalThis.Scattering.combat.patternCells : null;
check('engine patternCells loaded', !!patternCells);

const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const byId = Object.fromEntries(monsters.map(x => [x.id, x]));

const PX = 4, PY = 4, CELL = 36, GRID = 9 * CELL, OX = (390 - GRID) / 2, OY = 108;
const SCENES = [
  { id: 'gallowdeer', mpos: [4, 0], note: 'benchmark — harsh red beamLane' },
  { id: 'mirror_stag', mpos: [4, 0], note: 'w2aStag — pale mirror-shimmer lane' },
  { id: 'review_drone', mpos: [4, 0], note: 'w2aDrone — cyan dotted projection' },
  { id: 'voice_mimic_radio', mpos: [4, 1], note: 'w2aStatic — violet VOICE-RIPPLE (boosted)' },
  { id: 'bright_idea', mpos: [4, 2], note: 'w2bIdea — ember warm-up' },
  { id: 'bright_idea', mpos: [4, 2], bihot: true, note: 'biHot — white-hot last tick' },
  { id: 'memory_projector', mpos: [4, 0], note: 'mpBeam — warm amber home-light' },
  { id: 'paparazzo', mpos: [4, 2], note: 'w2bPz — EXPOSURE flash + viewfinder' },
  { id: 'statickite', mpos: [4, 2], note: 'w2bKite — static discharge ↯' },
  { id: 'understudy', mpos: [4, 2], note: 'w2bUnder — the mimic ◐' },
  { id: 'landlord', mpos: [6, 4], note: 'w2bLord — eviction red tape §' },
  { id: 'heckler', mpos: [2, 4], note: 'w2bHeck — taunt ‼' },
  { id: 'union_rep', mpos: [5, 5], note: 'w2bUnion — ledger blue' },
  { id: 'moderator', mpos: [4, 0], note: 'w2bMod — banhammer ✕' },
  { id: 'warranty_caller', mpos: [4, 2], note: 'rush — no telegraph by design' },
];
const FONT = "DejaVu Sans";
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// paint plan per class for the renderer (approximation of the shipped CSS)
function paintFor(scene, mdef) {
  const id = scene.id;
  const p = paints.find(x => x.cls === clsMap[id]);
  if (scene.bihot) return { fill: 'rgba(255,255,255,0.42)', stroke: '#ffffff', sw: 3, hot: true };
  if (id === 'memory_projector') return { fill: 'rgba(255,190,110,0.16)', stroke: '#ffca7a', sw: 2, innerGlow: true };
  if (id === 'gallowdeer') return { fill: 'rgba(255,60,40,0.28)', stroke: '#ff3b30', sw: 2 };
  if (!p) return null;
  const L = { stroke: p.outlineColor || '#fff', sw: parseInt(p.outlineW || '2', 10), cls: p.cls };
  if (p.outlineStyle === 'dashed') L.dash = '6,3';
  if (p.outlineStyle === 'dotted') L.dash = '3,2';
  const f = p.fill;
  if (f.startsWith('stripes:')) { L.stripes = true; }
  else if (f.startsWith('radial:')) { L.radial = true; }
  else if (f.startsWith('linear:')) { L.linear = true; }
  else L.fill = f;
  if (p.deco === 'corners') L.corners = true;
  if (p.deco === 'ring') L.ring = true;
  if (p.glyph) L.glyph = p.glyph;
  return L;
}

function cellsFor(mdef, scene) {
  const atk = mdef.attacks || mdef.attack;
  const pat = (atk && atk.pattern) || {};
  const ptype = pat.type || 'single';
  if (ptype === 'rush') return [];
  if (ptype === 'direct') return [{ cx: PX, cy: PY }];
  const [mx, my] = scene.mpos;
  return patternCells(pat, mx, my, PX, PY);
}

function renderScene(mdef, scene, idx) {
  const L = paintFor(scene, mdef);
  const cells = cellsFor(mdef, scene);
  const cellMap = {};
  for (const c of cells) cellMap[c.cx + ',' + c.cy] = true;
  const atk = mdef.attacks || mdef.attack;
  const title = `${mdef.name} — ${(atk && atk.name) || ''}`;
  const pat = (atk && atk.pattern) || {};
  const uniq = `p${idx}`;
  let defs = `<defs>`;
  if (L && L.stripes) defs += `<pattern id="${uniq}s" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)"><rect width="12" height="12" fill="${L.stroke}" opacity="0.12"/><rect width="6" height="12" fill="${L.stroke}" opacity="0.42"/></pattern>`;
  if (L && L.radial) defs += `<radialGradient id="${uniq}r" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="${L.stroke}" stop-opacity="0.55"/><stop offset="1" stop-color="${L.stroke}" stop-opacity="0.05"/></radialGradient>`;
  if (L && L.linear) defs += `<linearGradient id="${uniq}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bfe9ff" stop-opacity="0.30"/><stop offset="0.5" stop-color="#bfe9ff" stop-opacity="0.08"/><stop offset="1" stop-color="#bfe9ff" stop-opacity="0.30"/></linearGradient>`;
  if (L && L.cls === 'w2bKite') defs += `<pattern id="${uniq}k" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(115)"><rect width="9" height="9" fill="#1e1b4b" opacity="0.55"/><rect width="4" height="9" fill="#a5f3fc" opacity="0.34"/></pattern>`;
  if (L && L.cls === 'w2bUnion') defs += `<pattern id="${uniq}u" patternUnits="userSpaceOnUse" width="8" height="7"><rect width="8" height="7" fill="#101c44" opacity="0.72"/><rect width="8" height="1" fill="#7aa2ff" opacity="0.30"/></pattern>`;
  defs += `</defs>`;
  let s = `<svg width="390" height="700" xmlns="http://www.w3.org/2000/svg">${defs}`;
  s += `<rect width="390" height="640" fill="#1a1a2e"/>`;
  s += `<text x="195" y="30" text-anchor="middle" fill="#eee" font-size="16" font-family="${FONT}" font-weight="bold">${esc(title.slice(0, 40))}</text>`;
  s += `<text x="195" y="52" text-anchor="middle" fill="#8af" font-size="11" font-family="${FONT}">pattern: ${esc(pat.type || '?')} · learned = shown</text>`;
  s += `<text x="195" y="70" text-anchor="middle" fill="#fd8" font-size="11" font-family="${FONT}">${esc(scene.note)}</text>`;
  // NOTE: glyph ::after overlays are positioned elements — in the real game
  // they paint ABOVE the in-flow player token. Collect glyph draws, emit after.
  const glyphDraws = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const px = OX + x * CELL, py = OY + y * CELL;
    s += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="#2a2a3e" stroke="#444" stroke-width="1"/>`;
    if (L && cellMap[x + ',' + y]) {
      const pad = 1;
      let fill = L.fill || '#333';
      if (L.stripes) fill = `url(#${uniq}s)`;
      if (L.radial) fill = `url(#${uniq}r)`;
      if (L.linear) fill = `url(#${uniq}l)`;
      if (L.cls === 'w2bKite') fill = `url(#${uniq}k)`;
      if (L.cls === 'w2bUnion') fill = `url(#${uniq}u)`;
      if (L.cls === 'w2bPz') fill = 'rgba(8,8,10,0.80)';
      const dash = L.dash ? ` stroke-dasharray="${L.dash}"` : '';
      s += `<rect x="${px + pad}" y="${py + pad}" width="${CELL - 2 * pad}" height="${CELL - 2 * pad}" fill="${fill}" stroke="${L.stroke}" stroke-width="${L.sw}"${dash}/>`;
      if (L.innerGlow) s += `<rect x="${px + 5}" y="${py + 5}" width="${CELL - 10}" height="${CELL - 10}" fill="none" stroke="${L.stroke}" stroke-width="3" opacity="0.45"/>`;
      if (L.hot) s += `<rect x="${px + 6}" y="${py + 6}" width="${CELL - 12}" height="${CELL - 12}" fill="rgba(255,255,255,0.95)" opacity="0.5"/>`;
      if (L.ring) s += `<circle cx="${px + CELL / 2}" cy="${py + CELL / 2}" r="10" fill="none" stroke="#d9a7ff" stroke-width="2" opacity="0.6"/>`;
      if (L.corners) {
        const c = '#ffffff';
        s += `<path d="M ${px + 4} ${py + 12} L ${px + 4} ${py + 4} L ${px + 12} ${py + 4}" stroke="${c}" stroke-width="3" fill="none"/>`;
        s += `<path d="M ${px + CELL - 12} ${py + CELL - 4} L ${px + CELL - 4} ${py + CELL - 4} L ${px + CELL - 4} ${py + CELL - 12}" stroke="${c}" stroke-width="3" fill="none"/>`;
      }
      if (L.glyph) glyphDraws.push(`<text x="${px + CELL / 2}" y="${py + CELL / 2 + 6}" text-anchor="middle" font-size="16" font-family="${FONT}" fill="${L.stroke === '#e03131' ? '#ffb3b3' : L.stroke === '#ff4d9d' ? '#ffc2dd' : L.stroke === '#ff5a5a' ? '#ffd7d7' : L.stroke === '#a5f3fc' ? '#d9fbff' : '#e9cfff'}">${esc(L.glyph)}</text>`);
    }
  }
  const [mx, my] = scene.mpos;
  s += `<text x="${OX + mx * CELL + CELL / 2}" y="${OY + my * CELL + CELL / 2 + 10}" text-anchor="middle" font-size="24" font-family="${FONT}">${mdef.emoji || '?'}</text>`;
  s += `<text x="${OX + PX * CELL + CELL / 2}" y="${OY + PY * CELL + CELL / 2 + 10}" text-anchor="middle" font-size="24" font-family="${FONT}">●</text>`;
  // token ring for direct voices (tgPlayerAlertClasses): the token swallows
  // the tile fill, so the voice rings the token itself.
  const ringCls = ringMap[scene.id];
  if (ringCls && ringColor[ringCls] && cells.length === 1 && cells[0].cx === PX && cells[0].cy === PY) {
    const rdash = ringCls === 'underTarget' ? ' stroke-dasharray="4,2"' : '';
    s += `<circle cx="${OX + PX * CELL + CELL / 2}" cy="${OY + PY * CELL + CELL / 2}" r="15" fill="none" stroke="${ringColor[ringCls]}" stroke-width="3"${rdash} opacity="0.95"/>`;
  }
  for (const gd of glyphDraws) s += gd;
  const tgText = (atk && atk.telegraph) || 'No telegraph text.';
  const words = String(tgText).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 44) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  let ty = OY + GRID + 30;
  lines.slice(0, 3).forEach((ln, i) => {
    s += `<text x="20" y="${ty + i * 16}" fill="#aaa" font-size="11" font-family="${FONT}" font-style="italic">${esc('“' + ln + (i === Math.min(lines.length, 3) - 1 ? '”' : ''))}</text>`;
  });
  s += `<text x="20" y="${ty + 62}" fill="#666" font-size="10" font-family="${FONT}">${cells.length ? cells.length + ' telegraph cells' : 'no grid telegraph — cue only'} · 390px mobile</text>`;
  return s + `</svg>`;
}

fs.mkdirSync(OUT, { recursive: true });
let rendered = 0;
SCENES.forEach((scene, i) => {
  const mdef = byId[scene.id];
  if (!mdef) { console.log('  MISSING def:', scene.id); fail++; return; }
  const svg = renderScene(mdef, scene, i);
  const base = scene.id + (scene.bihot ? '-telegraph-bihot' : '-telegraph');
  const svgPath = path.join(OUT, base + '.svg');
  const pngPath = path.join(OUT, base + '.png');
  fs.writeFileSync(svgPath, svg);
  try {
    execSync(`python3 -c "import cairosvg; cairosvg.svg2png(url='${svgPath}', write_to='${pngPath}')"`, { stdio: 'pipe', timeout: 60000 });
    rendered++;
  } catch (e) { console.log('  PNG FAIL', base, e.message); fail++; }
});
check(`${rendered} captures rendered (SVG+PNG)`, rendered === SCENES.length, `${rendered}/${SCENES.length}`);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`captures: ${OUT}`);
process.exit(fail ? 1 : 0);
