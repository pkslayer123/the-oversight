// test-animals-js-gaps-20261008.js
// ANIMALS JS-GAPS PROOF (Steve 2026-10-08): the 5 js-side gaps from the
// animals-hunt audit (evidence/2026-10-08/animals-hunt-report.md, "JS gaps
// found — NOT fixed"). Gaps 2-4 were fixed by sibling commits on 2026-10-07
// (37243d6 cues+chase lines, cae8cb7 slow-miss truth); this test locks all
// five contracts behaviorally, played as a player, not just grepped.
//   1. fleeDifficulty wired into the strike flee-odds roll (Game.preyReaction)
//   2. knownCue coaching for the 12 audit behaviors (known→cue, unknown→null)
//   3. still/stealthy chase lines in the hunt flee path (owl/panther)
//   4. slow-miss fiction honesty (gila/turtle: no "bolts")
//   5. winded turns rotate 3 quiet beats (catchable-but-doomed, never spamy)
// Seeded; green on 3+ seeds required.
// Usage: node scripts/test-animals-js-gaps-20261008.js  (SEED=7 node ...)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- Seeded PRNG, installed BEFORE module eval (several modules capture
// ---- Math.random at load time; seeding after eval leaves them unseeded).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261008', 10) || 20261008;
Math.random = mulberry32(SEED);
console.log('seed: ' + SEED);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL [seed ${SEED}] ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---- window stub for eval (equipment.js needs window at load); deleted
// ---- before play so runtime takes the sync path.
global.window = global;
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

// Full production module list in index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js) and minus drama.js
// (top-level document access crashes node eval).
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
 'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
 'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js']
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

const animalsFile = path.join(ROOT, 'src/data/animals.json');
const _animalsRaw = JSON.parse(fs.readFileSync(animalsFile, 'utf8'));
const animals = Array.isArray(_animalsRaw) ? _animalsRaw : _animalsRaw.animals;

const firedAudio = [];
function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function drainLines() {
  const l = (Game.log || []).slice(); Game.log = [];
  const fb = (Game._feedback || []); Game._feedback = [];
  return l.concat(fb).map(String);
}
function setKnown(id, n) {
  Game.state.codex.animalEncounters = Game.state.codex.animalEncounters || {};
  Game.state.codex.animalEncounters[id] = n;
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 1500; s.health = 100; s.dayPart = 1;
  Game.dayPart = 1;
  Game.genDetail = flatGrid;
  Game.log = []; Game._feedback = [];
  Game.state.codex.animalEncounters = {};
  // neutralize the hunter-occupation fleeP confounder for gap-1 thresholds
  try {
    const v = (Game.data.villagers || []).find(x => x.id === Game.villagerId);
    if (v) v.formerOccupation = 'Teacher';
  } catch (e) {}
  firedAudio.length = 0;
  return s;
}
function placeAnimal(id, ax, ay, aware) {
  const cfg = Game.encPreyCfg(id);
  Game.state.scholar.animal = {
    id, mx: ax, my: ay,
    aware: aware == null ? 0 : aware,
    stamina: (cfg && cfg.stamina) || 5, pstate: 'graze', edgeTurns: 0
  };
  return Game.state.scholar.animal;
}
function rig(v) { Math.random = () => v; }
function unrig() { Math.random = mulberry32(SEED); }

