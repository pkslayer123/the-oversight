// Detective archetype playtest — this run (2026-10-06, 14:00 CDT loop).
// Plays like a real player over 10 days, 3 seeds. Different angle from the
// rumorweb/feel runs: realistic pacing (not interview-everyone-day-1), full
// UI-real confrontation path INCLUDING interpreter bridging (nv:translate),
// journal/doubt legibility, and the fate of permanently-unactionable doubts.
//
// Feel questions:
//  1. Is the detective loop legible and fun past day 3, or feast-then-famine?
//  2. When a doubt has no UI path (nonverbal suspect, no interpreter), what
//     does the player see — dead end, or an alternative?
//  3. Do confrontations feel consequential (costs, rewards, dialogue quality)?
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js'
].forEach(f => {
  let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (f === 'src/js/game.js') {
    // WORKAROUND for the aa9cb19 newGame crash (rosterChars written before init;
    // see scripts/test-newgame-rosterchars-crash-20261006.js). In-memory only —
    // the real one-line fix is documented there, pending the sibling's hunk.
    src = src.replace('      for (const id of bg) {',
      '      this.state.village.rosterChars = {};\n      for (const id of bg) {');
    src = src.replace('\n      this.state.village.rosterChars = {};\n      for (const c of this.generatedRoster)',
      '\n      for (const c of this.generatedRoster)');
  }
  eval(src);
});
const Game = globalThis.Scattering.Game;

const seedArg = parseInt(process.env.SEED || '7', 10);
const seeds = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : [seedArg];
const DAYS = 10;
const name = (vid) => { try { return Game.displayName(vid); } catch (e) { return vid; } };
const trust = (vid) => { try { return Game.state.codex.people[vid].trust; } catch (e) { return '?'; } };
const honest = (vid) => { try { return (Game.state.codex.people[vid].honestyRep || 0); } catch (e) { return '?'; } };
const log = [];
const say = (t) => log.push(t);

// Real-UI confrontation path: startConvo -> choices -> (nv:translate if needed) -> confront: -> convoTurn
function confrontPlayerPath(vid, doubtId) {
  const diag = [];
  Game.startConvo(vid);
  let c = Game.convoGet(vid);
  diag.push(`thread=${c.thread} pendingQ=${!!c.pendingQ}`);
  let choices = Game.convoChoices(vid);
  let cf = choices.find(ch => String(ch.id).indexOf('confront:') === 0);
  if (!cf) {
    const tr = choices.find(ch => ch.id === 'nv:translate');
    if (tr) {
      diag.push('took nv:translate bridge');
      const r1 = Game.convoTurn(vid, 'nv:translate');
      choices = (r1 && r1.choices) || Game.convoChoices(vid);
      cf = choices.find(ch => String(ch.id).indexOf('confront:') === 0);
      c = Game.convoGet(vid);
      diag.push(`post-bridge thread=${c.thread} interpreter=${!!c.interpreter}`);
    } else {
      diag.push(`no bridge available | choices=[${choices.map(ch => ch.id).join(',')}]`);
    }
  }
  let res = null;
  if (cf) {
    const r = Game.convoTurn(vid, cf.id);
    res = { ok: true, outcome: r && r.outcome, line: String((r && r.line) || '').slice(0, 260), diag: diag.join(' | ') };
  } else {
    res = { ok: false, diag: diag.join(' | ') };
  }
  try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
  return res;
}

