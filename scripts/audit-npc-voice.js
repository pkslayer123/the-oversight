// NPC VOICE AUDIT: do villagers SOUND different, or just say different facts?
// Generates a roster, forces 5 distinct temperaments, prints ~10 lines each.
// Read the output blind: can you tell who's who from the voice alone?
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

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const TEMPS = ['bold', 'cautious', 'warm', 'prickly', 'withdrawn'];
  const vps = [];
  for (let i = 0; i < 5; i++) {
    const vid = roster[i];
    const vp = Game.vpOf(vid);
    vp.personality = vp.personality || {};
    vp.personality.temperament = TEMPS[i];
    vps.push({ vid, temp: TEMPS[i], name: vp.name || vid });
  }
  for (const { vid, temp, name } of vps) {
    console.log(`\n########## ${name} [${temp}] ##########`);
    const lines = [];
    // 5 openers (reset convo state each time for variety)
    for (let i = 0; i < 5; i++) {
      const c = Game.convoGet(vid);
      Object.assign(c, { secretShared: false, wantHooked: false, taughtMentioned: true, recalled: { q_origin: true, q_trust: true } });
      try { lines.push(Game.convoOpening(vid).line); } catch (e) { lines.push('[ERR ' + e.message + ']'); }
    }
    // topics: personal, past, village, plans, goal
    for (const t of ['personal', 'past', 'village', 'plans', 'goal']) {
      const c = Game.convoGet(vid);
      c.askedTopics = [];
      try { lines.push(Game.convoAskTopic(vid, t)); } catch (e) { lines.push('[ERR ' + e.message + ']'); }
    }
    lines.forEach((l, i) => console.log(`  ${i + 1}. ${l}`));
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
