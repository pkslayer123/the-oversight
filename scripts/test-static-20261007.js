// test-static-20261007.js — RED test: the voice-mimic's reveal round double-dips.
// Breaking the act (2 rounds of not approaching) flips it to 'reveal'. On that
// transition round the player takes BOTH the resolving Distress Call AND the
// no-telegraph rush — two damaging attacks in one monster turn. The reveal
// beat should be a breath (the rush comes next round), not a double hit.
// Run: node test-static-20261007.js   (from hidden_files/playtest-54/tests/)
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
    Game.debugScenario('static');
    const s = Game.state.scholar;
    Game.startCombat(s.monster.id);
    const me = Game.tbFighter('p');
    const m0 = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
    me.mx = Math.max(1, Math.min(7, m0.mx - 1)); me.my = m0.my;
    s.mx = me.mx; s.my = me.my;
    say.length = 0;

    // Wait 3 player turns without approaching: resist builds 1, 2 -> reveal
    // flips on the 3rd monster turn.
    for (let w = 0; w < 3; w++) {
      while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn()) Game.tbAdvance();
      if (!Game.tbfight || Game.tbfight.over) break;
      const mark = say.length;
      Game.tbPlayerWait();
      const p = Game.tbFighter('p');
      if (p && (p.acted || p.moveLeft <= 0)) { try { Game.tbPlayerEndTurn(); } catch (e) {} }
      // drain the rest of this monster turn: advance until player turn again
      let n = 0;
      while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && n++ < 40) Game.tbAdvance();
      const slice = say.slice(mark);
      const revealed = slice.some(l => /It's a radio\. It was always a radio/.test(l));
      if (revealed) {
        const hits = slice.filter(l => /hits you for/.test(l));
        console.log('reveal-round player hits: ' + hits.length);
        hits.forEach(l => console.log('  >> ' + l.slice(0, 110)));
        if (hits.length > 1) {
          fail = `BUG: reveal transition round dealt ${hits.length} damaging attacks to the player (Distress Call resolve + rush). Expected <= 1 — the reveal beat should be a breath, not a double hit.`;
        } else {
          console.log('OK: reveal round dealt at most one damaging attack.');
        }
        break;
      }
    }
    if (!fail && !say.some(l => /It's a radio\. It was always a radio/.test(l))) {
      fail = 'SETUP: the act never broke within 3 waits — cannot evaluate.';
    }
  } catch (e) { fail = 'THREW: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '); }
  Game.say = orig;
  if (fail) { console.log('FAIL: ' + fail); process.exit(1); }
  console.log('PASS');
  process.exit(0);
}
main().catch(e => { console.log('FAIL: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); process.exit(1); });
