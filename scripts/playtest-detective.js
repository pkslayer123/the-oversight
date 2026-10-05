// Detective archetype playtest: play as the village truth-seeker.
// Interview everyone (past/goal), ask for gossip, observe, cross-reference,
// confront doubts. Multi-day, evaluates feel: is detective work fun or chores?
// Usage: node scripts/playtest-detective.js [--seed N]
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

const seedArg = process.argv.find(a => a.startsWith('--seed'));
let seedUsed = 'random';
if (seedArg) {
  const m = seedArg.match(/--seed[= ]?(\d+)/);
  let s = (m && parseInt(m[1], 10)) || 1;
  seedUsed = String(s);
  Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

const name = (vid) => { try { return Game.displayName(vid); } catch (e) { return vid; } };
const said = [];
const origSay = Game.say.bind(Game);

function interview(vid, topic) {
  try {
    Game.startConvo(vid);
    const line = Game.convoAskTopic(vid, topic);
    try { Game.endConvo && Game.endConvo(vid, 'left'); } catch (e) {}
    return line;
  } catch (e) { return `[ERROR ${e.message}]`; }
}

function observe(vid) {
  try { return Game.observePerson(vid); } catch (e) { return { ok: false, err: e.message }; }
}

function gossipAbout(vid) {
  // use npcGossipAbout directly + check cross-reference plumbing
  try {
    const others = Game.state.village.roster.filter(id => id !== vid && id !== Game.villagerId);
    const target = others[Math.floor(Math.random() * others.length)];
    const gg = Game.npcGossipAbout(vid, target);
    return gg;
  } catch (e) { return { err: e.message }; }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const v = Game.state.village;
  const roster = v.roster.filter(id => id !== Game.villagerId);
  console.log(`=== DETECTIVE PLAYTEST: ${roster.length} villagers, seed ${seedUsed} ===\n`);

  // how many natural liars?
  let naturalLiars = 0;
  const liarFields = {};
  for (const vid of roster) {
    const lies = Game.npcLies(vid);
    const fields = Object.keys(lies || {}).filter(f => lies[f] && lies[f].told);
    if (fields.length) { naturalLiars++; liarFields[name(vid)] = fields.map(f => `${f}: "${lies[f].told}" (true: ${lies[f].truth}, ${lies[f].motive})`); }
  }
  console.log(`natural liars in village: ${naturalLiars}/${roster.length}`);
  for (const vid of roster) {
    const lies = Game.npcLies(vid);
    const fields = Object.keys(lies || {}).filter(f => lies[f] && lies[f].told);
    if (fields.length) console.log(`  ${vid}: ${fields.map(f => `${f}: "${lies[f].told}" (true: ${lies[f].truth}, ${lies[f].motive})`).join('; ')}`);
  }

  // Seed extra lies deterministically so the loop gets exercised every run
  const seeds = [
    { vid: roster[0], field: 'occupation', told: 'surgeon', motive: 'shame' },
    { vid: roster[2], field: 'origin', told: 'Denver', motive: 'hiding' },
    { vid: roster[4], field: 'goal', told: 'belong', motive: 'manipulation' },
  ];
  for (const s of seeds) {
    if (!s.vid) continue;
    const vp = Game.vpOf(s.vid);
    vp.lies = vp.lies || {};
    const truth = s.field === 'occupation' ? (vp.formerOccupation || 'cook')
      : s.field === 'origin' ? (vp.homeRegion || 'Akron') : (vp.goal || 'survive');
    vp.lies[s.field] = { told: s.told, truth, motive: s.motive, field: s.field };
    console.log(`SEEDED: ${name(s.vid)} lies about ${s.field}: "${s.told}" (true: ${truth}, ${s.motive})`);
  }
  v.trust = v.trust || {};
  for (const vid of roster) v.trust[vid] = 10; // low trust → lies active

  const stats = { doubts: 0, kinds: {}, confronts: 0, outcomes: {}, slips: 0, gossipHits: 0, resolved: 0 };
  const transcripts = [];

  for (let day = 0; day < 5; day++) {
    console.log(`\n---------- DAY ${Game.state.scholar.day} ----------`);
    // morning: interview everyone about past
    for (const vid of roster) {
      if (!Game.vpOf(vid) || !Game.vpOf(vid).id) continue;
      interview(vid, 'past');
      if (day < 2) interview(vid, 'goal');
    }
    // midday: ask gossip of a few, observe one person
    for (let i = 0; i < 4; i++) {
      const vid = roster[Math.floor(Math.random() * roster.length)];
      const gg = gossipAbout(vid);
      if (gg && gg.line && gg.contradictsLie) {
        stats.gossipHits++;
        transcripts.push(`GOSSIP HIT day ${Game.state.scholar.day} — ${name(vid)} about ${name(gg.target)}: ${gg.line.slice(0, 200)}`);
      }
    }
    const obsTarget = roster[Math.floor(Math.random() * roster.length)];
    const obs = observe(obsTarget);
    if (obs && obs.found) transcripts.push(`OBSERVATION day ${Game.state.scholar.day} — ${name(obsTarget)}: ${obs.text.slice(0, 180)}`);

    // evening: confront all unresolved doubts
    const open = Game.allDoubts();
    for (const d of open) {
      stats.confronts++;
      const r = Game.confrontDoubt(d.vid, d.id);
      stats.outcomes[r.outcome] = (stats.outcomes[r.outcome] || 0) + 1;
      if (transcripts.length < 14) transcripts.push(
        `CONFRONT day ${Game.state.scholar.day} — ${name(d.vid)} [${d.kind}] → ${r.outcome}: "${String(r.line).slice(0, 220)}"`);
    }

    const all = Game.allDoubts(true);
    stats.doubts = all.length;
    stats.kinds = {};
    for (const d of all) stats.kinds[d.kind] = (stats.kinds[d.kind] || 0) + 1;
    stats.resolved = all.filter(d => d.resolved).length;
    stats.slips = all.filter(d => d.kind === 'slip').length;

    console.log(`doubts open/resolved: ${open.filter(d => !d.resolved).length}/${stats.resolved} | outcomes so far: ${JSON.stringify(stats.outcomes)}`);
    Game.endDay();
  }

  console.log('\n=== FINAL ===');
  console.log(`total doubts: ${stats.doubts}, kinds: ${JSON.stringify(stats.kinds)}`);
  console.log(`confrontations: ${stats.confronts}, outcomes: ${JSON.stringify(stats.outcomes)}`);
  console.log(`gossip cross-ref hits: ${stats.gossipHits}, resolved: ${stats.resolved}`);
  console.log('\n--- transcripts ---');
  for (const t of transcripts) console.log(t + '\n');
})();
