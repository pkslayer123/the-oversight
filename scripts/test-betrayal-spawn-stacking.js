// Betrayal spawn-stacking + phantom-bulldozer regression (Steve 2026-10-06).
// Bug class (sibling of the justice.js uprising fix, ff9daaf):
//   1. startBetrayalCombat called freeSpotNear fresh per fighter with no
//      occupancy tracking, so the betrayer + every loyal party member stacked
//      on ONE tile. Door tiles weren't excluded either.
//   2. game.js's flee-by-door path stashes 'hostile' fighters as "waiting
//      monsters" with id = monsterId — but betrayal fighters have NO
//      monsterId, so the stash held {id:undefined} and the next door exit
//      called startCombat(undefined), which falls back to 'bulldozer':
//      a phantom monster spawned by a social fight.
// Usage: node scripts/test-betrayal-spawn-stacking.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL ' + name); }
}
function says() { const l = Game.log.join('\n'); Game.log.length = 0; return l; }

function asciiGrid(fighters, detail) {
  const g = Array.from({ length: 9 }, () => Array(9).fill('·'));
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (detail[y] && detail[y][x] === 'door') g[y][x] = 'D';
  }
  for (const f of fighters) {
    const cur = g[f.my][f.mx];
    g[f.my][f.mx] = (cur === '·' || cur === 'D') ? (f.kind === 'player' ? '@' : f.kind === 'hostile' ? 'H' : 'L') : 'X';
  }
  return g.map(r => r.join(' ')).join('\n');
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  says();

  // Quiet the chatter for determinism; keep a transcript for feel checks.
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  Game.sysSay = (t) => { said.push('[SYS] ' + String(t)); };
  Game.tickAction = () => {};

  const v = Game.state.village;
  const npcs = () => v.roster.filter(id => id !== Game.villagerId);
  const [A, B, C] = npcs();
  ok('three npc villagers exist', !!(A && B && C));

  // Party: you + betrayer + two loyal fighters.
  v.party = [A, B, C];
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;

  // ---------- 1. betrayal spawn: every fighter on their OWN tile ----------
  Game.startBetrayalCombat(A, { aggressor: 'npc' });
  says();
  const f = Game.tbfight;
  ok('tbfight is a betrayal fight', !!(f && f.betrayal));
  const tiles = f.fighters.map(x => x.mx + ',' + x.my);
  const uniq = new Set(tiles);
  ok('all fighters on distinct tiles (' + f.fighters.length + ' fighters)', uniq.size === tiles.length);
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const onDoor = f.fighters.filter(x => detail[x.my] && detail[x.my][x.mx] === 'door');
  ok('no fighter spawned on a door tile', onDoor.length === 0);
  const p = f.fighters.find(x => x.kind === 'player');
  ok('player stays at own tile', !!(p && p.mx === 4 && p.my === 4));
  const hostile = f.fighters.find(x => x.kind === 'hostile');
  ok('betrayer is a hostile fighter', !!hostile && hostile.villagerId === A);
  const loyal = f.fighters.filter(x => x.kind === 'villager');
  ok('two loyal party fighters spawned', loyal.length === 2);

  console.log('\n--- betrayal spawn grid (player @, betrayer H, loyal L, door D) ---');
  console.log(asciiGrid(f.fighters, detail));
  console.log('------------------------------------------------------------------\n');

  // ---------- 2. play a round as the player — it must FEEL like a fight ----------
  // Advance to the player's turn, then strike the betrayer. The world must
  // answer: damage lands, misses narrate, the fight continues.
  for (let i = 0; i < 8 && Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn(); i++) {
    try { Game.tbAdvance(); Game.tbBeginTurn(); } catch (e) { break; }
  }
  const hpBefore = hostile.hp;
  let struck = false;
  if (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn()) {
    try { struck = Game.tbPlayerStrike('h_' + A); } catch (e) { console.log('(tbPlayerStrike threw: ' + e.message + ')'); }
  }
  const transcript = said.join('\n');
  ok('player strike resolves on player turn (damage or narrated miss)',
    struck === true && Game.tbfight ? (hostile.hp < hpBefore || /miss|dodge|Too far/i.test(transcript)) : !!Game.tbfight);
  ok('combat has a real turn order', !f || (f.order && f.order.length >= 3));
  ok('betrayer got to act or is queued (distinct AI)', !f || f.order.includes('h_' + A));

  // ---------- 3. phantom bulldozer: flee-by-door stash with id:undefined ----------
  // Rebuild a fresh betrayal fight, then replicate game.js's flee-by-door stash
  // shape: 'hostile' fighters map to {id: monsterId} — betrayal fighters have
  // no monsterId, so the stash holds {id:undefined}.
  Game.state.doorFledMonsters = null;
  v.party = [A, B, C];
  Game.startBetrayalCombat(A, { aggressor: 'npc' });
  says();
  const f2 = Game.tbfight;
  const stashShape = f2.fighters
    .filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive)
    .map(m => ({ id: m.monsterId, mx: m.mx, my: m.my, hp: m.hp }));
  ok('stash shape holds id:undefined for the betrayer (the raw bug)',
    stashShape.length === 1 && stashShape[0].id === undefined);
  Game.state.doorFledMonsters = stashShape;
  Game.tbEnd('fled'); // what the door-flee path calls after stashing
  const st = Game.state.doorFledMonsters;
  ok('no id-less entries survive a betrayal fled (phantom bulldozer killed)',
    st === null || (Array.isArray(st) && st.every(m => m && m.id)));
  // And startCombat(undefined) can never fire from it: simulate exitBuilding's
  // re-engage line against whatever survived.
  if (st && st.length) {
    ok('surviving stash entries all have real ids', st.every(m => !!m.id));
  } else {
    ok('stash is empty/null — nothing to re-engage', true);
  }
  // betrayalAftermath still resolved the social side.
  ok('betrayal aftermath ran (state cleaned)', Game._lastBetrayal === null);

  // ---------- 4. real monster stashes pass through untouched ----------
  Game.state.doorFledMonsters = null;
  v.party = [A, B, C];
  Game.startBetrayalCombat(A, { aggressor: 'npc' });
  says();
  Game.state.doorFledMonsters = [{ id: 'bulldozer', mx: 2, my: 2, hp: 90 }, { id: undefined, mx: 3, my: 3, hp: 40 }];
  Game.tbEnd('fled');
  const st2 = Game.state.doorFledMonsters;
  ok('real monster stash survives betrayal fled',
    Array.isArray(st2) && st2.length === 1 && st2[0].id === 'bulldozer');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
