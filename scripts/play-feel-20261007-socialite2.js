// SOCIALITE run 2 (2026-10-07, archetype 2): continuation —
//   (a) complete the party-naming flow through the turn-result sub-choices
//   (b) a real multi-round fight: do party members actually strike? orders?
//   (c) the betrayal arc with a REAL candidate (prickly/lead) + real travel
// Run: node scripts/play-feel-20261007-socialite2.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let rngState = 777 >>> 0;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function flush(tag, max = 16) {
  const n = Math.min(says.length, max);
  for (const t of says.splice(0, n)) console.log(`   | ${tag} ${String(t).slice(0, 170)}`);
  if (says.length) { console.log(`   | ${tag} ...(${says.length} more suppressed)`); says.length = 0; }
}
function name(id) { try { return Game.displayName(id) || id; } catch (e) { return id; } }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  v.trust = v.trust || {};
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  // pick: a warm buddy + the prickly one (betrayal candidate)
  const prickly = roster.find(id => Game.npcTemper(id) === 'prickly') || roster[0];
  const buddy = roster.find(id => id !== prickly && Game.npcGoal(id) !== 'alone') || roster[1];
  console.log('prickly:', name(prickly), Game.npcGoal(prickly), '| buddy:', name(buddy), Game.npcTemper(buddy));
  v.trust[prickly] = 82; v.trust[buddy] = 84;
  for (let i = 0; i < 60 && (Game.partyState().followers || []).length < 2; i++) Game.followerCheck();
  console.log('followers:', (Game.partyState().followers || []).map(name).join(', '));
  flush('setup');

  // === (a) name the party through the real sub-choice flow ===
  console.log('\n=== (a) party naming ===');
  Game.state.scholar.day = 7;
  Game.checkSystemArrival();
  flush('sys');
  const M = Game.partyMembers()[0];
  Game.startConvo(M);
  let ch = Game.convoChoices(M);
  const np = ch.find(c => c.id === 'party_name');
  const r1 = Game.convoTurn(M, np.id);
  console.log('naming line:', String(r1.line).slice(0, 300));
  console.log('sub-choices:', (r1.choices || []).map(c => `${c.id} -> ${String(c.label).slice(0, 40)}`).join(' | '));
  const pick = (r1.choices || []).find(c => c.id.indexOf('party_namepick:') === 0);
  const r2 = Game.convoTurn(M, pick.id);
  console.log('after pick line:', JSON.stringify(String(r2.line || '').slice(0, 200)), '| youSaid:', JSON.stringify(r2.youSaid));
  console.log('party name now:', JSON.stringify(Game.partyName()));
  flush('name');
  // roles
  ch = Game.convoChoices(M);
  const rl = ch.find(c => c.id === 'party_role');
  console.log('party_role choice present:', !!rl);
  if (rl) {
    const r3 = Game.convoTurn(M, rl.id);
    console.log('role sub-choices:', (r3.choices || []).map(c => c.id).join(', '));
    const rp = (r3.choices || []).find(c => c.id.indexOf('party_rolepick:') === 0);
    const r4 = Game.convoTurn(M, rp.id);
    console.log('role of', name(M), ':', Game.roleOf(M));
  }
  Game.endConvo(M, 'left');
  flush('role');

  // === (b) a REAL fight: multi-round, player weak, watch party members ===
  console.log('\n=== (b) party combat, multi-round ===');
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100;
  s.equipped = { weapon: { itemId: 'stone_knife', name: 'Stone knife', range: 1 } }; // weak weapon, long fight
  s.mx = 4; s.my = 4;
  for (const pid of Game.partyMembers()) Game.state.village.positions[pid] = { mx: 4, my: 3 };
  s.monster = { id: 'sunbasker', mx: 6, my: 4 };
  Game.startCombat('sunbasker');
  flush('cbt');
  // give an order
  const or = Game.orderMember(Game.partyMembers()[0], 'distract');
  console.log('order distract:', JSON.stringify(String(or && (or.msg || or.ok) || '').slice(0, 120)));
  // fight: player waits, lets party + monster act; watch party strikes
  let rounds = 0, partyStrikes = 0;
  const ow = Game.tbDamage || null;
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 25) {
    const f = Game.tbfight;
    const cur = f.order ? f.order[f.turn % f.order.length] : null;
    if (Game.tbIsPlayerTurn()) {
      endTurn(); // player holds back — watch the party fight
    } else {
      if (cur && cur.kind === 'villager' && cur.alive) { /* observe */ }
      Game.tbAdvance();
    }
    if (Game.tbfight && Game.tbfight.over) break;
  }
  console.log('rounds:', rounds, 'tbfight now:', Game.tbfight ? 'exists(over=' + Game.tbfight.over + ')' : 'null (fight resolved)');
  if (Game.tbfight) {
    console.log('party member hp after:', Game.tbfight.fighters.filter(x => x.kind === 'villager').map(x => `${(x.name || '').slice(0, 12)}:${x.hp}/${x.maxHp}`).join(' | '));
  }
  flush('fight');

  // === (c) betrayal with a real candidate + real travel ===
  console.log('\n=== (c) betrayal arc ===');
  // revive party if combat went sideways
  const pl = Game.tbFighter('p'); if (pl) pl.hp = pl.maxHp;
  s.health = 500;
  // fresh scene: re-add followers if lost
  if (!Game.inParty(prickly) && !Game.isFollower(prickly)) {
    Game.partyState().party = [prickly, buddy].filter(id => (v.roster || []).includes(id));
  }
  console.log('party now:', Game.partyMembers().map(name).join(', '));
  const bs = Game.betrayalState(prickly);
  const intent = Game.betrayalIntent(prickly, true);
  console.log('intent for', name(prickly), ':', intent, '(temper', Game.npcTemper(prickly), 'goal', Game.npcGoal(prickly) + ')');
  // travel to a REAL target away from haven
  const targets = Game.travelTargets().filter(t => !(t.x === 3 && t.y === 3));
  console.log('travel targets:', targets.map(t => `${t.x},${t.y}`).join(' | ') || '(none!)');
  if (targets.length) {
    const t = targets[0];
    Game.travelTo(t.x, t.y, true);
    console.log('at:', Game.map.px, Game.map.py, '| at haven:', Game.map.px === 3 && Game.map.py === 3);
    flush('trav');
    // weaken player + give pack value
    s.health = 45;
    s.inventory = s.inventory || [];
    s.inventory.push({ itemId: 'dried_meat', name: 'Dried meat', units: 8, kcalEach: 400, kcal: 3200 });
    const opp = Game.betrayalOpportunity(prickly);
    console.log('opportunity:', opp);
    let struck = false;
    for (let i = 0; i < 60 && !struck; i++) { Game.betrayalSweep(); struck = !!Game.tbfight; }
    console.log('betrayal struck:', struck);
    flush('betr');
    if (struck) {
      console.log('fighters:', (Game.tbfight.fighters || []).map(f => f.kind + ':' + (f.name || '').slice(0, 16)).join(' | '));
      let br = 0;
      while (Game.tbfight && !Game.tbfight.over && br++ < 8) {
        if (Game.tbIsPlayerTurn()) { const foe = Game.tbfight.fighters.find(x => x.alive && x.kind !== 'player'); if (foe) Game.tbPlayerStrike(foe.key); }
        if (Game.tbfight && !Game.tbfight.over) { if (Game.tbIsPlayerTurn()) endTurn(); else Game.tbAdvance(); }
        const p2 = Game.tbFighter('p'); if (p2) p2.hp = p2.maxHp;
      }
      console.log('betrayal fight over?', !!(Game.tbfight && Game.tbfight.over));
      try { Game.betrayalAftermath(); } catch (e) { console.log('aftermath err', e.message); }
      flush('after');
    }
  }
  console.log('\nDONE');
})();
