#!/usr/bin/env node
// Generates ~/workspace/your_files/monster-sprites-preview.html — calm → aggro
// pairs for every monster in monsters.json, grouped by wave.
// Run: node scripts/gen-monster-sprites-preview.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const ms = Array.isArray(monsters) ? monsters : (monsters.monsters || []);
const src = fs.readFileSync(path.join(ROOT, 'src/js/sprites.js'), 'utf8');
const global = {};
global.globalThis = global;
eval(src.replace('})(globalThis);', '})(global);'));
const Sprites = global.Scattering.Sprites;

const BIG = { bulldozer: '[2x2]', moderator: '[2x2]' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const card = (m) => {
  const calm = Sprites.get(m.id + '_calm') || '';
  const aggro = Sprites.get(m.id + '_aggro') || '';
  const big = BIG[m.id] ? ` <span style="color:#e6a23c">${BIG[m.id]}</span>` : '';
  return `<div class="card"><div class="nm">${esc(m.name)}<br><span style="color:#666;font-size:10px">${esc(m.id)}</span>${big}</div><div class="pair"><div><span class="grid44 cell44">${calm}</span><div class="lbl">calm</div></div><div><span class="grid44 cell44">${aggro}</span><div class="lbl">aggro</div></div></div></div>`;
};
const wave = (n) => ms.filter(m => (m.wave || 1) === n).map(card).join('\n');
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monster Sprites — calm &rarr; aggro</title><style>
body{background:#14181c;color:#cfd6dd;font-family:system-ui,sans-serif;margin:0;padding:16px}
h1{font-size:20px}h2{font-size:15px;color:#9ae66e;margin:24px 0 8px}
.row{display:flex;flex-wrap:wrap;gap:12px}
.card{background:#1c2228;border:1px solid #2c353d;border-radius:8px;padding:10px;width:170px;text-align:center}
.card .nm{font-size:12px;margin-bottom:6px;min-height:30px}
.pair{display:flex;justify-content:center;gap:8px;align-items:flex-end}
.cell44 svg{width:44px;height:44px}
.lbl{font-size:10px;color:#8a939c;margin-top:2px}
.grid44{background:repeating-conic-gradient(#232a31 0 25%,#1c2228 0 50%) 0 0/22px 22px;border-radius:4px;padding:4px;display:inline-block}
</style></head><body><h1>Monster Sprites — calm &rarr; aggro</h1>
<p style="font-size:12px;color:#8a939c">44px on checker tile. Regenerated 2026-10-06 — all ${ms.length} monsters incl. wave-1 flyers (nevermore, nightcourt) + wave-2 static kite. [2x2] = occupies 2x2 grid spaces.</p>
<h2>Wave 1 (${ms.filter(m => (m.wave || 1) === 1).length})</h2><div class="row">
${wave(1)}
</div>
<h2>Wave 2 (${ms.filter(m => (m.wave || 1) === 2).length})</h2><div class="row">
${wave(2)}
</div>
</body></html>
`;
const out = '/home/hatch/workspace/your_files/monster-sprites-preview.html';
fs.writeFileSync(out, html);
console.log('wrote', out, `(${ms.length} monsters)`);
