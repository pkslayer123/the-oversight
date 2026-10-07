#!/usr/bin/env node
// BRAWLER WIRING PROOF — 2026-10-07 (Steve 2026-10-05).
// Proves the four wiring-backlog fixes from the 15:48 run note:
//   (a) all brawler synergies have discovery_method (earned discovery path)
//   (b) every brawler modifier is consumed, or honestly removed (no dead data)
//   (c) per-fight flags reset between fights (two-fight leak test)
//   (d) brace/frenzy text honesty (no promises the engine doesn't keep)
// Exit non-zero on any deviation. SEED env override (default 7).
//
// Run: BRAWLER_EXTRACT=/tmp/brawler-wiring node scripts/test-brawler-wiring-20261007.js
const fs = require('fs');
const path = require('path');

const ROOT = process.env.BRAWLER_EXTRACT || '/tmp/brawler-wiring';
try { fs.statSync(path.join(ROOT, 'src', 'js', 'game.js')); }
catch (e) { console.error('FATAL: extract missing at ' + ROOT + ' — build with: git archive HEAD src index.html | tar -x -C ' + ROOT); process.exit(2); }

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
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function use(ab, act, target) { clearSays(); return Game.useAbility(ab, act, target); }
function ensureFight(monId) {
  if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
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
  note(`seed=${SEED}  extract: ${ROOT}`);
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

  // ============ A. SYNERGY DISCOVERY_METHOD ============
  note('\n=== A. every brawler synergy has an earned discovery path ===');
  const syns = Game.data.synergies;
  const three = ['unstoppable', 'fear_itself', 'one_person_army'].map(id => syns.find(x => x.id === id));
  check('3 brawler synergies present in data', three.every(Boolean));
  check('all 3 have discovery_method', three.every(sy => sy && sy.discovery_method),
    three.filter(sy => !(sy && sy.discovery_method)).map(sy => sy && sy.id).join(','));
  check('discovery_methods well-formed (type+hint+tease1+tease2)',
    three.every(sy => sy.discovery_method.type && sy.discovery_method.hint && sy.discovery_method.tease1 && sy.discovery_method.tease2));
  // dynamic: simultaneous rage+iron_stomach over 3 days unlocks unstoppable
  function attemptLegs(legs) {
    for (let d = 0; d < 3; d++) {
      Game.state.village.day = 20 + d; Game.dayPart = 1;
      for (const leg of legs) Game.noteAbilityUse(leg, {});
    }
  }
  attemptLegs(['rage', 'iron_stomach']);
  const discovered = Game.state.scholar.synergies || [];
  check('unstoppable unlocks via played combined use (discovery_method consumed)', discovered.includes('unstoppable'), discovered.join(','));

  // ============ B. MODIFIER SWEEP ============
  note('\n=== B. no dead brawler modifiers ===');
  const esrc = order.map(f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } }).join('\n');
  const wired = {
    'combat.trade_window': 'open_trade window',
    'combat.heavy_damage': 'haymaker strike',
    'combat.damage_taken': 'player defense',
    'social.intimidate': 'stare_down courage',
    'combat.enemy_morale': 'bellow courage',
    'combat.outnumbered_bonus': 'strike while outnumbered',
    'combat.solo_damage': 'strike while solo',
  };
  let wiredOk = 0;
  for (const [t, where] of Object.entries(wired)) {
    const re = new RegExp("modTarget\\(['\"]" + t.replace('.', '\\.') + "['\"]", 'g');
    const hits = (esrc.match(re) || []).length;
    if (hits >= 1) wiredOk++;
    note(`   ${hits >= 1 ? 'CONSUMED' : 'MISSING'} ${t} (${where}): ${hits} call site(s)`);
  }
  check('all 7 wired targets have engine call sites', wiredOk === Object.keys(wired).length, `${wiredOk}/${Object.keys(wired).length}`);
  // honestly removed: no mechanic exists to wire into (documented, not silent)
  const dataText = JSON.stringify(Game.data.abilities) + JSON.stringify(Game.data.synergies);
  const removed = {
    'combat.knockdown_resist': 'no knockdown mechanic in src/js',
    'combat.morale_break_resist': 'no player morale-break mechanic',
    'combat.stun_duration': 'stuns are 1-turn integers; halving unrepresentable',
    'combat.initiative': 'superseded by read_fight +2 speed',
  };
  const stillDeclared = Object.keys(removed).filter(t => dataText.includes(t));
  for (const [t, why] of Object.entries(removed)) note(`   REMOVED ${t}: ${why}`);
  check('4 unwirable modifiers gone from data (no silent dead data)', stillDeclared.length === 0, stillDeclared.join(','));
  // behavioral: trade_window extends the window to 4
  let mkey = ensureFight();
  use('trade_of_blows', 'open_trade');
  check('behavioral: open_trade window is 4 (3 base + trade_window)', s.tradeOpen && s.tradeOpen.attacksLeft === 4, JSON.stringify(s.tradeOpen));

  // ============ C. PER-FIGHT FLAG LEAKS (two fights) ============
  note('\n=== C. per-fight flags reset between fights ===');
  mkey = ensureFight();
  use('trade_of_blows', 'open_trade');
  check('fight 1: open_trade sets tradeOpen', !!s.tradeOpen); endTurn();
  use('unbreakable', 'brace');
  check('fight 1: brace sets braceActive', !!s.braceActive); endTurn();
  use('haymaker', 'throw_haymaker');
  check('fight 1: throw_haymaker sets haymakerReady', !!s.haymakerReady); endTurn();
  use('rage', 'unleash_rage');
  check('fight 1: unleash_rage sets rageActive', !!s.rageActive); endTurn();
  s.debtSettled = true; s.settleDebtBonus = 14; s.shakeOffUsed = true; s.fightDamageTaken = 99;
  // brace is one-hit by design: the monster's turn above consumed it doing its
  // job. Top it back up so the leak test covers all 7 flags.
  if (!s.braceActive) s.braceActive = { reduce: 0.6 };
  const setFlags = ['rageActive', 'tradeOpen', 'debtSettled', 'settleDebtBonus', 'braceActive', 'shakeOffUsed', 'haymakerReady'].filter(k => s[k]);
  note(`   flags set during fight 1: ${setFlags.join(', ')}`);
  check('fight 1 set all 7 per-fight flags', setFlags.length === 7, setFlags.join(','));
  try { Game.tbfight.over = true; } catch (e) {}
  Game.startCombat('gallowdeer'); // fight 2
  const leaked = ['rageActive', 'tradeOpen', 'debtSettled', 'settleDebtBonus', 'braceActive', 'shakeOffUsed', 'haymakerReady'].filter(k => s[k]);
  check('fight 2 starts with zero leaked flags', leaked.length === 0, leaked.join(',') || '(none)');
  check('fightDamageTaken ledger reset (stale 99 gone)', s.fightDamageTaken !== 99, `fightDamageTaken=${s.fightDamageTaken}`);
  try { Game.tbfight.over = true; } catch (e) {}

  // ============ D. BRACE/FRENZY HONESTY ============
  note('\n=== D. text promises match the engine ===');
  const abs = Game.data.abilities;
  const braceDef = abs.find(a => a.id === 'unbreakable').actions.find(x => x.id === 'brace');
  const rageDef = abs.find(a => a.id === 'rage').actions.find(x => x.id === 'unleash_rage');
  check('brace text no longer promises knockdown immunity', !/knock/i.test(braceDef.effect), braceDef.effect);
  check('unleash_rage text no longer promises forced targeting / retreat lock',
    !/nearest|friend or foe|retreat/i.test(rageDef.effect), rageDef.effect);
  mkey = ensureFight();
  use('unbreakable', 'brace');
  check('braceActive carries no dead noKnockdown flag', s.braceActive && !('noKnockdown' in s.braceActive), JSON.stringify(s.braceActive));
  endTurn();
  // rage needs a fresh turn; ensure it is still the player's turn or force one
  if (!Game.inCombat()) mkey = ensureFight();
  use('rage', 'unleash_rage');
  const rageFlagOk = s.rageActive && !('frenzy' in s.rageActive) && s.rageActive.rounds === 3 && s.rageActive.dmgMult === 2.0;
  check('rageActive carries no dead frenzy flag (still +100% x3)', rageFlagOk, JSON.stringify(s.rageActive));
  try { Game.tbfight.over = true; } catch (e) {}

  // ============ E. SYNERGY MODIFIER END-TO-END ============
  note('\n=== E. synergy modifier fires through the pipeline ===');
  // one_person_army is minLevel 3: its ability legs need level 3
  grant('rage', 3); grant('war_cry', 3);
  // discover all three via play, hold one_person_army path [unstoppable+rage+war_cry]
  attemptLegs(['fear_aura', 'war_cry']);
  Game.recomputeActiveSynergies();
  const active = Game.state.scholar.activeSynergies || [];
  check('one_person_army active while path held (knowledge -> power)', active.includes('one_person_army'), active.join(','));
  mkey = ensureFight(); // solo: 1 monster, no allies
  clearSays();
  const dSolo = strikeFor(mkey);
  check('solo strike fires ONE PERSON ARMY narration (solo_damage consumed)', /ONE PERSON ARMY: alone in it/.test(said()), `dmg=${dSolo} said=${JSON.stringify(said().slice(0, 80))}`);
  check('solo strike deals damage', (dSolo || 0) > 0, String(dSolo));
  try { Game.tbfight.over = true; } catch (e) {}

  note(`\n=== RESULT: ${pass} ok, ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
