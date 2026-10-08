#!/usr/bin/env node
// PROOF: per-fight brawler/hunter flag leaks (flesh-out loop 2026-10-07).
//
// Backlog: "per-fight flag leaks — rageActive, tradeOpen, debtSettled,
// shakeOffUsed (and siblings)". Audit finding:
//   - rageActive/tradeOpen/debtSettled/settleDebtBonus/braceActive/
//     shakeOffUsed/haymakerReady/haymakerOffBalance/fightDamageTaken were
//     already reset in startCombat (HEAD hygiene block).
//   - BUT the uprising fight (justice.js startVillageUprising) and the
//     party-betrayal fight (party.js startBetrayalCombat) build
//     this.tbfight DIRECTLY, bypassing startCombat — flags from fight N
//     (e.g. a rage with rounds left after a fast kill, a settled debt, a
//     used shake-off) leaked into those fights with real behavioral effect
//     (free +100% rage damage, Settle the Debt refused, Shake It Off
//     refused, dishonest fightDamageTaken ledger).
// Fix: extracted Game.resetPerFightFlags() (game.js); startCombat,
// startVillageUprising, and startBetrayalCombat all call it.
// fightRead and layWaitActive are intentionally NOT cleared (design:
// read_fight banks speed for the next fight; lay_wait holds for the next
// animal encounter) — the proof asserts they survive the reset.
//
// Proof per seed:
//   P1. startCombat clears every per-fight flag at fight start (the path
//       that was already fixed — regression lock).
//   P2. startVillageUprising clears them (the leak this fix closes).
//   P3. startBetrayalCombat clears them (the leak this fix closes).
//   P4. Flags are live mechanics, not dead: while set, once-per-fight
//       abilities genuinely refuse (so clearing them matters).
//   P5. After the reset the abilities are available again in the new
//       fight (action surface restored).
//   P6. Back-to-back fresh fights have identical flag snapshots.
//   P7. fightRead/layWaitActive survive (design-intent, not a leak).
//
// Run:  node scripts/test-brawler-fightflag-reset-20261007.js
//       SEED=2 node scripts/test-brawler-fightflag-reset-20261007.js
//   or: REPO_ROOT=/path/to/pristine/extract node scripts/...
//
// Exit code non-zero on ANY failure. Against PRE-fix HEAD this script
// FAILS P2/P3 (the leaks) and passes P1 (already wired) — run it against
// the pristine extract to see the before/after.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
const ROOT = process.env.REPO_ROOT || path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---- harness: full module list in index.html order, minus DOM-only modules ----
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global; // ONLY for eval — makes equipment.js load; deleted before play
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
for (const f of order) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); fail++; }
}
delete global.window; delete global.document; // sync combat path; async stub stalls
const Game = globalThis.Scattering.Game;

const says = [];
Game.say = (t) => { says.push(String(t)); };
function clearSays() { says.splice(0); }
function said(substr) { return says.some(t => t.includes(substr)); }

// Turn hygiene (AGENTS.md): strike/ability -> endTurn only if still player's
// turn; tbPlayerWait() already advances — never advance after it.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function endFight() { if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; } }

