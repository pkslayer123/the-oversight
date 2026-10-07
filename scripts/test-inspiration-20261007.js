// test-inspiration-20261007.js — the night fight must be winnable by playing
// the mechanic: BACK OFF during the bloom, punish the ember. The ember is a
// guttering bright_idea — just cooling light — so the 75% physical resist
// does NOT apply while beamPhase === 'ember' (game.js tbPlayerStrike).
// Without this, the coaching ("punish the ember") could never kill it with
// the scenario's spear-only kit: ember windows shrink 2→1→0 per cycle.
// Run: node test-inspiration-20261007.js   (from hidden_files/playtest-54/tests/)
// Exit 0 = pass (fixed), exit 1 = fail (bug present).
const HL = require('../hidden_files/playtest-54/harness-load.js');
const { Game } = HL;

async function main() {
  const say = [];
  const orig = Game.say;
  Game.say = (t) => say.push(String(t));
  let fail = '';
  try {
    await Game.init();
    Game.debugScenario('inspiration');
    const s = Game.state.scholar;
    Game.startCombat(s.monster.id);
    const me = Game.tbFighter('p');
    const m0 = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
    if (!m0 || !Game.biIs(m0)) { fail = 'THREW: no bright_idea in fight'; }
    else {
      me.mx = Math.max(1, Math.min(7, m0.mx - 1)); me.my = m0.my;
      s.mx = me.mx; s.my = me.my;
      // Force the punish window: the idea is a guttering ember.
      m0.beamPhase = 'ember';
      say.length = 0;
      while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn()) Game.tbAdvance();
      Game.tbPlayerStrike(m0.key);
      const strikeLine = say.find(l => /You STRIKE/.test(l));
      const dmg = strikeLine ? parseInt((strikeLine.match(/for (\d+)/) || [])[1] || '0', 10) : 0;
      const cue = say.some(l => /guttering/.test(l));
      const resisted = say.some(l => /resists physical/.test(l));
      console.log(`ember strike: ${strikeLine || '(no strike line)'} | guttering cue: ${cue} | resisted: ${resisted}`);
      // Spear does 25-30; 75% resist would cut it to ~6-8.
      if (dmg < 20) fail = `BUG: ember strike dealt ${dmg} — the 75% physical resist still applies during the punish window. The ember must be vulnerable or the fight is unwinnable.`;
      else if (!cue) fail = 'BUG: no guttering cue — the player is never told the ember is the kill window.';
      else if (resisted) fail = 'BUG: resist callout fired during ember — the vulnerability is not applied.';
      else console.log('OK: ember is the kill window — full spear damage, no resist, cue shown.');
    }
  } catch (e) { fail = 'THREW: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '); }
  Game.say = orig;
  if (fail) { console.log('FAIL: ' + fail); process.exit(1); }
  console.log('PASS');
  process.exit(0);
}
main().catch(e => { console.log('FAIL: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); process.exit(1); });
