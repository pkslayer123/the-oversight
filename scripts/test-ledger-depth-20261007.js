// Ledger depth proof (Steve 2026-10-07): threshold beats, knowledge-gated
// visibility, unity state machine, food stance, exposed fallout.
// Run: node scripts/test-ledger-depth-20261007.js [SEED]
// Seeded RNG (mulberry32, default 20261007); deterministic green across seeds.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.argv[2] || process.env.SEED || '20261007', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const _store = {};
global.localStorage = {
  getItem: (k) => (_store[k] !== undefined ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
};
// equipment.js needs window at load; runtime checks take the sync path only
// when window is absent, so stub for eval then delete before playing.
global.window = global;

// FULL production script list, index.html order, minus DOM-only
// (app.js / sprites.js / tile-scenes.js / move-anim.js).
const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js',
  'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of FILES) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL [seed ${SEED}] ${name}${extra ? ' — ' + extra : ''}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  for (const k of Object.keys(_store)) delete _store[k];
  Game.say = function (t) { said.push(String(t)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 6000; s.health = 100; s.trauma = 0;
  Game.state.systemArrived = true;
  Game.progState();
  return s;
}
const beatsFired = () => (Game.progState().legendBeats || []).length;
const queued = () => (Game.progState().ledgerQueue || []).length;

(async () => {
  await Game.init();

  // 1. Exports: every old export still works, new ones exist.
  {
    freshGame();
    for (const m of ['ledger', 'ledgerAdd', 'recordLegend', 'recordMoment', 'contestStandings', 'viewershipBoard']) {
      ok('export ' + m + ' exists', typeof Game[m] === 'function');
    }
    for (const m of ['unityState', 'foodStance', 'legendSurface', 'shareFood', 'hoardFood',
      'hearGossipAboutSelf', 'hearsAboutSelf', 'exposeFallout', 'flushLedgerBeats']) {
      ok('new export ' + m + ' exists', typeof Game[m] === 'function');
    }
    ok('fresh foodHoarded backfills to 0', Game.ledger().foodHoarded === 0);
    ok('fresh unity is holding', Game.unityState().key === 'holding');
    ok('fresh food stance is even', Game.foodStance().key === 'even');
    ok('fresh frame unwritten', Game.endingFrame() === 'unwritten');
    const lb = Game.viewershipBoard();
    ok('viewershipBoard rows', Array.isArray(lb) && lb.length > 0 && lb[0].name !== undefined);
    const cs = Game.contestStandings();
    ok('contestStandings rows', Array.isArray(cs) && cs[0].score !== undefined);
  }

  // 2. Might arc: gossip beat fires immediately (overhearing is the channel),
  //    and marks the player talked-about.
  {
    freshGame();
    const pg = Game.progState();
    Game.ledgerAdd('might', 6);
    ok('might-5 gossip beat fired', said.some(t => t.includes('deer story') && t.includes('your name')), said.slice(-1).join(' ').slice(0, 120));
    ok('first gossip marks talked-about', pg.selfTalkedAbout === true);
    ok('beat recorded for codex surface', Game.legendSurface().length === 1 && Game.legendSurface()[0].dim === 'might');
    ok('no raw numbers in beat text', !said.some(t => /might[:\s]+\d/i.test(t)));
  }

  // 3. Show beats WAIT for viewership (knowledge gate), then land late.
  {
    freshGame();
    const pg = Game.progState();
    Game.state.village.viewership = 0; pg.broadcast = [];
    const before = beatsFired();
    Game.ledgerAdd('showmanship', 7); // crosses 6
    const firedNow = beatsFired() > before;
    const q = queued();
    ok('show beat held when unwatched', !firedNow && q >= 1, `fired=${firedNow} queued=${q}`);
    Game.broadcastLine('The village watches the broadcast.'); // now seen
    Game.flushLedgerBeats();
    ok('queued show beat lands after broadcast seen', beatsFired() > before && said.some(t => t.includes("audience has a favorite")));
    ok('queue drains', queued() === 0);
  }

  // 4. System beats wait for the overlay, then land.
  {
    freshGame();
    const pg = Game.progState();
    Game.state.systemArrived = false; // integrationStage() -> 0
    const before = beatsFired();
    Game.ledgerAdd('defiance', 4); // crosses 3, system-kind
    ok('system beat held pre-overlay', beatsFired() === before && queued() >= 1);
    Game.state.systemArrived = true;
    Game.flushLedgerBeats();
    ok('system beat lands post-arrival', beatsFired() > before && said.some(t => t.includes('careful around you')));
  }

  // 5. Unity: felt state machine with narrated, direction-aware transitions.
  {
    freshGame();
    Game._checkUnityTransition(); // baseline, silent
    const base = said.length;
    Game.ledgerAdd('unified', 4);
    Game._checkUnityTransition();
    ok('unified -> close-knit', Game.unityState().key === 'close-knit');
    ok('close-knit transition narrated', said.slice(base).some(t => t.includes('cover for each other')));
    Game.ledgerAdd('fractured', 9); // diff -5 -> fraying
    Game._checkUnityTransition();
    ok('fractured -> fraying', Game.unityState().key === 'fraying');
    ok('fraying transition narrated', said.some(t => t.includes('Two tables at dinner')));
    Game.ledgerAdd('fractured', 6); // diff -11 -> fractured
    Game._checkUnityTransition();
    ok('deep fracture narrated', said.some(t => t.includes('two villages wearing one name')));
    // repair: direction-aware holding text
    Game.ledgerAdd('unified', 12); // diff 1 -> holding, improving
    Game._checkUnityTransition();
    ok('repair narrated as recovery', said.some(t => t.includes('trying loud')));
    ok('unity beat recorded as moment', (Game.progState().moments || []).some(m => /Haven feels/.test(m.text)));
  }

  // 6. Food truth: sharer/even/hoarder with social consequences.
  {
    freshGame();
    Game._checkFoodStance(); // baseline
    Game.hoardFood(8000); // +8 hoarded
    Game._checkFoodStance();
    ok('hoarding -> hoarder stance', Game.foodStance().key === 'hoarder');
    ok('hoarder transition has consequence text', said.some(t => t.includes('silence has a price')));
    Game.shareFood(16000, 'Riverside'); // +16 shared vs 8 hoarded -> sharer
    Game._checkFoodStance();
    ok('sharing -> sharer stance', Game.foodStance().key === 'sharer');
    ok('sharer transition narrated', said.some(t => t.includes("The pantry is everyone's")));
    ok('hoarded beat text exists in ledger', Game.ledger().foodHoarded >= 8);
    ok('foodShared wrote via shareFood', Game.ledger().foodShared >= 12);
  }

  // 7. Exposed: truths named, people reacting.
  {
    freshGame();
    const realGetCase = Game.getCase;
    Game.getCase = () => ({ bribes: [{ by: 'vill_aaa', voter: 'vill_bbb', amount: 900 }], accused: ['vill_aaa'], exposedBribes: [] });
    const realDN = Game.displayName;
    Game.displayName = (id) => id === 'vill_aaa' ? 'Briber Bob' : id === 'vill_bbb' ? 'Bought Vera' : 'Someone';
    Game.exposeFallout('c1', 'vill_bbb');
    ok('fallout names the briber', said.some(t => t.includes('Briber') && t.includes("doesn't meet your eye")));
    ok('fallout names the bought', said.some(t => t.includes('Bought')));
    ok('fallout names the amount', said.some(t => t.includes('900')));
    ok('fallout recorded as moment', (Game.progState().moments || []).some(m => /Exposed: Briber bought Bought/.test(m.text)));
    Game.getCase = realGetCase; Game.displayName = realDN;
    // and the real wrap calls it on success
    const src = fs.readFileSync(path.join(ROOT, 'src/js/ledger.js'), 'utf8');
    ok('exposeBribery wrap calls exposeFallout', src.includes('this.exposeFallout(caseId, voterId)'));
  }

  // 8. The epithet is gated: shape before name.
  {
    freshGame();
    const pg = Game.progState();
    Game.state.village.viewership = 0; pg.broadcast = []; pg.selfTalkedAbout = false;
    const L = Game.ledger(); L.showmanship = 12; L.protected = 8; L.brokerage = 6;
    Game.state.scholar.day = 24; pg.lastLedgerBeat = 0;
    Game.ledgerBeat();
    ok('epithet withheld before heard', said.some(t => t.includes("the name hasn't reached you yet")), said.slice(-1).join(' ').slice(0, 140));
    ok('frame flavor still present', said.some(t => t.includes('blessing')));
    said.length = 0;
    Game.hearGossipAboutSelf('a rider');
    ok('gossip marks talked-about', Game.hearsAboutSelf() === true);
    Game.state.scholar.day = 36; pg.lastLedgerBeat = 24;
    Game.ledgerBeat();
    ok('epithet named once heard', said.some(t => t.includes('the Beloved')), said.slice(-1).join(' ').slice(0, 140));
  }

  // 9. Threshold beats fire once; multi-threshold crossing fires each level.
  {
    freshGame();
    Game.state.systemArrived = true;
    Game.ledgerAdd('might', 21); // crosses 5, 12, 20 in one go
    ok('three might beats, one per threshold', Game.legendSurface().filter(b => b.dim === 'might').length === 3);
    const n = Game.legendSurface().length;
    Game.ledgerAdd('might', 5); // no new threshold
    ok('no repeat beats', Game.legendSurface().length === n);
  }

  // 10. legendSurface: only gated beats, player-readable, no counters.
  {
    freshGame();
    Game.ledgerAdd('might', 6);
    Game.ledgerAdd('killed', 3);
    const surf = Game.legendSurface();
    ok('surface lists fired beats', surf.length === 2);
    ok('surface entries have day/kind/text', surf.every(b => typeof b.day === 'number' && b.kind && b.text));
    ok('surface never shows raw dims', !surf.some(b => /might|killed/.test(b.text) && /\d/.test(b.text)));
  }

  // 11. Frame math untouched: the old endings still compute.
  {
    freshGame();
    const L = Game.ledger();
    Object.assign(L, { might: 20, killed: 6 });
    ok('feared still computes', Game.endingFrame() === 'feared');
    freshGame();
    Object.assign(Game.ledger(), { exposed: 10, defiance: 4 });
    ok('witness still computes', Game.endingFrame() === 'witness');
    freshGame();
    Object.assign(Game.ledger(), { embrace: 12, defiance: 10 });
    ok('defiance still resists assimilation', Game.endingFrame() !== 'assimilated');
  }

  // 12. Static: wiring points present.
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/ledger.js'), 'utf8');
    ok('endDay flushes beats + checks states', src.includes('this.flushLedgerBeats()') && src.includes('this._checkUnityTransition()') && src.includes('this._checkFoodStance()'));
    ok('ledgerAdd checks threshold beats', src.includes('this._checkDimBeats(dim, before, L[dim])'));
    ok('WIRING comments for game.js/app.js owners', (src.match(/WIRING \(game\.js owner/g) || []).length >= 2 && src.includes('WIRING (conversation.js owner') && src.includes('WIRING (journal.js / codex owner'));
    ok('ontology header lists new methods', src.includes('- unityState()') && src.includes('- exposeFallout(caseId, voterId)'));
  }

  console.log(`\nseed ${SEED}: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
