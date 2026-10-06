// SOCIALITE run 3 (2026-10-06, archetype 2): fresh-eyes pass over the core
// conversation loop + party building, played as a player through real
// conversation choices. Looking for: crashes, "undefined"/NaN leaks,
// knowledge leaks (true names / monster names / gossip that shouldn't show),
// dialogue incoherence (who-said-what), duplicated lines, dead-end menus,
// mood/relationship dead weight, and fun-vs-chores feel.
// Usage: node scripts/play-socialite-run3-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convo-wants.js', 'src/js/convo-beats.js', 'src/js/convo-dialogue.js', 'src/js/convoTopics.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
 'src/js/contests.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

let issues = [];
function flag(kind, detail) { issues.push({ kind, detail }); console.log(`  [ISSUE ${kind}] ${detail}`); }
function name(id) { try { return Game.displayName(id) || id; } catch (e) { return id; } }
const BAD = /(undefined|null|NaN|\[object Object\])/i;

function snapshotConvo(vid, label) {
  let st;
  try { st = Game.startConvo(vid); }
  catch (e) { flag('crash', `startConvo(${name(vid)}) threw: ${e.message}`); return null; }
  const lines = [];
  if (st && st.line) lines.push(st.line);
  let choices;
  try { choices = Game.convoChoices(vid) || []; }
  catch (e) { flag('crash', `convoChoices(${name(vid)}) threw: ${e.message}`); choices = []; }
  choices.forEach(c => {
    const t = c.label || c.text || c.id || '';
    if (BAD.test(String(t)) && !/none/i.test(String(t))) flag('leak', `${name(vid)} choice label: ${JSON.stringify(t).slice(0, 140)}`);
    lines.push(t);
  });
  const blob = lines.join('\n');
  const badHits = blob.match(/undefined|NaN|\[object Object\]/g);
  if (badHits) flag('leak', `${label}: menu/opener contains "${badHits[0]}" — ${JSON.stringify(blob.slice(0, 200))}`);
  return { st, choices };
}

function talk(vid, choiceId, n) {
  let r;
  try { r = Game.convoTurn(vid, choiceId); }
  catch (e) { flag('crash', `convoTurn(${name(vid)}, ${choiceId}) threw: ${e.message}`); return null; }
  if (!r) { flag('silent', `convoTurn(${name(vid)}, ${choiceId}) returned nothing`); return null; }
  const line = r.line || r.msg || r.text || '';
  if (!line && !r.choices) flag('silent', `${name(vid)} <- ${choiceId}: empty response, no choices`);
  if (line && BAD.test(line)) flag('leak', `${name(vid)} <- ${choiceId}: "${line.slice(0, 160)}"`);
  // who-said-what sanity: villager lines shouldn't narrate the player as "you study X"
  if (r.who === 'them' && /you study|you watch|you notice/i.test(line))
    flag('voice', `${name(vid)} says narration as dialogue: "${line.slice(0, 120)}"`);
  // choice label sanity after the turn
  try {
    const ch2 = Game.convoChoices(vid) || [];
    const ids = ch2.map(c => c.id);
    if (!ids.includes('bye') && !ids.includes('leave') && !ids.includes('silence') && ch2.length > 0) {
      // leave option should almost always exist
      if (!ids.some(i => /bye|leave|go|end/i.test(i))) flag('ux', `${name(vid)} has no visible leave/exit choice after ${choiceId}: [${ids.join(',')}]`);
    }
  } catch (e) {}
  return r;
}

