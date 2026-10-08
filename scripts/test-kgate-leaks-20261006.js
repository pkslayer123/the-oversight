// ============================================================================
// HOT-TREE KNOWLEDGE-GATING LEAK CHECKS — 2026-10-06 (Worker B).
//
// Steve's law: "If you don't know, it doesn't show."
// Played checks (fresh codex) against the hot worktree. READ-ONLY: no game
// files are modified by this script. Run: node scripts/test-kgate-leaks-20261006.js
// Uses --cacheDirectory=/tmp/jest-cache-kgate if jest is ever involved (it isn't;
// this is plain node).
// ============================================================================
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/betrayal.js', 'src/js/corpses.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, note) {
  if (cond) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); }
}
function heard(said) { return said.join(' '); }

(async () => {
  await Game.init();
  const said = [];
  const origSay = Game.say;
  Game.say = function (t) { said.push(String(t)); return origSay.call(this, t); };

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);

  // ---- CHECK 1: fresh scenario start — intro/wake/depart messages ----
  said.length = 0;
  Game.depart();
  const intro = heard(said);
  // woodcock is the audit's canonical unknown animal; pine the unknown tree.
  // Neither should be named anywhere in the fresh-start flow.
  ok('C1: fresh start names no unknown animal species',
    !/woodcock/i.test(intro), `heard: "${intro.slice(0, 200)}"`);
  ok('C1: fresh start names no unknown tree species',
    !/pine/i.test(intro), `heard: "${intro.slice(0, 200)}"`);

  // ---- CHECK 2: american_woodcock is actually unknown to a fresh codex ----
  const woodcock = Game.data.animals.find(a => a.id === 'american_woodcock');
  ok('C2: american_woodcock exists in data', !!woodcock, 'no american_woodcock def');
  const wcKnown = woodcock ? Game.encAnimalKnown('american_woodcock') : true;
  ok('C2: american_woodcock is NOT auto-known to fresh codex', wcKnown === false,
    `encAnimalKnown(american_woodcock)=${wcKnown}`);

  // ---- CHECK 3: charred kill of unknown animal — carcass name vs knowledge ----
  // The charred branch (game.js:8343-8346) creates the carcass but never calls
  // encIdentifyAnimal (unlike the hunted branch at 8349). foodCarcass bakes the
  // TRUE species name into the item (food.js), and itemDisplayName returns
  // it.name raw for meat_ items. Play the mechanism end-to-end:
  const S = Game.state.scholar;
  Game.state.codex.animalEncounters = Game.state.codex.animalEncounters || {};
  delete Game.state.codex.animalEncounters['american_woodcock'];
  const wcDef = Game.data.animals.find(a => a.id === 'american_woodcock');
  const charred = Game.foodCarcass(wcDef, 50, S.day, 'charred');
  // what the charred branch does: push carcass, say the (clean) message, NO identify
  S.inventory.push(charred);
  Game.state.codex.animalEncounters['american_woodcock'] =
    ((Game.state.codex.animalEncounters || {})['american_woodcock'] || 0) + 1; // game.js:8363
  const encAfter = Game.state.codex.animalEncounters['american_woodcock'] || 0;
  const stillUnknown = !Game.encAnimalKnown('american_woodcock');
  const dispName = String(Game.itemDisplayName(charred));
  // source proxy: the charred branch really has no identify call
  const gameSrcC3 = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const cb0 = gameSrcC3.indexOf('if (charsMeat) {');
  const cb1 = gameSrcC3.indexOf('} else {', cb0);
  const charredSrc = gameSrcC3.slice(cb0, cb1);
  const charredIdentifies = /encIdentifyAnimal/.test(charredSrc);
  ok('C3: charred branch does not teach the species (no encIdentifyAnimal)',
    !charredIdentifies, charredIdentifies ? 'identify found in charred branch' : '');
  ok('C3: charred carcass of unknown animal does not carry the true species name',
    !(stillUnknown && /woodcock/i.test(dispName)),
    `pack shows "${dispName}" while encAnimalKnown=false (encounters=${encAfter})`);

  // ---- CHECK 4: trap catch message ordering (identify-before-name) ----
  // Code-read proxy: game.js checkTraps must call encIdentifyAnimal before the
  // say that names the species.
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const trapBlock = gameSrc.slice(gameSrc.indexOf('checkTraps()'), gameSrc.indexOf('checkTraps()') + 4500);
  const idPos = trapBlock.indexOf('encIdentifyAnimal(catchId)');
  const sayPos = trapBlock.indexOf('caught a ${animal.name}');
  ok('C4: trap catch identifies before naming (identify-before-say order)',
    idPos !== -1 && sayPos !== -1 && idPos < sayPos,
    `identify@${idPos} say@${sayPos}`);

  // ---- CHECK 5: system_task quest display ----
  Game.triggerEvent({ id: 'system_task' });
  const q = Game.state.scholar.activeQuest;
  // replicate the app.js ord-quest-top template verbatim
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rendered = q ? esc(q.text || (q.giverName + ' needs ' + q.qty + ' ' + q.plant + '.')) : '(no quest)';
  ok('C5: system_task quest renders a real line, not "undefined"',
    q && !/undefined/.test(rendered), `rendered="📋 ${rendered}"`);

  // ---- CHECK 6: unknown plant lump shows no kcal in pack ----
  const dandelion = Game.data.plants.find(p => p.id === 'dandelion');
  if (dandelion) {
    const before = S.inventory.length;
    Game.addUnknownToLump(dandelion, 3, S.day, S.inventory);
    const lump = S.inventory.slice(before).find(i => i.foodState === 'unknown');
    const packKcal = lump ? ((lump.foodKind === 'meat' && lump.edible === false) ? '?' : (lump.kcalEach || 0) * lump.units) : 'n/a';
    ok('C6: unknown plant lump shows no kcal number',
      lump && Number(packKcal) === 0, `lump="${lump && lump.name}" packKcal="${packKcal}"`);
    ok('C6: unknown plant lump shows no true species name',
      lump && !/dandelion/i.test(lump.name || ''), `lump name="${lump && lump.name}"`);
  } else {
    console.log('SKIP C6: no dandelion in plants data');
  }

  // ---- CHECK 7: d62b034 hunted-catch gate — is the else branch reachable? ----
  // The hunted path calls encIdentifyAnimal (encounters -> 3 -> known) BEFORE
  // the known check, so the "unknown" branch is dead code by construction.
  const huntBlock = gameSrc.slice(gameSrc.indexOf("s.day, 'hunted')") - 600, gameSrc.indexOf("s.day, 'hunted')") + 900);
  const hIdPos = huntBlock.indexOf('encIdentifyAnimal(animal.id)');
  const hKnownPos = huntBlock.indexOf('encAnimalKnown(animal.id)');
  ok('C7-doc: hunted catch identifies before the known-check (else branch unreachable)',
    hIdPos !== -1 && hKnownPos !== -1 && hIdPos < hKnownPos,
    `identify@${hIdPos} known-check@${hKnownPos} — gate is defense-in-depth, name is earned by the identify`);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
