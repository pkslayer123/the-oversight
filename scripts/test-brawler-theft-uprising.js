// Brawler loop part 2 (Steve 2026-10-05): the thief's run + the uprising fought for real.
// 1. stealFrom unseen x2 + caught x1 -> notice sweep -> gossip -> crimes. Feel check.
// 2. startVillageUprising with the fixed mob logic: 2-4 real attackers, defenders,
//    uprising flag, talk in an uprising, flee path, and win path (uprisingAftermath).
// Usage: node scripts/test-brawler-theft-uprising.js
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

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}
function note(s) { console.log(`  → ${s}`); }

const said = [];
const origRand = Math.random;
function stubRand(c) { Math.random = () => c; }
function unStub() { Math.random = origRand; }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const origSay = Game.say.bind(Game);
  Game.say = (s) => { said.push(String(s)); return origSay(s); };

  const v = Game.state.village;
  const others = () => v.roster.filter(id => id !== Game.villagerId);
  const name = (id) => Game.displayName(id);

  // ============ PART 1: THE THIEF'S RUN ============
  console.log('\n== PART 1: stealFrom — two clean lifts, one caught ==');
  const rich = others().filter(id => Game.packKcal(id) >= 100).slice(0, 3);
  ok('three victims with full packs', rich.length === 3);
  const [t1, t2, t3] = rich;

  stubRand(0.9); // unseen: every roll lands above detection
  const r1 = Game.stealFrom(t1);
  ok('first lift unseen', r1 === 'unseen');
  ok('stolen rations in inventory', Game.state.scholar.inventory.some(i => i.stolen && i.units > 0));
  note(`stolen so far: ${JSON.stringify(Game.state.scholar.inventory.filter(i => i.stolen).map(i => i.units + 'x ' + i.name))}`);

  const r2 = Game.stealFrom(t2);
  ok('second lift unseen', r2 === 'unseen');

  stubRand(0.05); // caught: every roll lands below detection
  const trustBefore = ((v.trust || {})[t3]) || 0;
  const stolenBefore = Game.state.scholar.inventory.filter(i => i.stolen).reduce((n, i) => n + (i.units || 0), 0);
  const r3 = Game.stealFrom(t3);
  ok('third lift caught', r3 === 'caught');
  ok('caught victim trust cratered (-35, floor 0)', (((v.trust || {})[t3]) || 0) === Math.max(0, trustBefore - 35));
  ok('caught theft is a crime', Game.justiceState().crimes.some(c => c.type === 'theft' && c.victim === t3 && c.caught));
  const stolenAfter = Game.state.scholar.inventory.filter(i => i.stolen).reduce((n, i) => n + (i.units || 0), 0);
  ok('caught hands came away empty', stolenAfter === stolenBefore);
  unStub();

  // The victims notice a part later — advance the clock.
  said.length = 0;
  Game.advancePart();
  ok('notice sweep fired for the unseen thefts', said.some(s => s.includes('Someone took my rations')));
  const unseenCrimes = Game.justiceState().crimes.filter(c => c.type === 'theft' && !c.caught);
  ok('unseen thefts became unsolved crimes', unseenCrimes.length === 2);
  note(`justice heat after the spree: ${Game.justiceHeat()}`);

  // ============ PART 2: THE UPRISING, FOUGHT FOR REAL ============
  console.log('\n== PART 2: stage 4 — the village comes ==');
  // Setup like the debug scenario: everyone hates you, one friend left.
  const roster = others();
  v.trust = v.trust || {};
  for (const rid of roster) v.trust[rid] = 3 + Math.floor(origRand() * 6);
  const friend = roster[roster.length - 1];
  v.trust[friend] = 70;
  try { Game.recordCrime('theft', { victim: roster[0] }); } catch (e) {}
  try { Game.recordCrime('attack', { victim: roster[1] }); } catch (e) {}
  Game.justiceState().stage = 3;
  Game.justiceState().exiled = true;
  said.length = 0;
  const tb = Game.startVillageUprising('debug scenario: theft + assault + defiance');
  ok('uprising fight started', !!tb);
  const atk = tb.fighters.filter(f => f.kind === 'hostile');
  const dfn = tb.fighters.filter(f => f.kind === 'villager');
  note(`uprising: ${atk.length} attackers (${atk.map(f => f.name).join(', ')}), ${dfn.length} defender(s)`);
  ok('mob, not army (2-4 attackers)', atk.length >= 2 && atk.length <= 4);
  ok('every attacker is a real villager', atk.every(f => typeof f.villagerId === 'string' && !f.villagerId.includes(',')));
  ok('uprising flag set', tb.uprising === true);
  ok('the loyal friend stands with you', dfn.length === 1 && dfn[0].villagerId === friend);
  ok('aftermath context seeded', !!(Game._lastBetrayal && Game._lastBetrayal.uprising && Game._lastBetrayal.uprisingAttackers.length === atk.length));
  ok('opening dread was spoken', said.some(s => s.includes('THE UPRISING')));
  ok('FIGHT/FLEE/TALK offered', said.some(s => s.includes('FIGHT, FLEE, or TALK')));

  // TALK in an uprising: reason with the first attacker. Wait for our turn first.
  let guard = 0;
  while (!Game.tbIsPlayerTurn() && guard++ < 12 && Game.tbfight && !Game.tbfight.over) {
    try { Game.tbAdvance(); } catch (e) { break; }
  }
  ok('reached the player turn', Game.tbIsPlayerTurn());
  const p = Game.tbFighter('p');
  p.acted = false;
  said.length = 0;
  let talkOk = true;
  try { Game.tbPlayerTalk(atk[0].key, 'reason'); } catch (e) { talkOk = false; note('talk threw: ' + e.message); }
  ok('reason-tactic does not throw', talkOk);
  ok('talking cost the turn', p.acted === true);

  // The uprising voice: hostiles declare themselves on their turns.
  said.length = 0;
  try { Game.tbHostileTalk(atk[0]); } catch (e) { note('hostile talk threw: ' + e.message); }
  ok('uprising declaration line fires',
    said.some(s => s.includes('The village voted') || s.includes("This isn't personal") || s.includes('You know what you did')));

  // FLEE path: run, and the aftermath must be the uprising's, not generic betrayal.
  said.length = 0;
  Game.tbEnd('fled');
  ok('flee aftermath: the uprising text', said.some(s => s.includes('You run. Behind you, the village')));
  ok('flee aftermath: exile permanent', Game.justiceState().exiled === true);
  ok('flee aftermath: context cleared', Game._lastBetrayal === null);

  // ============ PART 3: WIN THE UPRISING ============
  console.log('\n== PART 3: stand and fight the mob ==');
  for (const rid of roster) v.trust[rid] = 5;
  v.trust[friend] = 5;
  Game.justiceState().stage = 3;
  Game.justiceState().exiled = true;
  Game.state.scholar.health = 1000;
  said.length = 0;
  Game.startVillageUprising('debug scenario: round two');
  const tb2 = Game.tbfight;
  const atk2 = tb2.fighters.filter(f => f.kind === 'hostile');
  ok('second uprising is a mob too', atk2.length >= 2 && atk2.length <= 4);
  const pf = Game.tbFighter('p'); pf.hp = 1000; pf.maxHp = 1000;
  // Weaken the mob so the sim can finish; the point is the aftermath wiring, not the DPS race.
  for (const a of atk2) { a.hp = 1; a.maxHp = 1; }
  let rounds = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 80) {
    const tgt = Game.tbfight.fighters.find(f => f.kind === 'hostile' && f.alive && !f.fled);
    if (!tgt) break;
    if (Game.tbIsPlayerTurn()) {
      const pl = Game.tbFighter('p');
      pl.mx = tgt.mx; pl.my = tgt.my; pl.acted = false; pl.hp = 1000;
      try { Game.tbPlayerStrike(tgt.key); } catch (e) { break; }
    } else Game.tbAdvance();
  }
  ok('the mob fight resolved', !Game.tbfight);
  ok('victory aftermath: the clearing is quiet', said.some(s => s.includes('The clearing is quiet')));
  ok('victory aftermath: the village is broken', Game.justiceState().broken === true);

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  Math.random = origRand;
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); Math.random = origRand; process.exit(2); });
