// Proof test: animal cue coverage — all behaviors have knownCue coaching,
// knowledge gating is intact, and still/stealthy (owl/panther) chase + hold
// lines are species-distinct, not the generic fallback. (Steve 2026-10-08)
//
// Assignment: 12 behaviors shipped without coaching in the audit; the PACK 3
// commit (Steve 2026-10-07) has since added them. This test locks the
// contract in: every behavior string in animals.json must have cue coverage,
// cues fire only when known, and still/stealthy no longer hit the generic
// fallback on flee.
//
// Run: SEED=1 node scripts/test-animal-cues-20261008.js   (seed defaults to 1)

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
const SEED = parseInt(process.env.SEED || '1', 10) || 1;
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

// Full production module list, index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js) and minus drama.js
// (top-level document access crashes node eval).
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
 'src/js/convo-mood.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
 'src/js/convo-beats.js', 'src/js/examine.js', 'src/js/equipment.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js',
 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js',
 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js']
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

// ---- data (worktree copy; caller verifies against HEAD for staleness)
const animalsFile = path.join(ROOT, 'src/data/animals.json');
const _animalsRaw = JSON.parse(fs.readFileSync(animalsFile, 'utf8'));
const animals = Array.isArray(_animalsRaw) ? _animalsRaw : _animalsRaw.animals;
const behaviors = [...new Set(animals.map(a => a.behavior))];
const TWELVE = ['unpredictable', 'ambush', 'cautious', 'still', 'patient', 'social',
  'stealthy', 'semiaquatic', 'aerial', 'wading', 'burrowing', 'pack'];

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
function setKnown(id, encounters) {
  Game.state.codex.animalEncounters = Game.state.codex.animalEncounters || {};
  Game.state.codex.animalEncounters[id] = encounters;
}
function animalObj(id) {
  const cfg = Game.encPreyCfg(id);
  return { id, mx: 6, my: 4, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
}
const GENERIC_BOLT_KNOWN = ' runs — putting distance between you, fast.';
const GENERIC_BOLT_PLAIN = ' runs, putting distance between you.';
const GENERIC_HOLD_KNOWN = ' holds at the treeline — deciding whether to risk it.';
const GENERIC_HOLD_PLAIN = ' holds at the treeline, deciding.';

(async () => {
  await Game.init();
  freshGame();

  // ---------- 1. EVERY behavior in animals.json has cue coverage ----------
  {
    const seen = {};
    for (const a of animals) {
      seen[a.behavior] = seen[a.behavior] || a.id;
      setKnown(a.id, 3);
    }
    for (const b of behaviors) {
      const cue = Game.encAnimalCue(seen[b]);
      ok(`cue coverage for behavior '${b}'`, typeof cue === 'string' && cue.length > 20,
        `animal=${seen[b]} cue=${JSON.stringify(cue)}`);
    }
    ok('all 12 audit behaviors covered', TWELVE.every(b => behaviors.includes(b)));
  }

  // ---------- 2. KNOWLEDGE GATE: cue null iff unknown (property over all animals) ----------
  {
    let gated = 0, violations = 0;
    for (const a of animals) {
      setKnown(a.id, 0);
      const known = Game.encAnimalKnown(a.id);
      const cue = Game.encAnimalCue(a.id);
      if (cue === null) gated++;
      else if (!known) { violations++; }
    }
    ok('cue is null whenever animal unknown (no leak)', violations === 0, violations + ' violations');
    // known animals DO get cues: mark everyone known, count non-null cues
    for (const a of animals) setKnown(a.id, 3);
    const firing = animals.filter(a => Game.encAnimalCue(a.id) !== null).length;
    ok('cue fires for known animals', firing === animals.length, firing + '/' + animals.length);
    // explicit: owl and panther unknown → null cue
    setKnown('spotted_owl', 0); setKnown('florida_panther', 0);
    ok('spotted_owl unknown → no cue', Game.encAnimalCue('spotted_owl') === null);
    ok('florida_panther unknown → no cue', Game.encAnimalCue('florida_panther') === null);
    setKnown('spotted_owl', 3); setKnown('florida_panther', 3);
    ok('spotted_owl known → cue', typeof Game.encAnimalCue('spotted_owl') === 'string');
    ok('florida_panther known → cue', typeof Game.encAnimalCue('florida_panther') === 'string');
  }

  // ---------- 3. CUES voice: the 12 coach the trick (substantive, distinct) ----------
  {
    const cues = TWELVE.map(b => {
      const a = animals.find(x => x.behavior === b);
      setKnown(a.id, 3);
      return Game.encAnimalCue(a.id);
    });
    ok('12 cues all distinct', new Set(cues).size === 12);
    const coaching = {
      still: 'doesn\'t move', stealthy: 'birds going silent', unpredictable: 'decision',
      ambush: 'stillness is the trap', cautious: 'DECIDING', patient: 'bank',
      social: 'barks', semiaquatic: 'water', aerial: 'roosting', wading: 'shallows',
      burrowing: 'hole', pack: 'never just one'
    };
    for (const b of TWELVE) {
      const a = animals.find(x => x.behavior === b);
      setKnown(a.id, 3);
      const cue = Game.encAnimalCue(a.id).toLowerCase();
      ok(`'${b}' cue coaches its trick`, cue.includes(coaching[b].toLowerCase()), Game.encAnimalCue(a.id));
    }
  }

  // ---------- 4. still/stealthy flee lines: species-distinct, non-generic ----------
  {
    setKnown('spotted_owl', 3); setKnown('florida_panther', 3);
    const owl = animalObj('spotted_owl'), pan = animalObj('florida_panther');
    const owlBolt = Game.encChaseText(owl), panBolt = Game.encChaseText(pan);
    const owlHold = Game.encChaseText(owl, true), panHold = Game.encChaseText(pan, true);
    ok('owl bolt is species-distinct (silent glide)', /glides, silent/i.test(owlBolt), owlBolt);
    ok('panther bolt is species-distinct (no run, just gone)', /stops being there/i.test(panBolt), panBolt);
    ok('owl bolt not generic fallback', !owlBolt.includes(GENERIC_BOLT_KNOWN) && !/bolts/i.test(owlBolt), owlBolt);
    ok('panther bolt not generic fallback', !panBolt.includes(GENERIC_BOLT_KNOWN), panBolt);
    ok('owl hold distinct from generic', /unblinking/i.test(owlHold), owlHold);
    ok('panther hold distinct from generic', /just eyes/i.test(panHold), panHold);
    ok('owl hold not generic fallback', !owlHold.includes(GENERIC_HOLD_KNOWN), owlHold);
    ok('panther hold not generic fallback', !panHold.includes(GENERIC_HOLD_KNOWN), panHold);
    ok('owl vs panther bolts distinct from each other', owlBolt !== panBolt && !/just gone/.test(owlBolt));
  }

  // ---------- 5. still/stealthy plain (unknown) lines: also non-generic, no vivid leak ----------
  {
    setKnown('spotted_owl', 0); setKnown('florida_panther', 0);
    ok('owl unknown for real', !Game.encAnimalKnown('spotted_owl'));
    ok('panther unknown for real', !Game.encAnimalKnown('florida_panther'));
    const owl = animalObj('spotted_owl'), pan = animalObj('florida_panther');
    const owlBolt = Game.encChaseText(owl), panBolt = Game.encChaseText(pan);
    const owlHold = Game.encChaseText(owl, true), panHold = Game.encChaseText(pan, true);
    ok('owl plain bolt non-generic', !owlBolt.includes(GENERIC_BOLT_PLAIN) && /glides silently away/.test(owlBolt), owlBolt);
    ok('panther plain bolt non-generic', !panBolt.includes(GENERIC_BOLT_PLAIN) && /melts back into the brush/.test(panBolt), panBolt);
    ok('owl plain hold non-generic', !owlHold.includes(GENERIC_HOLD_PLAIN) && /watching you/.test(owlHold), owlHold);
    ok('panther plain hold non-generic', !panHold.includes(GENERIC_HOLD_PLAIN) && /half-seen/.test(panHold), panHold);
    ok('unknown owl gets no vivid line', !/beat too long/i.test(owlBolt), owlBolt);
    ok('unknown panther gets no vivid line', !/stops being there/i.test(panBolt), panBolt);
  }

  // ---------- 6. sim: bolt block still wires encChaseText; flee of owl/panther narrates distinct ----------
  {
    const encSrc = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');
    ok('bolt block calls encChaseText(a)', encSrc.includes('this.say(this.encChaseText(a));'));
    ok('hold branch calls encChaseText(a, true)', encSrc.includes('this.say(this.encChaseText(a, true));'));
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
