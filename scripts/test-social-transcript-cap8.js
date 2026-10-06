// REPRO: cap-8 transcript trims survive in convo wrappers (Steve 2026-10-06).
// Bug class Steve flagged 2026-10-05: transcript cap was 8 — destroyed the
// speaker-tab full history and desynced tap-advance. conversation.js push
// sites were raised to 200, but FIVE wrapper trims still use 8:
//   betrayal.js:1743 (finish(): ambush talk/run/fight, press, approach,
//                     wounds, site, witnesses, accept/decline)
//   game.js:1976, 1995, 2027 (gesture convo, NPC question, convo exit)
//   truth.js:1022 (confront: choice — the liar confrontation path)
// Empirical proof: 6 press turns (12 transcript entries) render a transcript
// of length 8 — the speaker-tab history loses the first entries.
// Usage: node scripts/test-social-transcript-cap8.js  (exit 1 = bug present)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
(async () => {
  await Game.init();
  let fail = 0;
  // 1. static: no cap-8 trims may survive in convo wrappers
  for (const f of ['src/js/betrayal.js', 'src/js/game.js', 'src/js/truth.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const hits = [...src.matchAll(/transcript\.length > 8/g)];
    if (hits.length) {
      fail++;
      const lines = src.split('\n');
      let ci = 0;
      const at = hits.map(h => {
        while (ci < lines.length && lines.slice(0, ci + 1).join('\n').length < h.index) ci++;
        return ci + 1;
      });
      console.log(`FAIL ${f}: ${hits.length} cap-8 trim(s) at line(s) ${at.join(', ')}`);
    }
  }
  // 2. empirical: 6 press turns = 12 entries; speaker-tab transcript must keep them
  Game.debugScenario('mootJuror');
  const cs = (Game.betrayalState().cases || []).find(x => x.playerRole === 'juror');
  const vid = ((cs && (cs.accusedIds || cs.accused || [])) || [])[0];
  if (vid) {
    Game.startConvo(vid);
    const press = (Game.convoChoices(vid) || []).find(c => /^betrayal:press/.test(c.id));
    if (press) {
      for (let i = 0; i < 6; i++) Game.convoTurn(vid, press.id);
      const n = (Game.convoUI(vid).transcript || []).length;
      if (n < 12) { fail++; console.log(`FAIL empirical: 12 entries pushed, transcript keeps ${n} (cap-8 trim active)`); }
      else console.log(`  empirical: transcript keeps ${n}/12 entries`);
    }
    try { Game.endConvo(vid, 'left'); } catch (e) {}
  }
  console.log(fail ? `\n${fail} cap-8 trim bug(s) present` : '\nALL PASS: no cap-8 trims in convo wrappers');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); process.exit(2); });
