#!/usr/bin/env node
// HUNTER WIRING FIXES proof (Steve 2026-10-07): the 7 dead hunter modifier
// targets from the hunter re-verify (hunter-reverify-notes-20261007.md §4) —
// 2 wired through the real engine pipeline, 5 honestly removed from data;
// encKillLine names the field-dressing bonus at the kill; hunter per-fight
// flags reset in startCombat.
//
// Verdicts PROVEN in-harness, not asserted. Seeded PRNG (mulberry32,
// SEED env override, default 7). Exit 0 = PASS.
//
// Run: node scripts/test-hunter-wiring-fixes-20261007.js   (SEED env override)
//   HUNTER_ROOT defaults to the repo root (script is in scripts/); point it
//   at a pristine extract to test another tree.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.env.HUNTER_ROOT || path.resolve(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global; // stub ONLY for eval (equipment.js needs window at load)
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('LOAD FAIL ' + f + ': ' + e.message); process.exit(2); } });
delete global.window; delete global.document; // sync combat path from here on
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
  else { fail++; note(`  FAIL ${name}${detail ? ' -- ' + detail : ''}`); }
}
function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 1;
  return e;
}
function setDay(d, p) { Game.state.village.day = d; Game.state.scholar.day = d; Game.dayPart = p || 0; }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const pl = Game.tbFighter('p'); if (pl) { pl.moveLeft = 0; pl.acted = true; }
  Game.tbAfterPlayerAction();
}
function use(ab, act, target) { clearSays(); return Game.useAbility(ab, act, target); }
function ensureFight(monId) {
  if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
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
// modTarget reader count for a target across the loaded engine sources
function readers(target) {
  let n = 0;
  for (const f of order) {
    const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const re = new RegExp("modTarget\\('" + target.replace(/\./g, '\\.') + "'", 'g');
    const m = txt.match(re);
    if (m) n += m.length;
  }
  return n;
}

(async () => {
  await Game.init();
  note(`seed=${SEED} ROOT=${ROOT}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  try { Game.location = 'haven'; } catch (e) {}
  s.health = 100; s.kcal = 3000; s.hydration = 80; s.energy = 100;
  s.trauma = 0; s.mx = 4; s.my = 4;
  setDay(20, 1); // midday: not night (keeps the preyReaction A/B clean)
  Game.state.weather = 'clear';
  clearSays();

  // NOTE: 'stalk' is deliberately NOT in the kit — D1 grants it between
  // batches so batch A is genuinely stalk-less.
  const KIT = ['blood_trail', 'ambush', 'animal_ken', 'game_sense', 'patient_aim', 'field_dressing', 'tracker', 'dead_aim'];
  KIT.forEach(id => grant(id, 2));

  // ============ A. THE 7 DEAD TARGETS: WIRED (2) OR HONESTLY REMOVED (5) ============
  note('\n=== A. 7 dead hunter modifier targets: wired or removed ===');
  const absTxt = JSON.stringify(Game.data.abilities);
  const synTxt = JSON.stringify(Game.data.synergies);
  const removed = ['hunt.track_wounded', 'animal.behavior_read', 'hunt.wounded_find', 'hunt.wounded_time', 'hunt.intimidate'];
  for (const t of removed) {
    const gone = !absTxt.includes(t) && !synTxt.includes(t);
    check(`REMOVED from data: ${t}`, gone, gone ? '' : 'still present in data!');
  }
  // stalk keeps its passive — now consumed by the prey flee roll
  const stalkDef = Game.data.abilities.find(a => a.id === 'stalk');
  check('stalk still declares stealth.move_silent (wired, not removed)',
    (stalkDef.modifiers || []).some(m => m.target === 'stealth.move_silent'));
  check("stealth.move_silent consumed: modTarget reader in engine (food.js preyReaction)",
    readers('stealth.move_silent') > 0, `readers=${readers('stealth.move_silent')}`);
  // clean_kill keeps first_shot_damage — now consumed by the round-1 hook
  const ckDef = Game.data.synergies.find(x => x.id === 'clean_kill');
  check('clean_kill still declares hunt.first_shot_damage (wired, not removed)',
    (ckDef.modifiers || []).some(m => m.target === 'hunt.first_shot_damage'));
  check("hunt.first_shot_damage consumed: modTarget reader in engine (round-1 hook)",
    readers('hunt.first_shot_damage') > 0, `readers=${readers('hunt.first_shot_damage')}`);
  // full sweep: every hunter modifier target left in data must have a reader
  const hunterAbs = Game.data.abilities.filter(a => (a.paths || []).includes('hunter'));
  const hunterSyn = Game.data.synergies.filter(x => (x.paths || []).includes('hunter'));
  const liveTargets = new Set();
  for (const a of hunterAbs) for (const m of (a.modifiers || [])) liveTargets.add(a.id + ':' + m.target);
  for (const x of hunterSyn) for (const m of (x.modifiers || [])) liveTargets.add(x.id + ':' + m.target);
  let deadLeft = [];
  for (const key of liveTargets) {
    const t = key.split(':')[1];
    if (readers(t) === 0) deadLeft.push(key);
  }
  check('no dead hunter modifier targets remain in data', deadLeft.length === 0, deadLeft.join(', ') || '(none)');
  note(`   live hunter targets: ${[...liveTargets].map(k => k.split(':')[1]).join(', ')}`);

  // ============ B. encKillLine NAMES THE FIELD-DRESSING BONUS ============
  note('\n=== B. encKillLine names the field-dressing bonus ===');
  const cottontail = Game.data.animals.find(a => a.id === 'cottontail_rabbit');
  clearSays();
  const klWith = Game.encKillLine(cottontail, 1040);
  check('kill line names the bonus with field_dressing held', /Field Dressing \u00d7/.test(klWith), klWith.slice(0, 120));
  // without the ability: no bonus text (honest — nothing to name)
  s.abilities = s.abilities.filter(a => (a.id || a) !== 'field_dressing');
  const klWithout = Game.encKillLine(cottontail, 800);
  check('kill line stays silent without the skill (no phantom bonus)', !/Field Dressing/.test(klWithout), klWithout.slice(0, 120));
  grant('field_dressing', 2);

  // ============ C. PER-FIGHT FLAG RESET (two fights, no leaks) ============
  note('\n=== C. hunter per-fight flags reset in startCombat ===');
  let mkey = ensureFight();
  use('patient_aim', 'take_aim'); endTurn();
  use('dead_aim', 'dead_aim_shot'); endTurn();
  use('ambush', 'set_ambush'); endTurn();
  s.cleanShotReady = true; // armed in explore (patient_aim.clean_shot); same flag
  s.ignoreArmorNext = true; // set mid-strike when deadAimShot is consumed
  s.noDodgeNext = true; // set mid-strike when ambushReady is consumed (never read)
  const hunterFlags = ['aimBonus', 'deadAimShot', 'ambushReady', 'ignoreArmorNext', 'noDodgeNext', 'cleanShotReady'];
  const setH = hunterFlags.filter(k => s[k]);
  check('fight 1 armed all 6 hunter per-fight flags', setH.length === 6, setH.join(','));
  // stalkActive must NOT be set anymore (dead flag removed 2026-10-07)
  check('stalkActive dead flag gone (stalk_prey no longer arms it)', !('stalkActive' in s));
  try { Game.tbfight.over = true; } catch (e) {}
  Game.startCombat('gallowdeer'); // fight 2
  const leakedH = hunterFlags.filter(k => s[k]);
  check('fight 2 starts with zero leaked hunter flags', leakedH.length === 0, leakedH.join(',') || '(none)');
  // brawler regression: their 7 still reset
  const brawlerFlags = ['rageActive', 'tradeOpen', 'debtSettled', 'settleDebtBonus', 'braceActive', 'shakeOffUsed', 'haymakerReady'];
  brawlerFlags.forEach(k => { s[k] = { x: 1 }; });
  try { Game.tbfight.over = true; } catch (e) {}
  Game.startCombat('gallowdeer');
  const leakedB = brawlerFlags.filter(k => s[k]);
  check('brawler 7 still reset (regression)', leakedB.length === 0, leakedB.join(',') || '(none)');
  // layWaitActive is INTENTIONALLY not cleared (holds for next animal encounter)
  s.layWaitActive = true;
  try { Game.tbfight.over = true; } catch (e) {}
  Game.startCombat('gallowdeer');
  check('layWaitActive survives startCombat by design (next-encounter flag, not per-fight)', s.layWaitActive === true);
  s.layWaitActive = false;
  try { Game.tbfight.over = true; } catch (e) {}

  // ============ D1. stealth.move_silent: prey bolts less (behavioral A/B) ============
  note('\n=== D1. stealth.move_silent wired: stalk holders spook less prey ===');
  s.kcal = 99999;
  function boltCount(withStalk, trials) {
    let bolts = 0;
    for (let i = 0; i < trials; i++) {
      const a = { id: 'cottontail_rabbit', mx: 6, my: 4, aware: 0.5, stamina: 3, pstate: 'graze', edgeTurns: 0 };
      if (Game.preyReaction(a)) bolts++;
    }
    return bolts;
  }
  // batch A: no stalk. (tracker NOT granted: trackLvl 0; midday: no night bonus)
  Math.random = mulberry32(SEED);
  const boltsA = boltCount(false, 400);
  grant('stalk', 1);
  clearSays();
  Math.random = mulberry32(SEED); // identical random stream: only the modifier differs
  const boltsB = boltCount(true, 400);
  note(`   bolts without stalk: ${boltsA}/400, with stalk: ${boltsB}/400`);
  check('preyReaction roll is live (baseline bolts)', boltsA > 40, `${boltsA}`);
  check('stalk passive reduces bolt rate (stealth.move_silent consumed)', boltsB < boltsA, `${boltsB} vs ${boltsA}`);
  const mv = Game.modTarget('stealth.move_silent', 0, {});
  check('pipeline value: stealth.move_silent = 0.3 with stalk held', Math.abs(mv - 0.3) < 1e-9, `got ${mv}`);

  // ============ D2. hunt.first_shot_damage: round-1 strike says CLEAN KILL ============
  note('\n=== D2. hunt.first_shot_damage wired: clean_kill opening strike ===');
  grant('patient_aim', 2); grant('game_sense', 2);
  for (let d = 0; d < 3; d++) { setDay(30 + d, 1); for (const leg of ['patient_aim', 'game_sense']) Game.noteAbilityUse(leg, {}); }
  const discovered = (Game.state.scholar.synergies || []).includes('clean_kill');
  check('clean_kill discovered via play (3x [patient_aim + game_sense])', discovered);
  Game.recomputeActiveSynergies();
  const active = Game.state.scholar.activeSynergies || [];
  check('clean_kill ACTIVE while path held (knowledge -> power)', active.includes('clean_kill'), active.join(','));
  const ckVal = Game.modTarget('hunt.first_shot_damage', 1, { round: 1 });
  check('pipeline value: hunt.first_shot_damage = 2.0 while active', ckVal === 2.0, `got ${ckVal}`);
  mkey = ensureFight();
  clearSays();
  const dmg = strikeFor(mkey);
  check('round-1 strike narrates CLEAN KILL (first_shot_damage consumed)', /CLEAN KILL: one shot/.test(said()), `dmg=${dmg} said=${said().slice(0, 140)}`);
  check('round-1 strike deals damage', (dmg || 0) > 0, String(dmg));
  try { Game.tbfight.over = true; } catch (e) {}

  // ============ D3. cleanShotReady: consumed by the hunting strike, narrated clean ============
  note('\n=== D3. cleanShotReady wired: lined-up shot steadies the strike ===');
  let consumedOk = true, cleanNarrated = false, kills = 0;
  for (let i = 0; i < 6 && kills === 0; i++) {
    s.animal = { id: 'cottontail_rabbit', mx: 5, my: 4, aware: 0.1, pstate: 'graze', stamina: 3, edgeTurns: 0 };
    s.cleanShotReady = true; // exactly what patient_aim.clean_shot arms
    s.kcal = 99999;
    clearSays();
    Game.huntAnimal();
    if (s.cleanShotReady !== false) consumedOk = false;
    if (!s.animal) { kills++; if (/Clean Shot/.test(said())) cleanNarrated = true; }
  }
  s.animal = null;
  check('cleanShotReady consumed by the hunting strike (no forever-flag)', consumedOk);
  check('a lined-up kill narrates the clean shot', kills > 0 && cleanNarrated, `kills=${kills}`);
  // startCombat clears a lined-up shot (the moment doesn't survive a fight)
  s.cleanShotReady = true;
  Game.startCombat('gallowdeer');
  check('startCombat clears cleanShotReady', s.cleanShotReady === undefined || s.cleanShotReady === false);
  try { Game.tbfight.over = true; } catch (e) {}

  // ============ E. TEXT HONESTY ============
  note('\n=== E. card text matches the engine ===');
  const cleanShotDef = Game.data.abilities.find(a => a.id === 'patient_aim').actions.find(x => x.id === 'clean_shot');
  check('clean_shot text no longer promises "full meat yield"', !/full meat yield/i.test(cleanShotDef.effect), cleanShotDef.effect.slice(0, 90));
  check('clean_shot text promises reliability (what the flag does)', /more reliably/i.test(cleanShotDef.effect));
  const stalkDesc = Game.data.abilities.find(a => a.id === 'stalk').description;
  check('stalk description promises no numbered system', !/\+\d|[0-9]+%|\u00d7/.test(stalkDesc), stalkDesc);
  for (const id of ['blood_trail', 'animal_ken']) {
    const d = Game.data.abilities.find(a => a.id === id).description;
    check(`${id} description promises no numbered system (modifier removed)`, !/\+\d|[0-9]+%|\u00d7/.test(d), d.slice(0, 80));
  }
  for (const id of ['blood_tracker', 'apex_predator']) {
    const d = Game.data.synergies.find(x => x.id === id).description;
    check(`${id} description promises no numbered system (modifier removed)`, !/\+\d|[0-9]+%|\u00d7/.test(d), d.slice(0, 80));
  }

  // ============ F. REGRESSION: the 3 previously-consumed targets still wired ============
  note('\n=== F. regression: previously-consumed hunter targets still live ===');
  for (const t of ['hunt.meat_yield', 'combat.first_strike_damage', 'combat.vs_beast_damage']) {
    check(`${t} still consumed`, readers(t) > 0, `readers=${readers(t)}`);
  }
  const scSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const brawlerDeletes = ['rageActive', 'tradeOpen', 'debtSettled', 'settleDebtBonus', 'braceActive', 'shakeOffUsed', 'haymakerReady'];
  check('brawler flag-hygiene block intact in startCombat',
    brawlerDeletes.every(k => scSrc.includes('delete s.' + k)));

  note(`\n=== RESULT: ${pass} ok, ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e && e.stack || e); process.exit(2); });
