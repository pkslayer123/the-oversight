#!/usr/bin/env node
// Sprite visual audit (Steve 2026-10-06)
// Renders all monster sprites and checks:
// - They exist and are non-empty
// - Calm vs aggro are actually different
// - They have substantive visual content (not just a circle)
//
// Run: node scripts/sprite-audit.js
// Output: HTML file with all sprites side-by-side for visual inspection

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const spritesSrc = fs.readFileSync(path.join(ROOT, 'src/js/sprites.js'), 'utf8');
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));

// Extract sprite definitions
function getSprite(id) {
  const idx = spritesSrc.indexOf(id + ':');
  if (idx < 0) return null;
  const svgStart = spritesSrc.indexOf('<svg', idx);
  if (svgStart < 0) return null;
  const svgEnd = spritesSrc.indexOf('</svg>', svgStart);
  if (svgEnd < 0) return null;
  return spritesSrc.substring(svgStart, svgEnd + 6);
}

let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Monster Sprite Audit</title>
<style>
  body { font-family: monospace; background: #1a1a2e; color: #eee; padding: 20px; }
  .monster { border: 1px solid #444; margin: 10px; padding: 10px; display: inline-block; }
  .sprite { width: 96px; height: 96px; background: #2a2a3e; margin: 5px; display: inline-block; }
  .sprite svg { width: 96px; height: 96px; }
  .label { font-size: 12px; color: #aaa; }
  .warn { color: #f88; }
  .ok { color: #8f8; }
</style></head><body>
<h1>Monster Sprite Audit — ${monsters.length} monsters</h1>
<p>Calm (left) vs Aggro (right). They should look meaningfully different.</p>
`;

let issues = [];

for (const m of monsters) {
  const calm = getSprite(`${m.id}_calm`);
  const aggro = getSprite(`${m.id}_aggro`);
  
  let status = '';
  if (!calm) {
    issues.push(`${m.id}: missing calm sprite`);
    status = '<span class="warn">❌ NO CALM</span>';
  } else if (!aggro) {
    issues.push(`${m.id}: missing aggro sprite`);
    status = '<span class="warn">❌ NO AGGRO</span>';
  } else if (calm === aggro) {
    issues.push(`${m.id}: calm and aggro are identical`);
    status = '<span class="warn">⚠️ IDENTICAL</span>';
  } else {
    // Check if they have substantive content (not just empty)
    const calmLen = calm.length;
    const aggroLen = aggro.length;
    if (calmLen < 200 || aggroLen < 200) {
      issues.push(`${m.id}: sprite suspiciously small (${calmLen}/${aggroLen} chars)`);
      status = '<span class="warn">⚠️ TINY</span>';
    } else {
      status = '<span class="ok">✅</span>';
    }
  }
  
  html += `<div class="monster">
    <div class="label">${m.name} (${m.id}) ${status}</div>
    <div class="sprite">${calm || '<span class="warn">MISSING</span>'}</div>
    <div class="sprite">${aggro || '<span class="warn">MISSING</span>'}</div>
  </div>\n`;
}

html += `</body></html>`;

const outPath = '/tmp/sprite-audit.html';
fs.writeFileSync(outPath, html);

console.log(`\n=== SPRITE AUDIT ===`);
console.log(`Monsters: ${monsters.length}`);
console.log(`Issues: ${issues.length}`);
if (issues.length > 0) {
  console.log(`\nProblems:`);
  issues.forEach(i => console.log(`  ❌ ${i}`));
} else {
  console.log(`\n✅ All sprites present and distinct`);
}
console.log(`\nVisual report: ${outPath}`);
console.log(`Open in browser to see all sprites side-by-side.`);
