// DETECTIVE archetype playtest 2 — persistence loop (2026-10-06).
// Does repeated confrontation pay off? Form doubts through the UI across seeds,
// confront the SAME doubt up to 4 times (evidence should mount: +15% per deflect),
// and report outcome sequences. Also: does a resolved doubt's truth reach the journal?
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
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
global.window = global;
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log('LOAD FAIL', f, e.message); process.exit(1); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

const seeds = (process.argv[2] || '7,42,99').split(',').map(Number);
const name = (vid) => { try { return Game.displayName(vid); } catch (e) { return String(vid); } };
const clip = (t, n) => String(t || '').replace(/\s+/g, ' ').slice(0, n || 120);

let seed = 1;
function setSeed(s) { seed = s; Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }

const total = { doubts: 0, resolved: 0, sequences: [] };

(async () => {
for (const s of seeds) {
  setSeed(s);
  // need a fresh Game per seed — re-eval is heavy; instead reset via newGame
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = v.roster.filter(id => id !== Game.villagerId);
  for (const vid of roster) v.trust[vid] = 20;
  // seed 2 lies
  const L = [
    { vid: roster[1], field: 'occupation', told: 'surgeon', motive: 'shame' },
    { vid: roster[3], field: 'origin', told: 'Denver', motive: 'hiding' },
  ];
  for (const x of L) {
    if (!x.vid) continue;
    const vp = Game.vpOf(x.vid); vp.lies = vp.lies || {};
    vp.lies[x.field] = { told: x.told, truth: x.field === 'occupation' ? (vp.formerOccupation || 'cook') : (vp.homeRegion || 'Akron'), motive: x.motive, field: x.field };
  }

  // quick interview sweep: past/goal + gossip for everyone
  for (const vid of roster) {
    try {
      Game.startConvo(vid);
      let choices = Game.convoChoices(vid);
      const ask = choices.find(c => /^ask:(past|goal)$/.test(c.id));
      if (ask) Game.convoTurn(vid, ask.id);
      for (let t = 0; t < 2; t++) {
        choices = Game.convoChoices(vid);
        const dlg = choices.find(c => c.id === 'dlg:more' || c.id === 'dlg:react');
        if (dlg) Game.convoTurn(vid, dlg.id); else break;
      }
      choices = Game.convoChoices(vid);
      if (choices.find(c => c.id === 'dlg:subject')) {
        Game.convoTurn(vid, 'dlg:subject');
        const menu = Game.convoChoices(vid);
        if (menu.find(c => c.id === 'ask:gossip')) Game.convoTurn(vid, 'ask:gossip');
      }
      Game.endConvo && Game.endConvo(vid, 'left');
    } catch (e) {}
    // observe for observation doubts
    try { Game.observePerson && Game.observePerson(vid); } catch (e) {}
  }

  const doubts = Game.allDoubts();
  console.log(`\n### seed ${s}: ${doubts.length} doubts formed via UI`);
  for (const d of doubts) {
    total.doubts++;
    const vid = d.vid;
    const seq = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      const open = (Game.getDoubts(vid) || []).find(x => x.id === d.id);
      if (!open) { seq.push('resolved'); break; }
      try {
        Game.startConvo(vid);
        const choices = Game.convoChoices(vid);
        const real = choices.find(c => String(c.id).indexOf('confront:') === 0);
        if (!real) { seq.push('NO-UI'); Game.endConvo && Game.endConvo(vid, 'left'); break; }
        const r = Game.convoTurn(vid, real.id);
        seq.push(r.outcome || 'null');
        if (attempt === 1) console.log(`  ${name(vid)} [${d.kind}] a1 → ${r.outcome}: "${clip(r.line, 110)}"`);
        Game.endConvo && Game.endConvo(vid, 'left');
      } catch (e) { seq.push('ERR:' + e.message); break; }
      // advance half a day between attempts so it's not same-tick spam
      try { Game.tickAction && Game.tickAction(4); } catch (e) {}
    }
    const openNow = (Game.getDoubts(vid) || []).find(x => x.id === d.id);
    if (!openNow) total.resolved++;
    total.sequences.push(`${name(vid)}[${d.kind}]: ${seq.join(' → ')}`);
    if (seq.length > 1) console.log(`    ... attempts: ${seq.join(' → ')}`);
  }
}

console.log(`\n=== TOTAL: ${total.doubts} doubts, ${total.resolved} resolved after ≤4 confrontations ===`);
console.log('sequences:');
for (const q of total.sequences) console.log('  ' + q);
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
