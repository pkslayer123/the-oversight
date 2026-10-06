// BRAWLER LADDER probe (2026-10-06): petty-crime arc as a player.
// Steals, intimidations (yielded + refused), then days pass. Narrates the
// justice ladder stages, confrontation, and whether refused-intimidation
// has any follow-through. Usage: node scripts/playtest-brawler-ladder-20261006.js
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
const STAGENAMES = ['peace', 'cold shoulder', 'confrontation', 'moot track', 'uprising'];
const status = (label) => {
  console.log(`  [stage=${Game.justiceStage()} (${STAGENAMES[Game.justiceStage()] || '?'}) heat=${Game.justiceHeat()} confrontedBy=${Game.justiceState().confrontedBy ? Game.displayName(Game.justiceState().confrontedBy) : 'none'} pendingConfront=${!!Game.justiceState().pendingConfront}] ${label}`);
};

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village, me = Game.villagerId;
  const others = () => v.roster.filter(id => id !== me);
  const trustOf = (id) => { const t = (v.trust || {})[id]; return t === undefined ? 10 : t; };
  freshLines();

  const mark = others().find(id => Game.packKcal(id) >= 200);
  const bold = others().find(id => ['bold', 'prickly', 'intense'].includes(Game.npcTemper(id)) && id !== mark);
  const soft = others().find(id => ['cautious', 'withdrawn', 'gentle'].includes(Game.npcTemper(id)) && id !== mark && id !== bold);
  console.log('mark:', Game.displayName(mark), '| bold:', bold && Game.displayName(bold), '| soft:', soft && Game.displayName(soft));

  // --- petty crime: one theft, noticed ---
  console.log(`\n>>> I lift rations from ${Game.displayName(mark)}.`);
  Game.stealFrom(mark);
  Game.dayPart = (Game.dayPart + 1) % 4; Game.theftNoticeSweep();
  status('after 1 theft'); beat('theft noticed');

  // --- intimidate the soft one -> yielded; the bold one -> refused ---
  if (soft) { console.log(`\n>>> I threaten ${Game.displayName(soft)}. ("Your food. Now.")`); console.log('>>> result:', Game.intimidate(soft)); }
  if (bold) { console.log(`\n>>> I threaten ${Game.displayName(bold)}. ("Your food. Now.")`); console.log('>>> result:', Game.intimidate(bold)); }
  status('after 2 intimidations'); beat('intimidations');

  // --- days pass: watch the ladder tick ---
  for (let d = 1; d <= 8; d++) {
    try { Game.justiceTick(); } catch (e) { console.log('tick err', e.message); }
    try { Game.considerPlayerAccusation(); } catch (e) {}
    try { Game.dayPart = 3; Game.endDay && Game.endDay(); } catch (e) {}
    status(`day ${d}`);
    if (Game.justiceState().confrontedBy) {
      const cv = Game.justiceState().confrontedBy;
      beat(`day ${d} — confronted by ${Game.displayName(cv)}`);
      break;
    }
  }

  // --- answer the confrontation: REFUSE first in one timeline ---
  const j = Game.justiceState();
  if (j.confrontedBy && Game.justicePendingConfront(j.confrontedBy)) {
    console.log(`\n>>> Confrontation pending with ${Game.displayName(j.confrontedBy)}. I answer: REFUSE.`);
    const r = Game.justiceConfront(j.confrontedBy, 'refuse');
    console.log('>>> justiceConfront refuse =>', JSON.stringify(r).slice(0, 200));
    status('after refusing'); beat('refusal');
    for (let d = 1; d <= 4; d++) {
      try { Game.justiceTick(); } catch (e) {}
      try { Game.dayPart = 3; Game.endDay && Game.endDay(); } catch (e) {}
      status(`post-refusal day ${d}`);
    }
    beat('post-refusal aftermath');
    const cases = (Game.betrayalState().cases || []).filter(c => c.accused.includes(me));
    console.log(`>>> cases against me: ${cases.map(c => c.charge + '/' + c.status).join(', ') || 'none'}`);
  }

  // --- trust-recovery under cold shoulder: is amends visible? ---
  console.log('\n>>> Back at peace: I give food to the mark, see if kindness lands.');
  const before = trustOf(mark);
  try { Game.giveFood && Game.giveFood(mark, 500); } catch (e) { console.log('give err', e.message); }
  console.log(`>>> trust ${before} -> ${trustOf(mark)} (cold=${Game.justiceCold()})`);
  beat('amends attempt');
})().catch(e => { console.error('PLAYTEST CRASH:', e); process.exit(1); });
