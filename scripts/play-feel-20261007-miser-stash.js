// Miser playtest: the village stash as a social economy — played as a
// taker-hoarder AND as a ledger-watcher. Scenes:
//  1. donate to a fresh (closed) village stash, then watch the skim economy
//  2. the drain: takeMaterial past net -20, trust cost, watched message
//  3. open village: contributions land with names
//  4. closed village: skims are anonymous, player NOT blamed
//  5. takeTool notice path in a closed village
//  6. dailyCacheCheck feel: new per-day roll, near vs far survival over a season
// Seeded RNG (mulberry32, SEED env) for the aggregate; deterministic stubs for
// branch-forcing scenes. Usage: node scripts/play-feel-20261007-miser-stash.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // deleted before play (AGENTS.md)
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

// --- seeded RNG ---
const SEED = parseInt(process.env.SEED || '20261007', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realRandom = Math.random;
const setRand = (fn) => { Math.random = fn; };
const seeded = () => setRand(mulberry32(SEED));
const restoreRand = () => { Math.random = realRandom; };

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, extra === undefined ? '' : String(extra).slice(0, 260)); }
}
function check(label, cond, extra) { ok(label, cond, extra); }

let said = [];
const ME = () => Game.state.scholar.villagerId;
const others = () => (Game.state.village.roster || []).filter(id => id !== ME());
const atHaven = () => {
  Game.state.scholar.insideHaven = true;
  Game.map.px = Game.state.village.px ?? 4; Game.map.py = Game.state.village.py ?? 4;
  try { Game.state.scholar.tile = { type: 'haven' }; } catch (e) {}
};
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.say = (t) => { said.push(String(t)); };
  Game.depart();
  Game.state.scholar.inventory = [];
  atHaven();
}