(async () => {
  await Game.init();
  Game.audio = new Proxy({}, { get: (t, k) => (...a) => { firedAudio.push(String(k)); } });

  // ================= GAP 1: fleeDifficulty in the strike flee-odds roll =================
  // Play the roll itself (Game.preyReaction) with rigged RNG at thresholds
  // that distinguish wired vs unwired fleeP. aware=0.5 -> base fleeP 0.45.
  // Wired: trivial 0.30 / medium 0.45 / very_hard 0.60 / dangerous 0.25.
  console.log('\n-- GAP 1: fleeDifficulty drives the strike flee-odds roll --');
  {
    let s = freshGame();
    // gray_fox: very_hard — rigged roll 0.5 sits between unwired 0.45 and wired 0.60
    let a = placeAnimal('gray_fox', 6, 4, 0.5);
    rig(0.5);
    const foxBolted = Game.preyReaction(a);
    unrig();
    ok('very_hard fox bolts at a roll the old math would have let pass (0.5 < 0.60)', foxBolted === true && a.pstate === 'bolt',
      'bolted=' + foxBolted + ' pstate=' + a.pstate);
    // box_turtle: trivial — rigged roll 0.4 sits between wired 0.30 and unwired 0.45
    a = placeAnimal('box_turtle', 6, 4, 0.5);
    rig(0.4);
    const turtleBolted = Game.preyReaction(a);
    unrig();
    ok('trivial turtle holds at a roll the old math would have bolted on (0.4 > 0.30)', turtleBolted === false && a.pstate !== 'bolt',
      'bolted=' + turtleBolted + ' pstate=' + a.pstate);
    // cottontail_rabbit: medium — the neutral case is unchanged by the wiring
    a = placeAnimal('cottontail_rabbit', 6, 4, 0.5);
    rig(0.4);
    const rabBoltLow = Game.preyReaction(a);
    unrig();
    a = placeAnimal('cottontail_rabbit', 6, 4, 0.5);
    rig(0.5);
    const rabBoltHigh = Game.preyReaction(a);
    unrig();
    ok('medium rabbit: 0.4 bolts, 0.5 holds — the old 0.45 line is intact', rabBoltLow === true && rabBoltHigh === false,
      'low=' + rabBoltLow + ' high=' + rabBoltHigh);
    // dangerous backstop: no real dangerous animal can bolt (all five are
    // never-bolt behaviors), so synthesize one — the data backstop must hold.
    const tmp = { id: '_test_beast', behavior: 'skittish', fleeDifficulty: 'dangerous', unknown: 'a test shape', description: 'a test beast' };
    Game.data.animals.push(tmp);
    a = placeAnimal('_test_beast', 6, 4, 0.5);
    rig(0.35);
    const beastBolted = Game.preyReaction(a);
    unrig();
    Game.data.animals.pop();
    ok('dangerous backstop: bolt-able dangerous animal holds at 0.35 (0.35 > 0.25)', beastBolted === false,
      'bolted=' + beastBolted);
    // the stealth lesson is untouched: fully-aware (>=0.9) always bolts,
    // difficulty buys no forgiveness there
    a = placeAnimal('box_turtle', 6, 4, 0.95);
    rig(0.99);
    const seenBolt = Game.preyReaction(a);
    unrig();
    ok('aware>=0.9 still always bolts, even for trivial (the saw-you lesson)', seenBolt === true, 'bolted=' + seenBolt);
    console.log('  fleeP bands: trivial 0.30 / medium 0.45 / very_hard 0.60 / dangerous 0.25 @ aware 0.5');
  }

  // ================= GAP 2: knownCue coaching for the 12 audit behaviors =================
  console.log('\n-- GAP 2: knownCue for the 12 audit behaviors --');
  {
    freshGame();
    const TWELVE = ['unpredictable', 'ambush', 'cautious', 'still', 'patient', 'social',
      'stealthy', 'semiaquatic', 'aerial', 'wading', 'burrowing', 'pack'];
    const cues = [];
    let allCovered = true;
    for (const b of TWELVE) {
      const rep = animals.find(x => x.behavior === b);
      if (!rep) { ok("behavior '" + b + "' exists in data", false); allCovered = false; continue; }
      setKnown(rep.id, 0);
      const unk = Game.encAnimalCue(rep.id);
      const unkKnown = Game.encAnimalKnown(rep.id);
      // The gate property: no cue without knowledge. Some animals (mink,
      // bat, heron, chipmunk, coyote) are region common-knowledge — known
      // with 0 encounters — so the cue firing for them is correct, not a leak.
      ok("'" + b + "' (" + rep.id + '): cue never fires while unknown',
        unk === null || unkKnown === true,
        'cue=' + String(unk).slice(0, 50) + ' known=' + unkKnown);
      setKnown(rep.id, 3);
      const cue = Game.encAnimalCue(rep.id);
      const good = typeof cue === 'string' && cue.length > 20;
      ok("'" + b + "' (" + rep.id + '): cue once known', good, String(cue).slice(0, 80));
      if (good) cues.push(cue);
    }
    if (allCovered) ok('the 12 cues are pairwise distinct (no generic coaching)', new Set(cues).size === 12,
      new Set(cues).size + '/12 distinct');
  }

  // ================= GAP 3: still/stealthy chase lines in the hunt flee path =================
  // Play it: spook the animal in the real flee path (pstate bolt -> animalTurn
  // narrates via encChaseText), known and unknown.
  console.log('\n-- GAP 3: still/stealthy chase lines (owl/panther) --');
  {
    freshGame();
    setKnown('florida_panther', 3); setKnown('spotted_owl', 3);
    let a = placeAnimal('florida_panther', 6, 4, 1); a.pstate = 'bolt';
    Game.animalTurn();
    let said = drainLines().join(' ');
    ok('panther known: flee line is the melt ("stops being there")', /stops being there/i.test(said), said.slice(0, 140));
    ok('panther known: not the generic fallback', !/runs, putting distance between you/i.test(said), said.slice(0, 140));
    a = placeAnimal('spotted_owl', 6, 4, 1); a.pstate = 'bolt';
    Game.animalTurn();
    said = drainLines().join(' ');
    ok('owl known: flee line is the silent glide', /glide/i.test(said) && /silent/i.test(said), said.slice(0, 140));
    ok('owl known: not the generic fallback', !/runs, putting distance between you/i.test(said), said.slice(0, 140));
    // unknown: plain lines, still species-distinct, no vivid leak
    setKnown('florida_panther', 0); setKnown('spotted_owl', 0);
    a = placeAnimal('florida_panther', 6, 4, 1); a.pstate = 'bolt';
    Game.animalTurn();
    said = drainLines().join(' ');
    ok('panther unknown: plain melt, no vivid leak', /melts back into the brush/i.test(said) && !/stops being there/i.test(said), said.slice(0, 140));
    a = placeAnimal('spotted_owl', 6, 4, 1); a.pstate = 'bolt';
    Game.animalTurn();
    said = drainLines().join(' ');
    ok('owl unknown: plain silent glide, no vivid leak', /glides silently away/i.test(said) && !/beat too long/i.test(said), said.slice(0, 140));
  }

  // ================= GAP 4: slow-miss fiction honesty =================
  // Play it: strike the gila, whiff (rigged max roll), read the miss line.
  console.log('\n-- GAP 4: slow-miss honesty (gila/turtle) --');
  {
    let s = freshGame();
    s.equipped = { weapon: { itemId: 'fire_hardened_spear' } };
    placeAnimal('gila_monster', 5, 4, 0);
    drainLines();
    rig(0.9999); // every roll maximal: the strike whiffs clean (not near-miss)
    Game.huntAnimal();
    unrig();
    let said = drainLines().join(' ');
    let a = Game.state.scholar.animal;
    ok("gila miss: no 'bolts' in the miss line", !/bolt/i.test(said), said.slice(0, 160));
    // two honest miss texts for slow animals, depending on the roll band:
    // the clean-miss verb (holds its ground, never was going to flee) or
    // the near-miss text (doesn't jink, doesn't move at all). Neither bolts.
    ok('gila miss: slow-honest text on whichever miss band',
      (/holds its ground/i.test(said) && /never was going to/i.test(said)) ||
      (/doesn't jink/i.test(said) && /doesn't move at all/i.test(said)),
      said.slice(0, 160));
    ok('gila miss: encounter continues (it stays)', !!a && a.pstate !== 'bolt', 'pstate=' + (a && a.pstate));
    // the generic slow fallback (turtle): also no bolt line
    s = freshGame();
    s.equipped = { weapon: { itemId: 'fire_hardened_spear' } };
    placeAnimal('box_turtle', 5, 4, 0);
    drainLines();
    rig(0.9999);
    Game.huntAnimal();
    unrig();
    said = drainLines().join(' ');
    a = Game.state.scholar.animal;
    ok("turtle miss: no 'bolts' either", !/bolt/i.test(said), said.slice(0, 160));
    // two honest miss texts for slow animals, depending on the roll band:
    // the clean-miss verb ("slowest dodge") or the near-miss shame
    // ("doesn't jink... stationary turtle"). Neither bolts.
    ok('turtle miss: slow-honest text on whichever miss band',
      (/slowest dodge/i.test(said) && /barely even hurries/i.test(said)) ||
      (/doesn't jink/i.test(said) && /stationary turtle/i.test(said)),
      said.slice(0, 160));
    ok('turtle miss: encounter continues', !!a && a.pstate !== 'bolt', 'pstate=' + (a && a.pstate));
  }

  // ================= GAP 5: winded turns rotate 3 quiet beats =================
  console.log('\n-- GAP 5: winded turns rotate (catchable-but-doomed) --');
  {
    freshGame();
    const a = placeAnimal('white_tailed_deer', 5, 4, 1);
    a.pstate = 'winded';
    const lines = [];
    for (let t = 0; t < 3; t++) {
      Game.animalTurn();
      const said = drainLines().join(' ').trim();
      lines.push(said);
      ok('winded turn ' + (t + 1) + ' narrates (no dead air)', said.length > 0, JSON.stringify(said.slice(0, 60)));
      ok('winded turn ' + (t + 1) + ' stays (encounter continues)', !!Game.state.scholar.animal);
    }
    ok('the 3 winded beats are distinct (rotation, not a frozen line)', new Set(lines).size === 3,
      lines.map(l => JSON.stringify(l.slice(0, 50))).join(' | '));
    for (let t = 0; t < 3; t++) {
      ok('winded beat ' + (t + 1) + ' reads catchable-but-doomed, low-key',
        /spent|winded|heaving|blown|chase is over/i.test(lines[t]) && !/[A-Z]{4,}/.test(lines[t].replace(/HP|kcal/g, '')),
        lines[t].slice(0, 110));
    }
    ok('winded beats name player agency (your move / yours to take)',
      lines.filter(l => /your move|yours to take/i.test(l)).length >= 2,
      lines.map(l => JSON.stringify(l.slice(0, 60))).join(' | '));
    // 4th turn cycles back to beat 1: rotation, not random
    Game.animalTurn();
    const fourth = drainLines().join(' ').trim();
    ok('4th winded turn cycles back to beat 1 (rotation)', fourth === lines[0], fourth.slice(0, 80));
    ok('no audio re-fire across winded turns (never spamy)',
      !firedAudio.some(h => /pant/i.test(h)), 'fired: ' + [...new Set(firedAudio)].join(','));
    console.log('  beats: ' + lines.map(l => JSON.stringify(l.slice(0, 70))).join('\n         '));
  }

  console.log('\n== SEED ' + SEED + ': ' + pass + ' pass, ' + fail + ' fail ==');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