(async () => {
  for (const seed of seeds) {
    let s = seed;
    Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
    say(`\n######## SEED ${seed} — ${roster.length} villagers ########`);
    let liars = 0;
    for (const vid of roster) { const L = Game.npcLies(vid); if (L && Object.values(L).some(l => l && l.told)) liars++; }
    say(`liars (analyst-only): ${liars}/${roster.length}`);

    const seenDoubts = new Set();
    let confronts = 0, noUI = 0, obsFound = 0, obsTried = 0;
    const outcomes = {};
    const doubtKinds = {};
    const falseAcc = [];
    const sparksSeen = [];

    for (let d = 0; d < DAYS; d++) {
      const day = Game.state.scholar.day;
      say(`\n===== DAY ${day} =====`);
      // MORNING: interview 3 villagers (rotate; new people first, then open-doubt folks)
      const openPre = Game.allDoubts().filter(x => !x.resolved);
      const talked = new Set(Game.state.codex.people ? Object.keys(Game.state.codex.people).filter(v => Game.state.codex.people[v].met) : []);
      const queue = [...new Set([...openPre.map(x => x.vid), ...roster.filter(v => !talked.has(v)), ...roster])].slice(0, 3);
      for (const vid of queue) {
        Game.startConvo(vid);
        try { Game.convoAskTopic(vid, 'past'); } catch (e) {}
        try { Game.convoAskTopic(vid, 'goal'); } catch (e) {}
        try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
      }
      // MIDDAY: 3 gossip asks
      let sparks = 0;
      for (let i = 0; i < 3; i++) {
        const vid = roster[(d * 3 + i) % roster.length];
        Game.startConvo(vid);
        let line = '';
        try { line = Game.convoAskTopic(vid, 'gossip'); } catch (e) { line = e.message; }
        try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
        if (line && /❓/.test(String(line))) {
          sparks++; sparksSeen.push(`d${day} ${name(vid)}: ${String(line).slice(0, 150)}`);
          if (sparks <= 2) say(`  spark — ${name(vid)}: ${String(line).slice(0, 150)}`);
        }
      }
      // observe the most-suspicious
      const open0 = Game.allDoubts().filter(x => !x.resolved);
      const counts = {};
      for (const x of open0) counts[x.vid] = (counts[x.vid] || 0) + 1;
      let suspect = roster[d % roster.length], best = -1;
      for (const vid of roster) if ((counts[vid] || 0) > best) { best = counts[vid] || 0; suspect = vid; }
      const obs = Game.observePerson(suspect);
      obsTried++;
      if (obs && obs.found) { obsFound++; say(`  observe — ${name(suspect)}: ${String(obs.text).slice(0, 150)}`); }

      // EVENING: what does the player SEE about open doubts? (journal legibility)
      const open = Game.allDoubts().filter(x => !x.resolved);
      for (const db of open) {
        if (seenDoubts.has(db.id)) continue;
        seenDoubts.add(db.id);
        doubtKinds[db.kind] = (doubtKinds[db.kind] || 0) + 1;
        let jp = '';
        try { const e = Game.journalPerson(db.vid); jp = (e.doubts || []).map(x => x.kind).join(','); } catch (e) {}
        say(`  NEW DOUBT — ${name(db.vid)} [${db.kind}] journalDoubts=[${jp}]: ${String(db.text).slice(0, 150)}`);
      }
      // confront everything, real UI path
      for (const db of open) {
        const L = Game.npcLies(db.vid);
        const liveLie = L && Object.values(L).some(l => l && l.told && !l.confessed);
        const t0 = trust(db.vid), h0 = honest(db.vid);
        const r = confrontPlayerPath(db.vid, db.id);
        confronts++;
        if (!r.ok) {
          noUI++;
          say(`  NO-UI — ${name(db.vid)} [${db.kind}] stuck: ${r.diag}`);
          continue;
        }
        const out = r.outcome || 'no-outcome';
        outcomes[out] = (outcomes[out] || 0) + 1;
        if (!liveLie) falseAcc.push({ vid: name(db.vid), kind: db.kind, outcome: out, dT: `${t0}->${trust(db.vid)}`, line: r.line.slice(0, 130) });
        say(`  CONFRONT — ${name(db.vid)} [${db.kind}] liveLie=${!!liveLie} → ${out} (trust ${t0}->${trust(db.vid)}, honest ${h0}->${honest(db.vid)})`);
        say(`    "${r.line.slice(0, 200)}"`);
      }
      const allD = Game.allDoubts(true);
      say(`  eod: formed=${allD.length} open=${allD.filter(x => !x.resolved).length} sparks=${sparks}`);
      Game.endDay();
      if (Game.state.scholar.day === day) { say(`  PLAYER DIED or day stuck — stopping`); break; }
    }
    say(`\nseed ${seed} SUMMARY: doubts=${Game.allDoubts(true).length} kinds=${JSON.stringify(doubtKinds)} confronts=${confronts} noUI=${noUI} obs=${obsFound}/${obsTried} outcomes=${JSON.stringify(outcomes)}`);
    if (falseAcc.length) {
      say(`false-accusations (no live lie behind doubt):`);
      for (const f of falseAcc.slice(0, 6)) say(`  ${f.vid} [${f.kind}] → ${f.outcome}, trust ${f.dT}: "${f.line}"`);
    }
    if (sparksSeen.length > 6) say(`(total sparks: ${sparksSeen.length})`);
  }
  const outPath = path.join(ROOT, 'scripts', 'play-detective-feel3-output.txt');
  fs.writeFileSync(outPath, log.join('\n') + '\n');
  console.log(log.join('\n'));
  console.log(`\nwrote ${outPath}`);
})();
