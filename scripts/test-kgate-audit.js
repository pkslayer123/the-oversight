// ============================================================================
// KNOWLEDGE-GATING AUDIT GUARD — audit 2026-10-06.
//
// Steve's law: "If you don't know, it doesn't show."
//
// These asserts guard the leaks found by the knowledge-gating audit
// (evidence/2026-10-06/kgate-audit-20261006-muse.md). F1–F4 were fixed
// 2026-10-06 (carexplore.js treeName gating + deep-study learn path,
// perceive.js tree/bigtree gating, app.js tap-panel treeName gating).
// F5 was fixed by the social-loop worker (betrayal.js whoTag occupation
// gating). All asserts below are GREEN and guard regressions.
//
// STATUS 2026-10-06 (kgate-fix): all five findings fixed and gated.
// Usage: node scripts/test-kgate-audit.js
// ============================================================================
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0, skip = 0;
function ok(name, cond, note) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); }
}
function skipped(name, note) { skip++; console.log(`SKIP ${name}${note ? ' — ' + note : ''}`); }

(async () => {
  await Game.init();
  const said = [];
  const origSay = Game.say;
  Game.say = function (t) { said.push(String(t)); return origSay.call(this, t); };

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const S = Game.state.scholar;
  const tile = Game.playerTile();
  const detail = Game.genDetail(Game.map.px, Game.map.py); // cached on tile; mutations persist
  tile.modifiers = tile.modifiers || {};
  const pineMod = () => ({ species: 'pine', health: 'healthy', ivy: false, known: false });

  // Sanity: pine really is unknown species knowledge at game start (oak/hickory seed at L1).
  ok('setup: pine is unknown species knowledge',
    Game.treeName('pine') === null && Game.treeName('oak') === 'oak',
    `treeName(pine)=${Game.treeName('pine')} treeName(oak)=${Game.treeName('oak')}`);

  // Deterministic stage: a pine tree at (4,3), player at (4,4), 3x3 cleared
  // so no other forageable steals the proximity-hint scan.
  S.mx = 4; S.my = 4;
  detail[3][4] = 'tree';
  tile.modifiers['4,3'] = pineMod();
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = 4 + dx, y = 4 + dy;
    if (x < 0 || x > 8 || y < 0 || y > 8 || (x === 4 && y === 3)) continue;
    detail[y][x] = 'grass';
  }

  // ---- FINDING 1: carexplore.js examineCell names the raw species ----
  said.length = 0;
  Game.examineCell(4, 3); // surface examine
  const surfaceSaid = said.join(' ');
  Game.examineCell(4, 3); // deep examine
  const deepSaid = said.join(' ');
  ok('F1: surface examine of unknown pine does not name it (carexplore.js:354/357)',
    !/pine/i.test(surfaceSaid), `heard: "${surfaceSaid.slice(0, 80)}"`);
  ok('F1: deep examine of unknown pine does not name it (carexplore.js:362)',
    !/pine/i.test(deepSaid), `heard: "${deepSaid.slice(0, 80)}"`);

  // ---- FINDING 2: perceive.js tree proximity hint names the raw species ----
  // Game.perceptionHints() returns an array of STRINGS.
  const treeHints = Game.perceptionHints();
  ok('F2: proximity hint for unknown pine does not name it (perceive.js:177)',
    !treeHints.some(t => /pine/i.test(t)),
    `hints: ${JSON.stringify(treeHints)}`);

  // ---- FINDING 3: perceive.js bigtree proximity hint names the raw species ----
  detail[3][4] = 'bigtree';
  const bigHints = Game.perceptionHints();
  ok('F3: bigtree proximity hint for unknown pine does not name it (perceive.js:134)',
    !bigHints.some(t => /pine/i.test(t)),
    `hints: ${JSON.stringify(bigHints)}`);
  detail[3][4] = 'tree'; // restore

  // ---- FINDING 4: app.js tile-tap panel gates species on treeName() ----
  // The tap panel (app.js:1112) renders the species slot through
  // Game.treeName(mod.species), falling back to 'tree' — the same gate as the
  // examine message (game.js:5920). app.js needs DOM so this is a source +
  // logic proxy: (1) the panel's only mod.species print routes through
  // treeName, and (2) the gated expression names nothing for the unknown pine.
  tile.modifiers['4,3'] = pineMod();
  tile.modifiers['4,3'].known = true; // what game.js:5917 does on any examine
  const panelSpeciesSlot = Game.treeName(tile.modifiers['4,3'].species) || 'tree';
  ok('F4: tap panel species slot does not name examined-but-unknown pine',
    panelSpeciesSlot === 'tree',
    `slot="${panelSpeciesSlot}"`);
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const speciesPrints = appSrc.split('\n').filter(l => l.includes('mod.species'));
  ok('F4: every mod.species print in app.js routes through treeName()',
    speciesPrints.length > 0 && speciesPrints.every(l => l.includes('treeName')),
    `prints: ${speciesPrints.map(l => l.trim().slice(0, 70)).join(' | ')}`);

  // ---- LEARN PATH (Steve 2026-10-06): pine must be learnable, not a dead end ----
  // Deep-examining an unknown species 3 times teaches it (carexplore.js).
  // Must run while pine is still unknown (before this, F1–F4 prove it is).
  // Uses a fresh pine at (5,3) so the per-tile examine-depth counter starts clean.
  Game.state.codex.treeStudy = {};
  detail[3][5] = 'tree';
  tile.modifiers['5,3'] = pineMod();
  Game.examineCell(5, 3); // surface — no study
  Game.examineCell(5, 3); // deep study 1
  Game.examineCell(5, 3); // deep study 2 — hint, still unknown
  const stillUnknown = Game.treeName('pine') === null;
  Game.examineCell(5, 3); // deep study 3 — learns
  ok('LEARN: 3 deep studies teach the pine (no permanent dead end)',
    stillUnknown && Game.treeName('pine') === 'pine',
    `unknown before=${stillUnknown} treeName after=${Game.treeName('pine')}`);
  // And once known, the gated surfaces name it (the gate opens, it doesn't vanish).
  said.length = 0;
  Game.examineCell(5, 3);
  const knownSaid = said.join(' ');
  ok('LEARN: known pine is named by examine (gate opens after learning)',
    /pine/i.test(knownSaid),
    `heard: "${knownSaid.slice(0, 80)}"`);
  const knownHints = Game.perceptionHints();
  ok('LEARN: known pine is named by proximity hints',
    knownHints.some(t => /pine/i.test(t)),
    `hints: ${JSON.stringify(knownHints)}`);

  // ---- FINDING 5: betrayal.js whoTag names the TRUE former occupation ----
  // The same commit (855cbcc) that gated true occupations in truth.js left
  // whoTag's ", the <occupation>" descriptor ungated for truthful NPCs.
  const vps = Game.data.villagers || [];
  const truthful = vps.find(v => {
    if (!v || v.id === Game.villagerId) return false;
    const occ = v.formerOccupation;
    if (!occ) return false;
    let lies = null;
    try { lies = (Game.vpOf(v.id) || {}).lies; } catch (e) {}
    return !(lies && lies.occupation);
  });
  if (!truthful) { skipped('F5 whoTag names true occupation', 'no truthful villager with occupation'); }
  else {
    const tag = Game.whoTag(truthful.id);
    const occWord = String(truthful.formerOccupation).toLowerCase().split(/[\s(]/)[0];
    ok('F5: whoTag does not name the true occupation pre-knowledge (betrayal.js:147)',
      !tag.toLowerCase().includes(occWord),
      `whoTag(${truthful.id}) = "${tag}" leaks "${truthful.formerOccupation}"`);
  }

  console.log(`\nkgate-audit: ${pass} pass, ${fail} fail, ${skip} skip`);
  console.log('All green — these asserts guard the fixed knowledge gates against regressions.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
