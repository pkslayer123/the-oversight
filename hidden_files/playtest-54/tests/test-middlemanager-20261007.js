// test-middlemanager-20261007.js — RED test: the union rep's solo auto-summon.
// The rep's documented weakness is "isolate it from other monsters" — but the
// PICKET LINE code conjures a wave-1 ally from nowhere when allies < 2, and
// the pool includes the apex gallowdeer (150-170 HP) whose beam one-shots a
// stationary player (77+8=85 observed). Isolating the rep GUARANTEES the
// summon, so the weakness is inverted and the solo fight is unwinnable.
// This test forces the summon pick onto the gallowdeer and asserts the
// summoned ally is not apex-tier (maxHp < 140).
// Run: node test-middlemanager-20261007.js   (from hidden_files/playtest-54/tests/)
// Exit 0 = pass (fixed), exit 1 = fail (bug present).
const HL = require('../harness-load.js');
const { Game, fs, path, ROOT } = HL;

async function main() {
  const say = [];
  const orig = Game.say;
  Game.say = (t) => say.push(String(t));
  let fail = '';
  const realRandom = Math.random;
  try {
    await Game.init();
    Game.debugScenario('middlemanager');
    const s = Game.state.scholar;
    // Force the PICKET LINE summon pick onto the gallowdeer (apex), whatever
    // its index in the wave-1 pool is. NOTE: the summon fires DURING
    // startCombat, so the override must be installed BEFORE it.
    const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
    const pool = monsters.filter(x => (x.wave || 1) === 1 && x.id !== 'bulldozer');
    const apexIdx = pool.findIndex(x => x.id === 'gallowdeer');
    if (apexIdx < 0) throw new Error('setup: gallowdeer not in wave-1 pool');
    Math.random = () => (apexIdx + 0.5) / pool.length;
    Game.startCombat(s.monster.id);
    say.length = 0;
    // The PICKET LINE summon fires during startCombat (the "solo" scenario is
    // never solo — the ally is in the fight from turn 0).
    const summoned = Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive && x.monsterId !== 'union_rep');
    if (!summoned) {
      console.log('OK: no ally conjured from nowhere (weakness "isolate it" honored).');
    } else {
      console.log(`summoned: ${summoned.monsterId} maxHp=${summoned.maxHp}`);
      if (summoned.maxHp >= 140) {
        fail = `BUG: isolated rep conjured apex-tier ally ${summoned.monsterId} (maxHp ${summoned.maxHp}). ` +
          `The "isolate it from other monsters" weakness is inverted — isolating guarantees an apex summon, and the solo fight is unwinnable.`;
      } else {
        console.log('OK: summoned ally is not apex-tier.');
      }
    }
  } catch (e) { fail = 'THREW: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '); }
  Math.random = realRandom;
  Game.say = orig;
  if (fail) { console.log('FAIL: ' + fail); process.exit(1); }
  console.log('PASS');
  process.exit(0);
}
main().catch(e => { console.log('FAIL: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); process.exit(1); });
