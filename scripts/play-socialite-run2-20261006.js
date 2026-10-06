// SOCIALITE run 2 (2026-10-06, archetype 2): deep-play the conversation system.
// Full transcripts printed for human reading: coherence, contradiction,
// repetition, voice uniqueness, and voice evolution after events.
// Usage: node scripts/play-socialite-run2-20261006.js
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

const ALL_LINES = []; // {vid, topic, text}
function talk(vid, turns, seq) {
  const name = Game.displayName(vid) || vid;
  const vp = Game.vpOf(vid) || {};
  console.log(`\n### ${name} — ${vp.formerOccupation || '?'} · ${(vp.personality || {}).temperament || '?'}`);
  try {
    const st = Game.startConvo(vid);
    if (!st) { console.log('(no convo — refused or busy)'); return; }
    const op = (st.line || '');
    console.log(`  [open] "${op.slice(0, 200)}"`);
    ALL_LINES.push({ vid, topic: 'open', text: op });
    for (let i = 0; i < turns; i++) {
      const ch = Game.convoChoices(vid);
      if (!ch || !ch.length) { console.log('  (no choices)'); break; }
      // prefer the planned sequence first
      let pick = null;
      for (const id of seq) { pick = ch.find(c => c.id === id || c.id.indexOf(id) === 0); if (pick && pick.id !== 'leave') break; }
      if (!pick || pick.id === 'leave') {
        pick = ch.find(c => c.id.indexOf('ans:') === 0) || ch.find(c => c.id.indexOf('react:') === 0) || ch[0];
      }
      if (pick.id === 'leave') break;
      const r = Game.convoTurn(vid, pick.id);
      if (!r || r.ended) { console.log('  (ended)'); break; }
      const line = (r.line || r.msg || '');
      const tlabel = pick.id.slice(0, 22);
      console.log(`  you(${tlabel}): "${pick.label.slice(0, 70)}"`);
      console.log(`  > "${line.slice(0, 240)}"`);
      if (line) ALL_LINES.push({ vid, topic: tlabel, text: line });
    }
    Game.endConvo(vid, 'left');
  } catch (e) { console.log('ERROR:', e.message.slice(0, 140)); }
}

(async () => {
  await Game.init();
  try { Game.debugScenario('day1'); } catch (e) { console.log('scenario fail:', e.message); return; }
  const v = Game.state.village;
  const roster = (v.roster || []).slice(0, 6);
  const names = roster.map(id => Game.displayName(id));
  console.log(`Roster: ${(v.roster || []).length} villagers. Deep talks with: ${names.join(', ')}\n`);

  const seqs = [
    ['ask:personal', 'ask:past', 'ask:goal', 'ask:plans', 'ask:village', 'ask:gossip'],
    ['ask:gossip', 'ask:personal', 'ask:past', 'ask:goal', 'ask:plans', 'theorize'],
    ['ask:past', 'ask:personal', 'ask:village', 'ask:gossip', 'ask:goal', 'ask:plans'],
    ['ask:goal', 'ask:plans', 'ask:personal', 'ask:past', 'ask:village', 'ask:gossip'],
    ['ask:personal', 'ask:past', 'ask:past', 'ask:goal', 'ask:gossip', 'ask:village'],
    ['ask:village', 'ask:personal', 'ask:past', 'ask:goal', 'ask:plans', 'ask:gossip'],
  ];
  for (let i = 0; i < roster.length; i++) talk(roster[i], 10, seqs[i]);

  // --- REPEAT-ASK: does re-asking the same topic repeat the same line? ---
  console.log('\n\n=== REPEAT-ASK (same topic twice in one convo) ===');
  try {
    const vid = roster[0];
    const st = Game.startConvo(vid);
    const askId = (Game.convoChoices(vid).find(c => c.id === 'ask:past') || {}).id;
    if (askId) {
      for (let k = 0; k < 3; k++) {
        const r = Game.convoTurn(vid, askId);
        console.log(`  [ask:past #${k + 1}] "${((r && (r.line || '')) || '').slice(0, 220)}"`);
      }
    } else console.log('  (no ask:past choice)');
    Game.endConvo(vid, 'left');
  } catch (e) { console.log('ERROR:', e.message.slice(0, 140)); }

  // --- REPETITION AUDIT ---
  console.log('\n\n=== REPETITION AUDIT ===');
  const norm = t => (t || '').replace(/[A-Z][a-z]+/g, 'NAME').replace(/\d+/g, 'N').replace(/\s+/g, ' ').trim().toLowerCase();
  const byNorm = {};
  for (const l of ALL_LINES) {
    const n = norm(l.text);
    if (n.length < 40) continue;
    byNorm[n] = byNorm[n] || { vids: new Set(), topics: new Set(), count: 0 };
    byNorm[n].vids.add(l.vid); byNorm[n].topics.add(l.topic); byNorm[n].count++;
  }
  let dupes = 0;
  for (const [n, info] of Object.entries(byNorm)) {
    if (info.vids.size > 1 || info.count > 1) {
      dupes++;
      if (dupes <= 8) console.log(`  DUPE x${info.count} (${info.vids.size} villagers, topics ${[...info.topics].join(',')}): "${n.slice(0, 130)}"`);
    }
  }
  console.log(`lines sampled: ${ALL_LINES.length}, normalized dupes (2+ villagers or repeated): ${dupes}`);

  console.log('\n\n=== END OF SOCIALITE RUN 2 ===');
})().catch(e => console.log('FATAL', e.message, e.stack && e.stack.split('\n')[1]));
