// Knowledge-gating audit pass (Steve 2026-10-06): "if you don't know, it doesn't show."
// Companion to scripts/test-knowledge-gating.js (2026-10-05, meat/noun gating).
// This pass covers the LEAKS FIXED in this audit:
//   1. encThreatLines default branch: the true shortName ('boar') only once the
//      village has named it or the System has arrived — same gate as
//      encShortLabel. Pre-naming, the strange descriptor speaks. Affected:
//      bulldozer, hushwolf, white_noise_heron, speedbump_turtle, mirror_stag.
//   2. targeting-bar ⚠ marker: gated behind encTelegraphKnown, same as the
//      combat strip (src/js/app.js line ~1466). Engine gate asserted here;
//      DOM rendering verified by visual pass.
// Also re-asserts the established gates on the fixed surfaces' siblings:
//   3. tbTelegraphCue: dread for the ignorant, knownCue coaching once learned.
//   4. monsterDisplayName: descriptor pre-System, true name post-System.
//   5. encAnimalCue: null until the animal is learned.
//   6. encAttackName / encShortLabel gates unchanged.
// Usage: node scripts/test-knowledge-gating-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function drain() { const l = (Game.log || []).join('\n'); Game.log = []; return l; }

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.log = [];
  Game.state.codex.monsters = {};
  Game.state.systemArrived = false;
  return s;
}
function mdef(id) { return (Game.data.monsters || []).find(m => m.id === id); }
// Minimal fighter stand-in: name via the gated display function, like spawn does.
function fighterFor(id) {
  const md = mdef(id);
  return { kind: 'monster', mdef: md, name: Game.monsterDisplayName(id) };
}

