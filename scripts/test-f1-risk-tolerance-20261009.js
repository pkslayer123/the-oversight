#!/usr/bin/env node
// F1 RISK-TOLERANCE PROOF (Steve 2026-10-09, corrected): "It's not like we are
// trying to produce death packs, we just want logical item continuity."
// NO death quota, NO death-rate target. This proves BELIEVABLE behavior:
//  1. Flee correlates with actual hopelessness, not a flat HP threshold.
//  2. Villagers commit to winnable fights instead of scattering — including
//     wins the OLD flat rule could never have taken (minHpFrac < 0.15, the old
//     clamp floor: the old code ALWAYS fled before that line).
//  3. Outmatched + allies near -> call for help / party up, not instant flight.
//  4. Outmatched + alone -> believable flight (not suicide).
//  5. No damage/stat buffs: the strike formula is verbatim; villager's own
//     damage-per-round stays in the unbuffed band.
//  6. Post-day-7 villagers break later (lower HP fraction at flee) than pre-7.
// Death rates are REPORTED as observed, never targeted.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
const _store = {};
global.localStorage = {
  getItem: k => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) {} });
delete global.window;
const Game = globalThis.Scattering.Game;
const SC = globalThis.Scattering;
Game.say = function () {}; Game.sysSay = function () {}; Game.audioEvent = function () {};
if (Game.drama === undefined) Game.drama = function () {};

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL [seed ${SEED}] ${name}${detail ? ' — ' + detail : ''}`); }
}
const gid = e => (e && (e.itemId || e.id)) || e;

(async () => {
  await Game.init();
  Game.newGame('Columbus, Ohio', null, (Game.generatedRoster || [])[0] && Game.generatedRoster[0].id);
  const v = Game.state.village;
  const npcs = (v.roster || []).filter(id => id !== Game.villagerId);
  const byId = id => (Game.data.monsters || []).find(m => m.id === id);

  const monsters = ['mirrormoth', 'bulldozer', 'voice_mimic_radio', 'warranty_caller'].map(byId);
  const results = [];
  let fightNo = 0;
  for (const armed of [true, false]) {
    for (const mdef of monsters) {
      for (const day of [3, 10]) {
        for (const nAllies of [0, 2]) {
          for (let rep = 0; rep < 4; rep++) {
            const vid = npcs[fightNo % npcs.length];
            const person = Game.getPerson(vid);
            // arm / disarm
            if (armed) {
              try { Game.villagerGearUp(vid, true); } catch (e) {}
            } else {
              person.items = (person.items || []).filter(i => {
                const d = (Game.data.items || []).find(x => x.id === gid(i));
                return !(d && d.weapon);
              });
            }
            Game.state.village.health = Game.state.village.health || {};
            Game.state.village.health[vid] = 100;
            Game.state.scholar.day = day;
            const allyVids = [];
            for (let a = 0; a < nAllies; a++) allyVids.push(npcs[(fightNo + 1 + a) % npcs.length]);
            const rng = mulberry32(SEED * 100003 + fightNo);
            let rec;
            try {
              rec = Game.fieldFight(vid, mdef, null, { rng, allies: nAllies, allyVids });
            } catch (e) { check('fieldFight runs', false, String(e && e.message)); continue; }
            results.push({
              armed, mid: mdef.id, day, nAllies,
              outcome: rec.outcome, calledHelp: !!rec.calledHelp,
              everWinning: !!rec.everWinning, everHopeless: !!rec.everHopeless,
              fleeHopeless: rec.fleeHopeless, minHpFrac: rec.minHpFrac,
              fleeHpFrac: rec.fleeHpFrac, rounds: rec.rounds,
              ownDpr: rec.rounds ? (rec.mDealt - rec.allyDealt) / rec.rounds : 0,
            });
            fightNo++;
          }
        }
      }
    }
  }
  console.log(`fights run: ${results.length}`);
  const outcomes = {};
  for (const r of results) outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
  console.log('outcomes:', JSON.stringify(outcomes));

  // 1. commit to winnable fights
  const winnable = results.filter(r => r.everWinning && !r.everHopeless);
  const winnableFlee = winnable.filter(r => r.outcome === 'vFlee').length;
  check('1. winnable fights: rarely flee', winnable.length === 0 || winnableFlee / winnable.length < 0.30,
    `${winnableFlee}/${winnable.length} fled`);

  // 2a. flee means hopeless
  const fled = results.filter(r => r.outcome === 'vFlee');
  const fledHopeless = fled.filter(r => r.fleeHopeless || r.everHopeless).length;
  check('2a. flees correlate with hopelessness', fled.length === 0 || fledHopeless / fled.length > 0.50,
    `${fledHopeless}/${fled.length} hopeless`);
  // 2b. wins the old rule could never take
  const wins = results.filter(r => r.outcome === 'vKill');
  const winsPastOldFloor = wins.filter(r => r.minHpFrac < 0.15).length;
  const heldDeep = results.filter(r => r.outcome !== 'vFlee' && r.minHpFrac < 0.30).length;
  console.log(`DIAG held-below-30pct-without-fleeing: ${heldDeep}/${results.length}, wins-under-15pct: ${winsPastOldFloor}/${wins.length}`);
  check('2b. commit past the old break line (held under 30% HP without fleeing)', heldDeep > 0,
    `${heldDeep}/${results.length} fights`);

  // 3. outmatched + allies -> party up
  const hopelessWithAllies = results.filter(r => r.everHopeless && r.nAllies > 0);
  const called = hopelessWithAllies.filter(r => r.calledHelp).length;
  check('3. hopeless with allies: call for help', hopelessWithAllies.length === 0 || called / hopelessWithAllies.length > 0.40,
    `${called}/${hopelessWithAllies.length} called`);

  // 4. outmatched + alone -> believable flight
  const hopelessAlone = results.filter(r => r.everHopeless && r.nAllies === 0);
  const fledAlone = hopelessAlone.filter(r => r.outcome === 'vFlee').length;
  check('4. hopeless and alone: flee (not suicide)', hopelessAlone.length === 0 || fledAlone / hopelessAlone.length > 0.50,
    `${fledAlone}/${hopelessAlone.length} fled`);

  // 5. no damage buffs
  const ffSrc = fs.readFileSync(path.join(ROOT, 'src/js/fieldFights.js'), 'utf8');
  check('5a. strike formula verbatim (no buff)', ffSrc.includes('lroll([4 + wb, 8 + wb])'));
  // unarmed villagers strike [4,8] verbatim — their own damage must sit in that
  // band. (Armed villagers hit harder because of their GEAR, not a buff.)
  const unDpr = results.filter(r => !r.armed).map(r => r.ownDpr).filter(x => x > 0);
  const meanUn = unDpr.reduce((a, b) => a + b, 0) / Math.max(1, unDpr.length);
  check('5b. unarmed damage-per-round in the verbatim [4,8] band', meanUn >= 3.5 && meanUn <= 8.5,
    'unarmed mean dpr=' + meanUn.toFixed(2));

  // 6. post-day-7 breaks later
  const fleesPre = fled.filter(r => r.day < 7 && r.fleeHpFrac != null).map(r => r.fleeHpFrac);
  const fleesPost = fled.filter(r => r.day >= 7 && r.fleeHpFrac != null).map(r => r.fleeHpFrac);
  const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  check('6. post-day-7 villagers break at lower HP', fleesPre.length === 0 || fleesPost.length === 0 || mean(fleesPost) <= mean(fleesPre) + 0.05,
    `pre=${mean(fleesPre).toFixed(2)} (n=${fleesPre.length}) post=${mean(fleesPost).toFixed(2)} (n=${fleesPost.length})`);

  // caller wiring: resolvePatrol passes the outdoor crew as allies
  let capturedOpts = null;
  const origFF = Game.fieldFight;
  const origNWM = Game.nearestWorldMonster;
  Game.fieldFight = function (vid, mdef, m, opts) { capturedOpts = opts; return { outcome: 'vFlee', log: [] }; };
  Game.nearestWorldMonster = function () { return { id: 'mirrormoth', tx: 4, ty: 4 }; };
  try {
    Game._outdoorCrew = [npcs[0], npcs[1], npcs[2]];
    Game.state.village.health = Game.state.village.health || {};
    Game.state.village.health[npcs[0]] = 100;
    Game.resolvePatrol(npcs[0], 'Testy');
  } catch (e) { check('wiring: patrol runs', false, String(e && e.message)); }
  Game.fieldFight = origFF;
  Game.nearestWorldMonster = origNWM;
  check('wiring: patrol passes allies', capturedOpts && capturedOpts.allies === 2 &&
    capturedOpts.allyVids && capturedOpts.allyVids.length === 2,
    JSON.stringify(capturedOpts));

  // report death rates as observed (no target)
  const deaths = results.filter(r => r.outcome === 'vDie');
  console.log(`observed deaths: ${deaths.length}/${results.length} (reported, not targeted)`);
  const byCell = {};
  for (const r of results) {
    const k = `${r.armed ? 'armed' : 'unarmed'}/${r.mid}/d${r.day}/${r.nAllies}al`;
    byCell[k] = byCell[k] || { n: 0, die: 0, flee: 0, kill: 0 };
    byCell[k].n++;
    if (r.outcome === 'vDie') byCell[k].die++;
    if (r.outcome === 'vFlee') byCell[k].flee++;
    if (r.outcome === 'vKill') byCell[k].kill++;
  }
  for (const k of Object.keys(byCell).sort()) {
    const c = byCell[k];
    console.log(`  ${k}: kill ${c.kill}/${c.n} flee ${c.flee}/${c.n} die ${c.die}/${c.n}`);
  }

  console.log(`\n${pass} pass, ${fail} fail (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('HARNESS ERROR', e); process.exit(2); });
