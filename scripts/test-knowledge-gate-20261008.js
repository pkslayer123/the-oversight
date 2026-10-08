// Knowledge-gating UI audit proof (Steve 2026-10-08, worker knowledge-gate).
// Proves, against REAL Game code and the REAL app.js render functions:
//   A. LEAKS CLOSED (unknown -> hidden)
//      1. beastCircleKeys dead branch is gone from app.js render paths — no
//         live callers remain; tbAllTelegraphCells runs without the helper.
//      2. Codex BEASTS no longer shows the telegraph tell after a single
//         sighting — gated on surviving the full attack (tbPatternKnown) or
//         slaying (stage === 'slain').
//      3. Combat strip: first encounter shows no ⚠, no cue text, no true name.
//   B. EARNED KNOWLEDGE SURFACES (known -> shown)
//      4. After surviving the attack (tbLearnPattern), the combat strip shows
//         the ⚠ marker and the cue line WITH the earned coaching
//         ("You know this one: <attack name> ...").
//      5. Codex BEASTS, once earned, surfaces attack name + telegraph tell +
//         knownCue + knownTactics (the payoff beat).
//      6. monsterDisplayName: descriptor while unknown, true/village name
//         once named.
// Run: node scripts/test-knowledge-gate-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/statusEffects.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function def(id) {
  const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const mlist = Array.isArray(md) ? md : md.monsters;
  return mlist.find(m => m.id === id);
}
// Extract a top-level `function NAME(` from app.js and eval it against a Game.
function extractFn(name, stubGame, extra) {
  const m = APP.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}\\n'));
  if (!m) throw new Error('function ' + name + ' not found in app.js');
  const Game = stubGame;
  const esc = (s) => String(s).replace(/</g, '&lt;');
  const monsterSpriteHtml = () => '';
  let prelude = '';
  if (extra) prelude = extra;
  return eval(prelude + '(' + m[0].replace('function ' + name, 'function') + ')');
}

