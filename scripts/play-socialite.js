// SOCIALITE playtest: conversations, gossip, relationships, party building.
// Plays as a player would: meet everyone, talk deep, spread a rumor,
// watch it travel, recruit a party, then re-talk after days pass.
// Usage: node scripts/play-socialite.js
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

const PICK = ['invite_party', 'ask:gossip', 'ask:personal', 'ask:spread_rumor', 'theorize', 'ask:past', 'ask:goal', 'ask:plans', 'ask:village'];
const TALK_LINES = {};

function talk(vid, label, turns) {
  const name = Game.displayName(vid) || vid;
  console.log(`\n### ${name} (${label})`);
  const lines = [];
  try {
    const st = Game.startConvo(vid);
    if (!st) { console.log('(no convo — refused or busy)'); return null; }
    console.log(`  > "${(st.line || '').slice(0, 160)}"`);
    lines.push({ who: 'them', text: st.line });
    for (let i = 0; i < turns; i++) {
      const ch = Game.convoChoices(vid);
      if (!ch || !ch.length) break;
      const pick = PICK.map(id => ch.find(c => c.id === id)).find(Boolean)
        || PICK.map(id => ch.find(c => c.id.indexOf(id) === 0)).find(Boolean)
        || ch.find(c => c.id.indexOf('ans:') === 0)
        || ch.find(c => c.id.indexOf('react:') === 0)
        || ch[0];
      if (pick.id === 'leave') break;
      console.log(`  you: "${pick.label.slice(0, 80)}"`);
      const r = Game.convoTurn(vid, pick.id);
      if (!r || r.ended) { console.log('  (conversation ended)'); break; }
      // convoTurn returns {line, choices, ...}; the player's said line may be in r.line or r.youSaid
      const line = (r.line || r.msg || '').slice(0, 220);
      if (line) { console.log(`  > "${line}"`); lines.push({ who: 'them', text: line }); }
      if (r.youSaid) { lines.push({ who: 'you', text: r.youSaid }); }
    }
    Game.endConvo(vid, 'left');
  } catch (e) { console.log('ERROR:', e.message.slice(0, 120)); }
  TALK_LINES[vid] = lines;
  return lines;
}

