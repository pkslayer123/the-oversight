// Gossip contradiction lines: no verbatim repeats between villagers about the
// same target, and template vars interpolate correctly.
// Usage: node scripts/test-gossip-norepeat.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
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
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  ok('roster has NPCs', roster.length >= 4);

  const target = roster[0];
  const vpt = Game.vpOf(target);
  const truth = vpt.formerOccupation || 'cook';
  vpt.lies = { occupation: { told: 'surgeon', truth, motive: 'shame', field: 'occupation' } };
  v.trust = v.trust || {};
  // make every teller talkative and force the lie to be gossiped about:
  // seed claims so npcGossipAbout frames it as a heard claim
  Game.trackClaimSilent(target, 'occupation', 'surgeon');

  const tellers = roster.slice(1, 4);
  for (const t of tellers) { v.trust[t] = 80; }

  // --- 1. no verbatim repeat across tellers about the same target+lie ---
  // Force the occupation-lie option to fire every time by stubbing Math.random
  // to keep lieP draws under threshold: simplest is to loop until we have
  // contradicting hits from distinct tellers (rng-gated), bounded tries.
  const heardLines = [];
  for (const t of tellers) {
    for (let i = 0; i < 40 && heardLines.filter(l => l.t === t).length < 1; i++) {
      const g = Game.npcGossipAbout(t, target);
      if (g && g.contradictsLie && g.field === 'occupation') {
        heardLines.push({ t, line: g.line });
        break;
      }
    }
  }
  ok('got contradicting gossip from 3 tellers', heardLines.length === 3);
  const texts = heardLines.map(h => h.line);
  const uniq = new Set(texts);
  ok('three tellers, three distinct lines (no verbatim repeat)', uniq.size === 3);
  if (uniq.size !== 3) console.log('  lines:', JSON.stringify(texts, null, 1));

  // --- 2. pool exhausts then recycles: 4 fresh draws max before any repeat ---
  // Reset the no-repeat state and draw 4 lines via npcGossipAbout from one
  // teller (forced), then confirm all 4 are distinct (pool has 4 variants).
  Game.state.truthLineUsed = {};
  const seen = [];
  const t0 = tellers[0];
  for (let i = 0; i < 60 && seen.length < 4; i++) {
    const g = Game.npcGossipAbout(t0, target);
    if (g && g.contradictsLie && g.field === 'occupation' && !seen.includes(g.line)) seen.push(g.line);
  }
  ok('pool serves 4 distinct lines before recycling', seen.length === 4);
  if (seen.length !== 4) console.log('  distinct seen:', seen.length);

  // --- 3. template vars interpolate: no raw placeholders, truth/lie present ---
  for (const line of texts.concat(seen)) {
    ok('no unreplaced placeholders', !/\{(first|teller|lieWord|truthWord|truthCap|truth|told)\}/.test(line));
  }
  ok('lines all name the truth', texts.every(l => new RegExp(truth.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(l)));
  ok('at least one heard line names the lie (surgeon)',
    // check across the FULL 4-line pool (texts + seen), not just the 3 drawn:
    // only 1 of 4 gossipHeard variants names {lieWord}, so sampling 3 of 4
    // missed it ~25% of runs (flaky). The pool's content is what's asserted.
    texts.concat(seen).some(l => /surgeon/i.test(l)));

  // --- 4. origin-lie phrasing uses "from Denver" style, not an article ---
  const target2 = roster[1];
  const vpt2 = Game.vpOf(target2);
  vpt2.lies = { origin: { told: 'Denver', truth: vpt2.homeRegion || 'Columbus, Ohio', motive: 'hiding', field: 'origin' } };
  Game.trackClaimSilent(target2, 'origin', 'Denver');
  Game.state.truthLineUsed = {};
  const originLines = [];
  for (const t of tellers) {
    for (let i = 0; i < 40; i++) {
      const g = Game.npcGossipAbout(t, target2);
      if (g && g.contradictsLie && g.field === 'origin') { originLines.push(g.line); break; }
    }
  }
  const originTruth = vpt2.homeRegion || 'Columbus, Ohio';
  ok('origin gossip contradicts', originLines.length === tellers.length);
  ok('origin lines use "from <truth>" phrasing',
    originLines.every(l => new RegExp('from ' + originTruth.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(l)));
  ok('origin lines have no unreplaced placeholders',
    originLines.every(l => !/\{(first|teller|lieWord|truthWord|truthCap)\}/.test(l)));

  // --- 5. mundane (non-lie) gossip path still works ---
  const target3 = roster[2];
  Game.vpOf(target3).lies = {};
  Game.state.truthLineUsed = {};
  let mundane = null;
  for (let i = 0; i < 80 && !mundane; i++) {
    const g = Game.npcGossipAbout(tellers[0], target3);
    if (g && !g.contradictsLie) mundane = g.line;
  }
  ok('mundane gossip line produced', typeof mundane === 'string' && mundane.length > 10);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
