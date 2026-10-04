// Village justice + combat dialogue tests. Usage: node scripts/test-justice.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/party.js', 'src/js/justice.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const v = Game.state.village;
  const others = () => v.roster.filter(id => id !== Game.villagerId);

  // --- 1. crime recording + heat ---
  ok('justice state exists', !!Game.justiceState());
  eq('stage starts 0', Game.justiceStage(), 0);
  Game.recordCrime('murder', { victim: 'x1' });
  eq('heat after murder', Game.justiceHeat() >= 40, true);
  Game.recordCrime('attack', { victim: 'x2' });
  ok('heat after attack higher', Game.justiceHeat() >= 55);
  Game.recordCrime('murder', { victim: 'x1' }); // same day part + victim: dedupe
  eq('dedupe works', Game.justiceState().crimes.filter(c => c.type === 'murder').length, 1);

  // --- 2. stage 0 -> 1: cold shoulder ---
  Game.justiceTick();
  eq('stage 1 cold shoulder', Game.justiceStage(), 1);
  ok('justiceCold true', Game.justiceCold());
  // cold shoulder halves positive trust gains
  const rid0 = others()[0];
  const t0 = (v.trust[rid0] || 10);
  Game.bumpTrust(rid0, 10);
  eq('trust gain halved', (v.trust[rid0] || 10) - t0, 5);

  // --- 3. stage 1 -> 2: confrontation ---
  Game.recordCrime('murder', { victim: 'x3' }); // heat well past 50
  Game.justiceTick();
  eq('stage 2 confrontation', Game.justiceStage(), 2);
  ok('confronter picked', !!Game.justiceState().confrontedBy);
  const confronter = Game.justiceState().confrontedBy;
  ok('pendingConfront true', Game.justicePendingConfront(confronter));
  ok('not pending for others', !Game.justicePendingConfront(others().find(id => id !== confronter)));

  // --- 4. pay restitution ---
  // give player food to pay with
  Game.state.scholar.inventory.push({ itemId: 'dried_meat', name: 'Dried meat', units: 50, kcalEach: 500 });
  const r = Game.justiceRespond('pay');
  ok('paid enough', r.enough);
  ok('paid some kcal', r.paid > 0);
  eq('confrontation cleared', Game.justicePendingConfront(confronter), false);
  ok('stage dropped after amends', Game.justiceStage() <= 1);

  // --- 5. refuse -> exile vote ---
  // rebuild heat to force stage 2 again (clear amends credit first)
  Game.justiceState().amendsCredit = 0;
  Game.recordCrime('murder', { victim: 'x4' });
  Game.justiceState().stage = 1;
  Game.justiceState().confrontedBy = null;
  Game.justiceTick(); // -> stage 2, new confrontation
  eq('stage 2 again', Game.justiceStage(), 2);
  const r2 = Game.justiceRespond('refuse');
  ok('refused', r2.refused);
  Game.justiceTick(); // refused -> stage 3 exile vote
  eq('stage 3 exile vote', Game.justiceStage(), 3);
  ok('exiled (trust is low)', Game.justiceExiled());

  // --- 6. exile enforcement ---
  Game.map.px = 3; Game.map.py = 3;
  Game.justiceTick(); // exiled + at Haven -> stage 4 uprising
  eq('stage 4 uprising', Game.justiceStage(), 4);
  ok('tbfight started', !!Game.tbfight);
  ok('uprising flag', !!Game.tbfight.uprising);
  const hostiles = Game.tbfight.fighters.filter(f => f.kind === 'hostile');
  ok('2-4 attackers', hostiles.length >= 2 && hostiles.length <= 4);
  ok('player fighter present', !!Game.tbFighter('p'));
  ok('turn order built', Game.tbfight.order.length === Game.tbfight.fighters.length);

  // --- 7. combat dialogue: tactics available ---
  const tactics = Game.tbTalkTactics();
  ok('tactics list', tactics.length >= 5);
  ok('beg present', tactics.some(t => t.id === 'beg'));
  ok('lie gated pre-System', !tactics.some(t => t.id === 'lie'));
  Game.state.systemArrived = true;
  ok('lie available post-System', Game.tbTalkTactics().some(t => t.id === 'lie'));

  // --- 8. tbPlayerTalk: beg on a hostile costs the turn ---
  // force it to be the player's turn
  const pkey = 'p';
  const p = Game.tbFighter(pkey);
  p.acted = false;
  // find player in turn order and set turnIdx
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  const hk = hostiles[0].key;
  const before = hostiles[0].talkStun || 0;
  // capture say output to verify the talk happened
  let said = '';
  const origSay = Game.say;
  Game.say = (t) => { said += t + '\n'; };
  const acted = Game.tbPlayerTalk(hk, 'beg');
  Game.say = origSay;
  ok('talk returned true', acted);
  ok('talk produced dialogue', said.includes('💬'));
  // beg may or may not stun (RNG), but talkStun never goes negative and no crash
  ok('talkStun sane', (hostiles[0].talkStun || 0) >= before);

  // --- 9. bribe with no food fails cleanly, doesn't consume turn ---
  Game.state.scholar.inventory = [];
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  Game.tbFighter('p').acted = false;
  const br = Game.tbPlayerTalk(hk, 'bribe');
  eq('bribe fails without food', br, false);
  eq('turn not consumed', Game.tbFighter('p').acted, false);

  // --- 10. bribe with food can end the fight ---
  Game.state.scholar.inventory.push({ itemId: 'dried_meat', name: 'Dried meat', units: 20, kcalEach: 500 });
  // monkeypatch Math.random for deterministic success
  const origRandom = Math.random;
  Math.random = () => 0.01;
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  Game.tbFighter('p').acted = false;
  Game.tbPlayerTalk(hk, 'bribe');
  Math.random = origRandom;
  // bribe sets all hostiles fled -> tbEndCheck resolves routed -> tbfight may be null
  const tf2 = Game.tbfight;
  const allFled = !tf2 || tf2.fighters.filter(f => f.kind === 'hostile').every(f => f.fled || !f.alive);
  ok('bribe made hostiles flee', allFled);
  // if the fight ended, no restart needed — tests 11-12 start their own uprising
  if (!Game.tbfight) { /* fight resolved via bribe; aftermath ran */ }

  // fresh uprising for the talk-back and aftermath tests
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbEnd(Game.tbfight.result || 'betrayal_routed'); }
  Game._lastBetrayal = null;
  Game.startVillageUprising('unforgivable');
  ok('fresh uprising started', !!(Game.tbfight && Game.tbfight.uprising));

  // --- 11. NPC talk during combat doesn't crash ---
  const h2 = Game.tbfight.fighters.find(f => f.kind === 'hostile');
  if (h2) { Game.tbHostileTalk(h2); pass++; } else { fail++; console.log('FAIL hostile talk: no hostile'); }

  // --- 12. end the uprising: kill remaining hostiles -> betrayal_won -> uprisingAftermath ---
  for (const h of Game.tbfight.fighters.filter(f => f.kind === 'hostile' && f.alive && !f.fled)) {
    Game.tbDamage(h.key, 999, 'You');
  }
  Game.tbEndCheck(); // strikes normally trigger this; tbDamage alone doesn't
  ok('fight over', !Game.tbfight);
  ok('uprising aftermath cleared _lastBetrayal', !Game._lastBetrayal);
  ok('village broken flag', Game.justiceState().broken);
  eq('stage stays 4', Game.justiceStage(), 4);

  // --- 13. self-defense murder records less heat ---
  const j2 = Game.justiceState();
  j2.crimes = [];
  j2.amendsCredit = 0;
  Game.recordCrime('murder', { victim: 'sd1', justified: true });
  eq('justified murder heat', Game.justiceHeat(), 15);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
