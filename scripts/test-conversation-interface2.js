// Conversation structure tests: one-beat turns, voiced continuer, no interrupt.
// Steve rejected the interrupt button (shortsighted) — the structural fix is
// one-beat turns: a choice yields exactly one new THEM beat; follow-ons queue
// in c.heldBeats and surface as a voiced continuer ('goon').
// Usage: node scripts/test-conversation-interface2.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

// ---- Static checks on app.js (no DOM needed) ----
const appJs = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');

ok('interrupt button is GONE from dialogueBoxHTML',
  !appJs.includes('dlg-interrupt') && !appJs.includes('chatInterrupt'));
ok('no interrupt trust penalty remains',
  !appJs.includes('c.interrupted'));
ok('chatChoice skips your echoed line (lands on their reply)',
  /while \(idx < t\.length && t\[idx\]\.who === 'you'\) idx\+\+/.test(appJs));

// ---- Static checks on CSS ----
const css = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');
ok('interrupt styles removed', !css.includes('.dlg-interrupt') && !css.includes('.dlg-advance'));

// ---- Engine checks (eval harness) ----
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/convo-mood.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  Game.debugScenario('liars');
  for (const vid of Game.npcIds()) { Game.state.village.trust[vid] = 50; }

  let maxBeats = 0, goonSeen = 0, goonLabels = new Set();
  let askBlind = 0; // answers offered before the question was shown
  for (const vid of Game.npcIds().slice(0, 6)) {
    const st = Game.startConvo(vid);
    if (!st) continue;
    let choices = st.choices || [], turns = 0;
    while (turns < 12 && choices && choices.length) {
      const c = Game.convoGet(vid);
      const goon = choices.find(ch => ch.id === 'goon');
      if (goon) { goonSeen++; goonLabels.add(goon.label); }
      // Blind-answer check: ans: offered while pendingQ null means the
      // question hasn't been shown yet (shouldn't happen for ask-beats).
      const hasAns = choices.some(ch => ch.id.indexOf('ans:') === 0);
      if (hasAns && !c.pendingQ) askBlind++;
      const nonLeave = choices.filter(ch => ch.id !== 'leave');
      const pool = nonLeave.length ? nonLeave : choices;
      const pick = goon && turns % 3 !== 2 ? goon : pool[turns % pool.length];
      const before = Game.convoGet(vid).transcript.slice();
      const res = Game.convoTurn(vid, pick.id);
      if (!res || res.ended) break;
      const after = Game.convoGet(vid).transcript;
      const lastBefore = before.length ? before[before.length - 1] : null;
      let idx = 0;
      if (lastBefore) { const li = after.lastIndexOf(lastBefore); idx = li >= 0 ? li + 1 : 0; }
      const themFresh = after.slice(idx).filter(e => e.who === 'them').length;
      if (themFresh > maxBeats) maxBeats = themFresh;
      choices = res.choices || [];
      turns++;
    }
    try { Game.endConvo(vid, 'left'); } catch (e) {}
  }

  ok('one-beat invariant: max 1 new THEM beat per choice', maxBeats <= 1, `max=${maxBeats}`);
  ok('continuer ("goon") is offered when beats are held', goonSeen > 0, `offered ${goonSeen}x`);
  ok('continuer labels vary (voiced per person/mood/thread)',
    goonLabels.size >= 2, [...goonLabels].slice(0, 4).join(' / '));
  ok('never offer answers to an unshown question', askBlind === 0, `${askBlind}x`);

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
