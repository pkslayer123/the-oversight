// BRAWLER fight feel (2026-10-06): play the shakedown artist for real.
// Arc: intimidate a soft villager -> push the breaking point -> they snap
// (fight) -> play the human fight: strikes, combat dialogue (beg/intimidate/
// reason/bribe/taunt), win it -> aftermath (trauma, wounds/disease vectors,
// justice response). Verdicts are qualitative — feel over math.
// Usage: node scripts/playtest-brawler-fight-feel-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/journal.js', 'src/js/betrayal.js',
 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let lm = 0;
const beat = (t) => {
  console.log('\n' + '='.repeat(66));
  console.log('  ' + t);
  console.log('='.repeat(66));
  const l = Game.log.slice(lm); lm = Game.log.length;
  for (const x of l) console.log('  | ' + x);
};
const invKcal = () => (Game.state.scholar.inventory || []).reduce((s, i) => s + (i.kcalEach || 0) * (i.units || 0), 0);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.log.length = 0; lm = 0;
  const v = Game.state.village, me = Game.villagerId;
  const others = () => v.roster.filter(id => id !== me);
  const soft = others().find(id => ['cautious', 'withdrawn', 'gentle'].includes(Game.npcTemper(id)));
  if (!soft) { console.log('no soft villager in roster; abort'); process.exit(1); }
  const dname = Game.displayName(soft);
  console.log('soft mark:', dname, '| temper:', Game.npcTemper(soft), '| pack:', Game.packKcal(soft), 'kcal');

  // ---- BEAT 1: the shakedown ----
  const inv0 = invKcal();
  console.log('\n>>> "Your food. Now." (shakedown 1)');
  const r1 = Game.intimidate(soft);
  console.log('>>> result:', r1, '| gained', invKcal() - inv0, 'kcal');
  beat('SHAKEDOWN 1 (yielded)');

  // ---- BEAT 2: push the breaking point ----
  console.log('\n>>> again. (shakedown 2 — should telegraph)');
  const r2 = Game.intimidate(soft);
  console.log('>>> result:', r2);
  beat('SHAKEDOWN 2 (telegraph)');

  console.log('\n>>> one more. (shakedown 3 — breaking point: snap or flee)');
  let r3 = Game.intimidate(soft);
  console.log('>>> result:', r3);
  beat('SHAKEDOWN 3 (breaking point)');

  if (r3 === 'fled') {
    console.log('\n>>> they fled. FEEL: does the village care?');
    console.log('roster now:', v.roster.length, '| in roster:', v.roster.includes(soft));
    beat('FLED aftermath');
    console.log('\nPLAYTEST NOTE: got fled path this seed. Run again for the snap/fight path.');
    process.exit(0);
  }

  // ---- BEAT 3: the human fight ----
  if (!Game.tbfight) {
    console.log('\n>>> snap did not start a fight (r3=' + r3 + '). Forcing playerAttacks to feel the fight.');
    Game.playerAttacks(soft);
  }
  const hf = Game.tbfight && Game.tbfight.fighters ? Game.tbfight.fighters.map(f => `${f.key}:${f.kind}:${f.name} hp=${Math.round(f.hp)}/${f.maxHp}`) : [];
  console.log('>>> fight fighters:', hf.join(' | '));
  beat('FIGHT START');

  // play the fight: strike, strike, talk(beg), strike, talk(intimidate), strikes
  const endTurn = () => { if (Game.tbfight && Game.tbIsPlayerTurn()) { try { Game.tbPlayerEndTurn(); } catch (e) { console.log('endTurn err:', e.message); } } };
  let turn = 0;
  while (Game.tbfight && turn < 20) {
    turn++;
    const p = Game.tbFighter('p');
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (!foe) break;
    console.log(`\n>>> player turn ${turn}: foe hp=${Math.round(foe.hp)}/${foe.maxHp}, my hp=${Math.round(p.hp)}/${p.maxHp}`);
    if (turn === 3) { console.log('>>> TALK instead of striking: beg'); Game.tbPlayerTalk(foe.key, 'beg'); }
    else if (turn === 5) { console.log('>>> TALK: intimidate'); Game.tbPlayerTalk(foe.key, 'intimidate'); }
    else Game.tbPlayerStrike(foe.key);
    endTurn(); // let the hostile act
  }
  beat(`FIGHT END (after ${turn} player turns)`);
  console.log('>>> fight still active?', !!Game.tbfight);
  const me2 = Game.state.scholar;
  console.log('>>> my health:', Math.round(me2.health), '| trauma:', me2.trauma, '| conditions:', JSON.stringify(me2.conditions || me2.diseases || 'none'));

  // ---- BEAT 4: justice aftermath ----
  console.log('\n>>> crimes on record:', JSON.stringify(Game.justiceState().crimes.map(c => c.type)));
  console.log('>>> heat:', Game.justiceHeat(), 'stage:', Game.justiceStage());
  beat('AFTERMATH (justice state)');
})().catch(e => { console.error('PLAYTEST CRASH:', e.message); process.exit(1); });
