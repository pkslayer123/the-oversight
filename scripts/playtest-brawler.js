// BRAWLER playtest: theft, intimidation, assault, village justice escalation.
// A narrated run — plays like a player, reports the story and the friction.
// Usage: node scripts/playtest-brawler.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js', 'src/js/game.js',
 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let logMark = 0;
function freshLines() { const l = Game.log.slice(logMark); logMark = Game.log.length; return l; }
function beat(title) {
  console.log('\n' + '='.repeat(64));
  console.log('  ' + title);
  console.log('='.repeat(64));
  for (const l of freshLines()) console.log('  | ' + l);
}
const trustOf = (vid) => { const t = (Game.state.village.trust || {})[vid]; return t === undefined ? 10 : t; };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const me = Game.villagerId;
  const others = () => v.roster.filter(id => id !== me);
  freshLines();

  console.log('THE CAST (temperaments):');
  for (const id of others()) console.log(`  - ${Game.displayName(id)} [${Game.npcTemper(id)}] trust=${trustOf(id)}`);

  // ---------- BEAT 1: THEFT ----------
  const mark = others().find(id => Game.packKcal(id) >= 200);
  console.log(`\n>>> I pick ${Game.displayName(mark)}'s pack.`);
  const sr = Game.stealFrom(mark);
  console.log(`>>> steal result: ${sr}`);
  beat('BEAT 1 — the theft');
  console.log(`  trust now: ${trustOf(mark)} | stolen goods: ${JSON.stringify(Game.state.scholar.inventory.filter(i => i.stolen).map(i => i.units + 'x ' + i.name))}`);

  Game.dayPart = (Game.dayPart + 1) % 4;
  Game.theftNoticeSweep();
  beat('BEAT 1b — the noticing');
  console.log(`  trust now: ${trustOf(mark)}`);

  // ---------- BEAT 2: INTIMIDATION ----------
  const soft = others().find(id => ['cautious', 'withdrawn'].includes(Game.npcTemper(id)) && id !== mark);
  const hard = others().find(id => ['bold', 'prickly', 'intense'].includes(Game.npcTemper(id)) && id !== mark);
  if (soft) {
    console.log(`\n>>> I corner ${Game.displayName(soft)} [${Game.npcTemper(soft)}]. "Your food. Now."`);
    console.log(`>>> intimidate result: ${Game.intimidate(soft)}`);
    beat('BEAT 2a — threatening the fearful');
    console.log(`  trust now: ${trustOf(soft)}`);
  }
  if (hard) {
    console.log(`\n>>> I get in ${Game.displayName(hard)}'s face [${Game.npcTemper(hard)}].`);
    const ir = Game.intimidate(hard);
    console.log(`>>> intimidate result: ${ir}`);
    beat('BEAT 2b — threatening the bold');
    console.log(`  trust now: ${trustOf(hard)} | fight started: ${!!Game.tbfight}`);
    if (ir === 'fight' && Game.tbfight) {
      let guard = 0;
      while (Game.tbfight && guard++ < 8) {
        if (Game.tbIsPlayerTurn()) { Game.tbPlayerFlee(); }
        else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
        if (!Game.tbfight) break;
        if (Game.tbIsPlayerTurn()) break;
      }
      beat('BEAT 2c — the brawl');
    }
  }

  // ---------- BEAT 3: ASSAULT ----------
  const foe = others().find(id => id !== mark && id !== soft && id !== hard && trustOf(id) < 10) || others().find(id => id !== mark);
  console.log(`\n>>> Enough talk. I turn on ${Game.displayName(foe)}.`);
  Game.playerAttacks(foe);
  let rounds = 0;
  const fkey = 'h_' + foe;
  while (Game.tbfight && rounds++ < 10) {
    if (Game.tbIsPlayerTurn()) {
      const p = Game.tbFighter('p'), h = Game.tbFighter(fkey);
      if (!h || !h.alive) break;
      const d = Math.max(Math.abs(h.mx - p.mx), Math.abs(h.my - p.my));
      if (d <= 1) { Game.tbPlayerStrike(fkey); }
      else { Game.tbPlayerFlee(); break; }
      if (Game.tbfight && Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn();
    } else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
  }
  if (Game.tbfight && Game.tbIsPlayerTurn()) Game.tbPlayerFlee();
  beat('BEAT 3 — the assault');
  console.log(`  fight over. my health: ${Math.round(Game.state.scholar.health)} | crimes: ${JSON.stringify((Game.justiceState().crimes || []).map(c => c.type + (c.victim ? ':' + Game.displayName(c.victim) : '')))}`);

  // ---------- BEAT 4: JUSTICE ----------
  console.log('\n>>> Days pass. The village talks.');
  let accused = false;
  for (let d = 0; d < 6 && !accused; d++) {
    try { Game.considerPlayerAccusation(); } catch (e) { console.log('accuse err', e.message); }
    accused = (Game.betrayalState().cases || []).some(c => (c.status === 'open' || c.status === 'dormant') && c.accused.includes(me));
    try { Game.dayPart = 3; Game.endDay && Game.endDay(); } catch (e) {}
  }
  const myCase = (Game.betrayalState().cases || []).find(c => c.accused.includes(me));
  console.log(`>>> accused: ${accused} ${myCase ? `(charge: ${myCase.charge}, accuser: ${Game.displayName(myCase.accuser)})` : ''}`);
  if (myCase) {
    const voter = v.roster.filter(id => id !== me && !myCase.accused.includes(id))[0];
    const price = Game.caseBribePrice(myCase, voter);
    console.log(`>>> bribing ${Game.displayName(voter)} (price ${price} kcal). pantry: ${Math.round(v.pantryKcal)}`);
    Game.state.village.pantryKcal = Math.max(Game.state.village.pantryKcal, price + 500);
    const br = Game.bribeVoter(myCase.id, voter, me, price);
    console.log(`>>> bribe result: ${br}`);
    beat('BEAT 4a — the bribe');
    const mt = Game.callMoot(myCase.id);
    if (mt && mt.awaitingPlayerVote) { console.log('>>> I vote GUILTY — own it.'); Game.castPlayerVote(myCase.id, true); }
    beat('BEAT 4b — the moot');
    console.log(`>>> verdict: ${myCase.trial && myCase.trial.convicted ? 'GUILTY' : 'ACQUITTED'} | status: ${myCase.status} | exiled: ${!!Game.state.scholar.exiled}`);
  }
  beat('BEAT 4c — aftermath');
  console.log(`  heat: ${(() => { try { return Game.justiceHeat(); } catch (e) { return '?'; } })()}`);
  console.log('  trust ledger:');
  for (const id of others()) console.log(`    ${Game.displayName(id)}: ${trustOf(id)}`);
})().catch(e => { console.error('PLAYTEST CRASH:', e); process.exit(1); });
