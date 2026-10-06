// Detective archetype feel playtest (2026-10-06 run): play as a player.
// - NO seeded lies: natural liar rate only. Is there enough to do?
// - Uses the real player path: startConvo → convoChoices → 'confront:' choice
//   → convoTurn, not direct confrontDoubt calls.
// - Captures what the player SEES: choices, doubtsHTML, journal notes.
// - Feel verdict: legible? enough leads? sustained past day 3? risky?
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let s = parseInt(process.env.SEED || '7', 10);
Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };

const name = (vid) => { try { return Game.displayName(vid); } catch (e) { return vid; } };
const log = [];
const say = (t) => log.push(t);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  say(`village: ${roster.length} villagers`);

  // natural liars (player-visible info only: NONE at start)
  let liars = 0;
  for (const vid of roster) {
    const lies = Game.npcLies(vid);
    if (lies && Object.values(lies).some(l => l && l.told)) liars++;
  }
  say(`natural liars (player can't see this): ${liars}/${roster.length}`);

  const days = 7;
  const seenDoubts = new Set();
  let confronts = 0;
  const outcomes = {};

  for (let d = 0; d < days; d++) {
    const day = Game.state.scholar.day;
    say(`\n===== DAY ${day} =====`);
    // PLAYER MORNING: interview everyone: past, then goal
    for (const vid of roster) {
      Game.startConvo(vid);
      try { Game.convoAskTopic(vid, 'past'); } catch (e) {}
      try { Game.convoAskTopic(vid, 'goal'); } catch (e) {}
      try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
    }
    // PLAYER MIDDAY: ask gossip in convos (the real path: convoAskTopic 'gossip')
    for (let i = 0; i < 4; i++) {
      const vid = roster[Math.floor(Math.random() * roster.length)];
      Game.startConvo(vid);
      let line = '';
      try { line = Game.convoAskTopic(vid, 'gossip'); } catch (e) { line = e.message; }
      try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
      if (line && /contradict|snorts|doesn't survive|told you|admitted|lie/i.test(String(line))) {
        say(`  gossip spark day ${day} — ${name(vid)}: ${String(line).slice(0, 160)}`);
      }
    }
    // PLAYER: observe one suspicious person (pick one with a doubt, else random)
    const openPre = Game.allDoubts().filter(x => !x.resolved);
    const obsTarget = openPre.length ? openPre[0].vid : roster[Math.floor(Math.random() * roster.length)];
    const obs = Game.observePerson(obsTarget);
    if (obs && obs.found) say(`  observe day ${day} — ${name(obsTarget)}: ${String(obs.text).slice(0, 150)}`);

    // PLAYER EVENING: check journal/doubts surface, confront via UI choices
    const open = Game.allDoubts().filter(x => !x.resolved);
    for (const d_ of open) {
      if (seenDoubts.has(d_.id)) continue;
      seenDoubts.add(d_.id);
      say(`  NEW DOUBT day ${day} — ${name(d_.vid)} [${d_.kind}]: ${String(d_.text).slice(0, 160)}`);
    }
    if (d === 0) {
      // capture what the player sees: doubts card HTML + journal note sample
      const html = Game.doubtsHTML ? Game.doubtsHTML() : '';
      say(`  doubtsHTML length: ${html.length} chars`);
      const jn = Game.state.journal && Game.state.journal.notes ? Game.state.journal.notes : [];
      const qn = jn.filter(n => String(n.text || n).includes('❓'));
      say(`  journal ❓ notes: ${qn.length}`);
      if (qn[0]) say(`  sample: ${String(qn[0].text || qn[0]).slice(0, 180)}`);
    }
    // confront EVERYTHING via the UI path
    for (const d_ of open) {
      Game.startConvo(d_.vid);
      const choices = Game.convoChoices(d_.vid);
      const cf = choices.find(ch => String(ch.id).indexOf('confront:') === 0);
      let out;
      if (cf) {
        const res = Game.convoTurn(d_.vid, cf.id);
        out = res && res.outcome ? res.outcome : 'no-outcome';
        say(`  CONFRONT(UI) day ${day} — ${name(d_.vid)} [${d_.kind}] → ${out}: ${String(res && res.line || '').slice(0, 200)}`);
      } else {
        const r = Game.confrontDoubt(d_.vid, d_.id);
        out = r.outcome;
        say(`  CONFRONT(direct, no UI choice!) day ${day} — ${name(d_.vid)} [${d_.kind}] → ${out}`);
      }
      confronts++;
      outcomes[out] = (outcomes[out] || 0) + 1;
      try { Game.endConvo && Game.endConvo(d_.vid, 'left'); } catch (e) {}
    }
    const allD = Game.allDoubts(true);
    say(`  end of day ${day}: open=${allD.filter(x => !x.resolved).length} resolved=${allD.filter(x => x.resolved).length}`);
    Game.endDay();
  }

  say(`\n===== FEEL SUMMARY =====`);
  say(`doubts ever formed: ${seenDoubts.size}`);
  say(`confrontations: ${confronts}, outcomes: ${JSON.stringify(outcomes)}`);
  const allD = Game.allDoubts(true);
  const kinds = {};
  for (const d_ of allD) kinds[d_.kind] = (kinds[d_.kind] || 0) + 1;
  say(`kinds: ${JSON.stringify(kinds)}`);

  const outPath = path.join(ROOT, 'scripts', 'play-detective-feel-output.txt');
  fs.writeFileSync(outPath, log.join('\n') + '\n');
  console.log(log.join('\n'));
  console.log(`\nwrote ${outPath}`);
})();
