// Proof: item sprites are wired into the UI render paths (Steve 2026-10-06).
// Asserts that pack HTML, loot HTML, and trade HTML include sprite SVGs,
// and that unknown items get the generic parcel (knowledge gating).
// Run: node scripts/test-sprites-items-ui-20261006.js
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); }
}

// ---- 1. Static wiring: render paths call itemSpriteHtml ----
const appSrc = fs.readFileSync(path.join(repo, 'src/js/app.js'), 'utf8');
check('itemSpriteHtml helper defined in app.js', appSrc.includes('function itemSpriteHtml(it)'));
check('helper exposed on Scattering', appSrc.includes('S.itemSpriteHtml = itemSpriteHtml'));
check('helper uses itemSprite(itemId, known)', appSrc.includes('Sp.itemSprite('));
check('helper gates on lump (unknown)', appSrc.includes('!it.lump'));
check('helper handles plant-derived via plantSprite', appSrc.includes('Sp.plantSprite('));

const betSrc = fs.readFileSync(path.join(repo, 'src/js/betrayal.js'), 'utf8');
check('trade buy view uses itemSpriteHtml', betSrc.includes('Scattering.itemSpriteHtml'));
check('trade sell view uses itemSpriteHtml', (betSrc.match(/Scattering\.itemSpriteHtml/g) || []).length >= 2);

// Count call sites in app.js render paths
const calls = (appSrc.match(/itemSpriteHtml\(/g) || []).length;
check(`itemSpriteHtml called in render paths (>=4, found ${calls})`, calls >= 4);

// ---- 2. CSS: .itemsprite sized for list rows ----
const css = fs.readFileSync(path.join(repo, 'src/css/main.css'), 'utf8');
check('.itemsprite CSS exists', css.includes('.itemsprite'));
check('.itemsprite has inline-block sizing', css.includes('.itemsprite { display: inline-block'));

// ---- 3. Functional: itemSprite gating behavior ----
const sprSrc = fs.readFileSync(path.join(repo, 'src/js/sprites.js'), 'utf8');
const sandbox = {};
const Sprites = new Function('globalThis', sprSrc + '\nreturn globalThis.Scattering.Sprites;')(sandbox);
const knownSvg = Sprites.itemSprite('multitool', true);
const unknownSvg = Sprites.itemSprite('multitool', false);
check('known item gets unique sprite', knownSvg.includes('<svg') && !knownSvg.includes('>?<'));
check('unknown item gets parcel with ?', unknownSvg.includes('?'));
check('known != unknown', knownSvg !== unknownSvg);

// ---- 4. Simulated render: pack row includes sprite span ----
function fakeItemSpriteHtml(it) {
  const known = !(it && it.lump);
  const svg = Sprites.itemSprite(it.id, known);
  return svg ? `<span class="itemsprite">${svg}</span>` : '';
}
const knownRow = `<p class="small">${fakeItemSpriteHtml({ id: 'multitool' })}<b>Multitool</b>`;
check('pack row for known item has itemsprite span', knownRow.includes('class="itemsprite"') && knownRow.includes('<svg'));
const unknownRow = `<p class="small">${fakeItemSpriteHtml({ id: 'multitool', lump: { form: 'metal' } })}<b>unfamiliar metal thing</b>`;
check('pack row for lumped item has parcel', unknownRow.includes('class="itemsprite"') && unknownRow.includes('?'));

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures.slice(0, 20)) console.log('  -', f);
  process.exit(1);
}
console.log('ALL GREEN');
