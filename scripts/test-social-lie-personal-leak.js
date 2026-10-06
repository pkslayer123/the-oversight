// REPRO: 'personal' smalltalk leaks a liar's real occupation under an active cover (Steve 2026-10-06).
// The lie wrapper (truth.js getActiveLie) only maps topics 'past' and 'goal' —
// the 'personal' branch (conversation.js convoAskTopic 'personal') fills talk
// lines from the REAL formerOccupation with no lie swap, handing the player
// the truth for free and breaking the detective loop ("if you don't know, it
// doesn't show").
// Usage: node scripts/test-social-lie-personal-leak.js  (exit 1 = leak present)
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
  Game.debugScenario('liars');
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId).slice(0, 5);
  let fail = 0;
  for (const rid of roster) {
    const vp = Game.vpOf(rid);
    const truth = (vp.formerOccupation || '').toLowerCase();
    const cover = ((vp.lies && vp.lies.occupation && vp.lies.occupation.told) || '').toLowerCase();
    if (!truth || !cover) continue;
    const active = Game.getActiveLie && Game.getActiveLie(rid, 'past');
    if (!active) { console.log(`  (skip ${rid}: no active lie this seed)`); continue; }
    Game.startConvo(rid);
    for (let i = 0; i < 10; i++) {
      const ch = (Game.convoChoices(rid) || []).filter(c => !/leave|bye|goodbye/i.test(c.label));
      if (!ch.length) break;
      const r = Game.convoTurn(rid, ch[i % ch.length].id);
      const line = String((r && r.line) || '');
      const low = line.toLowerCase();
      if (low.includes(truth) && !low.includes(cover)) {
        fail++;
        console.log(`FAIL ${rid}: "personal" smalltalk reveals "${truth}" under "${cover}" cover:`);
        console.log(`     "${line.slice(0, 120)}"`);
        break;
      }
      if (!r || r.ended) break;
    }
    try { Game.endConvo(rid, 'left'); } catch (e) {}
  }
  console.log(fail ? `\n${fail} liar(s) leaked real occupation via 'personal' topic` : '\nALL PASS: no occupation leak through personal smalltalk');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); process.exit(2); });
