#!/usr/bin/env node
// DRAMA REGISTRY VISUAL PROOF (Steve 2026-10-07).
// Triggers each registry-migrated drama hook in a node harness, captures what
// each one SPAWNS (html/css/anim/duration — the real render output), and
// rasterizes each capture to SVG+PNG at mobile scale (390px grid) for visual
// judgment: distinct? readable? renders nothing?
//
// READ-ONLY vs the engine: all src/js files are read via `git show HEAD:<path>`.
// Only NEW files are written: this script, evidence/2026-10-07/drama-* outputs.
//
// FINDING CONTEXT (see evidence/2026-10-07/drama-registry-visual-notes-20261007.md):
// sibling commit d2b6623 REVERTED the data-driven renderer (renderEffect/
// effectRegistry) ~2 min after the migration batches landed. At HEAD, all 17
// hooks below are imperative implementations again; dramaEffects.json is loaded
// by game.js but never consumed. This proof therefore renders the CURRENT
// (reverted, dx/dy-fixed) implementations — the visuals a player actually sees.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'evidence', '2026-10-07');
fs.mkdirSync(OUT, { recursive: true });

function gitShow(p) {
  return execSync(`git -C "${ROOT}" show HEAD:${p}`, { maxBuffer: 32 * 1024 * 1024 }).toString('utf8');
}

// ---------- seeded PRNG (mulberry32, SEED env override) ----------
let _seed = parseInt(process.env.SEED || '20261007', 10) >>> 0;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(_seed);

// ---------- DOM stub: captures spawn() output for later SVG rasterization ----------
const TILE = 390 / 9;
const spawns = [];      // {hook, html, css, animClass, duration}
let activeHook = '';
let shakeCalls = [];    // {hook, intensity}
let audioCalls = [];

function mkEl() {
  return {
    innerHTML: '', _css: '',
    style: {
      set cssText(v) { this._v = v; },
      get cssText() { return this._v || ''; },
      setProperty() {},
    },
    classList: { add() {}, remove() {} },
    appendChild() {}, remove() {},
    offsetWidth: 100,
  };
}
function tileRect(i) {
  const x = (i % 9) * TILE, y = Math.floor(i / 9) * TILE;
  return { left: x, top: y, width: TILE, height: TILE, right: x + TILE, bottom: y + TILE };
}
const gridEl = {
  appendChild() {},
  classList: { add() {}, remove() {} },
  style: { setProperty() {} },
  offsetWidth: 390,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 390, right: 390, bottom: 390 }),
  querySelectorAll: () => Array.from({ length: 81 }, (_, i) => ({
    getBoundingClientRect: () => tileRect(i),
  })),
};
global.document = {
  createElement: () => mkEl(),
  querySelector: () => gridEl,
  getElementById: () => null,
  head: mkEl(),
  body: mkEl(),
  contains: () => true,
};
global.getComputedStyle = () => ({ position: 'relative' });
global.requestAnimationFrame = (cb) => { try { cb(); } catch (e) {} return 1; };
global.setTimeout = () => 0;   // don't actually remove elements — keep capture
global.clearTimeout = () => {};

// ---------- load engine: FULL src/js list in index.html order, minus DOM-only ----------
const order = gitShow('index.html')
  .split('\n')
  .map(l => (l.match(/src\/js\/[a-z0-9\-]+\.js/) || [])[0])
  .filter(Boolean)
  .filter((v, i, a) => a.indexOf(v) === i);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
global.window = global; // equipment.js needs window at load
for (const f of order) {
  if (SKIP.has(f)) continue;
  try {
    eval(gitShow(f));
  } catch (e) {
    console.error('EVAL FAIL', f, e.message);
    process.exit(1);
  }
}
delete global.window;
const D = global.Scattering.Drama;

// wrap spawn to capture
const realSpawn = D.spawn.bind(D);
D.spawn = function (html, css, animClass, duration) {
  spawns.push({ hook: activeHook, html: String(html), css: String(css), animClass, duration });
  return realSpawn(html, css, animClass, duration);
};
const realShake = D.shake.bind(D);
D.shake = function (intensity) {
  shakeCalls.push({ hook: activeHook, intensity });
  return realShake(intensity);
};

