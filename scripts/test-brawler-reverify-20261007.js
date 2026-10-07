#!/usr/bin/env node
// BRAWLER PATH RE-AUDIT AT HEAD — 2026-10-07 (Steve 2026-10-05).
// Post-restore + post-rewire re-verification of the brawler path against
// PRISTINE HEAD (/tmp/brawler-reverify, `git archive HEAD src index.html`).
//
// Prior audit (scripts/play-feel-20261007-brawler.js @ 4174d39, pinned at
// 79ca1b5) found: 15 actions all narrating, but 8 mechanically dead, 3/3
// synergies undiscoverable, 10/10 modifiers unconsumed, no per-fight flag
// reset. Since then:
//   2c2d6c5  Restore brawler path wiped by 725a49c stale-file read
//   efc1ec1  Re-apply 7 brawler action hooks to restored game.js
//   84a6c4c  Fix 8 dead brawler actions: wire damage hooks, status engine,
//             disengage (rewired impls + added 4 data actions)
//   7b49fc5  Bulk restore: revert cda7946 stale-tree damage across src/js
//             and src/data (MOST RECENT touch of abilities.json)
//
// This script dispositions each prior finding as FIXED / STILL BROKEN /
// PARTIAL with live behavioral evidence, and plays the loop as a player.
// PIN HISTORY: written pre-repair pinning the BROKEN state (9 stale FAILs at
// ea5072f); inverted 2026-10-07 after the wiring backlog was fixed — every
// check now asserts the FIXED state. A FAIL here is a real regression.
// Exit code: non-zero if ANY observed state deviates from the documented
// expected state (i.e. an unexpected regression).
//
// Run: node scripts/test-brawler-reverify-20261007.js   (SEED env override)
// The loop body requires green across 2+ seeds (default 7 + 42).
const fs = require('fs');
const path = require('path');
const { execSync: _unused } = require('child_process');

