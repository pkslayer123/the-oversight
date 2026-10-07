// Proof test: gossip intel must not be corrupted by the teller's own lie scrub
// (detective playtest 2026-10-07).
//
// Bug: the convoAskTopic wrapper scrubs the SPEAKER's cover story over every
// finished talk line. Gossip lines are ABOUT OTHER villagers — when the
// teller's true origin/occupation string-matches the target's truth (e.g.
// both really from "Minneapolis, USA", teller claims "Denver"), the scrub
// rewrote the TARGET's truth to the TELLER's cover in the spoken line, while
// the journal doubt recorded the right value. The player heard wrong intel.
// Fix: skip scrubLiesFromLine for the 'gossip' topic (truth.js wrapper).
//
// Seeded mulberry32 (default 20261007, SEED env override). Exits nonzero on failure.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(parseInt(process.env.SEED || '20261007', 10));

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // eval-phase stub only
const SCRIPTS = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of SCRIPTS) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`FAILED loading ${f}: ${e.message}`); process.exit(2); }
}
delete global.window;

const Game = globalThis.Scattering.Game;
Game.say = () => {};
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; } else { fail++; console.log('FAIL ' + n + (extra ? ' :: ' + extra : '')); } };

(async () => {
  await Game.init();
  Game.debugScenario('liars');
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const target = roster[0], teller = roster[1];
  Game.startConvo(target); Game.endConvo(target, 'left'); // learn the target's name
  const tFirst = Game.firstRef(target);
  // Force the collision: both really from Minneapolis, USA; teller claims Denver.
  const tLies = Game.npcLies(teller);
  tLies.origin = { told: 'Denver', truth: 'Minneapolis, USA', motive: 'hiding', field: 'origin' };
  const aLies = Game.npcLies(target);
  aLies.origin = { told: 'Chicago', truth: 'Minneapolis, USA', motive: 'hiding', field: 'origin' };
  Game.state.village.trust[teller] = 50;
  // Mark the target "interviewed" so the detective bias picks them as gossip subject.
  Game.trackClaimSilent(target, 'origin', 'Chicago');

  let gossipLine = null, attempts = 0;
  for (let i = 0; i < 60 && !gossipLine; i++) {
    attempts++;
    let line = null;
    try {
      Game.convoGet(teller).askedTopics = []; // one topic per conversation — reset for the loop
      line = Game.convoAskTopic(teller, 'gossip');
    } catch (e) { line = null; }
    if (line && String(line).includes(tFirst) && /Minneapolis|Denver|Chicago/.test(String(line))) {
      gossipLine = String(line);
    }
  }
  ok('gossip about target produced', !!gossipLine, `after ${attempts} attempts`);
  if (gossipLine) {
    console.log('gossip line: ' + gossipLine.slice(0, 300));
    ok('line names the target truth (Minneapolis)', gossipLine.includes('Minneapolis'), gossipLine.slice(0, 200));
    ok('line does NOT name the teller cover (Denver) as the target truth',
      !gossipLine.includes('Denver'), gossipLine.slice(0, 200));
  }

  // The journal doubt must agree with the spoken line.
  const doubts = Game.allDoubts().filter(d => d.kind === 'gossip' && d.vid === target);
  ok('gossip doubt recorded', doubts.length > 0);
  if (doubts.length && gossipLine) {
    const dEv = JSON.stringify(doubts[doubts.length - 1].evidence);
    ok('doubt evidence names Minneapolis', dEv.includes('Minneapolis'), dEv.slice(0, 200));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
