// Regression test: player-started rumors complete through conversation and propagate.
// Bug (2026-10-06): the spread_rumor thread dangled at "who are we talking
// about?" with no follow-up choices, and spreadRumor seeded heard: [] so
// spreadGossip never had a teller — rumors died on arrival.
// Usage: node scripts/test-rumor-flow.js
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

// Deterministic RNG for the test (mulberry32) — the conversation pacing
// layer is heavily RNG-driven; without a seed the warm-up path varies.
(function seed() {
  let a = 0xC10C;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  const roster = v.roster || [];
  v.trust = v.trust || {};

  console.log('== 1. conversation rumor flow ==');
  // find a listener: answer anything hanging, warm up with personal +
  // gossip (topicCap crowds spread_rumor off the first menu — it's last in
  // priority order), then run the rumor flow IN THE SAME conversation.
  let listener = null, target = null;
  for (const vid of roster) {
    v.trust[vid] = 60;
    Game.startConvo(vid);
    let cc = Game.convoChoices(vid);
    // answer a hanging direct question first (coherence: pivots wait)
    const gq = cc.find(c => c.id.indexOf('gq:') === 0 || c.id.indexOf('react:') === 0);
    if (gq && gq.id !== 'leave') { try { Game.convoTurn(vid, gq.id); } catch (e) {} cc = Game.convoChoices(vid); }
    const p1 = cc.find(c => c.id === 'ask:personal');
    if (p1) { Game.convoTurn(vid, 'ask:personal'); cc = Game.convoChoices(vid); }
    const g1 = cc.find(c => c.id === 'ask:gossip');
    if (g1) { Game.convoTurn(vid, 'ask:gossip'); cc = Game.convoChoices(vid); }
    if (cc.some(c => c.id === 'ask:spread_rumor')) { listener = vid; break; }
    Game.endConvo(vid, 'left');
  }
  target = roster.find(id => id !== listener && id !== Game.villagerId);
  // belt-and-braces: the offered target list is authoritative (roster can
  // shift during warm-up; the player can never be a rumor target)
  ok('found a listener offering ask:spread_rumor', !!listener);
  if (!listener) { console.log('cannot test further'); process.exit(1); }
  // convo is still open from the warm-up above — continue in it
  ok('convo open', !!(Game.convoGet(listener) || {}).active);
  let ch = Game.convoChoices(listener);
  const askRumor = ch.find(c => c.id === 'ask:spread_rumor');
  ok('ask:spread_rumor choice offered', !!askRumor);
  // settle(vid): answer hanging direct questions / take the continuer until
  // the menu stabilizes (the pacing layer queues questions behind turns)
  function settle(vid) {
    let ch = [];
    for (let i = 0; i < 12; i++) {
      ch = Game.convoChoices(vid);
      if (ch.some(c => c.id.indexOf('rumor:tgt:') === 0) || ch.some(c => c.id.indexOf('rumor:type:') === 0)) return ch;
      const q = ch.find(c => (c.id.indexOf('gq:') === 0 || c.id.indexOf('react:') === 0) && c.id !== 'goon' && c.id !== 'leave');
      if (q) { Game.convoTurn(vid, q.id); continue; }
      const goon = ch.find(c => c.id === 'goon');
      if (goon) { Game.convoTurn(vid, 'goon'); continue; }
      return ch;
    }
    return ch;
  }

  let r = Game.convoTurn(listener, 'ask:spread_rumor');
  ok('rumor thread opens', !!r && /who are we talking about/i.test(r.line || ''));
  ch = settle(listener);
  const tgtPick = ch.find(c => c.id === 'rumor:tgt:' + target);
  ok('target picks offered (incl. target)', !!tgtPick);
  ok('no other topic asks during rumor thread', !ch.some(c => c.id.indexOf('ask:') === 0));
  r = Game.convoTurn(listener, 'rumor:tgt:' + target);
  ok('target step responds', !!r && /what's the word/i.test(r.line || ''));
  ch = settle(listener);
  const typePick = ch.find(c => c.id === 'rumor:type:stingy');
  ok('rumor type picks offered', !!typePick && ch.filter(c => c.id.indexOf('rumor:type:') === 0).length === 5);
  const beforeGossip = (v.gossip || []).length;
  const trustBefore = v.trust[listener];
  r = Game.convoTurn(listener, 'rumor:type:stingy');
  ok('rumor completes with reaction line', !!r && !r.ended && (r.line || '').length > 10);
  const g = (v.gossip || [])[(v.gossip || []).length - 1];
  ok('gossip created', (v.gossip || []).length === beforeGossip + 1);
  ok('gossip action is stingy', g && g.action === 'stingy');
  ok('gossip subject is target', g && g.dims && g.dims.who === target);
  ok('listener is FIRST HEARER (propagation seed)', g && (g.heard || []).includes(listener));
  ok('trust bumped for sharing a secret', (v.trust[listener] || 0) > trustBefore);
  const mems = (v.memory && v.memory[listener]) || [];
  ok('listener remembers you told the rumor', mems.some(m => String(m.t || '').includes('you_told_rumor') || String(m.note || '').includes('rumor')));
  Game.endConvo(listener, 'left');

  console.log('== 2. propagation ==');
  // make tellers chatty: warm temperament spreads at 0.5/part
  for (const vid of roster) { const vp = Game.vpOf(vid); if (vp && vp.personality) vp.personality.temperament = 'warm'; }
  for (let i = 0; i < 12; i++) Game.spreadGossip();
  const heard = (g.heard || []).length;
  ok(`rumor reached ${heard}/${roster.length} villagers`, heard >= 3);

  console.log('== 3. reputation effect on subject ==');
  const dims = Game.gossipActionDims('stingy', { who: target });
  ok('stingy maps to negative rep dims', dims && Object.keys(dims).length > 0 && Object.values(dims).some(x => x < 0));

  console.log('== 4. rumor tracing memory ==');
  // the 15% trace fires while the rumor is still spreading (section 2) —
  // once everyone has heard it, there are no new tellings to trace.
  // Deterministic check: force the RNG low for one spread with a fresh
  // teller and open candidates, so the trace path must fire.
  const realRandom = Math.random;
  g.heard = [listener];
  Math.random = () => 0.01;
  try { Game.spreadGossip(); } finally { Math.random = realRandom; }
  const tmems = (v.memory && v.memory[target]) || [];
  ok('subject may trace the rumor', tmems.some(m => String(m.t || '').includes('rumor_about_them') || String(m.note || '').includes('rumor')));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message, e.stack && e.stack.split('\n')[1]); process.exit(2); });