(async () => {
  await Game.init();
  try { Game.debugScenario('day1'); } catch (e) { console.log('scenario fail:', e.message); return; }
  const v = Game.state.village;
  const roster = (v.roster || []).slice(0, 6);
  console.log(`Roster: ${(v.roster || []).length} villagers. Talking to ${roster.length}.\n`);
  for (const vid of roster) {
    const vp = Game.vpOf(vid) || {};
    talk(vid, `${vp.formerOccupation || '?'} · ${((vp.personality || {}).temperament) || '?'}`, 7);
  }

  // --- GOSSIP DRAMA: spread a rumor, watch it travel ---
  console.log('\n\n=== GOSSIP DRAMA ===');
  const A = roster[0], B = roster[1];
  const rumorTypes = ['stingy', 'untrustworthy', 'lazy'];
  const rt = rumorTypes[0];
  try {
    const before = (v.gossip || []).length;
    Game.spreadRumor(A, rt);
    console.log(`Player spread rumor "${rt}" about ${Game.displayName(A)}. gossip count ${before} -> ${(v.gossip || []).length}`);
  } catch (e) { console.log('spreadRumor ERROR:', e.message.slice(0, 140)); }
  // let NPCs mingle: run batch turns + ask others about gossip
  try {
    for (let i = 0; i < 6; i++) Game.npcBatchTurn && Game.npcBatchTurn();
  } catch (e) { console.log('batch ERROR:', e.message.slice(0, 100)); }
  console.log(`After 6 batch turns: gossip count = ${(v.gossip || []).length}`);
  for (const vid of roster.slice(2, 5)) {
    const g = (v.gossip || []).filter(x => (x.heard || []).includes(vid));
    console.log(`  ${Game.displayName(vid)} has heard ${g.length} gossip item(s)`);
    for (const x of g.slice(0, 2)) console.log(`    - about ${(x.dims || {}).who || '?'}: action=${x.action || '?'} dims=${JSON.stringify(x.dims || {}).slice(0, 90)}`);
  }
  // ask a villager what they've heard
  const listener = roster[2];
  try {
    Game.state.village.trust = Game.state.village.trust || {};
    Game.state.village.trust[listener] = 60;
    const st = Game.startConvo(listener);
    const ch = Game.convoChoices(listener);
    const gq = ch.find(c => c.id === 'ask:gossip');
    if (gq) {
      const r = Game.convoTurn(listener, 'ask:gossip');
      console.log(`\nAsked ${Game.displayName(listener)} for gossip: "${((r && (r.line || r.gossip)) || '').slice(0, 260)}"`);
      if (r && r.gossipAbout) console.log(`  (gossipAbout: ${r.gossipAbout})`);
    } else console.log('\n(no gossip ask available for listener)');
    Game.endConvo(listener, 'left');
  } catch (e) { console.log('gossip-ask ERROR:', e.message.slice(0, 120)); }

  // --- PARTY: try to recruit ---
  console.log('\n\n=== PARTY BUILDING ===');
  try {
    console.log(`systemArrived: ${!!Game.state.systemArrived}, partyUnlocked: ${Game.partyUnlocked ? !!Game.partyUnlocked() : 'n/a'}`);
    const buddy = roster[3];
    Game.state.village.trust = Game.state.village.trust || {};
    Game.state.village.trust[buddy] = 70;
    const st = Game.startConvo(buddy);
    const ch = Game.convoChoices(buddy);
    const inv = ch.find(c => c.id === 'invite_party');
    if (inv) {
      const r = Game.convoTurn(buddy, 'invite_party');
      console.log(`Invite result: "${((r && (r.line || r.msg)) || '').slice(0, 200)}"`);
      console.log(`inParty: ${Game.inParty ? Game.inParty(buddy) : 'n/a'}`);
    } else {
      console.log(`No invite choice for ${Game.displayName(buddy)} (choices: ${ch.map(c => c.id).join(', ')})`);
      console.log(`hasDiscovered('party')=${Game.hasDiscovered ? Game.hasDiscovered('party') : 'n/a'}`);
    }
    Game.endConvo(buddy, 'left');
  } catch (e) { console.log('party ERROR:', e.message.slice(0, 140)); }

  // --- TIME PASSES: does their voice change? ---
  console.log('\n\n=== AFTER SEVERAL DAYS ===');
  try {
    for (let d = 0; d < 3; d++) Game.endDay && Game.endDay();
    console.log(`Day is now ${Game.state.scholar ? Game.state.scholar.day : Game.state.day}`);
    talk(roster[0], 'revisit after 3 days', 3);
  } catch (e) { console.log('endDay ERROR:', e.message.slice(0, 120)); }

  // --- VOICE UNIQUENESS CHECK: compare talk lines across villagers ---
  console.log('\n\n=== VOICE UNIQUENESS (unique-person law check) ===');
  const allLines = [];
  for (const vid of Object.keys(TALK_LINES)) {
    for (const l of TALK_LINES[vid] || []) allLines.push({ vid, text: (l.text || '').slice(0, 120) });
  }
  const seen = {};
  let dupes = 0;
  for (const l of allLines) {
    if (!l.text) continue;
    seen[l.text] = seen[l.text] || new Set();
    seen[l.text].add(l.vid);
    if (seen[l.text].size > 1) { dupes++; if (dupes <= 5) console.log(`  DUPE (${seen[l.text].size} villagers): "${l.text.slice(0, 110)}"`); }
  }
  console.log(`Total talk lines sampled: ${allLines.length}, lines spoken by 2+ villagers: ${dupes}`);
})().catch(e => console.log('FATAL', e.message, e.stack && e.stack.split('\n')[1]));