// Per-fight flags + their in-fight values. fightDamageTaken resets to 0,
// everything else must be absent at fight start.
const FLAG_KEYS = [
  'rageActive', 'tradeOpen', 'debtSettled', 'settleDebtBonus', 'braceActive',
  'shakeOffUsed', 'haymakerReady', 'haymakerOffBalance', 'fightDamageTaken',
  'aimBonus', 'deadAimShot', 'ambushReady', 'ignoreArmorNext', 'noDodgeNext', 'cleanShotReady',
];
function setAllFlags() {
  const s = Game.state.scholar;
  s.rageActive = { rounds: 2, dmgMult: 2.0 };       // rage with rounds left (fast kill)
  s.tradeOpen = { attacksLeft: 2, bonus: 0.5 };    // trade window mid-burn
  s.debtSettled = true; s.settleDebtBonus = 25;    // debt already settled
  s.braceActive = { reduce: 0.6 };                 // braced
  s.shakeOffUsed = true;                          // shake-off spent
  s.haymakerReady = { mult: 2.5, accPenalty: 0.3, offBalanceOnMiss: true };
  s.haymakerOffBalance = true;                    // whiffed last fight
  s.fightDamageTaken = 30;                        // dishonest ledger carryover
  s.aimBonus = 1; s.deadAimShot = { mult: 3 };     // hunter per-strike flags
  s.ambushReady = { mult: 2 };
  s.ignoreArmorNext = true; s.noDodgeNext = true; s.cleanShotReady = true;
}
function assertCleared(label) {
  const s = Game.state.scholar;
  for (const k of FLAG_KEYS) {
    if (k === 'fightDamageTaken') check(`${label}: ${k} reset to 0`, s[k] === 0, `got ${s[k]}`);
    else check(`${label}: ${k} cleared`, s[k] === undefined, `got ${JSON.stringify(s[k])}`);
  }
}
function flagSnapshot() {
  const s = Game.state.scholar;
  const o = {};
  for (const k of [...FLAG_KEYS, 'fightRead', 'layWaitActive']) {
    o[k] = (k in s) ? JSON.stringify(s[k]) : '<absent>';
  }
  return JSON.stringify(o);
}
function freshMonsterFight() {
  endFight();
  Game.startCombat('bulldozer');
  const f = Game.tbfight;
  check('monster fight started', !!f && !f.over && f.fighters.length > 1);
  const mk = f.fighters.find(x => x.kind === 'monster').key;
  // keep everyone on interior tiles (1..7); edges are the flee-by-barrier
  const pp = Game.tbFighter('p'); pp.mx = 4; pp.my = 4; pp.hp = 100; pp.maxHp = 100; pp.alive = true;
  const m = Game.tbFighter(mk); m.mx = 5; m.my = 4; m.hp = 500; m.maxHp = 500;
  const s = Game.state.scholar; s.health = 100; s.kcal = 3000;
  return mk;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  Game.state.weather = 'clear';
  // grant the brawler abilities under test (abilities live in s.abilities)
  s.abilities = s.abilities || [];
  for (const id of ['unbreakable', 'trade_of_blows', 'rage', 'haymaker']) {
    if (!s.abilities.some(a => a.id === id)) s.abilities.push({ id });
  }
  console.log(`seed ${SEED}, ${order.length} modules loaded`);

  // ---- P1: startCombat path (regression lock — already wired at HEAD) ----
  console.log('P1. monster fight (startCombat) clears per-fight flags');
  let mk = freshMonsterFight();
  const snap1 = flagSnapshot();
  check('fresh fight starts clean', FLAG_KEYS.every(k => k === 'fightDamageTaken' ? s[k] === 0 : s[k] === undefined));
  // playable: one real strike as a player, then a clean endTurn
  Game.tbPlayerStrike(mk); endTurn();
  check('fight still live after a real strike+endTurn', !!Game.tbfight && !Game.tbfight.over);

  // P4: flags are live mechanics — once-per-fight abilities refuse while set
  console.log('P4. flags are live mechanics (refusals while set)');
  setAllFlags();
  clearSays();
  const shakeRefused = Game.useAbility('unbreakable', 'shake_off');
  check('shake_off refuses while shakeOffUsed', shakeRefused === false && said('already shaken off'), says.join(' | ').slice(0, 120));
  clearSays();
  const debtRefused = Game.useAbility('trade_of_blows', 'settle_debt');
  check('settle_debt refuses while debtSettled', debtRefused === false && said("debt's already settled"), says.join(' | ').slice(0, 120));

  // P1b: new monster fight clears everything again
  console.log('P1b. back-to-back monster fight resets flags');
  mk = freshMonsterFight();
  assertCleared('startCombat');
  check('snapshots identical across back-to-back fresh fights', flagSnapshot() === snap1);

  // P5: action surface restored in the new fight
  console.log('P5. abilities available again after reset');
  clearSays();
  const shakeOk = Game.useAbility('unbreakable', 'shake_off');
  check('shake_off usable in new fight', shakeOk === true, says.join(' | ').slice(0, 120));
  s.fightDamageTaken = 10; // real damage taken this fight
  clearSays();
  const debtOk = Game.useAbility('trade_of_blows', 'settle_debt');
  check('settle_debt usable with fresh ledger', debtOk === true && s.debtSettled === true && s.settleDebtBonus === 5,
    `debtSettled=${s.debtSettled} bonus=${s.settleDebtBonus}`);

  // P7: design-intent persistence survives the reset
  console.log('P7. fightRead/layWaitActive survive (design, not a leak)');
  s.fightRead = { speedBonus: 2 };
  s.layWaitActive = true;
  mk = freshMonsterFight();
  check('fightRead survives startCombat', JSON.stringify(s.fightRead) === '{"speedBonus":2}', JSON.stringify(s.fightRead));
  check('layWaitActive survives startCombat', s.layWaitActive === true);
  delete s.fightRead; s.layWaitActive = false; // tidy for later assertions

  // ---- P2: uprising path (THE LEAK this fix closes) ----
  console.log('P2. uprising fight (startVillageUprising) clears per-fight flags');
  setAllFlags();
  endFight();
  let up = null;
  try { up = Game.startVillageUprising('flag hygiene proof'); } catch (e) { console.log(`  UPRISING THREW: ${e.message}`); }
  check('uprising fight started', !!Game.tbfight && !Game.tbfight.over && Game.tbfight.uprising === true);
  assertCleared('startVillageUprising');

  // ---- P3: party-betrayal path (THE LEAK this fix closes) ----
  console.log('P3. betrayal fight (startBetrayalCombat) clears per-fight flags');
  setAllFlags();
  endFight();
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  check('have a betrayal victim', !!vid, `vid=${vid}`);
  let bet = null;
  try { bet = Game.startBetrayalCombat(vid, {}); } catch (e) { console.log(`  BETRAYAL THREW: ${e.message}`); }
  check('betrayal fight started', !!Game.tbfight && !Game.tbfight.over && Game.tbfight.betrayal === true);
  assertCleared('startBetrayalCombat');
  endFight();

  console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS THREW:', e); process.exit(2); });