(async () => {
  await Game.init();

  // ================= SCENE 1: fresh village trust level =================
  freshGame();
  const lvl0 = Game.villageTrustLevel();
  const avgTrust = others().reduce((s, id) => s + (Game.state.village.trust[id] || 15), 0) / Math.max(1, others().length);
  console.log(`fresh village: avg roster trust ${avgTrust.toFixed(1)} -> level '${lvl0}'`);
  check('fresh village starts closed (trust 5-20 strangers)', lvl0 === 'closed', lvl0);

  // ================= SCENE 2: donate, then the skim economy =================
  seeded();
  freshGame();
  Game.addMaterial('branch', 20);
  Game.donateMaterial('branch', 20);
  const st0 = Game.stashState().materials.branch;
  check('donation lands in stash', st0 === 20, 'got ' + st0);
  check('donation logged with player name', Game.stashLedgerText(1).includes('left 20×'), Game.stashLedgerText(1));
  const meTrust1 = Game.state.village.trust[ME()];
  check('donation raises trust in player', meTrust1 > 15, 'got ' + meTrust1);
  // run 5 days of batches (16 batches/day), count skims
  let skims = 0;
  const skimLines = [];
  for (let d = 0; d < 5; d++) {
    for (let b = 0; b < 16; b++) {
      said.length = 0;
      Game.npcBatchTurn();
      const line = said.find(t => /missing\. Nobody saw anything/.test(t));
      if (line) { skims++; skimLines.push(line); }
    }
  }
  const left = Game.stashState().materials.branch;
  console.log(`donated 20 branches; after 5 days ${left} left; skim events seen: ${skims}`);
  check('closed village skims a donated stash', left < 20 && skims > 0, `left=${left} skims=${skims}`);
  // ledger honesty: skims are anonymous, never blame the player
  const ledger = Game.stashLedgerText(30);
  const anon = ledger.split('\n').filter(l => /someone took/.test(l));
  check('skim ledger entries say "someone", not the player', anon.length > 0, ledger.slice(0, 200));
  const blameMe = ledger.split('\n').filter(l => l.includes(Game.firstRef(ME())) && /took/.test(l));
  check('player never blamed for skims', blameMe.length === 0, JSON.stringify(blameMe));
  // player trust NOT damaged by anonymous skims (ledger blaming you breaks the loop)
  const meTrust2 = Game.state.village.trust[ME()];
  check('skim events do not cost the player trust', meTrust2 >= meTrust1 - 1, `${meTrust1} -> ${meTrust2}`);
  restoreRand();

  // ================= SCENE 3: the drain (taker-hoarder) =================
  seeded();
  freshGame();
  // the stash is village-stocked (NPC donations), not the player's: only
  // then can the player's net go negative. Seed as an NPC give.
  const npcDonor = others()[0];
  Game.stashState().materials.wood = 150;
  Game.stashLog('give', 'Wood log', 150, npcDonor);
  said.length = 0;
  // take 5 at a time until net goes below -20. Weight check binds (~9 logs
  // fit the pack), so haul home between trips: spendMaterial simulates the
  // load leaving the pack for the player's own cache.
  let takes = 0, trustDrops = 0, watched = 0;
  for (let i = 0; i < 60; i++) {
    const before = Game.state.village.trust[ME()];
    said.length = 0;
    Game.takeMaterial('wood', 5);
    Game.spendMaterial('wood', 999); // the haul goes to my cache, pack empties
    takes++;
    const after = Game.state.village.trust[ME()];
    if (after < before) trustDrops++;
    if (said.some(t => /Someone watches you take/.test(t))) watched++;
    if (Game._stashTotalNet(ME()) < -20) break;
  }
  const net = Game._stashTotalNet(ME());
  console.log(`drain: ${takes} takes of 5, net=${net}, trust-costing takes=${trustDrops}, "watched" messages=${watched}`);
  check('takes past net -20 cost trust', trustDrops > 0, `trustDrops=${trustDrops}`);
  check('the watched message fires while draining', watched > 0, `watched=${watched}`);
  const myTake = Game.stashLedgerText(30).split('\n').find(l => /took 5×/.test(l));
  check('ledger names the taker', !!myTake && myTake.includes(Game.firstRef(ME())), myTake);
  restoreRand();

  // ================= SCENE 4: open village contributions =================
  freshGame();
  for (const id of others()) Game.state.village.trust[id] = 80;
  check('rich trust -> open level', Game.villageTrustLevel() === 'open', Game.villageTrustLevel());
  // force the 0.06 contribution branch and the 0.5 announcement branch
  setRand(() => 0.01);
  said.length = 0;
  const b0 = Game.stashState().materials.branch || 0;
  Game.npcBatchTurn();
  const b1 = Game.stashState().materials.branch || 0;
  const gave = b1 > b0;
  const annc = said.find(t => /left .* by the stash/.test(t));
  const gledger = Game.stashLedgerText(30).split('\n').find(l => /left \d+×/.test(l));
  check('open village: someone contributes wood/branches', gave, `b0=${b0} b1=${b1}`);
  check('contribution announced with a name (sometimes)', !!annc, said.slice(0, 3).join(' | '));
  check('contribution ledger names the giver', !!gledger && !/someone left/.test(gledger), gledger);
  restoreRand();

  // ================= SCENE 5: closed skim branch, forced =================
  freshGame();
  for (const id of others()) Game.state.village.trust[id] = 5;
  Game.addMaterial('stone', 10); Game.donateMaterial('stone', 10);
  setRand(() => 0.01); // forces both the 0.05 skim gate and n=1+floor(0.01*2)=1
  said.length = 0;
  const s0 = Game.stashState().materials.stone;
  Game.npcBatchTurn();
  const s1 = Game.stashState().materials.stone;
  const skimSay = said.find(t => /Nobody saw anything/.test(t));
  const skimLedger = Game.stashLedgerText(30).split('\n').find(l => /someone took/.test(l));
  check('forced skim removes stone', s1 < s0, `s0=${s0} s1=${s1}`);
  check('skim announcement fires', !!skimSay, said.slice(0, 3).join(' | '));
  check('skim ledger is anonymous', !!skimLedger, skimLedger);
  restoreRand();

  // ================= SCENE 6: takeTool notice in closed village =================
  freshGame();
  for (const id of others()) Game.state.village.trust[id] = 5;
  Game.state.scholar.inventory.push({ itemId: 'stone_axe', id: 'stone_axe', name: 'Stone axe', units: 1, kg: 1 });
  // make it a tool the stash accepts: patch data lookup path — use donateTool guard directly
  const st = Game.stashState();
  st.tools.push({ itemId: 'stone_axe', name: 'Stone axe' });
  setRand(() => 0.01); // force the 0.5 "people notice" branch
  said.length = 0;
  Game.takeTool('stone_axe');
  const notice = said.find(t => /people notice who takes tools/.test(t));
  check('closed village: tool take is noticed', !!notice, said.slice(0, 3).join(' | '));
  check('tool take logged', Game.stashLedgerText(5).includes('took 1× Stone axe'), Game.stashLedgerText(5));
  restoreRand();

  // ================= SCENE 7: daily cache roll feel (new per-day gate) =================
  seeded();
  freshGame();
  const v = Game.state.village, hx = v.px ?? 4, hy = v.py ?? 4;
  const clamp = (n) => Math.max(0, Math.min(6, n));
  const near = { x: clamp(hx + 2), y: hy }, far = { x: clamp(hx - 3), y: clamp(hy - 3) };
  const dN = Math.abs(near.x - hx) + Math.abs(near.y - hy);
  const dF = Math.abs(far.x - hx) + Math.abs(far.y - hy);
  const pN = Game.cacheTheftChance(dN), pF = Game.cacheTheftChance(dF);
  console.log(`theft/day: near(d${dN})=${(pN * 100).toFixed(2)}% far(d${dF})=${(pF * 100).toFixed(2)}%`);
  check('far cache is meaningfully safer per day than near', pF < pN * 0.75, `${pF} vs ${pN}`);
  const SEASONS = 60, DAYS = 45;
  let nearSurv = 0, farSurv = 0;
  for (let sn = 0; sn < SEASONS; sn++) {
    let nHit = false, fHit = false;
    for (let d = 0; d < DAYS; d++) {
      if (!nHit && Math.random() < pN) nHit = true;
      if (!fHit && Math.random() < pF) fHit = true;
    }
    if (!nHit) nearSurv++;
    if (!fHit) farSurv++;
  }
  console.log(`45-day season survival over ${SEASONS} seasons: near ${nearSurv}/${SEASONS}, far ${farSurv}/${SEASONS}`);
  check('near cache is a real gamble (~70% survive)', nearSurv / SEASONS > 0.5 && nearSurv / SEASONS < 0.9, nearSurv);
  check('far cache usually survives the season', farSurv / SEASONS >= 0.75, farSurv);
  check('distance gradient is visible to a player', farSurv > nearSurv, `${farSurv} vs ${nearSurv}`);
  restoreRand();

  // ================= SCENE 8: stash UI notes per level =================
  freshGame();
  const htmlClosed = Game.stashHtml();
  for (const id of others()) Game.state.village.trust[id] = 35;
  const htmlWary = Game.stashHtml();
  for (const id of others()) Game.state.village.trust[id] = 80;
  const htmlOpen = Game.stashHtml();
  check('closed note reads thin-trust', /trust is thin/.test(htmlClosed), htmlClosed.slice(0, 120));
  check('wary note reads watched', /watched a little/.test(htmlWary), htmlWary.slice(0, 120));
  check('open note reads nobody worries', /nobody worries/.test(htmlOpen), htmlOpen.slice(0, 120));

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
