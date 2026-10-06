// Detective archetype — RUMOR WEB playtest (2026-10-06, second run of the day).
// DIFFERENT PLAY STYLE from play-detective-feel.js: no interview-everyone 'past'/'goal'
// sweep. This player is a gossip-collector: harvest gossip daily, observe suspects,
// cross-reference rumors, confront via the UI path. Measures:
//   1. doubt formation rate with gossip-heavy play over 12 days (sustainability)
//   2. false-accusation cost: confront a doubt with NO lie behind it — trust delta?
//   3. multi-doubt UI: villager with 2+ open doubts — both confrontable?
//   4. village-level consequences: honesty rep, trust, gossip-after-confession
//   5. any survival-relevant payoff (knowledge/party/trust economy)
// Player-visible info only drives decisions (roster order, open doubts, gossip text);
// npcLies is consulted ONLY for analysis, never to choose actions — except the
// deliberate false-accusation probe on day 6 (marked clearly).
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

const SEEDS = (process.env.SEEDS || '7,9,42').split(',').map(Number);
const DAYS = parseInt(process.env.DAYS || '12', 10);
const log = [];
const say = (t) => log.push(t);

const name = (vid) => { try { return Game.displayName(vid); } catch (e) { return vid; } };
const trust = (vid) => (((Game.state.village.trust || {})[vid]) || 0);
const honest = (vid) => {
  try { const r = (Game.state.village.rep || {})[vid] || {}; return r.honest || 0; } catch (e) { return 0; }
};

function confrontUI(vid, doubtId) {
  Game.startConvo(vid);
  const choices = Game.convoChoices(vid);
  const cf = choices.find(ch => String(ch.id).indexOf('confront:') === 0);
  let rec;
  if (cf) {
    const res = Game.convoTurn(vid, cf.id);
    // convoTurn returns {line, choices, ended} — outcome is not returned (UI only needs the line).
    // Re-derive outcome: doubt resolved + resolution text, or trust deltas.
    const d = (Game.state.codex.doubts || []).find(x => x.id === doubtId);
    rec = { ui: true, choiceId: cf.id, resolved: d && d.resolved, resolution: d && d.resolution, line: String(res && res.line || '').slice(0, 160) };
  } else {
    const c = Game.convoGet(vid);
    rec = { ui: false, diag: `pendingQ=${!!(c && c.pendingQ)} thread=${c && c.thread} getDoubts=${Game.getDoubts(vid).length} choices=[${choices.map(ch => ch.id).join(',')}]` };
  }
  try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
  return rec;
}

(async () => {
  for (const seed of SEEDS) {
    let s = seed;
    Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
    say(`\n######## SEED ${seed} — ${roster.length} villagers ########`);
    // analysis-only: liar census
    let liars = 0;
    for (const vid of roster) { const L = Game.npcLies(vid); if (L && Object.values(L).some(l => l && l.told)) liars++; }
    say(`liars (analyst-only): ${liars}/${roster.length}`);

    let formed = 0, confronted = 0, noUIChoice = 0;
    const outcomeKinds = {};
    let falseAccProbe = null;

    for (let d = 0; d < DAYS; d++) {
      const day = Game.state.scholar.day;
      // MORNING: harvest gossip from everyone (the rumor-web play)
      let sparks = 0;
      for (const vid of roster) {
        Game.startConvo(vid);
        let line = '';
        try { line = Game.convoAskTopic(vid, 'gossip'); } catch (e) { line = e.message; }
        try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
        if (line && /❓/.test(String(line))) { sparks++; if (sparks <= 2) say(`  d${day} spark — ${name(vid)}: ${String(line).slice(0, 130)}`); }
      }
      const before = Game.allDoubts().filter(x => !x.resolved).length;
      // MIDDAY: observe the most-suspicious person (player-visible: most open doubts)
      const open0 = Game.allDoubts().filter(x => !x.resolved);
      const counts = {};
      for (const x of open0) counts[x.vid] = (counts[x.vid] || 0) + 1;
      let suspect = roster[0], best = -1;
      for (const vid of roster) if ((counts[vid] || 0) > best) { best = counts[vid] || 0; suspect = vid; }
      const obs = Game.observePerson(suspect);
      // EVENING: confront every open doubt via UI
      const open = Game.allDoubts().filter(x => !x.resolved);
      for (const db of open) {
        const t0 = trust(db.vid), h0 = honest(db.vid);
        const r = confrontUI(db.vid, db.id);
        confronted++;
        if (!r.ui) { noUIChoice++; say(`  d${day} NO-UI-CHOICE — ${name(db.vid)} [${db.kind}] doubt still open | ${r.diag}`); continue; }
        outcomeKinds[r.resolved ? 'resolved' : 'still-open'] = (outcomeKinds[r.resolved ? 'resolved' : 'still-open'] || 0) + 1;
        say(`  d${day} confront — ${name(db.vid)} [${db.kind}] → ${r.resolved ? 'RESOLVED: ' + r.resolution : 'STILL OPEN'} (trust ${t0}->${trust(db.vid)}, honest ${h0}->${honest(db.vid)})`);
      }
      formed += Game.allDoubts(true).length;
      // DAY 6: false-accusation probe — find an OPEN doubt with NO live lie behind it
      if (d === 6 && !falseAccProbe) {
        for (const db of Game.allDoubts().filter(x => !x.resolved)) {
          const L = Game.npcLies(db.vid);
          let liveLie = false;
          if (L) for (const l of Object.values(L)) if (l && l.told && !l.confessed) liveLie = true;
          if (!liveLie) {
            const t0 = trust(db.vid);
            const r = Game.confrontDoubt(db.vid, db.id); // direct: UI path already verified above
            falseAccProbe = { vid: name(db.vid), kind: db.kind, outcome: r.outcome, trustBefore: t0, trustAfter: trust(db.vid), line: String(r.line).slice(0, 120) };
            say(`  d${day} FALSE-ACCUSATION PROBE — ${name(db.vid)} [${db.kind}]: outcome=${r.outcome}, trust ${t0}->${trust(db.vid)}, line="${String(r.line).slice(0, 110)}"`);
            break;
          }
        }
        if (!falseAccProbe) say(`  d${day} FALSE-ACCUSATION PROBE: no liess doubt available (all doubts had a live lie)`);
      }
      const allD = Game.allDoubts(true);
      say(`  d${day}: formed-total=${allD.length} open=${allD.filter(x => !x.resolved).length} sparks=${sparks} obsFound=${obs && obs.found}`);
      Game.endDay();
      if (Game.state.scholar.day === day) { say(`  d${day}: PLAYER DIED or day did not advance — stopping`); break; } // endDay early-return (e.g. death)
    }
    const allD = Game.allDoubts(true);
    const kinds = {};
    for (const x of allD) kinds[x.kind] = (kinds[x.kind] || 0) + 1;
    say(`seed ${seed} SUMMARY: doubts=${allD.length} kinds=${JSON.stringify(kinds)} confronted=${confronted} noUI=${noUIChoice} outcomes=${JSON.stringify(outcomeKinds)}`);
    // village consequences: who has honesty rep hits?
    const repHits = [];
    for (const vid of roster) { const h = honest(vid); if (h < 0) repHits.push(`${name(vid)}:${h}`); }
    say(`seed ${seed} honesty-rep hits: ${repHits.length ? repHits.join(', ') : 'none'}`);
  }
  const outPath = path.join(ROOT, 'scripts', 'play-detective-rumorweb-output.txt');
  fs.writeFileSync(outPath, log.join('\n') + '\n');
  console.log(log.join('\n'));
  console.log(`\nwrote ${outPath}`);
})();
