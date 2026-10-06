// SOCIALITE run 3b (2026-10-06): the socialite's core verbs — gossip,
// rumor-spreading, personal/past/goal topics — reached via the designed
// subject-change path, played as a player. Looking for: unreachable verbs,
// dead subject-menu options, crashes, knowledge leaks, rumor lifecycle.
// Usage: node scripts/play-socialite-verbs-20261006.js
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
const BAD = /(undefined|null|NaN|\[object Object\])/;
let issues = [];
function flag(kind, detail) { issues.push(kind + ': ' + detail); console.log(`  [ISSUE ${kind}] ${detail}`); }
function name(id) { try { return Game.displayName(id) || id; } catch (e) { return id; } }
const ids = (vid) => { try { return (Game.convoChoices(vid) || []).map(c => c.id); } catch (e) { flag('crash', 'convoChoices: ' + e.message); return []; } };
function turn(vid, cid) {
  let r; try { r = Game.convoTurn(vid, cid); }
  catch (e) { flag('crash', `convoTurn ${cid}: ${e.message}`); return null; }
  const line = (r && (r.line || r.msg)) || '';
  if (!r) flag('silent', `${cid} returned nothing`);
  else if (!line && !(r.choices && r.choices.length)) flag('silent', `${cid}: empty line, no choices`);
  if (line && BAD.test(line)) flag('leak', `${cid}: "${line.slice(0, 150)}"`);
  return r;
}
function subjectMenu(vid) {
  // thread coherence: exit the opener thread via the explicit subject change
  const cids = ids(vid);
  if (cids.includes('dlg:subject')) turn(vid, 'dlg:subject');
  else if (cids.includes('subject')) turn(vid, 'subject');
  return ids(vid);
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  v.trust = v.trust || {};
  const me = Game.villagerId;
  const roster = (v.roster || []).filter(id => id !== me).slice(0, 5);
  roster.forEach(id => { v.trust[id] = 60; });

  console.log('=== SUBJECT MENU (trust 60) ===');
  const vid = roster[0];
  Game.startConvo(vid);
  let menu = subjectMenu(vid);
  console.log(name(vid), 'subject menu:', menu.join(', '));
  const want = ['ask:gossip', 'ask:spread_rumor', 'ask:personal', 'ask:past', 'ask:goal', 'ask:plans', 'ask:village'];
  want.forEach(w => { if (!menu.includes(w)) console.log(`  (missing: ${w})`); });

  console.log('\n=== TOPIC TRAVERSAL ===');
  for (const topic of ['ask:personal', 'ask:past', 'ask:goal', 'ask:plans', 'ask:village']) {
    menu = subjectMenu(vid);
    if (!menu.includes(topic)) { console.log(`  ${topic}: not in subject menu (asked already?)`); continue; }
    const r = turn(vid, topic);
    console.log(`  ${topic}: "${String((r && (r.line || r.msg)) || '').slice(0, 150)}"`);
    // drain follow-ups once, then subject-change back out
    for (let i = 0; i < 6; i++) {
      const c2 = ids(vid);
      if (c2.includes('dlg:more')) { turn(vid, 'dlg:more'); }
      else break;
    }
  }
  Game.endConvo(vid, 'left');

  console.log('\n=== GOSSIP ASK ===');
  const g = roster[1];
  Game.startConvo(g);
  menu = subjectMenu(g);
  if (menu.includes('ask:gossip')) {
    const r = turn(g, 'ask:gossip');
    console.log(`  ${name(g)}: "${String((r && (r.line || r.msg)) || '').slice(0, 260)}"`);
    console.log('  gossipAbout:', r && r.gossipAbout ? name(r.gossipAbout) : '(none)');
  } else console.log('  (no ask:gossip in subject menu)');
  Game.endConvo(g, 'left');

  console.log('\n=== RUMOR SPREAD (end to end) ===');
  const s = roster[2];
  Game.startConvo(s);
  menu = subjectMenu(s);
  const g0 = (v.gossip || []).length;
  if (menu.includes('ask:spread_rumor')) {
    let r = turn(s, 'ask:spread_rumor');
    console.log('  step1:', String((r && (r.line || r.msg)) || '').slice(0, 120));
    let c2 = ids(s);
    const tgt = c2.find(i => i.indexOf('rumor:tgt:') === 0);
    console.log('  targets:', c2.filter(i => i.indexOf('rumor:tgt:') === 0).map(t => name(t.slice(10))).join(', ') || '(none)');
    if (tgt) {
      r = turn(s, tgt);
      console.log('  step2:', String((r && (r.line || r.msg)) || '').slice(0, 120));
      c2 = ids(s);
      const typ = c2.find(i => i.indexOf('rumor:type:') === 0);
      console.log('  types:', c2.filter(i => i.indexOf('rumor:type:') === 0).join(', ') || '(none)');
      if (typ) {
        r = turn(s, typ);
        console.log('  result:', String((r && (r.line || r.msg)) || '').slice(0, 200));
      }
    }
  } else console.log('  (no ask:spread_rumor in subject menu)');
  Game.endConvo(s, 'left');
  console.log('  gossip items:', g0, '->', (v.gossip || []).length);

  // travel + cross-check
  for (let i = 0; i < 12; i++) { try { Game.npcBatchTurn && Game.npcBatchTurn(); } catch (e) {} }
  console.log('  after 12 batch turns:', (v.gossip || []).length);
  const l = roster[3];
  Game.startConvo(l);
  menu = subjectMenu(l);
  if (menu.includes('ask:gossip')) {
    const r = turn(l, 'ask:gossip');
    console.log(`  ${name(l)} heard: "${String((r && (r.line || r.msg)) || '').slice(0, 260)}"`);
  } else console.log('  (no ask:gossip)');
  Game.endConvo(l, 'left');

  console.log('\n=== PARTY / FORMAL ===');
  try {
    const unlocked = Game.partyUnlocked ? Game.partyUnlocked() : '(no fn)';
    console.log('  partyUnlocked:', unlocked, '| systemArrived:', !!Game.state.systemArrived);
  } catch (e) { console.log('  partyUnlocked threw:', e.message); }

  console.log('\n=== SUMMARY ===');
  console.log('issues:', issues.length);
  issues.forEach(i => console.log('  ' + i));
  process.exit(issues.length ? 2 : 0);
})();