(async () => {
  await Game.init();

  console.log('\n== A1: beastCircleKeys cleanup — no live callers in app.js ==');
  {
    const live = APP.split('\n').filter(l => l.includes('Game.beastCircleKeys(') && !l.trim().startsWith('//'));
    ok(live.length === 0, 'no live Game.beastCircleKeys() calls in app.js', live.join(' | ').slice(0, 200));
    ok(!APP.includes('const _circle ='), 'dead _circle branch removed from renderDetail');
    ok(!APP.includes("the delegate's closing circle"), 'stale circleRing comment removed');
    // manager synths: kept by design (audio-section owned, no callers outside
    // dispatch). Verify the dispatch table still registers them so nothing breaks.
    for (const s of ['managerCircle', 'managerCharge', 'managerDebrief', 'managerFear']) {
      ok(new RegExp('function ' + s + '\\(').test(APP), s + ' synth still defined');
      ok(new RegExp(s + '\\(\\) \\{ ' + s + '\\(\\); \\}').test(APP), s + ' still in dispatch table');
    }
  }

  console.log('\n== A2: codex BEASTS telegraph gate (source) ==');
  {
    const beastsBlock = APP.slice(APP.indexOf("BEASTS</h1>"));
    ok(beastsBlock.includes('Game.tbPatternKnown(id, atkName)'), 'BEASTS gates tell on Game.tbPatternKnown(id, atkName)');
    ok(beastsBlock.includes("m.stage === 'slain'"), 'slain stage also unlocks the tell');
    ok(!/attacksSeen\.length\}× — \$\{esc\(\(md\.attack/.test(beastsBlock), 'old unconditional telegraph line is gone');
    ok(beastsBlock.includes('enc.knownCue') && beastsBlock.includes('enc.knownTactics'), 'earned coaching (knownCue/knownTactics) surfaces in codex');
    ok(beastsBlock.includes("you haven't lived through its full attack yet"), 'honest un-earned coaching text present');
  }

  console.log('\n== live setup: bulldozer combat, fresh codex ==');
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.health = 99999; Game.state.scholar.maxHealth = 99999;
  Game.ensureVillagerPositions();
  const mid = 'bulldozer';
  Game.state.scholar.monster = { id: mid, mx: 6, my: 4 };
  Game.startCombat(mid);
  const m = Game.tbfight.fighters.find(f => f.kind === 'monster');
  m.hp = 99999; m.maxHp = 99999;
  const d = def(mid);
  const atkName = d.attack.name;

  console.log('\n== A3+B6: unknown -> hidden; descriptor not true name ==');
  {
    ok(Game.encTelegraphKnown(m) === false, 'fresh encounter: encTelegraphKnown false');
    ok(Game.tbPatternKnown(mid, atkName) === false, 'fresh codex: tbPatternKnown false');
    const dn = Game.monsterDisplayName(mid);
    ok(dn !== d.name, 'display name is NOT the true name while unknown', dn);
    ok(!!d.unknown && dn === d.unknown, 'display name is the strange descriptor', dn);
    const strip = extractFn('combatStripHTML', Game)(Game.status());
    ok(!strip.includes('⚠'), 'combat strip: no warning marker while unknown');
    ok(!strip.includes('cs-telegraph'), 'combat strip: no cue line while unknown');
    ok(!strip.includes(d.name), 'combat strip: no true name while unknown');
    ok(strip.includes(d.unknown.split(' ')[0]) || strip.includes('⚔'), 'combat strip still renders (descriptor or COMBAT fallback)');
  }

  console.log('\n== B4: earned -> shown in combat strip ==');
  {
    Game.tbLearnPattern(m); // survive the full attack
    ok(Game.encTelegraphKnown(m) === true, 'after tbLearnPattern: encTelegraphKnown true');
    // give the monster a live telegraph so the cue line has something to say
    m.telegraph = { pattern: d.attack.pattern, cells: [], turnsLeft: 2, firing: 0 };
    const strip = extractFn('combatStripHTML', Game)(Game.status());
    ok(strip.includes('⚠'), 'combat strip: warning marker appears once known');
    ok(strip.includes('cs-telegraph'), 'combat strip: cue line appears once known');
    ok(strip.includes('You know this one: ' + atkName), 'cue line carries earned coaching with attack name');
    delete m.telegraph;
  }

  console.log('\n== B5: codex BEASTS gate predicate flips hidden -> shown ==');
  {
    // fresh codex entry, one sighting, pattern NOT learned -> UI must hide tell
    const entry = (Game.state.codex.monsters || {})[mid] || {};
    entry.patterns = {};
    const hidden = !(entry.stage === 'slain' || (atkName && Game.tbPatternKnown(mid, atkName)));
    ok(hidden, 'predicate: telegraph tell hidden before learning');
    Game.tbLearnPattern(m);
    const shown = (entry.stage === 'slain' || (atkName && Game.tbPatternKnown(mid, atkName))) ? true : false;
    ok(shown, 'predicate: telegraph tell shown after learning');
    entry.stage = 'slain'; entry.patterns = {};
    const shownSlain = (entry.stage === 'slain' || (atkName && Game.tbPatternKnown(mid, atkName))) ? true : false;
    ok(shownSlain, 'predicate: slain unlocks the tell even without pattern');
    delete entry.stage;
  }

  console.log('\n== A1b: render path does not crash without beastCircleKeys ==');
  {
    const tb = extractFn('tbAllTelegraphCells', {
      tbfight: { fighters: [{ kind: 'monster', alive: true, mdef: { id: 'bulldozer' }, telegraph: null }] },
      encTelegraphKnown: () => false,
    });
    let out = null, threw = null;
    try { out = tb(); } catch (e) { threw = e; }
    ok(!threw, 'tbAllTelegraphCells runs with no beastCircleKeys helper', threw && threw.message);
    ok(out && out.burst instanceof Set, 'returns bucket sets');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
