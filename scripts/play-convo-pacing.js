// Conversation PACING playtest: full conversations start-to-finish, measuring rhythm.
// Captures: message lengths, hesitation times, transitions, endings.
// Usage: node scripts/play-convo-pacing.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }

(async () => {
  await Game.init();
  try { Game.debugScenario('mootAccused'); } catch (e) { console.log('scenario fail:', e.message); }
  if (!Game.state) { console.log('No state'); return; }
  const v = Game.state.village;
  const roster = (v.roster || []).slice(0, 5);

  const results = [];
  for (const vid of roster) {
    const name = Game.displayName(vid) || vid;
    const temp = (Game.npcTemper && Game.npcTemper(vid)) || '?';
    console.log(`\n========== ${name} [${temp}] ==========`);
    let st;
    try { st = Game.startConvo(vid); } catch (e) { console.log('startConvo FAIL:', e.message); continue; }
    if (!st) { console.log('null start'); continue; }

    const beats = []; // {who, len, hestMs, choiceId}
    const pushBeat = (who, text, hestMs, choiceId) => {
      const clean = stripTags(text);
      beats.push({ who, len: clean.length, hestMs: hestMs || 0, choiceId: choiceId || null, text: clean.slice(0, 90) });
    };

    // opening
    const openMs = Game.convoHesitationMs(vid, null, true);
    pushBeat('them', st.line, openMs, 'OPENING');

    let guard = 0, ended = false;
    let cur = st;
    while (!ended && guard < 30) {
      guard++;
      const choices = (cur.choices || []).filter(c => c.id !== 'leave');
      if (!choices.length) { pushBeat('sys', '(no choices left)', 0); break; }
      // pick a non-leave choice, prefer topic variety
      const pick = choices[Math.floor(Math.random() * choices.length)];
      const hms = Game.convoHesitationMs(vid, pick.id, false);
      pushBeat('you', pick.label, 0, pick.id);
      let nx;
      try { nx = Game.convoTurn(vid, pick.id); } catch (e) { pushBeat('sys', 'TURN FAIL: ' + e.message, 0); break; }
      if (!nx) { pushBeat('sys', '(null turn)', 0); break; }
      if (nx.line) pushBeat('them', nx.line, hms, pick.id);
      if (nx.ended) { ended = true; pushBeat('sys', `(ended: ${nx.how || 'unknown'})`, 0); break; }
      // windingDown gives us one more turn
      cur = nx;
      if (cur.windingDown && guard > 25) { pushBeat('sys', '(windingDown loop guard)', 0); break; }
    }
    // if not ended naturally, leave
    if (!ended) {
      try {
        const nx = Game.convoTurn(vid, 'leave');
        if (nx && nx.line) pushBeat('them', nx.line, Game.convoHesitationMs(vid, 'leave', false), 'leave');
        pushBeat('sys', '(player left)', 0);
      } catch (e) { pushBeat('sys', 'leave FAIL: ' + e.message, 0); }
    }

    // Report beats
    for (const b of beats) {
      const tag = b.who === 'them' ? 'NPC' : b.who === 'you' ? 'YOU' : '---';
      console.log(`  [${tag} ${b.len}ch hest=${b.hestMs}ms${b.choiceId ? ' <' + b.choiceId + '>' : ''}] ${b.text}`);
    }
    results.push({ name, temp, beats });
  }

  // === ANALYSIS ===
  console.log('\n\n########## PACING ANALYSIS ##########');
  let npcLens = [], hests = [], youLens = [];
  for (const r of results) for (const b of r.beats) {
    if (b.who === 'them') { npcLens.push(b.len); hests.push(b.hestMs); }
    if (b.who === 'you') youLens.push(b.len);
  }
  const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
  const sorted = a => [...a].sort((x, y) => x - y);
  const pctl = (a, p) => { const s = sorted(a); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  console.log(`NPC messages: n=${npcLens.length} avg=${avg(npcLens)}ch p50=${pctl(npcLens, .5)}ch p90=${pctl(npcLens, .9)}ch max=${Math.max(...npcLens, 0)}ch`);
  console.log(`YOU messages: n=${youLens.length} avg=${avg(youLens)}ch`);
  console.log(`Hesitation: avg=${avg(hests)}ms p50=${pctl(hests, .5)}ms max=${Math.max(...hests, 0)}ms`);
  // long messages
  const long = npcLens.filter(l => l > 280).length;
  console.log(`NPC messages >280ch (wall-of-text risk): ${long}/${npcLens.length}`);
  const tiny = npcLens.filter(l => l < 20).length;
  console.log(`NPC messages <20ch (dead-air risk): ${tiny}/${npcLens.length}`);

  // Endings
  console.log('\n--- Endings ---');
  for (const r of results) {
    const last = r.beats[r.beats.length - 1];
    const secondLast = r.beats[r.beats.length - 2];
    console.log(`${r.name}: last="${secondLast ? secondLast.text.slice(0, 80) : '?'}..." [${last ? last.text : '?'}]`);
  }
})().catch(e => console.log('FATAL', e.message));
