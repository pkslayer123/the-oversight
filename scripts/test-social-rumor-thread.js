// Regression: the in-conversation rumor thread must complete end-to-end.
// Bugs (socialite playtest 2026-10-06):
//  1. ask:gossip / ask:spread_rumor sat LAST in the asks list, so the topic
//     cap (5, or 2 for deflectors) starved them on a fresh conversation — the
//     socialite's core verbs were unreachable until every other topic was
//     exhausted.
//  2. The rumor prompt line ("who are we talking about?") was classified as
//     a generic question, and the generic-Q menu narrowing then hid the
//     rumor:tgt: follow-up choices — the thread dangled again after the
//     2026-10-06 un-dangle fix.
//  3. Rumor prompts used displayName().split(' ')[0], rendering bare "A"
//     for undescribed villagers ("A? Okay. And what's the word?") —
//     firstRef exists precisely to avoid that.
// Usage: node scripts/test-social-rumor-thread.js
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

let pass = 0, fail = 0;
function ok(name, cond, note) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); }
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const spreader = roster[0], target = roster[1];
  v.trust = v.trust || {};
  v.trust[spreader] = 55;

  // 1. gossip + spread_rumor visible on a FRESH conversation (cap starvation)
  let st = Game.startConvo(spreader);
  // answer a possible opener question so the menu isn't narrowed
  let ch = Game.convoChoices(spreader);
  const gqAns = ch.find(c => c.id.indexOf('gq:') === 0);
  if (gqAns && !ch.some(c => c.id === 'ask:spread_rumor')) Game.convoTurn(spreader, gqAns.id);
  ch = Game.convoChoices(spreader);
  const ids = ch.map(c => c.id);
  ok('ask:gossip visible on fresh convo', ids.includes('ask:gossip'), ids.join(','));
  ok('ask:spread_rumor visible on fresh convo', ids.includes('ask:spread_rumor'), ids.join(','));

  // 2+3. full rumor flow: no generic-Q dangle, target+type choices appear
  const before = (v.gossip || []).length;
  let r = Game.convoTurn(spreader, 'ask:spread_rumor');
  ch = Game.convoChoices(spreader);
  const tgtChoices = ch.filter(c => c.id.indexOf('rumor:tgt:') === 0);
  ok('rumor target choices offered (not dangled by generic-Q)', tgtChoices.length > 0,
    ch.map(c => c.id).join(','));
  ok('rumor prompt does not hang a generic question',
    !ch.some(c => c.id.indexOf('gq:') === 0), ch.map(c => c.id).join(','));
  const promptLine = String((r && (r.line || '')) || '');
  ok('rumor prompt names the target without bare "A"',
    !/\"A\? Okay/.test(promptLine), promptLine.slice(0, 80));
  const pick = tgtChoices.find(c => c.id.endsWith(target)) || tgtChoices[0];
  r = Game.convoTurn(spreader, pick.id);
  ch = Game.convoChoices(spreader);
  const typeChoices = ch.filter(c => c.id.indexOf('rumor:type:') === 0);
  ok('rumor type choices offered', typeChoices.length >= 5, ch.map(c => c.id).join(','));
  const typeLine = String((r && (r.line || '')) || '');
  ok('rumor type prompt names the target without bare "A"',
    !/\"A\? Okay/.test(typeLine) && !/\"A, /.test(typeLine), typeLine.slice(0, 80));
  const stingy = typeChoices.find(c => c.id === 'rumor:type:stingy') || typeChoices[0];
  // the type labels themselves must not render bare "A"
  ok('rumor type labels name the target properly',
    !stingy.label.match(/^"A['\s]/), stingy.label.slice(0, 60));
  Game.convoTurn(spreader, stingy.id);
  Game.endConvo(spreader, 'left');
  const rumorItems = (v.gossip || []).filter(g => g.playerRumor && g.dims && g.dims.who);
  ok('rumor created exactly one player-rumor gossip item', rumorItems.length === 1,
    `player-rumor items=${rumorItems.length} total=${(v.gossip || []).length}`);
  const g = rumorItems[0];
  ok('listener is the first hearer', g && (g.heard || []).includes(spreader),
    JSON.stringify(g && (g.heard || [])));

  // 4. firstRef never collapses to bare "A" for an unknown villager
  const stranger = roster.find(id => !Game.nameKnown(id)) || roster[2];
  const ref = Game.firstRef(stranger);
  ok('firstRef is not bare "A"', ref && ref !== 'A' && ref !== 'a', `"${ref}"`);

  console.log(`\nsocial-rumor-thread: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e.message); process.exit(2); });