(async () => {
  await Game.init();
  freshGame();

  // ---------- 1. encThreatLines: true shortName is knowledge-gated ----------
  {
    const m = fighterFor('bulldozer'); // default branch: shortName 'boar'
    const lines = Game.encThreatLines(m);
    const blob = lines.notice + ' | ' + lines.pain + ' | ' + lines.snap;
    ok('threatLines unknown: no true shortName', !/\bboar\b/i.test(blob), blob);
    ok('threatLines unknown: descriptor speaks', /Something huge, rooting in the underbrush turns toward/i.test(lines.notice), lines.notice);
    ok('threatLines unknown: no tactical coaching', !/shout|scatter|dodge|flank|fire|circle/i.test(blob), blob);
    // village names it
    Game.state.codex.monsters.bulldozer = { villageName: 'Big Bess' };
    const named = Game.encThreatLines(fighterFor('bulldozer'));
    ok('threatLines named: true shortName shown', /\bboar\b/i.test(named.notice), named.notice);
    delete Game.state.codex.monsters.bulldozer;
    // System arrives
    Game.state.systemArrived = true;
    const sys = Game.encThreatLines(fighterFor('bulldozer'));
    ok('threatLines post-System: true shortName shown', /\bboar\b/i.test(sys.notice), sys.notice);
    Game.state.systemArrived = false;
    // mirror_stag (Grief Counselor, shortName 'stag') — same discipline
    const stagU = Game.encThreatLines(fighterFor('mirror_stag'));
    ok('threatLines stag unknown: no true shortName', !/\bstag\b/i.test(stagU.notice + stagU.snap), stagU.notice);
    // deer keeps its own fixed lines
    const deer = Game.encThreatLines(fighterFor('gallowdeer'));
    ok('threatLines deer: fixed lines preserved', /deer's head swings toward/.test(deer.notice), deer.notice);
    // custom threatLines still override the default
    const hum = Game.encThreatLines(fighterFor('hummice'));
    ok('threatLines custom: hummice bespoke kept', /hum shifts pitch toward/.test(hum.notice), hum.notice);
  }

  // ---------- 2. targeting-bar ⚠ gate (engine half: encTelegraphKnown) ----------
  {
    const m = fighterFor('bulldozer');
    ok('encTelegraphKnown false for unobserved', !Game.encTelegraphKnown(m));
    const atkName = (mdef('bulldozer').attack || {}).name;
    Game.state.codex.monsters.bulldozer = { patterns: {} };
    Game.state.codex.monsters.bulldozer.patterns[atkName] = 'desc';
    ok('encTelegraphKnown true after pattern learned', !!Game.encTelegraphKnown(m));
    delete Game.state.codex.monsters.bulldozer;
    // app.js targeting bar now calls this exact gate before adding ' ⚠'
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    ok('targeting bar gates ⚠ behind encTelegraphKnown',
      /encTelegraphKnown\([^)]*\)\s*\)\s*\?\s*Game\.encTelegraphKnown/.test(appSrc) ||
      /const tKnown = Game\.encTelegraphKnown \? Game\.encTelegraphKnown\(f\) : false/.test(appSrc));
    ok('targeting bar: no ungated telegraph ⚠ remains',
      !/if \(f\.telegraph\) status \+= ' ⚠';/.test(appSrc));
  }

  // ---------- 3. tbTelegraphCue: dread for the ignorant, coaching for the learned ----------
  {
    const md = mdef('hummice');
    const m = { kind: 'monster', mdef: md, telegraph: { turnsLeft: 1 }, mx: 4, my: 4 };
    const dread = Game.tbTelegraphCue(m);
    ok('cue unknown: no "You know this one"', !/You know this one/.test(dread), dread);
    ok('cue unknown: no knownCue coaching', !/STACKS while you stand/.test(dread), dread);
    ok('cue unknown: still warns', /hum rises/i.test(dread), dread);
    const atkName = (md.attack || {}).name;
    Game.state.codex.monsters.hummice = { patterns: {} };
    Game.state.codex.monsters.hummice.patterns[atkName] = 'desc';
    const coached = Game.tbTelegraphCue(m);
    ok('cue known: "You know this one" appears', /You know this one/.test(coached), coached);
    ok('cue known: knownCue coaching appended', /STACKS while you stand/.test(coached), coached);
    delete Game.state.codex.monsters.hummice;
  }

  // ---------- 4. monsterDisplayName ----------
  {
    ok('displayName pre-System: descriptor',
      Game.monsterDisplayName('hummice') === mdef('hummice').unknown, Game.monsterDisplayName('hummice'));
    Game.state.systemArrived = true;
    ok('displayName post-System: true name',
      Game.monsterDisplayName('hummice') === 'Hummice', Game.monsterDisplayName('hummice'));
    Game.state.systemArrived = false;
  }

  // ---------- 5. encAnimalCue gating ----------
  {
    Game.state.codex.animalEncounters = {};
    ok('animalCue unknown: null', Game.encAnimalCue('rabbit') === null, String(Game.encAnimalCue('rabbit')));
    Game.state.codex.animalEncounters.rabbit = 3;
    const cue = Game.encAnimalCue('rabbit');
    ok('animalCue known: coaching string', typeof cue === 'string' && cue.length > 10, String(cue).slice(0, 60));
  }

  // ---------- 6. attack names / short labels stay gated ----------
  {
    const atkName = (mdef('hummice').attack || {}).name;
    const m = fighterFor('hummice');
    ok('attackName unknown: "the attack"', Game.encAttackName(m, atkName) === 'the attack');
    Game.state.codex.monsters.hummice = { patterns: {} };
    Game.state.codex.monsters.hummice.patterns[atkName] = 'desc';
    ok('attackName known: true name', Game.encAttackName(m, atkName) === atkName);
    delete Game.state.codex.monsters.hummice;
    ok('encShortLabel unknown: null', Game.encShortLabel(fighterFor('hummice')) === null);
    Game.state.codex.monsters.hummice = { villageName: 'Hummers' };
    ok('encShortLabel named: hum-mouse', Game.encShortLabel(fighterFor('hummice')) === 'hum-mouse');
    delete Game.state.codex.monsters.hummice;
  }

  drain();
  console.log(`\nknowledge-gating-20261006: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
