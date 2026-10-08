// Miser playtest: the village stash as a living system.
// ACT 1: a fresh village is born closed (12 strangers).
// ACT 2: the closed skim loop over 30 days — ledger honesty, depletion.
// ACT 3: wary dead zone + the open village (contributions).
// ACT 4: the player's own skimming — trust penalty, rubber-band bug probe.
// ACT 5: || 15 fallback probes in villageTrustLevel.
// Usage: node scripts/test-miser-stash-village-20261007.js
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

// Seeded RNG (AGENTS.md PROOF-TEST RNG STABILITY): SEED env override.
{
  const SEED = parseInt(process.env.SEED || '20261007', 10);
  let a = SEED;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra !== undefined ? ' :: ' + extra : ''}`); }
}

let said = [];
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  Game.state.scholar.water = (Game.state.scholar.water || []).slice(0, 1);
  Game.state.scholar.inventory = [];
}
const ME = () => Game.state.scholar.villagerId;
function npcIds() { return (Game.state.village.roster || []).filter(id => id !== ME()); }
function avgNpcTrust() {
  const ids = npcIds();
  const t = Game.state.village.trust || {};
  return ids.reduce((s, id) => s + (t[id] === undefined ? 15 : t[id]), 0) / Math.max(1, ids.length);
}
function runBatches(n) {
  let skims = 0, contribs = 0;
  for (let i = 0; i < n; i++) {
    said = [];
    Game.npcBatchTurn();
    if (said.some(t => /stash count is off/i.test(t))) skims++;
    if (said.some(t => /left .* by the stash\. No announcement/i.test(t))) contribs++;
  }
  return { skims, contribs };
}

(async () => {
  await Game.init();

  // ---------- ACT 1: born closed ----------
  freshGame();
  const avg0 = avgNpcTrust();
  const lvl0 = Game.villageTrustLevel();
  console.log(`  day-0: avg NPC trust ${avg0.toFixed(1)}, level=${lvl0}`);
  ok('fresh village: strangers (avg trust < 25)', avg0 < 25, avg0.toFixed(1));
  ok('fresh village level is closed', lvl0 === 'closed', lvl0);

  // ---------- ACT 2: the closed skim, 30 days ----------
  freshGame();
  const st0 = Game.stashState();
  st0.materials.wood = 20; st0.materials.branch = 30; st0.materials.stone = 10;
  const before30 = { wood: 20, branch: 30, stone: 10 };
  const r30 = runBatches(30 * 16);
  const stAfter = Game.stashState();
  const skimLines = stAfter.ledger.filter(e => e.kind === 'take' && e.vid === null);
  const totalBefore = before30.wood + before30.branch + before30.stone;
  const totalAfter = ['wood','branch','stone'].reduce((s, m) => s + (stAfter.materials[m] || 0), 0);
  console.log(`  30 days closed: skim announcements=${r30.skims}, contributions=${r30.contribs}, ` +
    `anonymous ledger takes=${skimLines.length}, stash ${totalBefore} → ${totalAfter}`);
  ok('closed village skims the stash', r30.skims >= 1, String(r30.skims));
  ok('closed village never contributes', r30.contribs === 0, String(r30.contribs));
  ok('skim ledger entries are anonymous (vid null)', skimLines.length >= 1, String(skimLines.length));
  const lt = Game.stashLedgerText(30);
  ok('ledger text says "someone" for skims', /someone took/.test(lt));
  // WITNESS (miser loop 2026-10-08): a skim seen by the hall-bound player now
  // names the real robber + plants a doubt. Ledger honesty becomes: every take
  // is either anonymous ("someone") or blames a REAL roster member — never a
  // phantom, never the player for a skim they didn't do.
  const rosterIds = new Set(Game.state.village.roster || []);
  const badBlame = stAfter.ledger.filter(e => e.kind === 'take' && e.vid && !rosterIds.has(e.vid));
  ok('skim takes blame real villagers or no one', badBlame.length === 0, JSON.stringify(badBlame.map(e => e.vid)));
  const witnessed = stAfter.ledger.filter(e => e.kind === 'take' && e.vid && e.vid !== ME());
  const wdoubts = (Game.state.codex.doubts || []).filter(d => d.theft && d.theft.kind === 'stash');
  ok('witnessed skims plant stash-theft doubts', wdoubts.length >= Math.min(witnessed.length, 1) && (witnessed.length === 0 || wdoubts.length >= 1),
    `witnessed=${witnessed.length} doubts=${wdoubts.length}`);
  ok('the pile drains over a closed month', totalAfter < totalBefore, `${totalBefore}→${totalAfter}`);

  // ---------- ACT 3: wary dead zone, then open ----------
  freshGame();
  for (const id of npcIds()) Game.state.village.trust[id] = 30;
  ok('trust 30 reads wary', Game.villageTrustLevel() === 'wary', Game.villageTrustLevel());
  const rw = runBatches(5 * 16);
  console.log(`  wary 5 days: skims=${rw.skims}, contributions=${rw.contribs}`);
  ok('wary: no skims', rw.skims === 0, String(rw.skims));
  ok('wary: no contributions (dead zone)', rw.contribs === 0, String(rw.contribs));
  for (const id of npcIds()) Game.state.village.trust[id] = 60;
  ok('trust 60 reads open', Game.villageTrustLevel() === 'open', Game.villageTrustLevel());
  const ro = runBatches(10 * 16);
  const stOpen = Game.stashState();
  const gaveLines = stOpen.ledger.filter(e => e.kind === 'give' && e.vid && e.vid !== ME());
  console.log(`  open 10 days: skims=${ro.skims}, contributions=${ro.contribs}, npc give entries=${gaveLines.length}`);
  ok('open village contributes', ro.contribs >= 1, String(ro.contribs));
  ok('open village never skims', ro.skims === 0, String(ro.skims));
  ok('contributions are ledgered to a real villager', gaveLines.length >= 1, String(gaveLines.length));

  // ---------- ACT 4: the player's own skimming ----------
  freshGame();
  const v4 = Game.state.village;
  Game.stashState().materials.wood = 200;
  const trustStart = (v4.trust || {})[ME()] || 15;
  let takes = 0;
  while ((Game.stashState().materials.wood || 0) > 0 && takes < 40) {
    Game.takeMaterial('wood', 10);
    Game.spendMaterial('wood', 99); // the miser hauls it away
    takes++;
  }
  const took = Object.values((v4.stashTakes || {})[ME()] || {}).reduce((t, x) => t + (x || 0), 0);
  const trustEnd = (v4.trust || {})[ME()];
  console.log(`  player skim: took=${took} wood, trust ${trustStart} → ${trustEnd}`);
  ok('heavy player taking costs trust', trustEnd < trustStart, `${trustStart}→${trustEnd}`);
  // rubber-band probe: trust must never rise from a penalty
  let rose = false, prev = trustEnd;
  for (let i = 0; i < 10; i++) {
    Game.stashState().materials.wood = 50;
    Game.takeMaterial('wood', 10);
    Game.spendMaterial('wood', 99);
    const cur = (Game.state.village.trust || {})[ME()];
    if (cur > prev + 0.001) rose = true;
    prev = cur;
  }
  ok('trust penalty never rubber-bands upward', !rose, `ended at ${prev}`);

  // ---------- ACT 5: trust-0 must count as 0 in the level ----------
  // Distinguishing case: all but two NPCs at trust 0, two at 100.
  // Correct avg = 200/n < 25 → closed. The old `|| 15` read 0 as 15 →
  // (15*(n-2)+200)/n ≥ 25 for n ≥ 11 → wrongly 'wary'.
  freshGame();
  const ids5 = npcIds();
  ids5.forEach((id, i) => { Game.state.village.trust[id] = i < 2 ? 100 : 0; });
  const lvl = Game.villageTrustLevel();
  console.log(`  trust [100,100,0,...]: level=${lvl} (correct: closed; old || 15 bug: wary)`);
  ok('trust-0 villagers count as 0, not 15', lvl === 'closed', lvl);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW', e && e.stack || e); process.exit(1); });
