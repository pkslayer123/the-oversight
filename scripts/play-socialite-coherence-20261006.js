// SOCIALITE deep play: real rumor flow through conversation, then time passes,
// then cross-examine villagers. Plus deep 10-turn convos for coherence/repetition.
// Usage: node scripts/play-socialite-coherence-20261006.js
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
const ALL_LINES = [];

function rec(who, text, tag) { ALL_LINES.push({ who, text: (text || '').slice(0, 220), tag }); }

function deepTalk(vid, turns, strategy) {
  const name = Game.displayName(vid) || vid;
  console.log(`\n### deep talk: ${name} (${strategy || 'mixed'})`);
  const lines = [];
  try {
    const st = Game.startConvo(vid);
    if (!st) { console.log('(no convo)'); return lines; }
    console.log(`  > "${(st.line || '').slice(0, 160)}"`);
    lines.push(st.line); rec(name, st.line, 'opener');
    for (let i = 0; i < turns; i++) {
      const ch = Game.convoChoices(vid);
      if (!ch || !ch.length) break;
      let pick = null;
      if (strategy === 'gossip-first') {
        pick = ch.find(c => c.id === 'ask:spread_rumor') || ch.find(c => c.id.indexOf('rumor:') === 0)
          || ch.find(c => c.id === 'ask:gossip') || ch.find(c => c.id === 'more')
          || ch.find(c => c.id.indexOf('ans:') === 0) || ch.find(c => c.id.indexOf('react:') === 0) || ch[0];
      } else {
        pick = ch.find(c => c.id === 'ask:personal') || ch.find(c => c.id === 'ask:past')
          || ch.find(c => c.id === 'theorize') || ch.find(c => c.id === 'more')
          || ch.find(c => c.id.indexOf('ans:') === 0) || ch.find(c => c.id.indexOf('react:') === 0) || ch[0];
      }
      if (pick.id === 'leave') break;
      const r = Game.convoTurn(vid, pick.id);
      if (!r || r.ended) { console.log('  (ended)'); break; }
      const line = (r.line || r.msg || '').slice(0, 260);
      if (line) { console.log(`  [${pick.id}] > "${line}"`); lines.push(line); rec(name, line, pick.id); }
    }
    Game.endConvo(vid, 'left');
  } catch (e) { console.log('ERROR:', e.message.slice(0, 140)); }
  return lines;
}

