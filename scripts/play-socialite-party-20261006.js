// SOCIALITE run 2b (2026-10-06, archetype 2): rumor thread + party building,
// played as a player through real conversation choices.
// Usage: node scripts/play-socialite-party-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

function name(id) { return Game.displayName(id) || id; }
function turn(vid, cid) {
  const r = Game.convoTurn(vid, cid);
  const line = r && (r.line || r.msg || '');
  console.log(`  you[${cid.slice(0, 26)}] -> "${String(line).slice(0, 200)}"`);
  return r;
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId).slice(0, 5);
  console.log('cast:', roster.map(name).join(' | '));

  // ---- RUMOR THREAD through real conversation choices ----
  console.log('\n=== RUMOR THREAD (in-conversation) ===');
  const spreader = roster[0], target = roster[1];
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[spreader] = 55;
  let st = Game.startConvo(spreader);
  console.log('open:', JSON.stringify((st.choices || []).map(c => c.id).slice(0, 14)));
  // the opener may hang a direct question (menu narrows to answers) — answer it first
  let ch = Game.convoChoices(spreader);
  const gqAns = ch.find(c => c.id.indexOf('gq:') === 0) || ch.find(c => c.id === 'silence') || ch.find(c => c.id === 'agree');
  if (gqAns && !ch.some(c => c.id === 'ask:spread_rumor')) {
    console.log('answering opener:', gqAns.id);
    turn(spreader, gqAns.id);
    ch = Game.convoChoices(spreader);
  }
  const rumorStart = ch.find(c => c.id === 'ask:spread_rumor');
  console.log('rumor entry choice:', rumorStart ? rumorStart.id : '(none: ' + ch.map(c => c.id).join(',') + ')');
  if (rumorStart) {
    turn(spreader, rumorStart.id);
    ch = Game.convoChoices(spreader);
    console.log('step2 choices:', ch.map(c => c.id).join(', '));
    const tgt = ch.find(c => c.id.indexOf('rumor:tgt:') === 0);
    if (tgt) {
      turn(spreader, tgt.id);
      ch = Game.convoChoices(spreader);
      console.log('step3 choices:', ch.map(c => c.id).join(', '));
      const typ = ch.find(c => c.id === 'rumor:type:stingy') || ch.find(c => c.id.indexOf('rumor:type:') === 0);
      if (typ) turn(spreader, typ.id);
    }
  }
  Game.endConvo(spreader, 'left');
  console.log('gossip items now:', (v.gossip || []).length);

  // ---- let it travel, then cross-check with a second villager ----
  for (let i = 0; i < 8; i++) { try { Game.npcBatchTurn && Game.npcBatchTurn(); } catch (e) {} }
  console.log('\nafter 8 batch turns, gossip items:', (v.gossip || []).length);
  const listener = roster[2];
  Game.state.village.trust[listener] = 60;
  Game.startConvo(listener);
  const gq = Game.convoChoices(listener).find(c => c.id === 'ask:gossip');
  if (gq) {
    const r = Game.convoTurn(listener, 'ask:gossip');
    console.log(`\n${name(listener)} on gossip: "${String((r && (r.line || '')) || '').slice(0, 300)}"`);
    if (r && r.gossipAbout) console.log('  gossipAbout:', name(r.gossipAbout));
  } else console.log('(no gossip ask)');
  Game.endConvo(listener, 'left');

  // ---- PARTY: pre-System party building = followers (trust 65+, volunteer) ----
  console.log('\n=== PARTY BUILDING (pre-System: followers) ===');
  const buddy = roster[3];
  Game.state.village.trust[buddy] = 75;
  Game.state.village.trust[roster[4]] = 80;
  Game.endConvo(buddy, 'left');
  let followers = [];
  for (let i = 0; i < 40 && !followers.length; i++) {
    try { Game.followerCheck && Game.followerCheck(); } catch (e) {}
    followers = (Game.partyState ? Game.partyState().followers : []) || [];
  }
  console.log('followers after checks:', followers.map(name).join(', ') || '(none volunteered)');
  if (followers.length) {
    const f = followers[0];
    Game.startConvo(f);
    const r = Game.convoTurn(f, 'ask:personal');
    console.log('follower talk:', JSON.stringify(String((r && (r.line || '')) || '').slice(0, 160)));
    Game.endConvo(f, 'left');
  }
  console.log('(formal invite_party is post-System by design; pre-System invite msg:)');
  try {
    const ir = Game.inviteToParty ? Game.inviteToParty(buddy) : null;
    console.log('  inviteToParty:', JSON.stringify(ir && ir.msg ? ir.msg.slice(0, 130) : ir));
  } catch (e) { console.log('  inviteToParty ERROR:', e.message.slice(0, 100)); }
  console.log('\n=== END ===');
})().catch(e => console.log('FATAL', e.message, e.stack && e.stack.split('\n')[1]));
