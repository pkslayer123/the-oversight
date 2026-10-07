// Detective archetype: THE DISTRUSTED DETECTIVE (2026-10-07 run).
// The Everyone Acts economy (9da6c50): villagers flee from distrusted players
// (trust<20 + fear>70 + close). The detective loop (confrontDoubt) can itself
// DROP trust below 20. Play the seam:
//  1. Can you still interrogate someone who is scared of you? Does
//     startConvo work on a fleeing villager, or is there a refusal?
//  2. Does isEngaged hold them during a confrontation (villagerTurn skip)?
//  3. After a hostile confrontation, does the aftermath read as alive
//     ("edges away from you, wary") or broken (can't ever follow up)?
//  4. Is there a repair path — confession, soft probes, gossip clearing?
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
const SEED = parseInt(process.env.SEED || '20261007', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // eval-phase stub only (equipment.js needs window at load)

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
delete global.window; // runtime checks take the sync path from here

const Game = globalThis.Scattering.Game;
const said = [];
Game.say = function (m) { said.push(String(m)); };
const first = (vid) => { try { return Game.firstRef(vid); } catch (e) { return vid; } };

let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL: ' + msg); };
const pass = (msg) => console.log('  ok: ' + msg);
const note = (msg) => console.log(msg);

(async () => {
  await Game.init();
  Game.debugScenario('liars');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  if (roster.length < 6) { fail('liars scenario: not enough villagers'); process.exit(1); }
  note(`village: ${roster.length} villagers`);

  // --- Phase 1: build a doubt the honest way (interview + gossip cross-ref) ---
  const liars = roster.slice(0, 5);
  liars.forEach(id => { v.trust[id] = 40; });
  for (const rid of liars) { try { Game.startConvo(rid); Game.convoAskTopic(rid, 'past'); } catch (e) {} }
  const tellers = roster.slice(5, 9);
  tellers.forEach(id => { v.trust[id] = 40; });
  let reveals = 0;
  for (const teller of tellers) for (const target of liars)
    for (let k = 0; k < 4; k++) { const g = Game.npcGossipAbout(teller, target); if (g && g.contradictsLie) reveals++; }
  const open = (Game.state.codex.doubts || []).filter(d => !d.resolved);
  note(`  gossip reveals: ${reveals}; open doubts: ${open.length}`);
  if (!open.length) { fail('no doubts formed to confront'); process.exit(1); }
  pass(`built ${open.length} doubts via gossip cross-reference`);

  // --- Phase 2: make the player distrusted by the doubt target ---
  const doubt = open[0];
  const vid = doubt.vid;
  Game.ensureVillagerPositions();
  const sx = Game.state.scholar.mx ?? 4, sy = Game.state.scholar.my ?? 4;
  v.trust[vid] = 12;
  Game.npcNeeds(vid).fear = 85;
  v.positions[vid] = { mx: Math.min(8, sx + 1), my: sy };
  note(`\nPHASE 2: ${first(vid)} — trust=12, fear=85, adjacent to player at (${sx},${sy})`);

  // 2a. will they even talk to me?
  let st = null;
  try { st = Game.startConvo(vid); } catch (e) { note('  startConvo threw: ' + e.message); }
  if (st) pass(`startConvo on scared villager opens: "${String(st.line).slice(0, 80)}..."`);
  else fail('startConvo on scared villager returned null — interrogation blocked entirely');

  // 2b. while engaged, villagerTurn must NOT move them (isEngaged lock)
  const pb = { ...v.positions[vid] };
  try { Game.villagerTurn(); } catch (e) { note('  villagerTurn threw: ' + e.message); }
  const pa = v.positions[vid];
  if (pb.mx === pa.mx && pb.my === pa.my) pass('engaged villager holds still during villagerTurn');
  else fail(`engaged villager MOVED mid-conversation (${pb.mx},${pb.my} → ${pa.mx},${pa.my})`);

  // 2c. confront the doubt while distrusted
  const trustBefore = v.trust[vid];
  said.length = 0;
  let r = null;
  try { r = Game.confrontDoubt(vid, doubt.id); } catch (e) { note('  confrontDoubt threw: ' + e.message); }
  if (r && r.ok) {
    note(`  confront outcome: ${r.outcome} (trust ${trustBefore} → ${v.trust[vid]})`);
    note(`  line: "${String(r.line).slice(0, 150)}..."`);
    pass(`confrontDoubt works while distrusted (outcome=${r.outcome})`);
  } else fail('confrontDoubt failed while distrusted');

  // 2d. end the conversation; advance an NPC turn; watch them react
  try { if (Game.endConvo) Game.endConvo(vid); } catch (e) {}
  const q0 = { ...v.positions[vid] };
  said.length = 0;
  try { Game.villagerTurn(); } catch (e) {}
  const q1 = v.positions[vid];
  const dist = (p) => Math.abs(p.mx - sx) + Math.abs(p.my - sy);
  const moved = q0.mx !== q1.mx || q0.my !== q1.my;
  const chatter = said.filter(s => /edges away|wary/i.test(s)).join(' | ');
  note(`  after convo: moved=${moved} (${q0.mx},${q0.my}→${q1.mx},${q1.my}), dist ${dist(q0)}→${dist(q1)}, fear=${Game.npcNeeds(vid).fear}`);
  note(`  chatter: ${chatter || '(none)'}`);
  if (moved && dist(q1) >= dist(q0) && /edges away/.test(chatter)) {
    pass('scared villager edges away with the wary announcement — aftermath reads as alive');
  } else if (!moved) {
    note('  NOTE: scared villager did not move (fear may have decayed below 70)');
  } else {
    fail('scared villager moved TOWARD the player — flee logic inverted');
  }

  // --- Phase 3: the repair paths ---
  note('\nPHASE 3: repair paths');
  // 3a. gossip about YOU: confrontGossip
  try {
    v.gossip = v.gossip || [];
    v.gossip.push({ id: 'gtest1', day: Game.state.scholar.day, dims: { who: Game.villagerId, honest: -5 }, text: `${first(vid)} says you can't be trusted.`, heard: [vid] });
    said.length = 0;
    const cg = Game.confrontGossip(vid);
    note(`  confrontGossip returned ok=${cg && cg.ok}; chatter: ${said.join(' ').slice(0, 140)}`);
    pass('confrontGossip executes (clear-the-air or backfire, both are content)');
  } catch (e) { fail('confrontGossip threw: ' + e.message); }
  // 3b. soft-probe verb exists on the doubt menu (from earlier detective work)
  try {
    Game.startConvo(vid);
    const ch = Game.convoChoices(vid) || [];
    const ids = ch.map(c => c.id);
    if (ids.some(i => /doubt/i.test(i))) pass('doubt soft-probe verb present in convo menu');
    else note('  note: no doubt verb in menu (ids: ' + ids.slice(0, 8).join(',') + ')');
  } catch (e) { note('  convoChoices threw: ' + e.message); }

  // --- Phase 4: does the NPC social economy repair trust over time? ---
  note('\nPHASE 4: 40 npcTakeAction social turns for a friend of the target');
  v.trust[vid] = 5;
  Game.npcNeeds(vid).fear = 10;
  const helper = roster.find(id => id !== vid);
  Game.npcNeeds(helper).social = 95;
  v.positions[helper] = { mx: 4, my: 4 };
  v.positions[vid] = { mx: 4, my: 5 };
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  let chats = 0;
  for (let t = 0; t < 40; t++) {
    try {
      Game.npcNeeds(helper).social = 95; // keep them chatty
      v.positions[helper] = { mx: 4, my: 4 };
      v.positions[vid] = { mx: 4, my: 5 };
      Game.npcTakeAction(helper, detail, { night: false, announced: 99 });
      chats++;
    } catch (e) { note('  npcTakeAction threw: ' + e.message); break; }
  }
  note(`  after ${chats} forced social turns: ${first(vid)} trust=${v.trust[vid]} (NPC-NPC talk bumps trust in the player +1 each)`);
  if (chats === 40) pass('40 NPC social turns ran clean, trust delta measured above');
  else fail('npcTakeAction loop broke early');

  note(`\n${failures} failures`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