(async () => {
  await Game.init();
  try { Game.debugScenario('day1'); } catch (e) { console.log('scenario fail:', e.message); return; }
  const v = Game.state.village;
  const roster = (v.roster || []).slice(0, 6);
  console.log(`Roster: ${(v.roster || []).length} villagers\n`);

  // ---- 1. THE RUMOR: start one for real through conversation ----
  // Find a villager who has ask:spread_rumor open (gossip gating).
  console.log('=== 1. RUMOR: finding a villager open to gossip ===');
  let teller = null, target = null, rumorType = 'stingy';
  for (const vid of roster) {
    try {
      // earn rapport first: two quick convos (mirrors real socialite play)
      for (let k = 0; k < 2; k++) {
        const s2 = Game.startConvo(vid);
        if (!s2) break;
        const c2 = Game.convoChoices(vid);
        const p2 = c2.find(c => c.id === 'ask:personal') || c2.find(c => c.id === 'joke') || c2[0];
        if (p2 && p2.id !== 'leave') Game.convoTurn(vid, p2.id);
        Game.endConvo(vid, 'left');
      }
      const st = Game.startConvo(vid);
      if (!st) continue;
      const ch = Game.convoChoices(vid);
      if (ch.find(c => c.id === 'ask:spread_rumor')) { teller = vid; Game.endConvo(vid, 'left'); break; }
      Game.endConvo(vid, 'left');
    } catch (e) {}
  }
  if (!teller) { console.log('NOBODY has ask:spread_rumor open — gating note.'); return; }
  target = roster.find(id => id !== teller);
  console.log(`teller=${Game.displayName(teller)}, target=${Game.displayName(target)}`);
  try {
    const st = Game.startConvo(teller);
    let ch = Game.convoChoices(teller);
    let sr = ch.find(c => c.id === 'ask:spread_rumor');
    if (!sr) { console.log('no ask:spread_rumor choice; choices:', ch.map(c => c.id).join(',')); }
    else {
      let r = Game.convoTurn(teller, 'ask:spread_rumor');
      ch = Game.convoChoices(teller);
      const tgt = ch.find(c => c.id === 'rumor:tgt:' + target) || ch.find(c => c.id.indexOf('rumor:tgt:') === 0);
      if (tgt) {
        target = tgt.id.slice('rumor:tgt:'.length);
        r = Game.convoTurn(teller, tgt.id);
        ch = Game.convoChoices(teller);
        const ty = ch.find(c => c.id === 'rumor:type:stingy') || ch.find(c => c.id.indexOf('rumor:type:') === 0);
        if (ty) {
          rumorType = ty.id.slice('rumor:type:'.length);
          r = Game.convoTurn(teller, ty.id);
          console.log(`  rumor="${rumorType}" about ${Game.displayName(target)}`);
          console.log(`  reaction: "${((r && (r.line || r.msg)) || '').slice(0, 220)}"`);
        } else console.log('no rumor:type choices:', ch.map(c => c.id).join(','));
      } else console.log('no rumor:tgt choices:', ch.map(c => c.id).join(','));
    }
    Game.endConvo(teller, 'left');
  } catch (e) { console.log('rumor flow ERROR:', e.message.slice(0, 160)); }
  const g0 = (v.gossip || []).filter(g => g.playerRumor);
  console.log(`player rumors in gossip pool: ${g0.length}; first-hearer heard=${JSON.stringify(g0.map(g => g.heard))}`);

  // ---- 2. TIME PASSES: does the rumor travel? ----
  console.log('\n=== 2. TIME PASSES: 30 npc batch turns ===');
  for (let i = 0; i < 30; i++) { try { Game.npcBatchTurn && Game.npcBatchTurn(); } catch (e) {} }
  const g1 = (v.gossip || []).filter(g => g.playerRumor);
  console.log(`heard lists now: ${JSON.stringify(g1.map(g => g.heard))}; distortion=${g1.map(g => g.distortion)}`);

  // ---- 3. CROSS-EXAMINE: ask everyone for gossip ----
  console.log('\n=== 3. CROSS-EXAMINE: ask each villager for gossip ===');
  for (const vid of roster) {
    if (vid === teller) continue;
    try {
      const st = Game.startConvo(vid);
      if (!st) { console.log(`  ${Game.displayName(vid)}: (no convo)`); continue; }
      let ch = Game.convoChoices(vid);
      let pick = ch.find(c => c.id === 'ask:gossip');
      if (!pick) { console.log(`  ${Game.displayName(vid)}: no ask:gossip (choices: ${ch.map(c => c.id).slice(0, 6).join(',')})`); Game.endConvo(vid, 'left'); continue; }
      const r = Game.convoTurn(vid, 'ask:gossip');
      const line = ((r && (r.line || r.msg)) || '').slice(0, 260);
      console.log(`  ${Game.displayName(vid)}: "${line}"`);
      rec(Game.displayName(vid), line, 'gossip-ask');
      Game.endConvo(vid, 'left');
    } catch (e) { console.log(`  ${Game.displayName(vid)}: ERROR ${e.message.slice(0, 100)}`); }
  }

  // ---- 4. DEEP CONVOS for coherence ----
  deepTalk(roster[2], 10, 'personal');
  deepTalk(roster[3], 8, 'gossip-first');

  // ---- 5. REPETITION SCAN ----
  console.log('\n=== 5. REPETITION SCAN ===');
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const byText = {};
  for (const l of ALL_LINES) {
    const k = norm(l.text).slice(0, 100);
    if (k.length < 25) continue;
    byText[k] = byText[k] || [];
    byText[k].push(l);
  }
  let dupTurns = 0, dupPeople = 0;
  for (const k of Object.keys(byText)) {
    const uses = byText[k];
    if (uses.length < 2) continue;
    const whos = new Set(uses.map(u => u.who));
    if (whos.size === 1) { dupTurns++; if (dupTurns <= 4) console.log(`  SAME-VILLAGER REPEAT (${uses[0].who}): "${uses[0].text.slice(0, 110)}"`); }
    else { dupPeople++; if (dupPeople <= 4) console.log(`  SHARED BARK (${[...whos].join(', ')}): "${uses[0].text.slice(0, 110)}"`); }
  }
  console.log(`lines recorded: ${ALL_LINES.length}; same-villager repeats: ${dupTurns}; shared barks: ${dupPeople}`);
})().catch(e => console.log('FATAL', e.message, e.stack && e.stack.split('\n')[1]));
