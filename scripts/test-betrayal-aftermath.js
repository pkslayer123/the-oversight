// Betrayal aftermath: dead vs alive victims must narrate differently.
// The journal must never confess to a killing that didn't happen.
// Usage: node scripts/test-betrayal-aftermath.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js', 'src/js/game.js',
 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const notes = () => (Game.state.codex.notes || []).map(n => n.text);
const said = (re) => Game.log.some(l => re.test(l));

function freshGame() {
  return (async () => {
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    Game.log.length = 0;
  })();
}
const others = () => Game.state.village.roster.filter(id => id !== Game.villagerId);

// start a player-aggressor fight, return hostile fighter key; force player turn, adjacent
function startFight(vid) {
  Game.playerAttacks(vid);
  const fkey = 'h_' + vid;
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  const p = Game.tbFighter('p'), h = Game.tbFighter(fkey);
  p.moveLeft = 10; p.acted = false;
  p.mx = 4; p.my = 4; h.mx = 5; h.my = 4;
  return fkey;
}

(async () => {
  // ---------- A. kill, no witnesses: the dark confession stands ----------
  await freshGame();
  {
    const vid = others()[0];
    const fkey = startFight(vid);
    Game.tbFighter(fkey).hp = 1;
    Game.tbPlayerStrike(fkey);
    ok('A: fight resolved', !Game.tbfight);
    ok('A: victim dead, out of roster', !Game.state.village.roster.includes(vid));
    ok('A: journal confesses the killing', notes().some(t => /I killed them/.test(t)));
    ok('A: unsolved disappearance recorded', (Game.state.village.unsolved || []).some(u => u.who === vid));
    ok('A: "no one saw" narrated', said(/No one saw/));
  }

  // ---------- B. victim flees, no witnesses: alive, not murdered ----------
  await freshGame();
  {
    const vid = others()[0];
    startFight(vid);
    const h = Game.tbFighter('h_' + vid);
    h.fled = true;
    Game.tbEndCheck();
    ok('B: fight resolved', !Game.tbfight);
    ok('B: fled victim out of roster', !Game.state.village.roster.includes(vid));
    ok('B: journal does NOT confess a killing', !notes().some(t => /I killed them/.test(t)));
    ok('B: journal says they got away', notes().some(t => /got away/i.test(t)));
    ok('B: no phantom unsolved entry', !(Game.state.village.unsolved || []).some(u => u.who === vid));
    ok('B: "ran" narrated, not "gone"', said(/ran\. No one saw it happen/));
  }

  // ---------- C. victim flees WITH a witness: assault gossip, not murder ----------
  await freshGame();
  {
    const vid = others()[0], wit = others()[1];
    const trustBefore = (Game.state.village.trust || {})[wit];
    startFight(vid);
    Game._lastBetrayal.witnesses = [wit]; // a loyal party member saw it
    const h = Game.tbFighter('h_' + vid);
    h.fled = true;
    Game.tbEndCheck();
    const trustAfter = (Game.state.village.trust || {})[wit];
    ok('C: fight resolved', !Game.tbfight);
    ok('C: journal does NOT confess a killing', !notes().some(t => /I killed them/.test(t)));
    ok('C: witness told it as assault ("alive to tell it")', said(/alive to tell it/));
    ok('C: witness trust cratered', (trustAfter === undefined ? 10 : trustAfter) < (trustBefore === undefined ? 10 : trustBefore));
  }

  // ---------- D. victim yields: alive in the village, no death narration ----------
  await freshGame();
  {
    const vid = others()[0];
    const trustBefore = (Game.state.village.trust || {})[vid];
    startFight(vid);
    const h = Game.tbFighter('h_' + vid);
    h.yielded = true;
    Game.tbEnd('betrayal_yielded');
    const trustAfter = (Game.state.village.trust || {})[vid];
    ok('D: fight resolved', !Game.tbfight);
    ok('D: yielder stays in roster', Game.state.village.roster.includes(vid));
    ok('D: journal does NOT confess a killing', !notes().some(t => /I killed them/.test(t)));
    ok('D: yield narrated as alive', said(/alive\. Shaking/));
    ok('D: yielder trust cratered', (trustAfter === undefined ? 10 : trustAfter) < (trustBefore === undefined ? 10 : trustBefore));
  }

  // ---------- E. NPC aggressor path untouched: player survives ----------
  await freshGame();
  {
    const vid = others()[0];
    Game.npcBetrays(vid); // they come at you
    ok('E: betrayal combat started', !!(Game.tbfight && Game.tbfight.betrayal));
    // player flees the ambush (flee can fail 20%: retry)
    for (let i = 0; i < 5 && Game.tbfight; i++) {
      Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
      const p = Game.tbFighter('p'); p.moveLeft = 10; p.acted = false;
      Game.tbPlayerFlee();
    }
    ok('E: survived', !Game.tbfight);
  }

  // ---------- F. combat opens as attack, not murder ----------
  await freshGame();
  {
    const vid = others()[0];
    Game.playerAttacks(vid);
    // the opening observe must not pre-label the act a murder: witnesses get
    // 'attack' rep (honest -25), not 'murder' rep (honest -30)
    ok('F: fight started', !!Game.tbfight);
    Game.tbEndCheck && null;
    const h = Game.tbFighter('h_' + vid);
    h.fled = true;
    Game.tbEndCheck();
    ok('F: resolved without death language', !notes().some(t => /I killed them/.test(t)));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
