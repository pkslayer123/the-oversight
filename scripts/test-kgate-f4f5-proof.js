// ============================================================================
// BEFORE/AFTER PROOF TEST — kgate audit F4 + F5 fixes (Steve 2026-10-06).
//
// F4: app.js tile-tap panel showed raw mod.species after ANY examine.
//     Fix (commit 8de8310): panel routes species through Game.treeName().
// F5: betrayal.js whoTag named the TRUE formerOccupation pre-knowledge.
//     Fix (commit a0cfe66): occupation shows only after journal-learned
//     (People Codex), via Game.journalLearn(vid, 'occupation', ...).
//
// BEFORE = exact pre-fix expressions, copied verbatim from git history
//   (8de8310^ for F4, a0cfe66^ for F5), evaluated against live game state.
//   They must still DEMONSTRATE THE LEAK — proving what the fix removed.
// AFTER = the current gated code paths against the same state.
//   They must be clean pre-knowledge and open correctly once learned.
//
// Usage: node scripts/test-kgate-f4f5-proof.js
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

let pass = 0, fail = 0;
function ok(name, cond, note) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const S = Game.state.scholar;
  const tile = Game.playerTile();
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  tile.modifiers = tile.modifiers || {};

  // ============ F4 ============
  // Unknown pine at (4,3); player at (4,4); examine flag set (what
  // game.js:5917 does on ANY examine — species knowledge NOT earned).
  S.mx = 4; S.my = 4;
  detail[3][4] = 'tree';
  const mod = { species: 'pine', health: 'healthy', ivy: false, known: true };
  tile.modifiers['4,3'] = mod;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = 4 + dx, y = 4 + dy;
    if (x < 0 || x > 8 || y < 0 || y > 8 || (x === 4 && y === 3)) continue;
    detail[y][x] = 'grass';
  }

  // BEFORE (8de8310^, app.js tile-tap panel): `desc = `${mod.species}, ...``
  const beforeF4 = `${mod.species}, ${mod.health}${mod.ivy ? ', ivy-covered' : ''}. `;
  ok('F4-BEFORE: old panel expression named the unknown pine (the leak)',
    /pine/i.test(beforeF4), `old desc = "${beforeF4.trim()}"`);

  // AFTER: current app.js source routes the print through Game.treeName().
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const speciesPrints = appSrc.split('\n').filter(l => l.includes('mod.species'));
  ok('F4-AFTER: current app.js prints mod.species only via treeName()',
    speciesPrints.length > 0 && speciesPrints.every(l => l.includes('treeName')),
    `prints: ${speciesPrints.map(l => l.trim().slice(0, 60)).join(' | ')}`);
  const afterSlot = Game.treeName(mod.species) || 'tree';
  const afterF4 = `${afterSlot}, ${mod.health}${mod.ivy ? ', ivy-covered' : ''}. `;
  ok('F4-AFTER: tap panel slots examined-but-unknown pine as just "tree"',
    afterSlot === 'tree' && !/pine/i.test(afterF4), `panel desc = "${afterF4.trim()}"`);

  // Gate OPENS after learning: 3 deep studies teach the pine (learn path).
  Game.state.codex.treeStudy = {};
  detail[3][5] = 'tree';
  tile.modifiers['5,3'] = { species: 'pine', health: 'healthy', ivy: false, known: false };
  Game.examineCell(5, 3); Game.examineCell(5, 3);
  Game.examineCell(5, 3); Game.examineCell(5, 3);
  ok('F4-AFTER: once learned (3 deep studies), panel names the pine',
    Game.treeName('pine') === 'pine' &&
    (Game.treeName(tile.modifiers['4,3'].species) || 'tree') === 'pine',
    `treeName(pine)=${Game.treeName('pine')}`);

  // ============ F5 ============
  const vps = Game.data.villagers || [];
  const truthful = vps.find(v => {
    if (!v || v.id === Game.villagerId) return false;
    const occ = v.formerOccupation;
    if (!occ) return false;
    let lies = null;
    try { lies = (Game.vpOf(v.id) || {}).lies; } catch (e) {}
    return !(lies && lies.occupation);
  });
  if (!truthful) { console.log('SKIP F5: no truthful villager with occupation'); }
  else {
    const v = (Game.data.villagers || []).find(x => x.id === truthful.id) || {};
    const occWord = String(v.formerOccupation).toLowerCase().split(/[\s(]/)[0];

    // BEFORE (a0cfe66^, betrayal.js whoTag): true occupation straight in.
    //   let occ = v.formerOccupation || (v.lifeseed && (...));
    //   if (occ) role = ', the ' + String(occ).toLowerCase()...
    let beforeRole = '';
    {
      let occ = v.formerOccupation || (v.lifeseed && (v.lifeseed.occupation || v.lifeseed.role));
      if (occ) beforeRole = ', the ' + String(occ).toLowerCase().replace(/\s*\(.*?\)/g, '').trim();
    }
    ok('F5-BEFORE: old whoTag named the true occupation pre-knowledge (the leak)',
      beforeRole.toLowerCase().includes(occWord), `old role = "${beforeRole}"`);

    // AFTER: journal is empty — tag must be age/gender descriptor only.
    const tagPre = Game.whoTag(truthful.id);
    ok('F5-AFTER: whoTag omits the true occupation pre-knowledge',
      !tagPre.toLowerCase().includes(occWord),
      `whoTag = "${tagPre}" (occupation: ${v.formerOccupation})`);

    // Gate OPENS when the occupation is journal-learned (personal-topic reveal).
    Game.journalLearn(truthful.id, 'occupation', v.formerOccupation, { sure: true, via: 'talk' });
    const tagPost = Game.whoTag(truthful.id);
    ok('F5-AFTER: whoTag names the occupation once journal-learned',
      tagPost.toLowerCase().includes(occWord),
      `whoTag = "${tagPost}"`);
  }

  console.log(`\nkgate-f4f5-proof: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
