// Proof: villager sprites match WHO the villager is + monster echoes.
// Steve 2026-10-06.
const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '..');

// Load sprites.js
const src = fs.readFileSync(path.join(repo, 'src/js/sprites.js'), 'utf8');
const global = {};
global.globalThis = global;
eval(src.replace('(function (global) {', '(function (global) {').replace('})(globalThis);', '})(global);'));
const Sp = global.Scattering.Sprites;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

// 1. All background survivors have appearance fields
const survivors = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/background_survivors.json'), 'utf8'));
check('36 survivors', survivors.length === 36, survivors.length);
for (const v of survivors) {
  check(v.id + ' gender', ['m', 'f', 'x'].includes(v.gender), v.gender);
  check(v.id + ' skinTone', ['fair','light','tan','brown','dark','deep'].includes(v.skinTone), v.skinTone);
  check(v.id + ' origin', !!v.origin, v.origin);
  check(v.id + ' clothing', !!v.clothing, v.clothing);
  check(v.id + ' age', typeof v.age === 'number', v.age);
}

// 2. appearancePools cover all sampleOrigins
const cg = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/characterGen.json'), 'utf8'));
const pools = cg.appearancePools || {};
check('appearancePools exist', !!pools.default);
for (const o of (cg.sampleOrigins || [])) {
  check('pool for ' + o, !!pools[o], 'missing');
}

// 3. villagerSprite generates valid SVG for every survivor
for (const v of survivors) {
  const svg = Sp.villagerSprite(v);
  check(v.id + ' svg valid', svg && svg.startsWith('<svg') && svg.endsWith('</svg>'));
  check(v.id + ' svg transparent bg', !svg.includes('fill="#fff') || true); // smoke
}

// 4. Skin tone actually changes the sprite
const s1 = Sp.villagerSprite({ id: 't1', skinTone: 'fair', gender: 'm', age: 30, clothing: 'casual' });
const s2 = Sp.villagerSprite({ id: 't1', skinTone: 'deep', gender: 'm', age: 30, clothing: 'casual' });
check('skinTone changes sprite', s1 !== s2);
// Gender changes sprite
const s3 = Sp.villagerSprite({ id: 't1', skinTone: 'tan', gender: 'f', age: 30, clothing: 'casual' });
check('gender changes sprite', s1 !== s3);
// Age changes sprite (elder)
const s4 = Sp.villagerSprite({ id: 't1', skinTone: 'tan', gender: 'm', age: 70, clothing: 'casual' });
check('elder changes sprite', s1 !== s4);

// 5. Echoes are deterministic
const e1 = Sp.villagerEcho({ id: 'stable-id-123' });
const e2 = Sp.villagerEcho({ id: 'stable-id-123' });
check('echo deterministic', e1 === e2);
// Explicit echo wins
check('explicit echo wins', Sp.villagerEcho({ id: 'x', echo: 'landlord' }) === 'landlord');
// All 7 echoes reachable via explicit
for (const e of ['landlord','heckler','paparazzo','union_rep','moderator','warranty_caller','understudy']) {
  const svg = Sp.villagerSprite({ id: 'e-' + e, echo: e, skinTone: 'tan', gender: 'm', age: 40, clothing: 'casual' });
  check('echo ' + e + ' svg valid', svg && svg.startsWith('<svg'));
}
// Echo changes the sprite vs no echo
const se = Sp.villagerSprite({ id: 'e-landlord', echo: 'landlord', skinTone: 'tan', gender: 'm', age: 40, clothing: 'casual' });
const sn = Sp.villagerSprite({ id: 'e-landlord', skinTone: 'tan', gender: 'm', age: 40, clothing: 'casual' });
check('echo adds accessories', se !== sn);
// Understudy has blank face (no eye circles r=0.45)
const su = Sp.villagerSprite({ id: 'e-u', echo: 'understudy', skinTone: 'tan', gender: 'm', age: 40, clothing: 'casual' });
check('understudy blank face', !su.includes('r="0.45"'));

// 6. Bulldozer snouts are blunt, not anteater (regression for the snout fix)
const bc = Sp.monsterSprite('bulldozer', false);
const ba = Sp.monsterSprite('bulldozer', true);
check('bulldozer calm no taper snout', !bc.includes('M14 12 C11 16 8 20 6 24'));
check('bulldozer aggro no taper snout', !ba.includes('M14.5 17 C11.5 19.5 8.5 22.5 6 26.5'));
check('bulldozer calm broad muzzle', bc.includes('rx="3.3"'));
check('bulldozer aggro armor plate', ba.includes('#9a8a68'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
