#!/usr/bin/env node
// BREAK-IT knowledge r3 (2026-10-10): synergy tech: legs read a dead store.
//
// CATCH (fix): the 2026-10-07 grantKnowledge unification moved ALL technique
// writes to state.codex.techniques, but three synergy readers still read
// state.scholar.codex.techniques — a store that is only ever initialized to
// {} (studyVillageCodex) and never written. Result: all 7 synergies with a
// tech: leg (tidecaller, wildreader, trailblazers_promise, stones_remember,
// smokehouse, green_highway, read_the_patch) could NEVER unlock, and the
// getNearSynergies "one leg away" hints never listed them. The design comment
// beside the reader even promises "A technique from a village codex + your
// skill level + an ability = something greater" — dead on arrival.
//
// FIX (src/js/game.js): the three readers now read state.codex.techniques,
// the canonical store (same as the skill: legs read state.codex.skills).
// The dead scholar.codex init in studyVillageCodex was removed.
//
// ATTACKS (all four classes):
//   EXPLOIT  (held): teach-loop re-trigger farming — identifyPlant and
//            grantKnowledge both refuse repeats (no-downgrade, no re-grant),
//            so cycling villagers/lessons/death cannot mint free integration.
//   EXPLOIT  (held): flowVillageKnowledge / studyVillageCodex re-sync — the
//            shared-village flow and the cross-village study both route
//            through grantKnowledge; repeats return false, no double grants,
//            and the study costs a day-part per visit.
//   SOFTLOCK (held): mantle pass keeps state.codex (wipe() only on game over)
//            — the new adventurer inherits the village's knowledge; the
//            L1->L2 loop cannot strand on a fresh body.
//   HONESTY  (held): alien disease surfaces — apply/tick/expire text is
//            symptom-only; contractDisease and diagnoseDisease refuse the
//            alien pool; sickDiseases filters mundane-only; the afflictions
//            panel is the designated alien surface (name + what happened /
//            what changed / what it costs, no earthly treatment buttons).
//   DEAD-CODE(held): every public function in journal.js, codex-people.js,
//            examine.js, perceive.js has a live caller; all knowledge modules
//            are loaded in index.html.
//
// Usage: node scripts/test-break-knowledge-r3-20261010.js
//        BEFORE=1 node scripts/test-break-knowledge-r3-20261010.js (pre-fix HEAD: must FAIL)
//        SEED=99 node scripts/test-break-knowledge-r3-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261010', 10);

// Only game.js changed this pass. BEFORE mode evals the pre-fix HEAD copy.
const PRE = ['src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bkr3-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bkr3-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL script list in index.html order, minus DOM-only (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: runtime checks take the sync path without window
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
}

// Rig the tidecaller legs: technique via the real grant path, skill at L2,
// ability at level 2, and a use-log entry for the sequential order's first leg.
function rigTidecaller() {
  const sch = Game.state.scholar;
  ok('grant path writes state.codex.techniques',
    Game.grantKnowledge('technique', 'tide_reading', 1, { type: 'taught', by: 'Fisher Village' }) === true);
  Game.state.codex.skills = Game.state.codex.skills || {};
  Game.state.codex.skills.fishing = { level: 2, learnedDay: 0, via: 'rig' };
  sch.abilities = sch.abilities || [];
  sch.abilities.push({ id: 'water_breathing', level: 2 });
  sch.abilityUseLog = sch.abilityUseLog || [];
  return sch;
}

(async () => {
await Game.init();
Game.drama = () => {};
Game.audioEvent = () => {};
console.log(`seed=${SEED}`);

console.log('T1. tech: synergy leg fires through checkSynergyDiscovery');
{
  freshGame();
  const sch = rigTidecaller();
  const day = Game.state.scholar.day || 1;
  sch.abilityUseLog.push({ id: 'water_breathing', day, part: 0 });
  // sequential: water_breathing first, then 'fishing' (the skill leg, bare id)
  for (let i = 0; i < 3; i++) Game.checkSynergyDiscovery('fishing', { day, part: i });
  ok('tidecaller discovered after 3 sequential uses',
    (sch.synergies || []).includes('tidecaller'),
    'synergies=' + JSON.stringify(sch.synergies));
}

console.log('T2. getNearSynergies counts the technique leg as held');
{
  freshGame();
  const sch = rigTidecaller(); // tech + fishing L2, but NO water_breathing ability
  sch.abilities = [];
  const near = Game.getNearSynergies();
  const tc = near.find(x => x.id === 'tidecaller');
  ok('tidecaller is one leg away (have=2, need=water_breathing)', !!tc && tc.have === 2 && tc.need === 'water_breathing',
    'near=' + JSON.stringify(near.filter(x => x.id === 'tidecaller')));
}

console.log('T3. sibling legs: all 7 tech: synergies see their technique');
{
  freshGame();
  const syns = Game.data.synergies || [];
  const techSyns = syns.filter(s => (s.requires || []).some(r => r.startsWith('tech:')));
  ok('7 synergies carry tech: legs', techSyns.length === 7, 'found ' + techSyns.length);
  for (const syn of techSyns) {
    const tids = syn.requires.filter(r => r.startsWith('tech:')).map(r => r.slice(5));
    for (const tid of tids) Game.grantKnowledge('technique', tid, 1, { type: 'taught', by: 'r3' });
  }
  // every one of the 7 now has its technique leg readable where the engine reads
  const store = (Game.state.codex || {}).techniques || {};
  const allHeld = techSyns.every(s =>
    s.requires.filter(r => r.startsWith('tech:')).every(r => !!store[r.slice(5)]));
  ok('all 7 tech legs land in the store the synergy engine reads', allHeld);
}

console.log('T4. no-downgrade: repeat technique grants do not re-fire narration/grants');
{
  freshGame();
  let says = 0;
  const origSay = Game.say;
  Game.say = function (t) { if (/Technique learned/.test(String(t))) says++; try { return origSay.call(this, t); } catch (e) {} };
  const g1 = Game.grantKnowledge('technique', 'tide_reading', 1, { type: 'taught' });
  const g2 = Game.grantKnowledge('technique', 'tide_reading', 1, { type: 'taught' });
  Game.say = origSay;
  ok('first grant lands, repeat refuses', g1 === true && g2 === false, `g1=${g1} g2=${g2}`);
  ok('repeat grant narrates nothing', says === 1, `technique-learned says=${says}`);
}

console.log('T5. scholar.codex split store is gone (no stale readers remain)');
{
  freshGame();
  // source-level: BEFORE game.js has 3 this.state.scholar.codex readers + the
  // dead init; AFTER has none (strip comments: the fix's own comment names it).
  const gsrc = srcOf('src/js/game.js').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const stale = (gsrc.match(/scholar\.codex(?!Unlocked)/g) || []).length;
  ok('no stale this.state.scholar.codex readers remain in game.js', stale === 0, `stale refs=${stale}`);
  ok('food.js techniques() reads the same canonical store',
    typeof Game.knowsTechnique === 'function' && Game.knowsTechnique('tide_reading') === false,
    'pre-grant known=false');
  Game.grantKnowledge('technique', 'tide_reading', 1, { type: 'taught' });
  ok('knowsTechnique sees the granted technique', Game.knowsTechnique('tide_reading') === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
