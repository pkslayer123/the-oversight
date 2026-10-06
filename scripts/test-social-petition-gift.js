// REPRO: petition gift consumed on rejection with no acknowledgment.
// petitionVillage (src/js/betrayal.js:1194) strips the offered food from the
// pack BEFORE the judgment roll, and the rejection line is identical whether
// a gift was given or not. A 700-kcal gift vanishes silently.
// Expected: rejection acknowledges the gift (or returns it).
// Usage: node scripts/test-social-petition-gift.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
let sayLog = [];
Game.say = (t) => { sayLog.push(String(t)); };

(async () => {
  await Game.init();
  let rejectedWithGift = 0, giftSilent = 0;
  for (let t = 0; t < 12; t++) {
    Game.debugScenario('exile');
    sayLog = [];
    Game.state.scholar.kcal = 3000;
    const before = Game.packKcal(Game.villagerId);
    const accepted = Game.petitionVillage(Game.state.otherVillages[0].id, { giftKcal: 700 });
    const after = Game.packKcal(Game.villagerId);
    const spent = before - after;
    if (accepted !== true && spent >= 700) {
      rejectedWithGift++;
      const acked = sayLog.some(l => /food|gift|laid down/i.test(l));
      if (!acked) giftSilent++;
      if (t === 0) console.log('rejection line:', sayLog.filter(l => /turns you away/.test(l))[0]);
    }
  }
  console.log(`rejected-with-gift: ${rejectedWithGift}, of which silent about the gift: ${giftSilent}`);
  if (giftSilent > 0) { console.log('FAIL: gift eaten on rejection, never acknowledged'); process.exit(1); }
  console.log('PASS: rejections acknowledge the gift');
})().catch(e => { console.error('CRASH:', e.message); process.exit(2); });
