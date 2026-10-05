// Test: origin-lie confession must correct the journal.
// The journal records what they TOLD you ("From Denver."). After they confess
// the truth, the journal must record the admission — the lie must not stand.
// Usage: node scripts/test-origin-confession-journal.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/truth.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const vid = roster[0];
  const vp = Game.vpOf(vid);

  // force a deterministic origin lie
  vp.homeRegion = 'Columbus, Ohio';
  vp.lies = { origin: { told: 'Denver', truth: 'Columbus, Ohio', motive: 'hiding', field: 'origin' } };
  // journal records the lie when told (mirrors the temp-swap path in convoAskTopic)
  Game.journalLearn(vid, 'backstory', `From ${vp.lies.origin.told}.`, { via: 'talk' });
  const backBefore = (Game.journalPerson(vid).backstory || []).map(b => b.text);
  ok('journal recorded the told origin lie', backBefore.some(t => /From Denver/.test(t)));

  // create a doubt on the origin claim, then force a confession
  const d = Game.addDoubt(vid, 'gossip', `${Game.displayName(vid)} said Denver; someone says otherwise.`, ['claimed "Denver"', 'a villager says "Columbus, Ohio"']);
  const trust = Game.state.village.trust || {};
  trust[vid] = 60; // high trust + hiding motive → confession likely
  const realRandom = Math.random;
  Math.random = () => 0.0; // roll 0 → confess branch guaranteed
  let r;
  try { r = Game.confrontDoubt(vid, d.id); } finally { Math.random = realRandom; }
  ok('confrontation ran', !!r && r.ok);
  ok('outcome was confession', r.outcome === 'confessed');
  ok('lie marked confessed', !!vp.lies.origin.confessed);

  const backAfter = (Game.journalPerson(vid).backstory || []).map(b => b.text);
  ok('journal now carries the admission', backAfter.some(t => /Admitted: from Columbus, Ohio \(said Denver\)/.test(t)));
  ok('the original told-lie note is still there (honest journal, no rewrite)',
    backAfter.some(t => /^From Denver\.$/.test(t)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