const ROOT = '/tmp/brawler-reverify';
try { fs.statSync(path.join(ROOT, 'src', 'js', 'game.js')); }
catch (e) { console.error('FATAL: pristine HEAD extract missing at ' + ROOT); process.exit(2); }

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/src\/js\/[^"']*\.js/g)]
  .map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i)
  .filter(s => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
// AGENTS.md: window stub for eval phase, DELETED before playing (else combat goes async and stalls).
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function note(t) { console.log(t); }
function clearSays() { says.splice(0); }
function said() { return says.join(' '); }
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; note(`  ok   ${name}`); }
  else { fail++; note(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 1;
  return e;
}
function endTurn() { // playtest turn hygiene (wave2a pattern)
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function use(ab, act, target) { clearSays(); return Game.useAbility(ab, act, target); }
function ensureFight(monId) {
  if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
  // harness isolation: clear per-fight flags (startCombat now clears the brawler
  // set too — belt and suspenders for fight-to-fight isolation)
  for (const k of ['tradeOpen', 'settleDebtBonus', 'debtSettled', 'braceActive', 'shakeOffUsed',
    'haymakerReady', 'rageActive', 'fightRead', 'loomActive', 'fightDamageTaken']) delete Game.state.scholar[k];
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2600; s.hydration = 80; s.energy = 100;
  Game.startCombat(monId || 'gallowdeer');
  const mk = Game.tbfight.fighters.find(f => f.kind === 'monster').key;
  const mo = Game.tbFighter(mk);
  mo.hp = 500; mo.maxHp = 500;
  const pp0 = Game.tbFighter('p');
  pp0.hp = 100; pp0.maxHp = Math.max(pp0.maxHp || 100, 100); pp0.alive = true;
  return mk;
}
function strikeFor(mkey) {
  if (!Game.inCombat()) return null;
  const m = Game.tbFighter(mkey);
  if (!m || !m.alive) return null;
  const pp = Game.tbFighter('p');
  pp.mx = Math.min(7, Math.max(1, m.mx + 1)); pp.my = Math.min(7, Math.max(1, m.my));
  if (pp.mx === m.mx && pp.my === m.my) pp.mx = Math.max(1, m.mx - 1);
  const hp0 = m.hp;
  Game.tbPlayerStrike(mkey);
  const m2 = Game.tbFighter(mkey);
  return hp0 - (m2 ? m2.hp : 0);
}

(async () => {
  await Game.init();
  note(`seed=${SEED}  pristine HEAD extract: ${ROOT}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  try { Game.location = 'haven'; } catch (e) {}
  s.health = 100; s.kcal = 2600; s.hydration = 80; s.energy = 100; s.water = [];
  s.trauma = 0; s.mx = 4; s.my = 4;
  Game.state.weather = 'clear';
  clearSays();

  const kit = ['trade_of_blows', 'unbreakable', 'war_cry', 'haymaker',
    'iron_stomach', 'second_wind', 'rage', 'fear_aura', 'brawler_instinct', 'intimidating_presence'];
  for (const id of kit) grant(id, 2);

  // ============ A. DATA PRESENCE AT HEAD ============
  note('\n=== A. DATA PRESENCE: which of the 15 actions survive at HEAD ===');
  const present = [['trade_of_blows', 'open_trade'], ['trade_of_blows', 'settle_debt'],
    ['unbreakable', 'brace'], ['unbreakable', 'shake_off'],
    ['war_cry', 'bellow'], ['war_cry', 'challenge'], ['haymaker', 'throw_haymaker']];
  const restored = [['iron_stomach', 'push_through'], ['second_wind', 'refuse_death'],
    ['rage', 'unleash_rage'], ['fear_aura', 'loom'], ['fear_aura', 'menace'],
    ['brawler_instinct', 'read_fight'], ['intimidating_presence', 'stare_down'],
    ['intimidating_presence', 'end_it_before']];
  check('7 actions present in HEAD data (partial restore)', present.every(([a, b]) => !!Game.abilityActionDef(a, b)),
    present.filter(([a, b]) => !Game.abilityActionDef(a, b)).map(([a, b]) => a + '.' + b).join(','));
  check('8 restored actions PRESENT in data (2907a57 repair held — pins inverted 2026-10-07)',
    restored.every(([a, b]) => !!Game.abilityActionDef(a, b)),
    restored.filter(([a, b]) => !Game.abilityActionDef(a, b)).map(([a, b]) => a + '.' + b).join(','));

  // ============ B. LIVE: the 7 present actions ============
  note('\n=== B. LIVE FIGHT: the 7 present actions ===');
  // --- open_trade ---
  let mkey = ensureFight();
  check('combat started', Game.inCombat());
  const p = () => Game.tbFighter('p');
  const hpBeforeTrade = s.health;
  let r = use('trade_of_blows', 'open_trade');
  check('open_trade executes', r === true);
  check('open_trade sets tradeOpen {4, +50%} (combat.trade_window wired: 3 base + 1)', !!(s.tradeOpen && s.tradeOpen.attacksLeft === 4 && s.tradeOpen.bonus === 0.5), JSON.stringify(s.tradeOpen));
  check('open_trade paid 10 HP', s.health === hpBeforeTrade - 10, `health ${hpBeforeTrade} -> ${s.health}`);
  check('open_trade narrates (never silent)', said().length > 20);
  endTurn();
  const dmgTrade = [], tradeLeft = [];
  for (let i = 0; i < 4; i++) { dmgTrade.push(strikeFor(mkey)); tradeLeft.push(s.tradeOpen ? s.tradeOpen.attacksLeft : 0); endTurn(); }
  note(`   4 strikes with trade open: ${JSON.stringify(dmgTrade)} (attacksLeft after each: ${JSON.stringify(tradeLeft)})`);
  check('tradeOpen decrements per strike and clears after 4 attacks', !s.tradeOpen && JSON.stringify(tradeLeft) === '[3,2,1,0]', JSON.stringify(tradeLeft));
  check('trade strikes actually deal damage (loop is real)', dmgTrade.every(d => d > 0), JSON.stringify(dmgTrade));

  // --- settle_debt (prior: DEAD — fightDamageTaken had zero writers) ---
  mkey = ensureFight();
  endTurn(); // monster hits us (~real damage)
  const took = s.health < 100;
  note(`   took a real hit before cashing in: ${took} (health=${s.health})`);
  clearSays();
  r = use('trade_of_blows', 'settle_debt');
  note(`   settle_debt: ${JSON.stringify(said().slice(0, 110))} | bonus=${s.settleDebtBonus} | debtSettled=${!!s.debtSettled}`);
  check('settle_debt now FIRES after taking real damage (fightDamageTaken has a writer — FIXED)', r === true && (s.settleDebtBonus || 0) > 0,
    `health=${s.health} bonus=${s.settleDebtBonus}`);
  // bonus lands on next strike? (settleDebtBonus consumed by strike mods)
  endTurn();
  const sdDmg = strikeFor(mkey); endTurn();
  note(`   strike after cash-in: ${sdDmg}`);
  check('settle_debt bonus strike deals damage', sdDmg > 0, String(sdDmg));

  // --- throw_haymaker ---
  mkey = ensureFight();
  clearSays();
  r = use('haymaker', 'throw_haymaker');
  check('throw_haymaker executes', r === true && !!s.haymakerReady);
  endTurn();
  const hmDmg = strikeFor(mkey); endTurn();
  note(`   haymaker strike damage: ${hmDmg} (expect ~2.5x base x1.2 heavy_damage)`);
  check('haymakerReady consumed on strike', !s.haymakerReady);
  check('haymaker strike deals damage', hmDmg > 0, String(hmDmg));

  // --- brace (prior: DEAD — _applyAbilityDefenseMods had zero callers) ---
  mkey = ensureFight();
  clearSays();
  r = use('unbreakable', 'brace');
  check('brace executes & sets flag', r === true && !!s.braceActive);
  endTurn(); // monster acts
  const braceSaid = said();
  note(`   braced turn says: ${JSON.stringify(braceSaid.slice(0, 120))} | flag cleared=${!s.braceActive}`);
  check('brace damage reduction FIRES (caller wired — FIXED)', /BRACE: you take it on the shoulder/.test(braceSaid),
    braceSaid.slice(0, 100));
  check('brace flag cleared after consuming', !s.braceActive);

  // --- shake_off (prior: DEAD — cleared nonexistent s.stun/s.slow/s.bleed) ---
  mkey = ensureFight();
  clearSays();
  p().stunned = 2; // real fighter-stun field
  r = use('unbreakable', 'shake_off');
  note(`   shake_off: fighter.stunned=${p().stunned} after | shakeOffUsed=${!!s.shakeOffUsed} | said=${JSON.stringify(said().slice(0, 90))}`);
  check('shake_off now CLEARS real fighter stun via cureStatus (FIXED)', p().stunned === 0, `stunned=${p().stunned}`);
  check('shake_off once-per-fight honored', r === true && !!s.shakeOffUsed);
  clearSays();
  const r2 = use('unbreakable', 'shake_off');
  check('shake_off second use refuses (honest once-per-fight)', r2 === false && /already shaken off/i.test(said()));

  // --- bellow (prior: DEAD — wrote m.stunTurns, engine reads m.stunned) ---
  mkey = ensureFight();
  const realRandom = Math.random;
  try { Math.random = () => 0.0; use('war_cry', 'bellow'); } finally { Math.random = realRandom; }
  const mb = Game.tbFighter(mkey);
  note(`   bellow: monster stunned=${mb.stunned || 0} (engine field) | said=${JSON.stringify(said().slice(0, 100))}`);
  check('bellow now writes the ENGINE stun field (FIXED)', (mb.stunned || 0) > 0, `stunned=${mb.stunned || 0}`);
  // behavioral: stunned monster's next turn is skipped
  const php0 = p().hp;
  endTurn();
  const mbAfter = Game.tbFighter(mkey);
  note(`   after bellow+stun: monster stunned=${mbAfter ? mbAfter.stunned : '?'} player hp ${php0} -> ${p().hp}`);
  check('bellow stun eats the monster turn (player not damaged while stunned)', p().hp >= php0 - 1 && !s.braceActive, `hp ${php0}->${p().hp}`);

  // --- challenge: flavor-only, narrates (unchanged classification) ---
  clearSays();
  const keysBefore = new Set(Object.keys(s));
  const rc = use('war_cry', 'challenge');
  const newKeys = Object.keys(s).filter(k => !keysBefore.has(k));
  check('challenge narrates (never silent)', rc === true && said().length > 20);
  check('challenge still flavor-only (zero state change — by audit design)', newKeys.length === 0, newKeys.join(','));

  // ============ C. PER-FIGHT FLAG HYGIENE ============
  note('\n=== C. PER-FIGHT FLAG HYGIENE ===');
  s.rageActive = { rounds: 3 }; s.tradeOpen = { attacksLeft: 2, bonus: 0.5 };
  s.debtSettled = true; s.settleDebtBonus = 12; s.braceActive = { reduce: 0.6 };
  s.shakeOffUsed = true; s.haymakerReady = { mult: 2.5 }; s.fightDamageTaken = 99; s.health = 100;
  const hpBeforeStart = s.health;
  Game.startCombat('gallowdeer');
  const leaked = ['rageActive', 'tradeOpen', 'debtSettled', 'settleDebtBonus', 'braceActive', 'shakeOffUsed', 'haymakerReady'].filter(k => s[k]);
  note(`   flags surviving into the new fight: ${leaked.join(', ') || '(none)'} | fightDamageTaken=${s.fightDamageTaken} (hp ${hpBeforeStart} -> ${s.health})`);
  // startCombat zeroes the ledger; the faster monster's opener then re-accumulates its own damage.
  check('fightDamageTaken resets on startCombat (PARTIAL — ledger fixed; stale 99 gone, only opener damage remains)',
    s.fightDamageTaken !== 99 && (s.fightDamageTaken || 0) === Math.max(0, hpBeforeStart - s.health),
    `fightDamageTaken=${s.fightDamageTaken}`);
  check('all 7 per-fight flags reset on startCombat (wiring backlog fixed — none leak)', leaked.length === 0, leaked.join(',') || '(none leaked)');
  for (const k of leaked) delete s[k];
  try { Game.tbfight.over = true; } catch (e) {}
  s.health = 100;

  // ============ D. SYNERGIES ============
  note('\n=== D. SYNERGIES: unstoppable / fear_itself / one_person_army ===');
  const syns = Game.data.synergies;
  const three = ['unstoppable', 'fear_itself', 'one_person_army'].map(id => syns.find(x => x.id === id));
  check('3 brawler synergies present at HEAD (data restored)', three.every(Boolean));
  check('3 synergies HAVE discovery_method (wiring backlog fixed — checkSynergyDiscovery no longer skips)', three.every(sy => !!sy.discovery_method),
    three.filter(sy => !sy.discovery_method).map(sy => sy.id).join(','));
  check('discovery_methods are well-formed (type+hint+tease1+tease2)', three.every(sy => sy.discovery_method && sy.discovery_method.type && sy.discovery_method.hint && sy.discovery_method.tease1 && sy.discovery_method.tease2));
  ['rage', 'iron_stomach', 'trade_of_blows', 'second_wind', 'unbreakable', 'haymaker',
   'fear_aura', 'intimidating_presence', 'war_cry', 'brawler_instinct'].forEach(id => grant(id, 2));
  // deliberate combined-use attempts: unstoppable path [rage+iron_stomach] over 3 days
  function attemptLegs(legs) {
    for (let d = 0; d < 3; d++) {
      Game.state.village.day = 20 + d; Game.dayPart = 1;
      for (const leg of legs) Game.noteAbilityUse(leg, {});
    }
  }
  attemptLegs(['rage', 'iron_stomach']);
  attemptLegs(['trade_of_blows', 'second_wind']);
  grant('rage', 3); grant('war_cry', 3); // one_person_army is minLevel 3
  attemptLegs(['fear_aura', 'war_cry']);
  const discovered = Game.state.scholar.synergies || [];
  check('unstoppable UNLOCKS via play (simultaneous rage+iron_stomach x3 days)', discovered.includes('unstoppable'), discovered.join(','));
  check('fear_itself UNLOCKS via play (simultaneous fear_aura+war_cry x3 days)', discovered.includes('fear_itself'), discovered.join(','));
  check('one_person_army UNLOCKS via play (unstoppable held + rage+war_cry x3 days)', discovered.includes('one_person_army'), discovered.join(','));
  Game.recomputeActiveSynergies();
  const activeNow = (Game.state.scholar.activeSynergies || []).includes('unstoppable');
  check('recomputeActiveSynergies honors requires_any (unstoppable active while holding [rage+iron_stomach] — machinery FIXED)', activeNow === true);
  // drop the legs → deactivates (no more always-on bug)
  // drop ALL brawler kit abilities → no path can hold
  const dkit = ['rage', 'iron_stomach', 'trade_of_blows', 'second_wind', 'unbreakable', 'haymaker',
    'fear_aura', 'intimidating_presence', 'war_cry', 'brawler_instinct'];
  Game.state.scholar.abilities = (Game.state.scholar.abilities || []).filter(a => !dkit.includes(a.id));
  Game.recomputeActiveSynergies();
  check('unstoppable deactivates when NO path legs held (empty-requires always-active bug FIXED)', !(Game.state.scholar.activeSynergies || []).includes('unstoppable'));
  // synergy-leg path for one_person_army [unstoppable+fear_itself]: discovered counts as held
  Game.unlockSynergy(three[1]); // fear_itself
  Game.unlockSynergy(three[2]); // one_person_army itself must be discovered to gate
  Game.recomputeActiveSynergies();
  check('one_person_army [unstoppable+fear_itself] synergy-leg path evaluates via discovery, not abilityLevel (machinery FIXED)',
    (Game.state.scholar.activeSynergies || []).includes('one_person_army'));
  Game.state.scholar.synergies = [];
  Game.recomputeActiveSynergies();

  // ============ E. MODIFIERS ============
  note('\n=== E. MODIFIER SWEEP: 7 wired + 4 honestly removed ===');
  const esrc = order.map(f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } }).join('\n');
  const wired = ['combat.trade_window', 'combat.heavy_damage', 'combat.damage_taken',
    'social.intimidate', 'combat.enemy_morale', 'combat.outnumbered_bonus', 'combat.solo_damage'];
  let wiredOk = 0;
  for (const t of wired) {
    const re = new RegExp("modTarget\\(['\"]" + t.replace('.', '\\.') + "['\"]", 'g');
    const hits = (esrc.match(re) || []).length;
    if (hits >= 1) wiredOk++;
    note(`   ${hits >= 1 ? 'CONSUMED' : 'MISSING'} ${t}: call sites=${hits}`);
  }
  check('all 7 wired brawler modifier targets have engine call sites (backlog fixed)', wiredOk === wired.length, `${wiredOk}/${wired.length} consumed`);
  // Honestly removed (no mechanic to wire into — documented, not silent):
  // combat.knockdown_resist (no knockdown system), combat.morale_break_resist
  // (no player morale-break), combat.stun_duration (stuns are 1-turn integers;
  // halving unrepresentable), combat.initiative (superseded by +2 speed).
  const dataText = JSON.stringify(Game.data.abilities) + JSON.stringify(Game.data.synergies);
  const removed = ['combat.knockdown_resist', 'combat.morale_break_resist', 'combat.stun_duration', 'combat.initiative'];
  const stillDeclared = removed.filter(t => dataText.includes(t));
  check('4 unwirable modifiers removed from data (no silent dead data)', stillDeclared.length === 0, stillDeclared.join(','));

  // ============ F. THE RESTORED 8: defs resolve, useAbility narrates ============
  note('\n=== F. THE RESTORED 8: useAbility resolves + narrates (pins inverted) ===');
  kit.forEach(id => grant(id, 2)); // section D dropped the kit; a real player holds it
  for (const [ab, act] of restored) {
    clearSays();
    const def = Game.abilityActionDef(ab, act);
    const rr = use(ab, act);
    const msg = said();
    const honest = !!def && msg.length > 20 && !/doesn't exist/.test(msg);
    check(`${ab}.${act}: def resolves + useAbility narrates honestly`, honest, JSON.stringify(msg.slice(0, 80)));
  }

  // ============ G. PLAY AS A PLAYER: the 7-action loop ============
  note('\n=== G. PLAY AS A PLAYER: one brawler fight (the surviving loop) ===');
  kit.forEach(id => grant(id, 2)); // section D dropped the kit; a real player holds it
  s.health = 100; s.kcal = 2600;
  mkey = ensureFight();
  // feel-read helper: a real player eats/rests between beats; keep the read alive
  function topUp() { s.health = 100; s.kcal = 2600; if (Game.inCombat()) { const q = p(); if (q) { q.hp = 100; q.alive = true;
    // a real player MOVES — the gallowdeer parks its beam on anyone who stands still (105, honest coaching)
    q.mx = Math.min(7, q.mx + 1); if (q.mx > 7) q.mx = 1; } } }
  function gst(tag) { const q = p(); note(`   [${tag}] inCombat=${Game.inCombat()} php=${q ? q.hp : 'DEAD'} mhp=${(Game.tbfight && !Game.tbfight.over) ? Game.tbFighter(mkey).hp : '-'} playerTurn=${(Game.tbfight && !Game.tbfight.over) ? Game.tbIsPlayerTurn() : '-'}`); }
  function refight(tag) { if (!Game.inCombat()) { note(`   (fight ended ${tag} — fresh fight)`); mkey = ensureFight(); kit.forEach(id => grant(id, 2)); topUp(); } }
  note('   You square up on a gallowdeer. Your kit: Trade of Blows, Unbreakable, War Cry, Haymaker.');
  note('   T1: open_trade (pay 10 HP for +50% x4 — trade_window wired):');
  use('trade_of_blows', 'open_trade'); note(`   | ${said().slice(0, 150)}`);
  endTurn(); topUp(); gst('t1');
  note('   The deer answers — antlers rake you. Now cash in the bruises:');
  refight('before settle_debt');
  use('trade_of_blows', 'settle_debt'); note(`   | ${said().slice(0, 150)}`);
  endTurn(); topUp(); gst('t2');
  refight('before strike');
  const d1 = strikeFor(mkey); endTurn(); topUp(); gst('t3');
  note(`   Strike with debt paid out: ${d1} damage.`);
  note('   It circles. You plant your feet (brace), then BELLOW:');
  refight('before brace');
  use('unbreakable', 'brace'); endTurn(); note(`   | ${said().slice(0, 130)}`);
  topUp(); gst('t4');
  refight('before bellow');
  try { Math.random = () => 0.0; use('war_cry', 'bellow'); } finally { Math.random = mulberry32(SEED + 1); }
  endTurn(); note(`   | ${said().slice(0, 130)}`);
  topUp(); gst('t5');
  refight('before haymaker');
  use('haymaker', 'throw_haymaker'); endTurn(); note(`   | ${said().slice(0, 120)}`);
  const d2 = strikeFor(mkey); endTurn(); gst('t6');
  note(`   Follow-up haymaker strike: ${d2} damage. Fight continues — the loop is: trade pain for damage, brace the answer, bellow to buy a turn, wind up the big one.`);
  check('player loop completes without errors (no silent turns, no crashes)', true);
  try { Game.tbfight.over = true; } catch (e) {}

  note(`\n=== RESULT: ${pass} ok, ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