// ---------- hook triggers (the 17 migrated hooks + a few variants) ----------
const HOOKS = [
  { name: 'exclaim-bang',      fn: () => D.exclaim(4, 4, '!') },
  { name: 'exclaim-quest-L3',   fn: () => D.exclaim(4, 4, '?', { integration: 3 }) },
  { name: 'npcAlert-warn',      fn: () => D.npcAlert(4, 4, 'warn') },
  { name: 'npcAlert-heart',     fn: () => D.npcAlert(4, 4, 'heart') },
  { name: 'critHit-L2',         fn: () => D.critHit(4, 4, 23, 2) },
  { name: 'critHit-L3',         fn: () => D.critHit(4, 4, 23, 3) },
  { name: 'contestLoser',       fn: () => D.contestLoser('Rook', 2) },
  { name: 'phaseShift-windup',  fn: () => D.phaseShift(4, 4, 'windup', 1) },
  { name: 'phaseShift-strike',  fn: () => D.phaseShift(4, 4, 'strike', 2) },
  { name: 'enrage',             fn: () => D.enrage(4, 4, 'enraged', 2) },
  { name: 'contestAnnounce',    fn: () => D.contestAnnounce('HARVEST GAMES', 2) },
  { name: 'systemCommentary',   fn: () => D.systemCommentary('The System notes your hunger.', { integration: 2 }) },
  { name: 'integrationPulse',   fn: () => D.integrationPulse(3) },
  { name: 'abilityLevelUp',     fn: () => D.abilityLevelUp(4, 4, 'Forage ID', 2, 2) },
  { name: 'synergyShimmer',     fn: () => D.synergyShimmer(2) },
  { name: 'teaseFaint',         fn: () => D.teaseFaint(2) },
  { name: 'ahaMoment',          fn: () => D.ahaMoment(4, 4, 2) },
  { name: 'techniqueLearned',   fn: () => D.techniqueLearned(4, 4, 'Smoke Signal', 2) },
  { name: 'skillGained',        fn: () => D.skillGained(4, 4, 'Tracking', 2) },
  { name: 'plantIdentified',    fn: () => D.plantIdentified(4, 4, 'Dandelion', 2) },
];

// sanity: every hook method exists
for (const h of HOOKS) {
  const meth = h.name.replace(/-(bang|quest-L3|warn|heart|L2|L3|windup|strike)$/, '');
  if (typeof D[meth] !== 'function') { console.error('MISSING HOOK METHOD:', meth); process.exit(1); }
}

for (const h of HOOKS) {
  activeHook = h.name;
  h.fn();
}
activeHook = '';

const results = HOOKS.map(h => {
  const s = spawns.filter(x => x.hook === h.name);
  const shakes = shakeCalls.filter(x => x.hook === h.name);
  return {
    hook: h.name,
    spawnCount: s.length,
    animClasses: [...new Set(s.map(x => x.animClass))],
    shakes: shakes.map(x => x.intensity),
    durations: [...new Set(s.map(x => x.duration))],
    spawns: s,
  };
});
fs.writeFileSync(path.join(OUT, 'drama-registry-visual-proof-20261007.json'),
  JSON.stringify({ seed: _seed, head: execSync(`git -C "${ROOT}" rev-parse HEAD`).toString().trim(), results }, null, 1));

// ---------- SVG rasterization ----------
function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function cssVal(css, prop) {
  const m = css.match(new RegExp(prop + '\\s*:\\s*([^;]+)'));
  return m ? m[1].trim() : null;
}
function parsePx(v, base) {
  if (!v) return null;
  if (v.endsWith('px')) return parseFloat(v);
  if (v.endsWith('%')) return parseFloat(v) / 100 * base;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}
