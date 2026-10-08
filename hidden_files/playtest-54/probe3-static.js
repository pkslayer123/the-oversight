// probe3-static.js — precise intended-play probe: wait 2 (break act), then strike every round.
const { Game, fs, path, ROOT } = require('./harness-load.js');
async function main() {
  const out = {};
  for (let trial = 0; trial < 3; trial++) {
    const say = [];
    const orig = Game.say;
    Game.say = (t) => say.push(String(t));
    const r = { lines: [] };
    try {
      await Game.init();
      Game.debugScenario('static');
      const s = Game.state.scholar;
      Game.startCombat(s.monster.id);
      const f = Game.tbfight;
      const m0 = f.fighters.filter(x => x.kind === 'monster' && x.alive)[0];
      const me = Game.tbFighter('p');
      me.mx = Math.max(1, Math.min(7, m0.mx - 1)); me.my = Math.max(1, Math.min(7, m0.my));
      s.mx = me.mx; s.my = me.my;
      r.monsterMaxHp = m0.maxHp;
      say.length = 0;
      let waits = 0, acts = 0;
      while (Game.tbfight && !Game.tbfight.over && acts < 20) {
        if (Game.tbIsPlayerTurn()) {
          const p = Game.tbFighter('p');
          const t = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
          if (!t) break;
          if (waits < 2) { Game.tbPlayerWait(); waits++; }
          else {
            const d = Math.max(Math.abs(t.mx - p.mx), Math.abs(t.my - p.my));
            if (d <= 2) Game.tbPlayerStrike(t.key);
            else {
              const nx = Math.max(1, Math.min(7, p.mx + Math.sign(t.mx - p.mx)));
              const ny = Math.max(1, Math.min(7, p.my + Math.sign(t.my - p.my)));
              try { Game.tbPlayerMove(nx, ny); } catch (e) {}
            }
          }
          const p2 = Game.tbFighter('p');
          if (Game.tbIsPlayerTurn() && Game.tbfight && !Game.tbfight.over) {
            if (p2 && (p2.acted || p2.moveLeft <= 0)) { try { Game.tbPlayerEndTurn(); } catch (e) {} }
            else { try { Game.tbPlayerWait(); } catch (e) {} }
          }
          acts++;
          const tt = Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
          r['act' + acts] = 'php=' + (p2 ? p2.hp : 'dead') + ' mhp=' + (tt ? tt.hp : 'dead') + ' phase=' + (tt ? tt.beamPhase : '-');
        } else Game.tbAdvance();
      }
      const p = Game.tbFighter('p');
      r.playerEnd = p ? p.hp + '/' + p.maxHp : 'dead';
      r.outcome = Game.tbfight ? (Game.tbfight.over ? 'OVER:' + JSON.stringify(Game.tbfight.result) : 'NOT-OVER') : 'null';
      r.keyLines = say.filter(l => /scrambles|RUSH|rush|reveal|stutters|hits you for|STRIKE|falls|go down/i.test(l)).slice(0, 20);
    } catch (e) { r.error = String(e && e.stack || e).split('\n').slice(0,3).join('|'); }
    Game.say = orig;
    out['trial' + trial] = r;
  }
  fs.writeFileSync(path.join(__dirname, 'probe3-static-results.json'), JSON.stringify(out, null, 1));
  process.stdout.write('WROTE probe3-static-results.json\n');
}
main().catch(e => { process.stderr.write('FATAL ' + (e && e.stack || e)); process.exit(1); });
