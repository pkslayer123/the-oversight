// Talk requests expire. Usage: node scripts/test-talk-request-expiry.js
// Socialite loop 2026-10-05: an undelivered "can we talk?" persisted forever —
// the Talk badge kept pinging about ancient history and time-stamped lines
// ("Day one. Everyone's pretending they're fine.") went stale. Villagers are
// people, not popups: after ~3 days unanswered the moment passes and they let
// it go. Delivered records are pruned too so they don't accumulate in saves.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const [a, b, c] = roster;
  Game.state.scholar.day = 1;

  // 1. fresh request survives the expiry sweep
  v.talkRequests = {};
  v.talkRequests[a] = { line: '__NAME__ wants to talk.', day: 1 };
  Game.expireTalkRequests();
  ok('fresh request survives', !!v.talkRequests[a]);

  // 2. a 3-day-old unanswered request is dropped (the moment passed)
  v.talkRequests[b] = { line: '"Day one. Everyone is pretending."', day: 1 };
  Game.state.scholar.day = 4;
  Game.expireTalkRequests();
  ok('3-day-old unanswered request expires', !v.talkRequests[b]);

  // 3. a 2-day-old unanswered request is still kept (grace period)
  v.talkRequests[b] = { line: '__NAME__ wants to talk.', day: 3 };
  Game.state.scholar.day = 5;
  Game.expireTalkRequests();
  ok('2-day-old unanswered request kept', !!v.talkRequests[b]);

  // 4. delivered records get pruned eventually (save hygiene, one-shot memory)
  v.talkRequests[c] = { line: '__NAME__ wanted to talk.', day: 1, delivered: true };
  Game.state.scholar.day = 6;
  Game.expireTalkRequests();
  ok('old delivered record pruned', !v.talkRequests[c]);

  // 5. old saves without a day stamp are never eaten by the sweep
  v.talkRequests[a] = { line: 'old save line, no day' };
  Game.state.scholar.day = 40;
  Game.expireTalkRequests();
  ok('unstamped request (old save) kept', !!v.talkRequests[a]);

  // 6. answered requests still deliver once, with the name rendered fresh
  v.talkRequests = {};
  v.talkRequests[a] = { line: `"Hey." __NAME__ settles near you. "Can we talk?"`, day: 40 };
  Game.state.scholar.day = 40;
  const op = Game.convoOpening(a);
  ok('answered request delivers rendered line',
    !!op && !!op.line && !/__NAME__/.test(op.line) && v.talkRequests[a].delivered === true,
    (op && op.line || '').slice(0, 80));

  // 7. expired request means no more Talk badge ping for that villager
  v.talkRequests = {};
  v.talkRequests[b] = { line: 'stale line', day: 1 };
  Game.state.scholar.day = 10;
  Game.expireTalkRequests();
  const pending = Object.entries(v.talkRequests).filter(([, t]) => t && !t.delivered);
  ok('nothing pending after expiry', pending.length === 0);

  console.log(`${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
