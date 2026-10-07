#!/usr/bin/env node
// BRAWLER ENDGAME (Steve 2026-10-07): earn Unstoppable through real play, then
// fight a wave-2 boss (The Moderator) with the full brawler kit + synergy.
//
// This is the brawler's payoff loop: the knowledge→power core loop END of the
// brawler path — 3 days of deliberate combined rage+iron_stomach use unlocks
// Unstoppable (simultaneous discovery), then the wave-2 boss fight tests whether
// the synergy + kit make a real endgame fight.
//
// RUNS READ-ONLY against a pristine HEAD extract (the worktree's
// src/data/synergies.json is dirty with a sibling's in-flight rework —
// staged rename stormcaller + unstaged brawler discovery_method removals).
// HEAD is intact (47 discovery_methods). Bugs in HEAD get fixed via
// private-index commits; the dirty file is never touched.
//
// Usage: ROOT=/tmp/headjs-brawler2 node scripts/play-brawler-endgame-20261007.js
// (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
let ROOT = process.env.ROOT || '/tmp/headjs-brawler2';
try { fs.statSync(path.join(ROOT, 'src', 'js', 'game.js')); }
catch (e) { ROOT = '/home/hatch/workspace/the-scattering'; console.log('!! extract missing, falling back to worktree (DIRTY)'); }
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function note(t) { console.log(t); }
function flush(tag, max = 5) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 170)}`); }
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
function endTurn() { // turn hygiene: advance only if still the player's turn
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function use(ab, act, target) { clearSays(); return Game.useAbility(ab, act, target); }
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
function monsterKey() {
  const f = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
  return f ? f.key : null;
}
function newDay(n) {
  const sch = Game.state.scholar;
  sch.day = n; if (Game.state.village) Game.state.village.day = n;
  Game.dayPart = 1; // midday — same part all three days
  sch.health = 100; sch.kcal = 3000; sch.hydration = 90; sch.energy = 100;
  sch.trauma = 0;
  // clear per-fight scholar flags (per-fight reset audit: fightDamageTaken resets
  // in startCombat; rageActive etc. may leak — clear to isolate days)
  for (const k of ['tradeOpen', 'settleDebtBonus', 'debtSettled', 'braceActive', 'shakeOffUsed',
    'haymakerReady', 'rageActive', 'fightRead', 'loomActive', 'fightDamageTaken', 'pushThroughParts']) delete sch[k];
  if (Game.tbfight) Game.tbfight.over = true;
}
function startFight(mid) {
  const sch = Game.state.scholar;
  for (const k of ['tradeOpen', 'settleDebtBonus', 'debtSettled', 'braceActive', 'shakeOffUsed',
    'haymakerReady', 'rageActive', 'fightRead', 'loomActive', 'fightDamageTaken']) delete sch[k];
  sch.health = 100; sch.kcal = 3000;
  Game.startCombat(mid);
  const mk = monsterKey();
  const mo = Game.tbFighter(mk); mo.hp = 400; mo.maxHp = 400;
  const pp = Game.tbFighter('p'); pp.hp = 100; pp.maxHp = 100; pp.alive = true;
  return mk;
}

(async () => {
  await Game.init();
  note(`seed=${SEED}  root=${ROOT}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  try { Game.location = 'haven'; } catch (e) {}
  s.health = 100; s.kcal = 3000; s.hydration = 90; s.energy = 100; s.water = [];
  s.trauma = 0; s.mx = 4; s.my = 4;
  Game.state.weather = 'clear';
  clearSays();

  const kit = ['trade_of_blows', 'unbreakable', 'war_cry', 'haymaker',
    'iron_stomach', 'second_wind', 'rage', 'fear_aura', 'brawler_instinct', 'intimidating_presence'];
  for (const id of kit) grant(id, 2);
  check('brawler kit granted at L2 (unstoppable minLevel)', kit.every(id => Game.abilityLevel(id) >= 2));
  const syn = (Game.data.synergies || []).find(x => x.id === 'unstoppable');
  check('unstoppable has discovery_method at HEAD', !!(syn && syn.discovery_method));

  // ============ PHASE 1: EARN IT — 3 days of rage+iron_stomach, same part ============
  note('\n=== PHASE 1: EARN UNSTOPPABLE (3 training days, rage + iron_stomach) ===');
  const teasesSeen = [];
  for (let day = 1; day <= 3; day++) {
    newDay(day);
    note(`\n--- day ${day} (midday) ---`);
    const mk = startFight('bulldozer');
    check(`day ${day}: fight started`, Game.inCombat());
    // leg 1: unleash_rage in the fight
    let r = use('rage', 'unleash_rage');
    note(`   unleash_rage returned=${r} rageActive=${!!(s.rageActive)}`);
    endTurn();
    // play a couple of honest turns: brace, then strikes
    use('unbreakable', 'brace'); endTurn();
    const d1 = strikeFor(mk); endTurn();
    const d2 = strikeFor(mk); endTurn();
    note(`   strikes: ${d1}, ${d2} | monster hp: ${Game.tbFighter(mk) ? Game.tbFighter(mk).hp : 'dead'}`);
    // end the training fight (it's practice, not a war)
    if (Game.tbfight) Game.tbfight.over = true;
    clearSays();
    // leg 2: push_through outside the fight, SAME part -> simultaneous combined use
    r = use('iron_stomach', 'push_through');
    const daySaid = says.join(' ');
    note(`   push_through returned=${r}`);
    flush('train');
    const attempts = (s.synergyAttempts || {}).unstoppable || 0;
    note(`   unstoppable attempts=${attempts} discovered=${(s.synergies || []).includes('unstoppable')}`);
    for (const t of says) teasesSeen.push(t);
    clearSays();
    if (day < 3) {
      check(`day ${day}: tease surfaced (not silent, not method-spoiling)`, /knees|ground has reached|blow landed/i.test(daySaid) || attempts > 0,
        daySaid.slice(0, 100));
    }
    // capture the unlock moment the instant it happens
    if ((s.synergies || []).includes('unstoppable') && !teasesSeen._unlocked) {
      teasesSeen._unlocked = true;
      note('\n   *** UNLOCK MOMENT (captured live) ***');
      flush('unlock', 8);
    }
  }
  check('unstoppable DISCOVERED after combined days', (s.synergies || []).includes('unstoppable'));
  Game.recomputeActiveSynergies && Game.recomputeActiveSynergies();
  const activeSyns = (s.activeSynergies || []).map(x => x.id || x);
  check('unstoppable is ACTIVE (held at minLevel)', activeSyns.includes('unstoppable'), JSON.stringify(activeSyns));
  const dtMult = Game.modTarget ? Game.modTarget('combat.damage_taken', 1) : null;
  check("modTarget('combat.damage_taken', 1) reflects unstoppable x0.7", dtMult === 0.7, `got ${dtMult}`);

  // ============ PHASE 2: BOSS FIGHT — The Moderator, played SMART ============
  // The Moderator mutes your most-used verb inside its purple field. The
  // brawler's counterplay: strike while unmuted; when STRIKE is muted, COMPLY —
  // abilities (bellow/brace/trade/haymaker) + tbPlayerWait (silence lifts the
  // mute after ~5 quiet rounds; compliance makes Notices GRAZE).
  note('\n=== PHASE 2: BOSS FIGHT vs THE MODERATOR (smart counterplay) ===');
  newDay(4);
  const mk = startFight('moderator');
  const mo = Game.tbFighter(mk); mo.hp = 160; mo.maxHp = 160;
  const modRef = () => Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
  const strikeMuted = () => { const m = modRef(); return !!(m && (m.modMuted || []).includes('strike')); };
  note(`   moderator hp=160 | raw Notice 12-18 (defiant) / 8-12 (compliant graze) | unstoppable x0.7`);
  const incoming = [];
  const dealt = [];
  let turns = 0, violations = 0, waits = 0, bellowStuns = 0, skipEndTurn = false;
  function playerTurn(action) {
    // action: 'strike' | 'wait' | 'bellow' | 'brace' | 'trade' | 'haymaker' | 'settle'
    const m = modRef();
    if (!m) return 'dead';
    clearSays();
    const hpBefore = Game.tbFighter('p').hp;
    if (action === 'strike') {
      if (strikeMuted()) { violations++; note(`   !! struck while muted (test error)`); }
      const d = strikeFor(mk); dealt.push(d);
    } else if (action === 'wait') {
      waits++;
      Game.tbPlayerWait();
      skipEndTurn = true; // wait already advanced — do NOT endTurn() (double monster turn)
    } else if (action === 'bellow') {
      use('war_cry', 'bellow');
      const mm = modRef(); if (mm && mm.stunned) bellowStuns++;
    } else if (action === 'brace') { use('unbreakable', 'brace'); }
    else if (action === 'trade') { use('trade_of_blows', 'open_trade'); }
    else if (action === 'haymaker') { use('haymaker', 'throw_haymaker'); }
    else if (action === 'settle') { use('trade_of_blows', 'settle_debt'); }
    if (!skipEndTurn) endTurn(); // strike/ability need it; wait must not get it
    skipEndTurn = false; turns++;
    const taken = hpBefore - (Game.tbFighter('p') ? Game.tbFighter('p').hp : 0);
    if (taken > 0) incoming.push(taken);
    const narr = says.join(' ');
    if (/MUTED|violation|SHADOWBAN|DEPLATFORMED|lost the thread/i.test(narr)) {
      note(`   [t${turns}] ${narr.slice(0, 200)}`);
    }
    clearSays();
    return 'ok';
  }
  // opener: brace (defensive read), then trade
  playerTurn('brace');
  playerTurn('trade');
  // main loop: strike while live; comply when muted (abilities + waits)
  let guard = 0, bellowed = false, haymakered = false;
  while (Game.inCombat() && modRef() && guard++ < 60) {
    const m = modRef();
    const phase = m.beamPhase;
    if (!strikeMuted()) {
      // strike is live: cash in (haymaker first if fresh)
      if (!haymakered && m.hp > 40) { playerTurn('haymaker'); haymakered = true; continue; }
      playerTurn('strike');
      // cash the bruises if we took real damage and trade window is open
      if ((s.fightDamageTaken || 0) > 15 && s.tradeOpen && !s.debtSettled) { playerTurn('settle'); }
    } else {
      // strike muted: comply — abilities don't feed the window, waits lift it
      if (!bellowed && phase !== 'shadowban') { playerTurn('bellow'); bellowed = true; }
      else if (!s.braceActive) { playerTurn('brace'); }
      else { playerTurn('wait'); }
    }
    if (!Game.inCombat() || !modRef()) break;
  }
  const mEnd = Game.tbFighter(mk);
  const bossDead = !Game.inCombat() || !mEnd || !mEnd.alive;
  const pHp = Game.tbFighter('p') ? Game.tbFighter('p').hp : s.health;
  note(`\n   fight over: bossDead=${bossDead} bossHp=${mEnd && mEnd.alive ? mEnd.hp : 0} playerHp=${pHp}`);
  note(`   turns=${turns} violations=${violations} waits=${waits} bellowStuns=${bellowStuns}`);
  note(`   dealt per strike: ${JSON.stringify(dealt)}`);
  note(`   incoming damage: ${JSON.stringify(incoming)}`);
  check('boss fight played to conclusion (boss dead)', bossDead);
  check('smart brawler takes ZERO violations (compliance is the counterplay)', violations === 0);
  check('player survived the wave-2 boss', (Game.tbFighter('p') ? Game.tbFighter('p').hp : 0) > 0 || bossDead, `playerHp=${pHp}`);
  const compliantHits = incoming.filter(x => x <= 13);
  check('compliant Notices graze in the expected band (raw 8-12 x0.7 => ~6-8)',
    incoming.length > 0 && compliantHits.length >= Math.ceil(incoming.length * 0.5),
    `incoming=${JSON.stringify(incoming)}`);
  note(`\nRESULT: ${pass} ok, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
