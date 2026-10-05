// Miser playtest: hoarding, caches, stash theft, personal economy.
// Plays the full miser loop end-to-end and asserts the mechanics hold.
// Usage: node scripts/test-miser.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

let said = [];
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  // deterministic light pack: 1 water bottle, empty pockets
  Game.state.scholar.water = (Game.state.scholar.water || []).slice(0, 1);
  Game.state.scholar.inventory = [];
}
const ME = () => Game.state.scholar.villagerId;

(async () => {
  await Game.init();

  // ---------- ACT 1: gather & stash ----------
  freshGame();
  Game.addMaterial('branch', 12);
  Game.addMaterial('wood', 2);
  ok('gathered materials land in inventory', Game.materialCount('branch') === 12);

  const trustBefore = (Game.state.village.trust || {})[ME()] || 15;
  Game.donateMaterial('branch', 10);
  const st = Game.stashState();
  ok('donation reaches the stash', st.materials.branch === 10);
  ok('donation is ledgered', st.ledger.length >= 1 && st.ledger[0].kind === 'give' && st.ledger[0].qty === 10);
  ok('donation buys a little trust', ((Game.state.village.trust || {})[ME()] || 0) > trustBefore);
  ok('donation says something warm', said.some(t => /pile grows/i.test(t)));
  ok('branches, never branchs', said.some(t => /10 branches/i.test(t)) && !said.some(t => /branchs/.test(t)));

  Game.takeMaterial('branch', 5);
  ok('take removes from stash', Game.stashState().materials.branch === 5);
  ok('take lands in inventory', Game.materialCount('branch') === 7); // 2 left + 5 taken
  ok('take is ledgered', Game.stashState().ledger[0].kind === 'take');
  ok('take names the plural', said.some(t => /Took 5 branches/i.test(t)));

  // drain past the -20 net line: seed the stash, take heavy
  Game.stashState().materials.branch = 60;
  const tMid = (Game.state.village.trust || {})[ME()];
  Game.takeMaterial('branch', 10);
  Game.spendMaterial('branch', 99); // haul it away; the miser doesn't carry it all
  Game.takeMaterial('branch', 20);
  Game.spendMaterial('branch', 99);
  const v = Game.state.village;
  const net = (v.stashGives[ME()] || 0) - (v.stashTakes[ME()] || 0);
  ok('takes accumulate in the ledger', (v.stashTakes[ME()] || 0) === 35);
  ok('net goes negative past -20', net < -20);
  ok('heavy taking costs trust', ((v.trust || {})[ME()] || 0) < tMid);
  console.log(`  stash drain: gives=10 takes=${v.stashTakes[ME()] || 0} net=${net}, trust ${tMid} → ${(v.trust || {})[ME()]}`);

  const lt = Game.stashLedgerText(5);
  ok('ledger text lists gives and takes', /left/.test(lt) && /took/.test(lt));

  // ---------- ACT 2: caches ----------
  freshGame();
  Game.addMaterial('wood', 6);
  Game.addMaterial('stone', 6);
  Game.buryCache('material', 'wood', 4);
  let caches = Game.playerCaches();
  ok('cache buried', caches.length === 1 && caches[0].items[0].units === 4);
  ok('cache notes the journal/codex', (Game.state.codex.places || []).some(p => /buried/i.test(p.text)));
  ok('burying says where', said.some(t => /Buried\./.test(t)));
  ok('burying costs the goods', Game.materialCount('wood') === 2);

  const cid = caches[0].id;
  Game.digUpCache(cid);
  ok('digging up returns the goods', Game.materialCount('wood') === 6);
  ok('dug cache is gone', Game.playerCaches().length === 0);
  ok('digging up feels good', said.some(t => /Still yours/.test(t)));

  // robbed cache: the gut-punch
  Game.buryCache('material', 'stone', 6);
  const robId = Game.playerCaches()[0].id;
  Game.playerCaches()[0].found = true;
  Game.playerCaches()[0].items = [];
  said = [];
  Game.digUpCache(robId);
  ok('robbed cache tells you straight', said.some(t => /Someone got here first/.test(t)));
  ok('robbed cache is cleared', Game.playerCaches().length === 0);

  // food caching round-trips
  const inv = Game.state.scholar.inventory;
  inv.push({ name: 'Test jerky', kcalEach: 200, units: 3, spoilDay: 99, kg: 0.1 });
  const fidx = inv.findIndex(i => i.name === 'Test jerky');
  Game.buryCache('food', fidx, 2);
  ok('food cache holds kcal', Game.playerCaches()[0].items[0].kcalEach === 200);
  Game.digUpCache(Game.playerCaches()[0].id);
  ok('food comes back', inv.find(i => i.name === 'Test jerky').units === 3);

  // ---------- ACT 3: theft pressure over time ----------
  freshGame();
  const hx = Game.state.village.px ?? 3, hy = Game.state.village.py ?? 3;
  Game.playerCaches().push({ id: 'near', node: { x: hx, y: hy }, desc: 'near', label: 'near', items: [{ name: 'x' }], found: false, day: 0 });
  Game.playerCaches().push({ id: 'far', node: { x: hx + 14, y: hy + 14 }, desc: 'far', label: 'far', items: [{ name: 'x' }], found: false, day: 0 });
  let nearHit = 0, farHit = 0;
  const TRIALS = 30;
  for (let t = 0; t < TRIALS; t++) {
    for (const c of Game.playerCaches()) { c.found = false; c.items = [{ name: 'x' }]; }
    for (let b = 0; b < 120; b++) Game.npcBatchTurn();
    if (Game.playerCaches()[0].found) nearHit++;
    if (Game.playerCaches()[1].found) farHit++;
  }
  console.log(`  theft pressure: near hit ${nearHit}/${TRIALS}, far hit ${farHit}/${TRIALS}`);
  ok('near caches get hit sometimes', nearHit > 0);
  ok('far caches are safer than near', farHit < nearHit);

  // ---------- ACT 4: pickpocket → notice → justice ----------
  freshGame();
  const victim = Game.state.village.roster.find(id => id !== ME());
  let seenCaught = false, seenUnseen = false, caughtKeptPack = false;
  for (let i = 0; i < 200 && !(seenCaught && seenUnseen); i++) {
    // keep the victim's pack full: we're testing the detection roll, not pack economics
    const v0 = Game.state.village;
    v0.pack = v0.pack || {};
    Game.packKcal(victim);
    v0.pack[victim].kcal = Math.max(v0.pack[victim].kcal, 1000);
    const packBefore = Game.packKcal(victim);
    const r = Game.stealFrom(victim);
    if (r === 'caught') {
      seenCaught = true;
      // getting caught means you let go — the food stays where it was
      if (Game.packKcal(victim) === packBefore) caughtKeptPack = true;
    }
    if (r === 'unseen') seenUnseen = true;
  }
  ok('pickpocket can get caught', seenCaught);
  ok('caught pickpocket leaves the food in the pack', caughtKeptPack);
  ok('pickpocket can go unseen', seenUnseen);
  ok('unseen theft stashes stolen goods', Game.state.scholar.inventory.some(i => i.stolen));
  Game.dayPart = (Game.dayPart || 0) + 1;
  said = [];
  Game.theftNoticeSweep();
  ok('victim notices missing rations', said.some(t => /Someone took my rations/.test(t)));
  const heat = Game.justiceHeat();
  ok('theft registers justice heat', heat >= 15);
  console.log(`  justice heat after one noticed theft: ${heat}`);

  // ---------- ACT 5: stash drain vs justice heat (design probe) ----------
  freshGame();
  Game.stashState().materials.branch = 100;
  Game.takeMaterial('branch', 60); // weight-capped; takes what fits
  const v2 = Game.state.village;
  const took = v2.stashTakes[ME()] || 0;
  const heat2 = Game.justiceHeat();
  console.log(`  stash-only drain: took=${took}, justice heat=${heat2} (pickpocket theft heat was >=15)`);
  ok('stash ledger tracks the drain', took > 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW', e); process.exit(1); });
