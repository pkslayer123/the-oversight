// Proof: every plant has a full sprite chain (Steve 2026-10-06).
// Visual identity law: plant/tree/bush root -> category -> specific final form.
// Every chain node must resolve to a valid SVG sprite.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}

// Load sprites.js
const sandbox = { Scattering: {} };
sandbox.globalThis = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(repo, 'src/js/sprites.js'), 'utf8'), sandbox);
const Sprites = sandbox.Scattering.Sprites;
check('Sprites module loads', !!Sprites && typeof Sprites.get === 'function');

// Load plants
const plantsRaw = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/plants.json'), 'utf8'));
const plants = plantsRaw.plants || plantsRaw;
check('plants.json parses with plants', plants.length > 0);
console.log('plants:', plants.length);

// Mock Game.data so chainFor prefers plants.json taxon
sandbox.Scattering.Game = { data: { plants } };

const ROOTS = { plant: 'generic_plant', bush: 'generic_bush', tree: 'generic_tree' };

for (const p of plants) {
  const pid = p.id;
  check(pid + ' has taxon field', Array.isArray(p.taxon) && p.taxon.length === 3);
  if (!Array.isArray(p.taxon)) continue;
  const [root, cat, spec] = p.taxon;
  check(pid + ' root is plant|bush|tree', ['plant', 'bush', 'tree'].includes(root));
  // Every depth resolves to a valid SVG
  for (let d = 0; d <= 2; d++) {
    const svg = Sprites.plantSprite(pid, d, root);
    check(`${pid} depth ${d} resolves`, typeof svg === 'string' && svg.includes('<svg'));
    if (typeof svg === 'string') {
      check(`${pid} depth ${d} valid viewBox`, svg.includes('viewBox="0 0 32 32"'));
    }
  }
  // Category and specific are distinct sprites (no doubling at final form)
  const catSvg = Sprites.get(cat), specSvg = Sprites.get(spec);
  check(pid + ' category sprite exists', !!catSvg);
  check(pid + ' specific sprite exists', !!specSvg);
  if (catSvg && specSvg) {
    check(pid + ' final form differs from category', catSvg !== specSvg);
  }
}

// Spot checks on known chains
const spot = {
  blackberry: ['bush', 'berry_bush', 'blackberry'],
  muscadine: ['bush', 'vine', 'muscadine'],
  dandelion: ['plant', 'flower', 'dandelion'],
  acorn_white_oak: ['tree', 'nut_tree', 'white_oak'],
  rare_herb: ['plant', 'herb', 'ghost_pipe'],
};
for (const [pid, want] of Object.entries(spot)) {
  const got = plants.find(p => p.id === pid).taxon;
  check(`chain ${pid} = ${want.join('>')}`, JSON.stringify(got) === JSON.stringify(want));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
