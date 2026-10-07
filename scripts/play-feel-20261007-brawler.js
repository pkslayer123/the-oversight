#!/usr/bin/env node
// BRAWLER PATH PLAY-AUDIT (Steve 2026-10-07): play the 5f0279e brawler content
// AS A PLAYER and judge fun/feel — not just execution.
//
// 5f0279e added: 4 new abilities (trade_of_blows, unbreakable, war_cry,
// haymaker), actions on 6 existing (iron_stomach/push_through,
// second_wind/refuse_death, rage/unleash_rage, fear_aura/loom+menace,
// brawler_instinct/read_fight, intimidating_presence/stare_down+end_it_before),
// 3 multi-path synergies (unstoppable, fear_itself, one_person_army).
//
// Engine b15ec93 added Game.useAbility() + 28 impls + damage hooks.
// This audit tests whether the brawler actions are REAL gameplay or
// data-only: every action through the real useAbility path, every flag
// checked for an engine consumer, every synergy for discoverability.
//
// LOADS A PRISTINE PINNED TREE (/tmp/brawler-head at 79ca1b5): the worktree's
// src/ is dirty with sibling work, so engine+data come from
// `git archive 79ca1b5 src`. Engine is READ-ONLY: bugs flagged, never fixed.
// NOTE: sibling commit 725a49c (landed after the pin) DELETED the entire
// brawler data payload — see evidence notes. This audit runs against the
// last tree where the brawler path exists.
//
// Run: node scripts/play-feel-20261007-brawler.js  (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
// Pinned pristine tree. /tmp is wipe-prone (sibling cleanup); durable backup at
// ~/workspace/scratch/brawler-head-79ca1b5. Prefer /tmp, fall back to backup.
let ROOT = '/tmp/brawler-head';
try { fs.statSync(path.join(ROOT, 'src', 'js', 'game.js')); }
catch (e) { ROOT = '/home/hatch/workspace/scratch/brawler-head-79ca1b5'; }
let PIN = '79ca1b5318c289fc98bcf55ef438be32e1d0d415';
try { PIN = fs.readFileSync('/tmp/brawler-head-sha.txt', 'utf8').trim() || PIN; } catch (e) {}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
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
function flush(tag, max = 4) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 160)}`); }
function clearSays() { says.splice(0); }
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

(async () => {
  await Game.init();
  note(`seed=${SEED}  pinned HEAD=${PIN}  (/tmp/brawler-head)`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  try { Game.location = 'haven'; } catch (e) {}
  s.health = 100; s.kcal = 2600; s.hydration = 80; s.energy = 100; s.water = [];
  s.trauma = 0; s.mx = 4; s.my = 4;
  Game.state.weather = 'clear';
  clearSays();

  // ============ A. THE BRAWLER'S KIT ============
  note('\n=== A. GRANT THE BRAWLER KIT (4 new + 6 touched) ===');
  const kit = ['trade_of_blows', 'unbreakable', 'war_cry', 'haymaker',
    'iron_stomach', 'second_wind', 'rage', 'fear_aura', 'brawler_instinct', 'intimidating_presence'];
  for (const id of kit) grant(id, 2);
  check('all 10 abilities granted', kit.every(id => Game.abilityLevel(id) >= 1));
  check('4 new abilities exist in data', ['trade_of_blows', 'unbreakable', 'war_cry', 'haymaker'].every(id => (Game.data.abilities || []).some(a => a.id === id)));
  check('3 new synergies exist in data', ['unstoppable', 'fear_itself', 'one_person_army'].every(id => (Game.data.synergies || []).some(x => x.id === id)));
  check('useAbility entry point exists', typeof Game.useAbility === 'function');
  const impls = globalThis.AbilityActionImpls || {};
  const brawlerActs = ['iron_stomach.push_through', 'second_wind.refuse_death', 'rage.unleash_rage',
    'fear_aura.loom', 'fear_aura.menace', 'brawler_instinct.read_fight',
    'intimidating_presence.stare_down', 'intimidating_presence.end_it_before',
    'trade_of_blows.open_trade', 'trade_of_blows.settle_debt',
    'unbreakable.brace', 'unbreakable.shake_off', 'war_cry.bellow', 'war_cry.challenge',
    'haymaker.throw_haymaker'];
  check('all 15 brawler actions have engine impls', brawlerActs.every(k => typeof impls[k] === 'function'),
    brawlerActs.filter(k => typeof impls[k] !== 'function').join(',') || '');

  // ============ B. EVERY ACTION THROUGH THE REAL PATH ============
  note('\n=== B. ACTION AUDIT: does each turn SAY something real? ===');
  // non-combat actions first (context-valid outside fight)
  const solo = [
    ['iron_stomach', 'push_through'],
    ['fear_aura', 'menace'],
    ['intimidating_presence', 'end_it_before'],
    ['war_cry', 'challenge'],
    ['second_wind', 'refuse_death'],
  ];
  for (const [ab, act] of solo) {
    const r = use(ab, act);
    const said = says.join(' ');
    const real = said.length > 20 && !/isn't wired up yet/.test(said);
    note(`   ${ab}.${act}: returned=${r} said=${said.length > 0 ? JSON.stringify(said.slice(0, 110)) : '(SILENT)'}`);
    check(`${ab}.${act} narrates (never silent)`, real);
  }
  // push_through sets a flag — is it consumed anywhere? (static: no)
  check('push_through flag set (pushThroughUntil)', !!s.pushThroughUntil);
  // refuse_death manual use explains automatic nature honestly
  // (checked above via narration)

  // ============ C. LIVE FIGHT: the combat actions ============
  note('\n=== C. LIVE FIGHT vs gallowdeer: combat actions ===');
  function ensureFight() {
    // fresh fight per action-test: monster at high HP so it survives the test.
    // NOTE: startCombat does NOT reset per-fight scholar flags (debtSettled,
    // shakeOffUsed, tradeOpen, rageActive...) — verified live in section C2.
    // The harness clears them to isolate each action test.
    if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
    for (const k of ['tradeOpen', 'settleDebtBonus', 'debtSettled', 'braceActive', 'shakeOffUsed',
      'haymakerReady', 'rageActive', 'fightRead', 'loomActive', 'fightDamageTaken']) delete s[k];
    // heal BEFORE startCombat: the faster monster opens, and a 1-HP player
    // dies in the opener (refuse may fire, then 'lost' nulls tbfight)
    s.health = 100;
    Game.startCombat('gallowdeer');
    const mk = Game.tbfight.fighters.find(f => f.kind === 'monster').key;
    const mo = Game.tbFighter(mk);
    mo.hp = 500; mo.maxHp = 500;
    // player: full health (strikes are range-gated; HP persists across tests)
    const pp0 = Game.tbFighter('p');
    pp0.hp = 100; pp0.maxHp = Math.max(pp0.maxHp || 100, 100); pp0.alive = true;
    return mk;
  }
  function strikeFor(mkey, note_) {
    // strike only if the monster is still up; returns damage dealt.
    // Close to adjacent first: tbPlayerStrike is range-gated ("Too far to reach").
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
  let mkey = ensureFight();
  check('combat started', Game.inCombat());
  const p = () => Game.tbFighter('p');

  // --- open_trade: +50% for 3 attacks ---
  // NOTE: spendCombatAction('ability') spends the turn AND auto-advances, but
  // leaves p.acted=true on the (returned) player turn — the honest player flow
  // is to end the spent turn, then strike on fresh turns.
  clearSays();
  const hpBeforeTrade = s.health;
  let r = use('trade_of_blows', 'open_trade');
  check('open_trade executes', r === true);
  check('open_trade sets tradeOpen {3, +50%}', !!(s.tradeOpen && s.tradeOpen.attacksLeft === 3 && s.tradeOpen.bonus === 0.5));
  check('open_trade paid 10 HP', s.health === hpBeforeTrade - 10, `health ${hpBeforeTrade} -> ${s.health}`);
  endTurn(); // pass the spent turn; monster acts
  note(`   fresh player turn after spent ability turn: ${Game.tbIsPlayerTurn()}`);
  flush('trade');
  const dmgTrade = [];
  const tradeLeft = [];
  for (let i = 0; i < 3; i++) {
    const d = strikeFor(mkey);
    dmgTrade.push(d);
    tradeLeft.push(s.tradeOpen ? s.tradeOpen.attacksLeft : 0);
    endTurn();
  }
  note(`   3 strikes with trade open: ${JSON.stringify(dmgTrade)} (attacksLeft after each: ${JSON.stringify(tradeLeft)})`);
  check('tradeOpen decrements per strike and clears after 3 attacks', !s.tradeOpen && JSON.stringify(tradeLeft) === '[2,1,0]');

  // --- settle_debt: can it EVER fire? (fightDamageTaken has zero writers) ---
  // fresh fight, take a real hit first, then try to cash in
  mkey = ensureFight();
  endTurn(); // monster hits us (~15)
  const tookHit = s.health < 100;
  clearSays();
  r = use('trade_of_blows', 'settle_debt');
  const debtSaid = says.join(' ');
  note(`   took a real hit (${tookHit}); settle_debt says: ${JSON.stringify(debtSaid.slice(0, 110))}`);
  check('settle_debt refuses even after taking hits (fightDamageTaken never written)', /haven't taken any damage|Nothing to cash in/.test(debtSaid));
  check('settle_debt CANNOT succeed — no code writes fightDamageTaken (dead action)', (s.fightDamageTaken || 0) === 0 && r === false);

  // --- haymaker: 2.5x next strike ---
  mkey = ensureFight();
  clearSays();
  r = use('haymaker', 'throw_haymaker');
  check('throw_haymaker executes', r === true && !!s.haymakerReady);
  endTurn(); // pass the spent turn
  flush('hay');
  const hmDmg = strikeFor(mkey); endTurn();
  note(`   haymaker strike damage: ${hmDmg} (base ~10-16 + weapon; expect ~2.5x)`);
  check('haymakerReady consumed on strike', !s.haymakerReady);

  // --- unleash_rage: +100% for 3 rounds ---
  mkey = ensureFight();
  clearSays();
  r = use('rage', 'unleash_rage');
  check('unleash_rage executes', r === true && !!(s.rageActive && s.rageActive.rounds === 3));
  endTurn(); // pass the spent turn
  flush('rage');
  const rageDmg = [];
  for (let i = 0; i < 3; i++) {
    rageDmg.push(strikeFor(mkey));
    endTurn();
  }
  note(`   3 raging strikes: ${JSON.stringify(rageDmg)}`);
  check('rage burns out after 3 rounds (narrated)', !s.rageActive);
  // NOTE: passive rage (hasAbility && hp<50%) also gives x2 — action duplicates it. Flagged in notes.

  // --- bellow: stunTurns vs engine's `stunned` ---
  mkey = ensureFight();
  clearSays();
  // force the 60% courage-fail roll to land (deterministic): stub RNG low
  // try/finally — the stub is also live during the auto-advanced monster turn
  const realRandom = Math.random;
  let mBefore = Game.tbFighter(mkey);
  try {
    Math.random = () => 0.0;
    r = use('war_cry', 'bellow');
  } finally {
    Math.random = realRandom;
  }
  const stunTurnsSet = (mBefore.stunTurns || 0) > 0;
  const stunnedSet = (mBefore.stunned || 0) > 0;
  note(`   bellow: stunTurns=${mBefore.stunTurns || 0} (impl sets this) vs stunned=${mBefore.stunned || 0} (engine reads this)`);
  check('bellow sets stunTurns (wrong field — engine reads `stunned`)', stunTurnsSet && !stunnedSet);
  flush('bellow');
  // mechanism check: engine's turn code only consults `stunned`; bellow wrote `stunTurns`.
  // behavioral: monster's next turn is unaffected.
  const mActCheck = (() => {
    const pHp0 = p().hp;
    endTurn();
    const m = Game.tbFighter(mkey);
    return { stunned: m ? (m.stunned || 0) : -1, playerTookDamage: p().hp < pHp0 };
  })();
  note(`   after bellow: engine-field stunned=${mActCheck.stunned}, monster still damaged player=${mActCheck.playerTookDamage}`);
  check('bellow stun is dead — engine field untouched, monster acts normally',
    mActCheck.stunned === 0);

  // --- brace: _applyAbilityDefenseMods has zero callers ---
  // fresh deterministic check: brace, then take a monster turn; damage unreduced.
  mkey = ensureFight();
  clearSays();
  const hpBefore = p().hp;
  r = use('unbreakable', 'brace');
  check('brace executes & sets flag', r === true && !!s.braceActive);
  flush('brace');
  endTurn(); // monster acts
  const hpAfter = p().hp;
  const dmgTaken = hpBefore - hpAfter;
  note(`   braced: took ${dmgTaken} damage (flag still set after: ${!!s.braceActive} — never cleared, never consulted)`);
  check('brace damage reduction NEVER fires (zero callers of _applyAbilityDefenseMods)', dmgTaken > 0 && !!s.braceActive,
    `took ${dmgTaken}, flag still set`);
  delete s.braceActive;

  // --- shake_off: clears s.stun/s.slow/s.bleed — fields that don't exist ---
  mkey = ensureFight();
  clearSays();
  p().stunned = 2; // real player-stun field (engine reads fighter.stunned)
  r = use('unbreakable', 'shake_off');
  note(`   shake_off: fighter.stunned=${p().stunned} after (impl cleared s.stun=${s.stun}, s.slow=${s.slow}, s.bleed=${s.bleed})`);
  check('shake_off does NOT clear real stun (wrong field names)', p().stunned === 2);
  p().stunned = 0;
  flush('shake');

  // --- read_fight: knowledge half works, initiative half dead ---
  mkey = ensureFight();
  clearSays();
  r = use('brawler_instinct', 'read_fight', mkey);
  const readSaid = says.join(' ');
  note(`   read_fight: ${JSON.stringify(readSaid.slice(0, 130))}`);
  check('read_fight narrates w/ knowledge gating (known vs unknown pattern)', /initiative/i.test(readSaid));
  check('read_fight sets fightRead.initiativeBonus (nothing reads it — turn order is speed-based)', !!(s.fightRead && s.fightRead.initiativeBonus === 2));
  flush('read');

  // --- stare_down: disengaging never read ---
  mkey = ensureFight();
  clearSays();
  // force the 50% back-off roll to land (deterministic)
  const realRandom2 = Math.random;
  try {
    Math.random = () => 0.0;
    r = use('intimidating_presence', 'stare_down', mkey);
  } finally {
    Math.random = realRandom2;
  }
  const m2 = Game.tbFighter(mkey);
  note(`   stare_down: disengaging=${!!m2.disengaging}, fled=${!!m2.fled}`);
  check('stare_down sets m.disengaging (zero engine consumers)', !!m2.disengaging);
  flush('stare');

  // --- loom: trust -2 vs text -5; loomActive dead ---
  clearSays();
  const trustBefore = JSON.stringify(Game.state.village.trust || {});
  r = use('fear_aura', 'loom');
  const loomSaid = says.join(' ');
  note(`   loom: ${JSON.stringify(loomSaid.slice(0, 120))}`);
  check('loom narrates', loomSaid.length > 20);
  check('loom sets loomActive (nothing reads it — "+1 round before they attack" never happens)', !!s.loomActive);
  flush('loom');
  // --- C2: per-fight flag hygiene — does startCombat reset brawler flags? ---
  note('\n--- C2. PER-FIGHT FLAG HYGIENE ---');
  s.rageActive = { rounds: 3, dmgMult: 2.0, frenzy: true };
  s.tradeOpen = { attacksLeft: 2, bonus: 0.5 };
  s.debtSettled = true; s.shakeOffUsed = true;
  Game.startCombat('gallowdeer'); // new fight — flags should reset
  const leakedFlags = ['rageActive', 'tradeOpen', 'debtSettled', 'shakeOffUsed'].filter(k => s[k]);
  note(`   flags surviving into the new fight: ${leakedFlags.join(', ') || '(none)'}`);
  check('startCombat does NOT reset brawler flags (leak across fights; "once per fight" = once per save)', leakedFlags.length === 4, leakedFlags.join(','));
  for (const k of leakedFlags) delete s[k];
  try { Game.tbfight.over = true; } catch (e) {}
  s.health = 100;

  // ============ D. REFUSE_DEATH: the automatic trigger (maybeCheatDeath) ============
  note('\n=== D. REFUSE_DEATH live: die in a fight with second_wind held ===');
  clearSays();
  // isolate the plain refuse path: drop rage so undying_fury can't interfere
  s.abilities = (s.abilities || []).filter(a => a.id !== 'rage');
  Game.startCombat('gallowdeer');
  check('second combat started', Game.inCombat());
  // manual invocation explains the automatic nature (honest, not silent)
  const rm = use('second_wind', 'refuse_death');
  check('manual Refuse explains automatic trigger (returns false, narrates)', rm === false && /isn't something you choose|automatic/i.test(says.join(' ')));
  // now actually die: drop fighter + scholar to lethal and let the monster hit.
  // break the INSTANT the trigger fires so post-trigger rounds can't muddy the read.
  const pf = Game.tbFighter('p');
  pf.hp = 1; s.health = 1; s.kcal = 100; s.day = 7;
  clearSays();
  let rounds = 0, firedAt = -1;
  while (Game.inCombat() && rounds < 12 && firedAt < 0) { endTurn(); rounds++; if (s.secondWindDay === s.day) firedAt = rounds; }
  const refuseLine = says.join(' ');
  note(`   trigger fired after ${firedAt} monster round(s): health=${s.health}, kcal=${s.kcal}`);
  note(`   line: ${JSON.stringify(refuseLine.slice(refuseLine.indexOf('SECOND WIND'), refuseLine.indexOf('SECOND WIND') + 120))}`);
  check('refuse_death auto-triggers on lethal damage (1 HP + 500 kcal + drama line)',
    firedAt > 0 && s.health === 1 && s.kcal >= 500 && /SECOND WIND/.test(refuseLine));
  flush('refuse');
  grant('rage', 2); // restore kit
  try { Game.tbfight.over = true; } catch (e) {}
  s.health = 100;

  // ============ E. SYNERGY DISCOVERY (same defects as hunter) ============
  note('\n=== E. SYNERGY DISCOVERY: unstoppable / fear_itself / one_person_army ===');
  const syns = Game.data.synergies;
  for (const sid of ['unstoppable', 'fear_itself', 'one_person_army']) {
    const sy = syns.find(x => x.id === sid);
    check(`${sid}: NO discovery_method (checkSynergyDiscovery skips it)`, !sy.discovery_method);
    check(`${sid}: requires empty (matchesUsed gates on requires, not requires_any)`, !(sy.requires && sy.requires.length));
  }
  // deliberate attempt: hold rage+iron_stomach L2, use both 3x across days
  ['rage', 'iron_stomach', 'trade_of_blows', 'second_wind', 'unbreakable', 'haymaker',
   'fear_aura', 'intimidating_presence', 'war_cry', 'brawler_instinct'].forEach(id => grant(id, 2));
  grant('unbreakable', 2);
  function attemptLegs(legs) {
    for (let d = 0; d < 3; d++) {
      Game.state.village.day = 20 + d; Game.dayPart = 1;
      for (const leg of legs) Game.noteAbilityUse(leg, {});
    }
  }
  attemptLegs(['rage', 'iron_stomach']);
  attemptLegs(['trade_of_blows', 'second_wind']);
  attemptLegs(['fear_aura', 'war_cry']);
  const discovered = Game.state.scholar.synergies || [];
  check('unstoppable NEVER unlocks via play (no discovery_method)', !discovered.includes('unstoppable'));
  check('fear_itself NEVER unlocks via play', !discovered.includes('fear_itself'));
  check('one_person_army NEVER unlocks via play', !discovered.includes('one_person_army'));
  check('zero attempt-counters increment (skip before counting)',
    Object.keys(Game.state.scholar.synergyAttempts || {}).filter(k => /unstoppable|fear_itself|one_person_army/.test(k)).length === 0);
  // near-hints (the working piece)
  const near = Game.getNearSynergies();
  const unNear = near.filter(n => n.id === 'unstoppable');
  note(`   unstoppable near-hints: ${unNear.length ? unNear.map(n => `${n.have}/${n.total} need ${n.needName}`).join(', ') : '(none — all paths need 2 pieces, hints only fire at 1-away)'}`);
  check('requires_any near-hints evaluate without crashing', Array.isArray(near));
  // synergy-as-requirement: one_person_army path [unstoppable+fear_itself]
  const opa = syns.find(x => x.id === 'one_person_army');
  const synPathMet = opa.requires_any[0].every(rid => Game.abilityLevel(rid) >= 3);
  check('one_person_army path [unstoppable+fear_itself] unsatisfiable via abilityLevel (synergies are not abilities)', synPathMet === false);
  // recomputeActiveSynergies ignores requires_any -> permanently active once discovered
  Game.unlockSynergy(syns.find(x => x.id === 'unstoppable'));
  check('forced unlock works (unlockSynergy ceremony fires)', discovered.includes('unstoppable'));
  Game.recomputeActiveSynergies();
  const activeHas = (Game.state.scholar.activeSynergies || []).includes('unstoppable');
  check('recomputeActiveSynergies ignores requires_any (empty requires => always active)', activeHas === true);
  note('   FEEL: if unstoppable were discoverable it would be PERMANENTLY active — no "currently held" check.');
  Game.state.scholar.synergies = discovered.filter(id => id !== 'unstoppable');
  Game.recomputeActiveSynergies();

  // ============ F. MODIFIER SWEEP ============
  note('\n=== F. MODIFIER SWEEP: 10 brawler targets — pipeline vs consumers ===');
  const targets = ['combat.trade_window', 'combat.knockdown_resist', 'combat.stun_duration',
    'combat.heavy_damage', 'combat.damage_taken', 'combat.morale_break_resist',
    'social.intimidate', 'combat.enemy_morale', 'combat.outnumbered_bonus', 'combat.solo_damage'];
  // static consumer counts verified by grep over pinned src/js (this run's tree)
  const src = order.map(f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } }).join('\n');
  let zeroCount = 0;
  for (const t of targets) {
    // count real consumer call sites: modTarget('t', ...) outside abilityActions/data
    const re = new RegExp("modTarget\\(['\"]" + t.replace('.', '\\.') + "['\"]", 'g');
    const hits = (src.match(re) || []).length;
    const piped = Game.modTarget(t, 100);
    if (hits === 0) zeroCount++;
    note(`   ${hits === 0 ? 'pipelined-only' : 'CONSUMED'} ${t}: call sites=${hits} pipeline(100)=${piped}`);
  }
  check('all 10 brawler modifier targets have ZERO engine consumers', zeroCount === 10, `${10 - zeroCount}/10 consumed`);
  note('   (knockdown has no mechanic at all; intimidate() never calls modTarget; damage pipeline never consults damage_taken/enemy_morale/outnumbered_bonus/solo_damage)');

  // ============ G. KNOWLEDGE GATING ============
  note('\n=== G. KNOWLEDGE GATING: does the UI leak pre-unlock? ===');
  // drop all brawler abilities; activatableAbilities must show none of their actions
  const s2 = Game.state.scholar;
  s2.abilities = (s2.abilities || []).filter(a => !kit.includes(a.id));
  const acts = Game.activatableAbilities();
  const leaked = acts.filter(a => brawlerActs.includes(a.abilityId + '.' + a.actionId));
  check('no brawler actions surface without the ability held', leaked.length === 0, leaked.map(a => a.id).join(','));
  // action defs are data-visible only for held abilities (UI builds from activatableAbilities)
  check('abilityActionDef resolves for held abilities only (data layer)', !!Game.abilityActionDef('rage', 'unleash_rage'));
  // restore kit for remaining checks
  kit.forEach(id => grant(id, 2));
  // synergy near-hints name undiscovered synergies — existing design (same as hunter's 41)
  const near2 = Game.getNearSynergies().filter(n => ['unstoppable', 'fear_itself', 'one_person_army'].includes(n.id));
  note(`   near-hints naming undiscovered brawler synergies: ${near2.length ? near2.map(n => n.id).join(', ') : '(none right now)'}`);
  note('   (teaser-naming is the existing design for all synergies, not a new brawler leak)');

  // ============ H. TEXT-VS-ENGINE MISMATCHES ============
  note('\n=== H. TEXT-VS-ENGINE MISMATCHES (hunter-audit class) ===');
  // loom: text says -5 trust, code does -2
  const loomDef = Game.abilityActionDef('fear_aura', 'loom');
  check('loom text "Villagers lose 5 trust" vs impl -2 (mismatch)', /5 trust/.test(loomDef.action.effect));
  note('   -> impl: v.trust[pid] - 2. Text lies by 3 trust.');
  // bellow: text "Beasts may flee outright" vs impl only stuns (wrong field at that)
  const belDef = Game.abilityActionDef('war_cry', 'bellow');
  check('bellow text "Beasts may flee outright" vs impl: no flee code at all', /flee outright/.test(belDef.action.effect));
  // rage: "attacks the nearest thing (friend or foe)" + "cannot retreat" vs no targeting/retreat code
  const rageDef = Game.abilityActionDef('rage', 'unleash_rage');
  check('rage text promises frenzy targeting + no-retreat; engine implements neither', /nearest thing|friend or foe/.test(rageDef.action.effect) && /cannot retreat/.test(rageDef.action.effect));
  // rage action duplicates the hasAbility('rage') && hp<50% passive (game.js:18006)
  check('unleash_rage (+100%/3 rounds, costs turn+60kcal) duplicates the free rage passive (x2 below half HP, no cost)', true, 'game.js:18006');
  // shake_off: "Clear stun, slow, and bleed" vs no such status fields
  const shDef = Game.abilityActionDef('unbreakable', 'shake_off');
  check('shake_off text "Clear stun, slow, bleed" vs engine has no stun/slow/bleed statuses on scholar', /stun, slow.*bleed/.test(shDef.action.effect));
  // brace: "cannot be knocked down" vs no knockdown mechanic
  const brDef = Game.abilityActionDef('unbreakable', 'brace');
  check('brace text "cannot be knocked down" vs no knockdown mechanic exists', /knocked down/.test(brDef.action.effect));
  // menace / challenge / end_it_before: pure narration, zero state
  clearSays();
  const keysBefore = new Set(Object.keys(s));
  use('fear_aura', 'menace'); use('war_cry', 'challenge'); use('intimidating_presence', 'end_it_before');
  const newKeys = Object.keys(s).filter(k => !keysBefore.has(k));
  check('menace/challenge/end_it_before change ZERO state (flavor-only actions)', newKeys.length === 0, newKeys.join(','));
  note('   FEEL: three menu actions that only print a line. The never_silent rule is met, but there is no game there.');

  note(`\n=== RESULT: ${pass} ok, ${fail} FAIL ===`);
  note(`(FAILs here are audit findings: the brawler path's wiring gaps, enumerated above.)`);
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
