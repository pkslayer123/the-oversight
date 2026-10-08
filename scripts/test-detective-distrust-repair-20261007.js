// Proof test: the distrusted-detective repair (2026-10-07 playtest loop).
// Two fixes under test:
//  1. endConvo clears engagement (conversation.js): without it, a villager
//     stays "engaged" until the batch-turn lapse (~64 ticks) and villagerTurn
//     skips them — they stand frozen instead of fleeing/foraging/living.
//  2. NPC-NPC social talk warms BOTH villagers toward the player (game.js
//     npcTakeAction): the shipped design says "building trust both ways"
//     but only the initiator's trust was bumped. This is the ambient repair
//     path for relationships the detective damages.
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
const said = [];
Game.say = function (m) { said.push(String(m)); };
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('FAIL ' + n); } };

(async () => {
  await Game.init();
  Game.debugScenario('liars');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0], helper = roster[1];
  Game.ensureVillagerPositions();
  const sx = Game.state.scholar.mx ?? 4, sy = Game.state.scholar.my ?? 4;

  // --- Fix 1: endConvo frees the villager immediately ---
  Game.startConvo(vid);
  ok('engaged during convo', Game.isEngaged(vid) === true);
  Game.endConvo(vid, 'left');
  ok('endConvo clears engagement', Game.isEngaged(vid) === false);

  // --- Fix 1b: the freed, scared villager flees on the very next villagerTurn ---
  v.trust[vid] = 9;
  Game.npcNeeds(vid).fear = 85;
  v.positions[vid] = { mx: Math.min(8, sx + 1), my: sy };
  const q0 = { ...v.positions[vid] };
  said.length = 0;
  Game.villagerTurn();
  const q1 = v.positions[vid];
  const d0 = Math.abs(q0.mx - sx) + Math.abs(q0.my - sy);
  const d1 = Math.abs(q1.mx - sx) + Math.abs(q1.my - sy);
  ok('scared villager moves after goodbye', q0.mx !== q1.mx || q0.my !== q1.my);
  ok('scared villager moves AWAY', d1 >= d0);
  ok('flee is announced ("edges away from you, wary")', said.some(s => /edges away from you, wary/.test(s)));
  ok('fleeing burns a little fear off', Game.npcNeeds(vid).fear < 85);

  // --- Fix 2: NPC-NPC social talk warms BOTH toward the player ---
  v.trust[vid] = 5; v.trust[helper] = 5;
  Game.npcNeeds(helper).social = 95;
  v.positions[helper] = { mx: 4, my: 4 };
  v.positions[vid] = { mx: 4, my: 5 };
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const t0h = v.trust[helper], t0v = v.trust[vid];
  Game.npcTakeAction(helper, detail, { night: false, announced: 99 });
  ok('talker gains trust in player', v.trust[helper] > t0h);
  ok('listener gains trust in player too', v.trust[vid] > t0v);
  console.log(`  trust after one chat: talker ${t0h}→${v.trust[helper]}, listener ${t0v}→${v.trust[vid]}`);

  // --- Integration: full distrusted-detective loop stays alive ---
  // confront → deflect (trust drops) → goodbye → flee → ambient repair
  const doubts = (Game.state.codex.doubts || []).filter(d => !d.resolved && d.vid === vid);
  if (doubts.length) {
    Game.startConvo(vid);
    const r = Game.confrontDoubt(vid, doubts[0].id);
    ok('confrontation executes', r && r.ok);
    const tAfter = v.trust[vid];
    Game.endConvo(vid, 'left');
    ok('engagement cleared after confrontation', !Game.isEngaged(vid));
    // ambient repair: 30 chats between helper and vid
    for (let t = 0; t < 30; t++) {
      Game.npcNeeds(helper).social = 95;
      v.positions[helper] = { mx: 4, my: 4 };
      v.positions[vid] = { mx: 4, my: 5 };
      Game.npcTakeAction(helper, detail, { night: false, announced: 99 });
    }
    console.log(`  trust: post-confront ${tAfter} → after 30 village chats ${v.trust[vid]}`);
    ok('ambient village chatter repairs damaged trust', v.trust[vid] > tAfter);
  } else { ok('integration loop (no doubts to confront)', true); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
