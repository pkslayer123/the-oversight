// DETECTIVE archetype playtest — UI PATH (2026-10-06).
// Plays as a player through the REAL conversation UI: startConvo -> convoChoices ->
// convoTurn. Questions the loop wants answered:
//   1. Can a player form doubts through the UI (gossip/observation/slips)?
//   2. When doubts exist, does the convo menu offer REAL confrontation (confront:<id>),
//      and is it distinguishable from the dlg:doubt flavor line?
//   3. Do confrontations actually resolve — does the player LEARN the truth?
//   4. Knowledge gating: does confrontation leak the gossiper / true names?
// Usage: node scripts/play-detective-ui-path-20261006.js [--seed N]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Full production script list, index.html order, minus DOM-only
// (app.js, sprites.js, tile-scenes.js, move-anim.js). AGENTS.md harness rule.
const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js',
  'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
];
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // stub for equipment.js at load; deleted before play (async combat rule)
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log('LOAD FAIL', f, e.message); process.exit(1); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

const seedIdx = process.argv.findIndex(a => a === '--seed' || a.startsWith('--seed='));
let seedUsed = 'random';
if (seedIdx >= 0) {
  const raw = process.argv[seedIdx].startsWith('--seed=') ? process.argv[seedIdx].slice('--seed='.length) : process.argv[seedIdx + 1];
  let s = parseInt(raw, 10) || 1; seedUsed = String(s);
  Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
const name = (vid) => { try { return Game.displayName(vid); } catch (e) { return String(vid); } };
const clip = (t, n) => String(t || '').replace(/\s+/g, ' ').slice(0, n || 200);

const out = [];
const say = (s) => { out.push(s); console.log(s); };

// choice ids for menu introspection
const ids = (choices) => (choices || []).map(c => c.id);

function tryConvoTurn(vid, choiceId) {
  try { return Game.convoTurn(vid, choiceId); }
  catch (e) { return { error: e.message, choiceId }; }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const v = Game.state.village;
  const roster = v.roster.filter(id => id !== Game.villagerId);
  say(`=== DETECTIVE UI-PATH PLAYTEST — seed ${seedUsed}, ${roster.length} villagers ===`);

  // Seed lies so the loop is exercised deterministically.
  for (const vid of roster) v.trust[vid] = 15;
  const seeds = [
    { vid: roster[1], field: 'occupation', told: 'surgeon', motive: 'shame' },
    { vid: roster[3], field: 'origin', told: 'Denver', motive: 'hiding' },
  ];
  for (const s of seeds) {
    if (!s.vid) continue;
    const vp = Game.vpOf(s.vid); vp.lies = vp.lies || {};
    const truth = s.field === 'occupation' ? (vp.formerOccupation || 'cook') : (vp.homeRegion || 'Akron');
    vp.lies[s.field] = { told: s.told, truth, motive: s.motive, field: s.field };
  }

  // Find villagers who share a language with the player (verbal path).
  const verbal = [];
  for (const vid of roster) {
    try {
      Game.startConvo(vid);
      const c = Game.convoGet(vid);
      const thread = c.thread;
      Game.endConvo && Game.endConvo(vid, 'left');
      if (thread !== 'nonverbal') verbal.push(vid);
    } catch (e) {}
  }
  say(`verbal villagers (shared language): ${verbal.length}/${roster.length}`);
  if (verbal.length < 3) { say('TOO FEW VERBAL — abort'); process.exit(1); }

  // ---- PHASE 1: interview — ask past/goal, listen, ask gossip ----
  const interviewLog = [];
  for (const vid of verbal.slice(0, 6)) {
    try {
      Game.startConvo(vid);
      let choices = Game.convoChoices(vid);
      // find ask:past or ask:goal
      const ask = choices.find(c => /^ask:(past|goal)$/.test(c.id));
      if (ask) {
        const r = tryConvoTurn(vid, ask.id);
        choices = r.choices || Game.convoChoices(vid);
        // advance a couple turns via first dlg response to build beats
        for (let t = 0; t < 3 && choices && choices.length; t++) {
          const dlg = choices.find(c => c.id === 'dlg:more' || c.id === 'dlg:react');
          if (!dlg) break;
          const rr = tryConvoTurn(vid, dlg.id);
          choices = (rr && rr.choices) || Game.convoChoices(vid);
        }
      }
      // try gossip
      choices = Game.convoChoices(vid);
      const subj = choices.find(c => c.id === 'dlg:subject');
      if (subj) {
        tryConvoTurn(vid, 'dlg:subject');
        const menu = Game.convoChoices(vid);
        const g = menu.find(c => c.id === 'ask:gossip');
        if (g) {
          const gr = tryConvoTurn(vid, 'ask:gossip');
          interviewLog.push(`${name(vid)} ask:gossip → "${clip(gr && gr.line, 150)}"`);
        }
      }
      const doubts = (Game.getDoubts && Game.getDoubts(vid)) || [];
      if (doubts.length) interviewLog.push(`${name(vid)} doubts after interview: ${doubts.map(d => '[' + d.kind + '] ' + clip(d.text, 80)).join(' | ')}`);
      Game.endConvo && Game.endConvo(vid, 'left');
    } catch (e) { interviewLog.push(`${name(vid)} ERROR: ${e.message}`); }
  }
  say('\n--- PHASE 1: interviews ---');
  interviewLog.forEach(say);

  // ---- PHASE 2: observation pass (player observes suspects) ----
  const openDoubts = Game.allDoubts ? Game.allDoubts() : [];
  say(`\n--- PHASE 2: doubts after interviews: ${openDoubts.length} ---`);
  for (const d of openDoubts) say(`  ${name(d.vid)} [${d.kind}] "${clip(d.text, 100)}"`);

  // ---- PHASE 3: confront through the REAL UI menu ----
  say('\n--- PHASE 3: confrontation via real convo menu ---');
  let uiConfrontSeen = 0, uiConfrontMissing = 0, dlgDoubtSeen = 0;
  for (const d of openDoubts) {
    const vid = d.vid;
    try {
      Game.startConvo(vid);
      const choices = Game.convoChoices(vid);
      const real = choices.filter(c => String(c.id).indexOf('confront:') === 0);
      const flavor = choices.filter(c => c.id === 'dlg:doubt');
      if (real.length) uiConfrontSeen++;
      else uiConfrontMissing++;
      if (flavor.length) dlgDoubtSeen++;
      say(`${name(vid)} [${d.kind}] menu: confront:${real.length} dlg:doubt:${flavor.length} all:[${ids(choices).join(', ')}]`);
      if (real.length) {
        const before = { trust: (v.trust || {})[vid] };
        const r = tryConvoTurn(vid, real[0].id);
        const after = { trust: (v.trust || {})[vid] };
        const still = (Game.getDoubts(vid) || []).map(x => x.id);
        say(`  → convoTurn(${real[0].id}) → "${clip(r && r.line, 220)}"`);
        say(`  trust ${before.trust}→${after.trust}; doubt resolved? ${!still.includes(d.id)} (open doubts now: ${still.length})`);
      }
      Game.endConvo && Game.endConvo(vid, 'left');
    } catch (e) { say(`${name(vid)} ERROR: ${e.message}`); }
  }
  say(`\nUI summary: real confront offered ${uiConfrontSeen}/${openDoubts.length}, missing ${uiConfrontMissing}, dlg:doubt flavor also present ${dlgDoubtSeen}`);

  // ---- PHASE 4: knowledge-gating spot check ----
  // Did confrontation lines leak true names / gossiper identity?
  say('\n--- PHASE 4: knowledge gating spot check ---');
  const leaks = [];
  for (const vid of verbal.slice(0, 4)) {
    try {
      const jp = Game.journalPerson(vid);
      const doubts = (jp && jp.doubts) || (jp && jp.e && jp.e.doubts) || [];
      for (const dd of doubts) {
        const txt = String((dd && dd.text) || '');
        if (/shanghai|denver|surgeon|carpenter/i.test(txt)) leaks.push(`${name(vid)} journal-doubt leaks truth-ish content: "${clip(txt, 100)}"`);
      }
    } catch (e) {}
  }
  if (!leaks.length) say('no obvious truth leaks in journal doubt entries');
  else leaks.forEach(say);

  say(`\n=== END seed ${seedUsed} ===`);
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