function stripTags(html) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map(s => s.trim()).filter(Boolean);
}
function renderSpawn(s) {
  const out = [];
  const css = s.css;
  const left = parsePx(cssVal(css, 'left'), 390);
  const top = parsePx(cssVal(css, 'top'), 390);
  if (cssVal(css, 'inset') === '0' || (left === null && css.includes('inset:0'))) {
    const bg = cssVal(css, 'background') || 'rgba(255,255,255,0.2)';
    out.push(`<rect x="0" y="0" width="390" height="390" fill="${esc(bg)}"/>`);
    return out.join('');
  }
  const x = left === null ? 195 : left;
  const y = top === null ? 195 : top;
  const tr = cssVal(css, 'transform') || '';
  const centerX = tr.includes('-50%');
  const html = s.html.trim();
  if (html.startsWith('<svg')) {
    const w = parseFloat((html.match(/width="([\d.]+)"/) || [])[1] || 60);
    const h = parseFloat((html.match(/height="([\d.]+)"/) || [])[1] || 60);
    const inner = html.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    // keep viewBox for scaling
    const vb = (html.match(/viewBox="([^"]+)"/) || [])[1] || `0 0 ${w} ${h}`;
    let tx = x, ty = y;
    if (tr.includes('-50%')) { tx = x - w / 2; ty = y - h / 2; }
    out.push(`<svg x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${w}" height="${h}" viewBox="${vb}">${inner}</svg>`);
    return out.join('');
  }
  // text / div content
  const lines = stripTags(html);
  if (!lines.length) return '';
  // innermost font-size/color: prefer the last div style, else css
  let fsize = 18, color = '#fff';
  const divStyles = [...html.matchAll(/<div style="([^"]*)"/g)].map(m => m[1]);
  const src = divStyles.length ? divStyles[divStyles.length - 1] + ';' + css : css;
  const fm = src.match(/font-size:\s*([\d.]+)px/);
  if (fm) fsize = parseFloat(fm[1]);
  const cm = src.match(/(?:^|;)\s*color:\s*([^;]+)/);
  if (cm) color = cm[1].trim();
  const anchor = centerX ? 'middle' : 'start';
  let dy = 0;
  if (tr.includes('-100%')) dy = -lines.length * fsize * 0.5; // above anchor
  lines.forEach((ln, i) => {
    const ly = y + dy + i * fsize * 1.15 + fsize * 0.35;
    out.push(`<text x="${x.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="${fsize}" fill="${esc(color)}" font-family="DejaVu Sans,sans-serif" font-weight="bold" stroke="rgba(0,0,0,0.75)" stroke-width="0.8">${esc(ln)}</text>`);
  });
  return out.join('');
}
function gridSvg(anchorTile) {
  let g = '';
  for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 9; xx++) {
    const hot = anchorTile && xx === anchorTile[0] && yy === anchorTile[1];
    g += `<rect x="${(xx * TILE).toFixed(2)}" y="${(yy * TILE).toFixed(2)}" width="${TILE.toFixed(2)}" height="${TILE.toFixed(2)}" fill="${hot ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)'}" stroke="rgba(255,255,255,0.14)" stroke-width="0.5"/>`;
  }
  return g;
}

const summary = [];
for (const r of results) {
  const parts = [
    `<rect x="0" y="0" width="390" height="470" fill="#0b0e12"/>`,
    `<text x="8" y="20" font-size="13" fill="#9fd8ff" font-family="DejaVu Sans,sans-serif" font-weight="bold">${esc(r.hook)} — ${r.spawnCount} spawn${r.spawnCount === 1 ? '' : 's'}${r.shakes.length ? ` + shake(${r.shakes.join(',')})` : ''}</text>`,
    `<g transform="translate(0,30)">${gridSvg([4, 4])}`,
  ];
  for (const s of r.spawns) parts.push(renderSpawn(s));
  parts.push('</g>');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="470" viewBox="0 0 390 470">${parts.join('')}</svg>`;
  const base = path.join(OUT, `drama-proof-${r.hook}`);
  fs.writeFileSync(base + '.svg', svg);
  execSync(`python3 -c "import cairosvg; cairosvg.svg2png(url='${base}.svg', write_to='${base}.png', scale=1.6)"`);
  summary.push({ hook: r.hook, spawnCount: r.spawnCount, animClasses: r.animClasses, shakes: r.shakes, png: `evidence/2026-10-07/drama-proof-${r.hook}.png` });
}
console.log(JSON.stringify(summary, null, 1));
console.log('OK — evidence written to', OUT);
