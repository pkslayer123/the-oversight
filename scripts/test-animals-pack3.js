// Animal pack 3 — hunting/flee/butchering deepening (Steve 2026-10-06).
// Covers: encAnimalCue completeness (incl. the thin four), encKillLine +
// killText data, aquatic hiding (miss -> dive -> wait -> re-emerge),
// opossum miss -> flop, muskrat dive-happy + knowledge-gated dive text,
// treed text gating, armadillo hunker + startle leap, crow mob + whAlert,
// bluegill bed-hiding (strike still allowed), rat snake strike-react + bite,
// sign hints (knowledge-gated), stick method words, hiding/hunkered badges,
// audio dispatch completeness for all fired animal hooks.
// Usage: node scripts/test-animals-pack3.js
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

function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = flatGrid;
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  return s;
}
function spawn(s, id, mx, my, aware) {
  const cfg = Game.encPreyCfg(id);
  s.animal = { id, mx, my, aware: aware == null ? 0 : aware, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
  return s.animal;
}
function adef(id) { return Game.data.animals.find(x => x.id === id); }
function know(s, id) { Game.state.codex.animalEncounters[id] = 3; }
function waterGrid() {
  const g = flatGrid(); g[4][5] = 'water'; g[5][4] = 'creek'; return g;
}

(async () => {
  await Game.init();
  const animals = Game.data.animals;

  // ---------- 1. encAnimalCue: every behavior in the data has a cue ----------
  {
    const behaviors = [...new Set(animals.map(a => a.behavior).filter(Boolean))];
    const s = freshGame();
    const missing = [];
    for (const b of behaviors) {
      const id = animals.find(a => a.behavior === b).id;
      know(s, id);
      if (!Game.encAnimalCue(id)) missing.push(b);
    }
    ok('encAnimalCue covers every behavior in animals.json', missing.length === 0, missing.join(','));
    // cues must not leak true names (they're shown pre-knowledge... actually
    // cues only show when known — but they must still not name OTHER animals)
    const names = animals.map(a => a.name.toLowerCase());
    const s2 = freshGame();
    let leak = null;
    for (const a of animals) {
      know(s2, a.id);
      const cue = (Game.encAnimalCue(a.id) || '').toLowerCase();
      for (const n of names) { if (cue.includes(n) && n !== a.name.toLowerCase()) { leak = a.id + ' names ' + n; break; } }
    }
    ok('encAnimalCue texts name no animal but their own', !leak, leak || '');
  }

  // ---------- 2. encKillLine + killText data ----------
  {
    const noKt = animals.filter(a => !a.killText).map(a => a.id);
    ok('every animal has killText', noKt.length === 0, noKt.join(','));
    const noPh = animals.filter(a => (a.killText || '').indexOf('{kcal}') < 0).map(a => a.id);
    ok('every killText has a {kcal} placeholder', noPh.length === 0, noPh.join(','));
    const s = freshGame();
    know(s, 'white_tailed_deer');
    const line = Game.encKillLine(adef('white_tailed_deer'), 20000);
    ok('encKillLine substitutes {kcal}', line.indexOf('20000') >= 0 && line.indexOf('{kcal}') < 0, line.slice(0, 60));
    ok('encKillLine kill text is vivid when known', /organs first/i.test(line), line.slice(0, 60));
    const s2 = freshGame(); // unknown
    const line2 = Game.encKillLine(adef('white_tailed_deer'), 20000);
    ok('encKillLine falls back to generic pre-knowledge', /^About 20000 kcal of meat on the bone/.test(line2), line2.slice(0, 60));
  }

  // ---------- 3. aquatic hide: miss -> dive -> wait -> re-emerge ----------
  {
    const s = freshGame();
    s.mx = 4; s.my = 4;
    const a = spawn(s, 'creek_chub', 5, 4);
    const r = Game.encMissReact(a, adef('creek_chub'));
    ok('chub miss -> hiding (not bolt)', a.pstate === 'hiding' && a.hideTurns === 3, 'pstate=' + a.pstate);
    ok('chub miss does not end encounter', r === false && !!s.animal);
    Game.animalTurn(); Game.animalTurn();
    ok('chub still hiding after 2 turns', s.animal && s.animal.pstate === 'hiding', s.animal && s.animal.pstate);
    Game.animalTurn();
    ok('chub re-emerges after 3 turns', s.animal && s.animal.pstate === 'graze', s.animal && s.animal.pstate);
    const l = drain();
    ok('re-emerge text mentions ripples', /ripples settle/i.test(l), l.slice(0, 120));
  }
  // strike blocked while hiding (chub/frog), allowed for crayfish
  {
    const s = freshGame();
    s.mx = 4; s.my = 4;
    const a = spawn(s, 'bullfrog', 5, 4); a.pstate = 'hiding'; a.hideTurns = 3;
    drain();
    Game.huntAnimal();
    const l = drain();
    ok('strike on hiding frog is blocked honestly', /can't hit what you can't see/i.test(l), l.slice(0, 100));
    ok('hiding frog survives the blocked strike', !!s.animal && s.animal.pstate === 'hiding');
  }
  {
    const s = freshGame();
    s.mx = 4; s.my = 4; s.equipped = {};
    const a = spawn(s, 'crayfish', 5, 4); a.pstate = 'hiding'; a.hideTurns = 3;
    drain();
    Game.huntAnimal();
    const l = drain();
    ok('strike on hiding crayfish is allowed (reach under the rock)', !/can't hit what you can't see/i.test(l), l.slice(0, 100));
  }
  // full-miss feedback is honest for aquatic
  {
    const s = freshGame();
    s.mx = 4; s.my = 4; s.equipped = {};
    const a = spawn(s, 'creek_chub', 5, 4);
    const realRandom = Math.random;
    Math.random = () => 0.999; // force clean miss
    drain();
    Game.huntAnimal();
    Math.random = realRandom;
    const l = drain();
    ok('clean miss on chub says vanishes, not bolts', /vanishes under the water/i.test(l) && !/bolts\./i.test(l), l.slice(0, 140));
    ok('chub is hiding after the clean miss', s.animal && s.animal.pstate === 'hiding', s.animal && s.animal.pstate);
  }

  // ---------- 4. opossum miss -> flop ----------
  {
    const s = freshGame();
    s.mx = 4; s.my = 4;
    const a = spawn(s, 'opossum', 5, 4, 0.5);
    drain();
    const r = Game.encMissReact(a, adef('opossum'));
    ok('opossum miss -> flop', a.pstate === 'playing_dead', 'pstate=' + a.pstate);
    ok('opossum flop skips animalTurn but encounter continues', r === true && !!s.animal);
    const l = drain();
    ok('flop text fires on miss', /playing dead/i.test(l), l.slice(0, 100));
  }

  // ---------- 5. muskrat dive-happy + knowledge-gated dive text ----------
  {
    const s = freshGame();
    Game.genDetail = waterGrid;
    s.mx = 4; s.my = 4;
    const a = spawn(s, 'muskrat', 4, 5, 0.7); // on the creek tile
    drain();
    Game.animalTurn();
    const l = drain();
    ok('muskrat dives early near water (dive-happy)', !s.animal, 'animal still there');
    ok('unknown muskrat dive uses generic text', /vanishes — under the bank/i.test(l) && !/ripples/i.test(l), l.slice(0, 120));
  }
  {
    const s = freshGame();
    Game.genDetail = waterGrid;
    s.mx = 4; s.my = 4;
    know(s, 'muskrat');
    const a = spawn(s, 'muskrat', 4, 5, 0.7);
    drain();
    Game.animalTurn();
    const l = drain();
    ok('known muskrat dive uses vivid huntText', /ripples/i.test(l), l.slice(0, 120));
  }
  // treed text gating (squirrel)
  {
    const s = freshGame();
    const g = flatGrid(); g[4][5] = 'tree';
    Game.genDetail = () => g;
    s.mx = 4; s.my = 4;
    const a = spawn(s, 'gray_squirrel', 4, 5, 1); a.pstate = 'bolt';
    drain();
    Game.encBehaviorAfterBolt(a);
    const l = drain();
    ok('unknown squirrel treed text is generic', /spirals up the trunk/i.test(l) && !/scolding/i.test(l), l.slice(0, 120));
    ok('treed squirrel ends encounter', !s.animal);
  }
  {
    const s = freshGame();
    const g = flatGrid(); g[4][5] = 'tree';
    Game.genDetail = () => g;
    s.mx = 4; s.my = 4;
    know(s, 'gray_squirrel');
    const a = spawn(s, 'gray_squirrel', 4, 5, 1); a.pstate = 'bolt';
    drain();
    Game.encBehaviorAfterBolt(a);
    const l = drain();
    ok('known squirrel treed text is vivid huntText', /scolding, not scared/i.test(l), l.slice(0, 120));
  }

  // ---------- 6. armadillo: hunker, never bolts, startle leap ----------
  {
    const s = freshGame();
    s.mx = 4; s.my = 4;
    const a = spawn(s, 'nine_banded_armadillo', 6, 4, 0.7);
    drain();
    Game.animalTurn();
    const l = drain();
    ok('armadillo hunkers at aware 0.7 in range', a.pstate === 'hunkered', 'pstate=' + a.pstate);
    ok('hunker text is distinct (armor plates)', /armor plates locking/i.test(l), l.slice(0, 120));
    ok('hunkered badge exists', Game.encPreyPhaseBadge(a) === '🛡 hunkered', Game.encPreyPhaseBadge(a));
    // never bolts: awareness maxed, several turns
    a.aware = 1;
    for (let i = 0; i < 3; i++) Game.animalTurn();
    ok('armadillo never bolts (still in encounter)', !!s.animal, s.animal ? s.animal.pstate : 'GONE');
    // startle leap on a failed barehanded grab (via encMissReact — the leap
    // never pre-empts a clean kill)
    s.equipped = {};
    a.mx = 5; a.my = 4; // adjacent
    a.pstate = 'graze'; a.aware = 0.8; a.leaptOnce = false;
    const realRandom = Math.random;
    Math.random = () => 0.1; // leap fires (< 0.5)
    drain();
    const lr = Game.encMissReact(a, adef('nine_banded_armadillo'));
    Math.random = realRandom;
    const l2 = drain();
    ok('failed grab triggers startle leap', /LEAPS straight up/i.test(l2), l2.slice(0, 120));
    ok('leap does not end the encounter', lr === false && !!s.animal);
    ok('leap fires once per encounter', a.leaptOnce === true);
  }

  // ---------- 7. crow: mob, whAlert, woods on edge ----------
  {
    const s = freshGame();
    s.mx = 4; s.my = 4;
    const a = spawn(s, 'american_crow', 6, 4, 0.5);
    drain();
    Game.animalTurn();
    const l = drain();
    ok('crow mobs at aware 0.5 (encounter ends)', !s.animal, 'still there');
    ok('crow mob sets woods-on-edge', !!(s.whAlert && s.whAlert.day === s.day), JSON.stringify(s.whAlert));
    ok('crow mob text is about cawing', /cawing/i.test(l), l.slice(0, 120));
    ok('crow mob keeps the on-edge hint', /woods are on edge/i.test(l), l.slice(0, 160));
  }
  {
    const s = freshGame();
    s.mx = 4; s.my = 4;
    know(s, 'american_crow');
    const a = spawn(s, 'american_crow', 6, 4, 0.5);
    drain();
    Game.animalTurn();
    const l = drain();
    ok('known crow mob uses vivid huntText', /whole treeline joins in/i.test(l), l.slice(0, 120));
  }

  // ---------- 8. bluegill: bed-hiding, never leaves ----------
  {
    const s = freshGame();
    s.mx = 4; s.my = 4;
    const a = spawn(s, 'bluegill', 5, 4, 1);
    drain();
    Game.animalTurn();
    const l = drain();
    ok('bluegill darts to bed center at aware 1', a.pstate === 'hiding', 'pstate=' + a.pstate);
    ok('bed text is distinct', /middle of its bed/i.test(l), l.slice(0, 120));
    ok('hiding badge exists', Game.encPreyPhaseBadge({ pstate: 'hiding' }) === '🫥 hiding');
    // strike allowed while bed-hiding (reach down and take it)
    s.equipped = {};
    drain();
    Game.huntAnimal();
    const l2 = drain();
    ok('strike on bed-hiding bluegill is allowed', !/can't hit what you can't see/i.test(l2), l2.slice(0, 100));
  }

  // ---------- 9. rat snake: strike-react bolt + bite ----------
  {
    const s = freshGame();
    s.mx = 4; s.my = 4;
    const a = spawn(s, 'gray_rat_snake', 5, 4, 0.3);
    const realRandom = Math.random;
    Math.random = () => 0.1; // < 0.4: pre-bolt
    drain();
    const r = Game.encBehaviorStrikeReact(a);
    Math.random = realRandom;
    const l = drain();
    ok('rat snake may bolt before the strike lands', r === true && !s.animal, 'r=' + r);
    ok('rat snake bolt text is distinct', /pours itself/i.test(l), l.slice(0, 120));
  }
  {
    // freeze tell (not shed-skin sign) at the wary moment
    const s = freshGame();
    s.mx = 4; s.my = 4;
    const a = spawn(s, 'gray_rat_snake', 6, 4, 0);
    drain();
    Game.animalTurn(); Game.animalTurn(); Game.animalTurn();
    const l = drain();
    ok('rat snake freeze tell is behavioral', /utterly still/i.test(l), l.slice(0, 120));
  }

  // ---------- 10. sign hints: knowledge-gated ----------
  {
    const s = freshGame();
    const realPT = Game.playerTile, realAL = Game.abilityLevel, realRandom = Math.random;
    Game.playerTile = () => ({ type: 'creek' });
    Game.abilityLevel = () => 3;
    const seq = [0.5, 0.1, 0.0]; // no spawn, hint fires, pick candidates[0]
    Math.random = () => seq.shift() ?? 0.9;
    drain();
    Game.checkAnimals();
    const l = drain();
    Math.random = realRandom; Game.playerTile = realPT; Game.abilityLevel = realAL;
    ok('tracker L2+ gets a sign hint on no-spawn', /Sign — /i.test(l), l.slice(0, 120));
    ok('unknown species reads as "something"', /Sign — something passed here/i.test(l), l.slice(0, 120));
  }
  {
    const s = freshGame();
    know(s, 'creek_chub');
    const realPT = Game.playerTile, realAL = Game.abilityLevel, realRandom = Math.random;
    Game.playerTile = () => ({ type: 'creek' });
    Game.abilityLevel = () => 3;
    const seq = [0.5, 0.1, 0.0];
    Math.random = () => seq.shift() ?? 0.9;
    drain();
    Game.checkAnimals();
    const l = drain();
    Math.random = realRandom; Game.playerTile = realPT; Game.abilityLevel = realAL;
    ok('known species is named in the sign hint', /Sign — a small fish flashing in the water passed here/i.test(l), l.slice(0, 140));
  }

  // ---------- 11. stick method words ----------
  {
    ok('encMethodWords(stick)', Game.encMethodWords('stick') === 'a forked stick', Game.encMethodWords('stick'));
    ok('encMethodToolName(stick)', Game.encMethodToolName('stick') === 'a forked stick');
    ok('encMethodToolReady(stick) is true (sticks are everywhere)', Game.encMethodToolReady('stick') === true);
  }

  // ---------- 12. audio dispatch: every fired animal hook resolves ----------
  {
    const enc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'encounters.js'), 'utf8');
    const app = fs.readFileSync(path.join(ROOT, 'src', 'js', 'app.js'), 'utf8');
    const fired = [...new Set([...enc.matchAll(/audioEvent\('([A-Za-z0-9_]+)'\)/g)].map(m => m[1]))];
    const hdr = app.indexOf('=========== AUDIO COMPLETION');
    const ret = app.indexOf('    return {', hdr);
    const end = app.indexOf('})();', ret);
    const table = app.slice(ret, end);
    const keys = new Set([...table.matchAll(/^      ([A-Za-z0-9_]+)\s*\(/gm)].map(m => m[1]));
    const missing = fired.filter(n => !keys.has(n));
    ok('all fired audio hooks are in the CombatAudio dispatch', missing.length === 0, missing.join(','));
    ok('animal hooks fired: ' + fired.length, fired.length >= 20, String(fired.length));
  }

  // ---------- 13. flee text gating: no true-name leak pre-knowledge ----------
  {
    const s = freshGame();
    let leak = null;
    for (const a of animals) {
      const txt = Game.encFleeText({ id: a.id }, 'It bolts!');
      if (txt !== 'It bolts!' && txt.toLowerCase().includes(a.name.toLowerCase())) { leak = a.id; break; }
    }
    ok('encFleeText never leaks a true name pre-knowledge', !leak, leak || '');
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
