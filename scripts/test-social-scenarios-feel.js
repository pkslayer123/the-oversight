// FEEL playtest: capture full narrative transcripts of each social scenario.
// Reads like a player would read them. Judges drama, not just completeness.
// Usage: node scripts/test-social-scenarios-feel.js
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

let sayLog = [];
const _say = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); return _say(t); };
function fresh(id) { sayLog = []; Game.debugScenario(id); }
function transcript(label) {
  console.log('\n' + '='.repeat(70));
  console.log(label);
  console.log('='.repeat(70));
  for (const line of sayLog) {
    if (!line.startsWith('🐞')) console.log(line);
  }
}

(async () => {
  await Game.init();

  // ===== 1. MOOT ACCUSED =====
  fresh('mootAccused');
  let cases = (Game.betrayalState().cases || []).filter(c => c.playerRole === 'accused' && (c.status === 'open' || c.status === 'dormant'));
  let c = cases[0];
  if (c) {
    transcript('MOOT ACCUSED — setup + defense');
    sayLog = [];
    Game.defendSpeak(c.id);
    Game.defendPressAccuser(c.id);
    transcript('MOOT ACCUSED — defendSpeak + pressAccuser');
    sayLog = [];
    Game.demandMoot(c.id);
    transcript('MOOT ACCUSED — demandMoot → verdict');
  }

  // ===== 2. MOOT JUROR =====
  fresh('mootJuror');
  cases = (Game.betrayalState().cases || []).filter(c => c.playerRole === 'juror' && c.status === 'open');
  c = cases[0];
  if (c) {
    transcript('MOOT JUROR — setup');
    sayLog = [];
    Game.examineAmbushSite(c.id);
    Game.nameWitnesses(c.id);
    for (const a of c.accused) Game.pressAccomplice(c.id, a);
    transcript('MOOT JUROR — detective work (examine, witnesses, press)');
    sayLog = [];
    Game.callMoot(c.id);
    if (c.trial && c.trial.awaitingPlayerVote) Game.castPlayerVote(c.id, false);
    transcript('MOOT JUROR — moot + vote → verdict');
  }

  // ===== 3. AMBUSH =====
  fresh('ambush');
  let plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
  if (plot) {
    transcript('AMBUSH — sprung');
    sayLog = [];
    for (let i = 0; i < 4; i++) {
      const res = Game.ambushExchange(plot, 'talk');
      if (res && !res.continue) break;
    }
    transcript('AMBUSH — 4x TALK exchanges');
  }

  // ===== 4. LIARS =====
  fresh('liars');
  transcript('LIARS — setup');
  // talk to each liar, ask about occupation
  sayLog = [];
  const roster = (Game.state.village.roster || []).slice(0, 3);
  for (const rid of roster) {
    try {
      Game.startConvo(rid);
      const conv = Game.convoGet(rid);
      // ask about them
      const resp = Game.convoRespond ? Game.convoRespond(rid, 'occupation') : null;
      if (conv && conv.transcript) {
        for (const t of conv.transcript.slice(-4)) {
          sayLog.push(`${Game.displayName(rid)}: ${t.text || t}`);
        }
      }
    } catch (e) { sayLog.push(`[${rid}: convo failed: ${e.message}]`); }
  }
  transcript('LIARS — conversations with 3 suspects');

  // ===== 5. EXILE =====
  fresh('exile');
  transcript('EXILE — setup + first beats');

  console.log('\n' + '='.repeat(70));
  console.log('END OF TRANSCRIPTS');
  console.log('='.repeat(70));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