function endTalk(vid) {
  try { Game.endConvo(vid, 'left'); } catch (e) { flag('crash', `endConvo(${name(vid)}) threw: ${e.message}`); }
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  v.trust = v.trust || {};
  const me = Game.villagerId;
  const roster = (v.roster || []).filter(id => id !== me).slice(0, 6);
  console.log('cast:', roster.map(name).join(' | '));

  // ============ A. Talk to everyone: openers + menu shape ============
  console.log('\n=== A. OPENERS ===');
  for (const vid of roster) {
    const snap = snapshotConvo(vid, `opener(${name(vid)})`);
    if (!snap) continue;
    console.log(`${name(vid)}: choices=[${snap.choices.map(c => c.id).join(', ')}]`);
    if (snap.st && snap.st.line) console.log(`  open: "${String(snap.st.line).slice(0, 160)}"`);
    endTalk(vid);
  }

  // ============ B. Deep convo with one villager: personal, gossip, wants ============
  console.log('\n=== B. DEEP CONVO (trust 60) ===');
  const pal = roster[0];
  v.trust[pal] = 60;
  snapshotConvo(pal, `deep(${name(pal)})`);
  const order = ['ask:personal', 'ask:how', 'ask:work', 'ask:gossip', 'ask:news',
    'ask:rumor', 'ask:opinion', 'ask:help', 'ask:teach', 'observe', 'compliment',
    'agree', 'joke', 'share', 'ask:about', 'bye'];
  for (let i = 0; i < 24; i++) {
    let ch;
    try { ch = Game.convoChoices(pal) || []; } catch (e) { flag('crash', 'convoChoices threw mid-deep-convo'); break; }
    if (!ch.length) { flag('ux', `${name(pal)}: menu empty mid-conversation`); break; }
    let pick = null;
    for (const id of order) { pick = ch.find(c => c.id === id || (c.id || '').startsWith(id.split(':')[0] + ':')); if (pick) break; }
    if (!pick) pick = ch.find(c => !/bye|leave/i.test(c.id || ''));
    if (!pick) { console.log('  (only leave left)'); break; }
    if (/bye|leave/i.test(pick.id)) { console.log('  leaving'); break; }
    const r = talk(pal, pick.id, i);
    if (r) {
      const line = r.line || r.msg || '';
      console.log(`  you[${pick.id}] -> ${name(pal)}: "${String(line).slice(0, 170)}"`);
    }
    if (r && r.ended) break;
  }
  // trust moved?
  console.log('  trust now:', v.trust[pal], 'mood:', JSON.stringify((Game.convoMood && Game.convoMood(pal)) || v.mood && v.mood[pal] || '?'));
  endTalk(pal);

  // ============ C. Gossip: start a rumor, travel it, cross-check ============
  console.log('\n=== C. RUMOR THREAD ===');
  const spreader = roster[1], target = roster[2];
  v.trust[spreader] = 55;
  snapshotConvo(spreader, 'rumor-start');
  let ch = Game.convoChoices(spreader) || [];
  const rumorStart = ch.find(c => c.id === 'ask:spread_rumor');
  if (rumorStart) {
    talk(spreader, rumorStart.id);
    ch = Game.convoChoices(spreader) || [];
    const tgt = ch.find(c => (c.id || '').startsWith('rumor:tgt:'));
    if (tgt) {
      talk(spreader, tgt.id);
      ch = Game.convoChoices(spreader) || [];
      const typ = ch.find(c => (c.id || '').startsWith('rumor:type:'));
      if (typ) { const r = talk(spreader, typ.id); console.log('  rumor result:', String((r && (r.line || r.msg)) || '').slice(0, 160)); }
      else console.log('  (no rumor type choices)');
    } else console.log('  (no rumor target choices)');
  } else console.log('  (no spread_rumor choice at trust 55)');
  endTalk(spreader);
  console.log('  gossip items:', (v.gossip || []).length);
  for (let i = 0; i < 10; i++) { try { Game.npcBatchTurn && Game.npcBatchTurn(); } catch (e) {} }
  console.log('  after 10 batch turns, gossip items:', (v.gossip || []).length);
  const listener = roster[3];
  v.trust[listener] = 60;
  snapshotConvo(listener, 'cross-check');
  const gq = (Game.convoChoices(listener) || []).find(c => c.id === 'ask:gossip');
  if (gq) {
    const r = talk(listener, 'ask:gossip');
    console.log(`  ${name(listener)}: "${String((r && (r.line || r.msg)) || '').slice(0, 260)}"`);
  } else console.log('  (no ask:gossip choice)');
  endTalk(listener);

  // ============ D. Party building: followers + formal party ============
  console.log('\n=== D. PARTY BUILDING ===');
  const buddy = roster[4], buddy2 = roster[5] || roster[3];
  v.trust[buddy] = 80; v.trust[buddy2] = 75;
  let followers = [];
  for (let i = 0; i < 60 && !followers.length; i++) {
    try { Game.followerCheck && Game.followerCheck(); } catch (e) { flag('crash', 'followerCheck threw: ' + e.message); break; }
    try { followers = (Game.partyState ? Game.partyState().followers : []) || []; } catch (e) { break; }
  }
  console.log('  followers:', followers.map(name).join(', ') || '(none volunteered)');
  if (followers.length) {
    const f = followers[0];
    snapshotConvo(f, 'follower-talk');
    const r = talk(f, 'ask:personal');
    console.log('  follower personal:', JSON.stringify(String((r && (r.line || r.msg)) || '').slice(0, 150)));
    endTalk(f);
    // formal party state
    try {
      const ps = Game.partyState();
      console.log('  partyState keys:', Object.keys(ps || {}).join(','));
    } catch (e) { flag('crash', 'partyState threw: ' + e.message); }
  }

  // ============ E. Relationship deltas: is talking doing anything? ============
  console.log('\n=== E. RELATIONSHIP DELTAS ===');
  const probe = roster[1];
  const t0 = v.trust[probe] || 0;
  snapshotConvo(probe, 'probe');
  for (const cid of ['compliment', 'agree', 'joke', 'ask:personal', 'share']) {
    const chh = (Game.convoChoices(probe) || []).map(c => c.id);
    if (chh.includes(cid)) { talk(probe, cid); console.log(`  after ${cid}: trust ${t0} -> ${v.trust[probe]}`); }
  }
  endTalk(probe);

  // ============ F. Stress: talk to same villager 3x in a row (repetition/coherence) ============
  console.log('\n=== F. REPETITION CHECK ===');
  const rep = roster[2];
  v.trust[rep] = 50;
  const seen = {};
  for (let round = 0; round < 3; round++) {
    snapshotConvo(rep, `rep${round}`);
    const r = talk(rep, 'ask:personal');
    const line = String((r && (r.line || r.msg)) || '');
    if (seen[line] && line.length > 20) flag('repeat', `${name(rep)} repeated personal line verbatim on round ${round}`);
    seen[line] = 1;
    console.log(`  round${round}: "${line.slice(0, 130)}"`);
    endTalk(rep);
  }

  console.log('\n=== SUMMARY ===');
  console.log('issues:', issues.length);
  issues.forEach(i => console.log(`  [${i.kind}] ${i.detail}`));
  process.exit(issues.length ? 2 : 0);
})();
