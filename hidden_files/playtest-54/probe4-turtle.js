// probe4-turtle.js — fight the turtle at spear range 2 (never adjacent).
const { Game, fs, path, ROOT } = require('./harness-load.js');
async function main() {
  const say = [];
  const orig = Game.say;
  Game.say = (t) => say.push(String(t));
  const r = {};
  try {
    await Game.init();
    Game.debugScenario('speedbump');
    const s = Game.state.scholar;
    Game.startCombat(s.monster.id);
    const f = Game.tbfight;
    const m0 = f.fighters.filter(x => x.kind === 'monster' && x.alive)[0];
    const me = Game.tbFighter('p');
    // place player 2 tiles west of monster
    me.mx = Math.max(1, m0.mx - 2); me.my = m0.my;
    s.mx = me.mx; s.my = me.my;
    r.startDist = Math.max(Math.abs(m0.mx - me.mx), Math.abs(m0.my - me.my));
    say.length = 0;
    let acts = 0;
    const dmgDealt = [];
    while (Game.tbfight && !Game.tbfight.over && acts < 25) {
      if (Game.tbIsPlayerTurn()) {
        const p = Game.tbFighter('p');
        const t = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
        if (!t) break;
        const d = Math.max(Math.abs(t.mx - p.mx), Math.abs(t.my - p.my));
        if (d !== 2) {
          // reposition to exactly distance 2
          const nx = Math.max(1, Math.min(7, t.mx - 2));
          try { Game.tbPlayerMove(nx, t.my); } catch (e) {}
        }
        const hpBefore = t.hp;
        const ok = Game.tbPlayerStrike(t.key);
        dmgDealt.push({ ok, dealt: hpBefore - t.hp, bunker: t.turtleBunker || 0 });
        const p2 = Game.tbFighter('p');
        if (Game.tbIsPlayerTurn() && Game.tbfight && !Game.tbfight.over) {
          if (p2 && (p2.acted || p2.moveLeft <= 0)) { try { Game.tbPlayerEndTurn(); } catch (e) {} }
          else { try { Game.tbPlayerWait(); } catch (e) {} }
        }
        acts++;
        r['act' + acts] = 'php=' + (p2 ? p2.hp : 'dead') + ' mhp=' + t.hp + ' dist=' + Math.max(Math.abs(t.mx - p2.mx), Math.abs(t.my - p2.my));
      } else Game.tbAdvance();
    }
    const p = Game.tbFighter('p');
    r.playerEnd = p ? p.hp + '/' + p.maxHp : 'dead';
    r.outcome = Game.tbfight ? (Game.tbfight.over ? 'OVER:' + JSON.stringify(Game.tbfight.result) : 'NOT-OVER') : 'null';
    r.dmgDealt = dmgDealt;
    r.keyLines = say.filter(l => /SNAP|snap|bunker|BUNKER|hits you for|withdraws|seal/i.test(l)).slice(0, 16);
  } catch (e) { r.error = String(e && e.stack || e).split('\n').slice(0,4).join('|'); }
  Game.say = orig;
  fs.writeFileSync(path.join(__dirname, 'probe4-turtle-results.json'), JSON.stringify(r, null, 1));
  process.stdout.write('WROTE probe4-turtle-results.json\n');
}
main().catch(e => { process.stderr.write('FATAL ' + (e && e.stack || e)); process.exit(1); });
