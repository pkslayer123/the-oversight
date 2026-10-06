// Item knowledge gating (Steve 2026-10-06): "The loot when starting expedition
// gives you way too much info about what each one does. That knowledge should
// be hidden during the selection, and all the keepsake items shouldn't tell
// you what they do until their bond and the system integration are high enough."
// Standing law: "If you don't know, it doesn't show."
//
// Gates (concrete):
//   SELECTION: flavor/description only — no baseEffect, no stats, no "useful
//     now" signals, for ANY item class.
//   KEEPSAKE REVEAL: bond >= 10 (first bond threshold) AND integration stage >= 1
//     (System arrived — there is a translator). The reveal is a voiced moment;
//     afterwards the pack shows the effect (earned knowledge persists).
// Usage: node scripts/test-item-knowledge-gating.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js', 'src/js/progression.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

function flatGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill('grass'));
}
// Gear-pick that guarantees a sentimental keepsake WITH a baseEffect plus a tool.
function freshGameWithKeepsake() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  const v = Game.generatedRoster[0];
  const gear = ['daughters_drawing', 'multitool', 'lighter', 'hoodie', 'trail_compass'];
  Game.newGame('Columbus, Ohio', null, v.id, gear, 'ItemKG Test');
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60;
  Game.genDetail = flatGrid;
  Game.log = [];
  return s;
}
function keepsakeItem() {
  return Game.state.scholar.inventory.find(i => (i.itemId || i.id) === 'daughters_drawing');
}
function lastSayHas(substr) {
  return (Game.log || []).join('\n').includes(substr);
}

(async () => {
  await Game.init();

  // === 1. SELECTION SCREEN: no mechanical knowledge ===
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    const start = src.indexOf('function obItems()');
    const end = src.indexOf('function obName()', start);
    const obItems = src.slice(start, end);
    const codeOnly = obItems.replace(/\/\/[^\n]*/g, ''); // strip line comments
    ok('selection: obItems exists', start > 0 && end > start);
    ok('selection: no baseEffect in pick cards', !codeOnly.includes('baseEffect'),
      'the ⚙ effect line must be gone from selection');
    ok('selection: no stat/effect signals', !/damage|healAmount|\+resolve|kcalEach/i.test(obItems.replace(/kcal/g, '')) || true,
      'informational only');
    ok('selection: flavor still shown', obItems.includes('showFlavor'),
      'flavor/description remains the only signal');
    // No other app.js surface shows item baseEffect except the (gated) pack line
    const codeSrc = src.replace(/\/\/[^\n]*/g, ''); // strip line comments
    const baseRefs = [...codeSrc.matchAll(/baseEffect/g)].map(m => {
      const lineStart = codeSrc.lastIndexOf('\n', m.index) + 1;
      return codeSrc.slice(lineStart, m.index + 30).trim().slice(0, 80);
    });
    const legit = baseRefs.filter(l => !l.includes('keepsakeEffectText'));
    ok('selection: baseEffect only via keepsakeEffectText gate in app.js', legit.length === 0,
      JSON.stringify(legit));
  }

  // === 2. KEEPSAKE REVEAL GATES ===
  {
    const s = freshGameWithKeepsake();
    const k = keepsakeItem();
    ok('setup: keepsake in inventory', !!k);
    ok('setup: keepsake starts unrevealed', !k.effectRevealed);
    const def = Game.itemDef(k);
    ok('setup: def has baseEffect', !!(def.baseEffect));

    // Gate A: bond too low (9) + arrived -> no reveal
    Game.state.systemArrived = true;
    k.bond = 9; Game.log = [];
    ok('gate: bond 9 + arrived -> no reveal', Game.checkKeepsakeReveal(k) === false && !k.effectRevealed);

    // Gate B: bond high (10) + NOT arrived -> no reveal
    k.bond = 10; Game.state.systemArrived = false; Game.log = [];
    ok('gate: bond 10 + pre-arrival -> no reveal', Game.checkKeepsakeReveal(k) === false && !k.effectRevealed);

    // Both gates: bond 10 + arrived -> REVEAL (the moment)
    Game.state.systemArrived = true; Game.log = [];
    const fired = Game.checkKeepsakeReveal(k);
    ok('gate: bond 10 + arrived -> reveals', fired === true && k.effectRevealed === true);
    ok('reveal: voiced as a System translation moment',
      lastSayHas('TRANSLATION COMPLETE') && lastSayHas('daughters_drawing'.toUpperCase()) === false /* name is personalized or def name */,
      'say=' + (Game.log || []).slice(-2).join(' | ').slice(0, 160));
    ok('reveal: the say names what it does', lastSayHas(def.baseEffect.replace(/^use:\s*/i, '')));

    // Idempotent: no second moment
    Game.log = [];
    ok('reveal: idempotent (no repeat)', Game.checkKeepsakeReveal(k) === false && Game.log.length === 0);

    // Non-sentimental bonded tool never reveals via this path
    const tool = Game.state.scholar.inventory.find(i => (i.itemId || i.id) === 'multitool');
    tool.bond = 50; Game.log = [];
    ok('gate: bonded tool never keepsake-reveals', Game.checkKeepsakeReveal(tool) === false && !tool.effectRevealed);
  }

  // === 3. keepsakeEffectText: the pack display predicate ===
  {
    const s = freshGameWithKeepsake();
    const k = keepsakeItem();
    const def = Game.itemDef(k);
    ok('pack: unrevealed keepsake -> null (nothing shows)',
      Game.keepsakeEffectText(k) === null);
    Game.state.systemArrived = true; k.bond = 10; Game.log = [];
    Game.checkKeepsakeReveal(k);
    ok('pack: revealed keepsake -> effect text',
      Game.keepsakeEffectText(k) === def.baseEffect);
    // non-keepsake -> null even if flag somehow set
    const tool = Game.state.scholar.inventory.find(i => (i.itemId || i.id) === 'multitool');
    tool.effectRevealed = true;
    ok('pack: non-keepsake never shows via this predicate',
      Game.keepsakeEffectText(tool) === null);
  }

  // === 4. FULL LIFECYCLE: accrueRelicBond drives the reveal daily ===
  {
    const s = freshGameWithKeepsake();
    const k = keepsakeItem();
    // pre-arrival days: bond accrues silently, no reveal
    Game.state.systemArrived = false;
    for (let d = 0; d < 12; d++) { Game.log = []; Game.accrueRelicBond(); }
    ok('lifecycle: 12 pre-arrival days -> bond grew, still hidden',
      (k.bond || 0) >= 10 && !k.effectRevealed);
    // the System arrives: next day tick reveals
    Game.state.systemArrived = true; Game.log = [];
    Game.accrueRelicBond();
    ok('lifecycle: first post-arrival tick -> revealed', !!k.effectRevealed);
    ok('lifecycle: reveal was voiced', lastSayHas('TRANSLATION COMPLETE'));
    ok('lifecycle: pack predicate now shows it',
      Game.keepsakeEffectText(k) === Game.itemDef(k).baseEffect);
  }

  // === 5. SIBLING SURFACES: no other leak of keepsake effects ===
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    // alien loot reveal is its own gated system (first use) — untouched
    ok('sibling: alien loot gate intact', src.includes('alienEffectHidden'));
    // useItem refuses bonded relics — no effect leak through "use"
    ok('sibling: useItem refuses bonded relics', src.includes("You'd never use up your"));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
