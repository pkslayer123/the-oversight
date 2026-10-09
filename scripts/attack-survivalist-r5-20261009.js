#!/usr/bin/env node
// HOSTILE PLAYTEST (survivalist r5, 2026-10-09): water/fire/rest/camp/weather.
// Fresh surface since: survivalist r4 (2026-10-09), break-it camps-7, storm
// hardening, sleep honesty chain. Canon: docs/TIME-ECONOMY.md (action costs),
// docs/PRESERVATION.md. Read CANON.md first — no invented canon.
// HOSTILE ANGLES:
//   E1 EXPLOIT: boilWater charges ZERO ticks. Canon TIME-ECONOMY matrix:
//      "Boil water (treat) | 32 (1 chunk) | 50 kcal". Current: 0 ticks,
//      30+5n kcal. Bulk purification (any N liters) costs zero time — a
//      full day-part chunk is free, on the one clock that governs everything.
//   E2 HONESTY: the "Boil NL water" button quotes no cost at all (neither
//      kcal nor ticks). Walk buttons quote ("Walking 8 squares (80 kcal)");
//      boil names the kcal only post-hoc in the say.
//   S1 SOFTLOCK/narrative-break: sleep through camp destruction. A storm at
//      the dusk transition wrecks your camp (breakCamp dumps insideTent) while
//      you're asleep in the tent — the sleep loop only wakes on fight/
//      encounter/contest. You sleep on in wreckage with stale 'tent' quality:
//      tent-quality rest + cold-snap exposure uses the dead tent's shelter.
//   H1 PROBE (expect HELD): storm +3L / rain_dancer / ant_trail addWater paths
//      bypass canCarry — check for mechanical consequence.
//   H2 PROBE (expect HELD): fillWater — dry ground refuses; creek fills for
//      1 tick + 10 kcal; haven cistern decrements.
//   H3 PROBE (expect HELD): rest — 96 ticks, crisis gate, mid-combat refusal.
//   H4 PROBE (expect HELD): gatherCharcoal — per-fire-per-day, second rake
//      on the same fire refused, different fire allowed.
//   H5 PROBE (expect HELD): drinkWater — not-thirsty refusal; risky 30% roll.
//   H6 PROBE (expect HELD): feedTentFire capped at 2x initial burn.
// Run: node scripts/attack-survivalist-r5-20261009.js (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
// SEED BEFORE EVAL (2026-10-08 lesson): modules capture Math.random at load.
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at load; deleted before play
const LOAD_ORDER = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'
];
for (const f of LOAD_ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window; // sync combat path (2026-10-06 lesson)
const Game = globalThis.Scattering.Game;
let fails = 0;
const check = (name, cond, detail) => {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};
const saidLines = [];
const origSay = Game.say ? Game.say.bind(Game) : null;

function freshGame() {
  return (async () => {
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const s = Game.state.scholar;
    s.health = 500; s.kcal = 5000; s.hydration = 100; s.mx = 4; s.my = 4;
    s.energy = 100;
    return s;
  })();
}
function grantAbility(s, id) {
  s.abilities = s.abilities || [];
  if (!s.abilities.some(a => a.id === id)) s.abilities.push({ id, level: 1 });
}
function litFireNear() {
  const s = Game.state.scholar;
  const now = Game._absTick();
  (Game.state.fires = Game.state.fires || []).push({
    tx: Game.map.px, ty: Game.map.py, cx: s.mx ?? 4, cy: (s.my ?? 4),
    till: now + 1000, burn0: 1000,
  });
}

(async () => {
  if (origSay) Game.say = (t) => { saidLines.push(String(t)); try { origSay(t); } catch (e) {} };

  // ================= E1: boilWater zero-time =================
  let s = await freshGame();
  const T = Game.TIME;
  s.water = [];
  for (let i = 0; i < 10; i++) s.water.push({ liters: 1, quality: 'risky', source: 'Creek source (unknown)' });
  grantAbility(s, 'beard_moss'); // boil anywhere, no fire needed
  const dt0 = s.dayTicks || 0, kcal0 = Math.round(s.kcal || 0);
  Game.boilWater();
  const dt1 = s.dayTicks || 0, kcal1 = Math.round(s.kcal || 0);
  const cleanCount = (s.water || []).filter(b => b.quality === 'clean').length;
  check('E1 boil purifies all 10L', cleanCount === 10, `${cleanCount}/10 clean`);
  check('E1 boil charges kcal', kcal0 - kcal1 === 30 + 5 * 10, `charged ${kcal0 - kcal1}, expect 80`);
  check('E1 boil charges 32 ticks (canon TIME-ECONOMY)', dt1 - dt0 === 32, `ticks spent: ${dt1 - dt0} (canon: 32)`);

  // ================= E2: boil with no risky water =================
  saidLines.length = 0;
  s.water = [{ liters: 1, quality: 'clean', source: 'Haven well' }];
  const dt2 = s.dayTicks || 0, kcal2 = Math.round(s.kcal || 0);
  Game.boilWater();
  check('E2 no-risky boil costs nothing', (s.dayTicks || 0) === dt2 && Math.round(s.kcal || 0) === kcal2, 'no charge');
  check('E2 no-risky boil is honest', saidLines.some(l => /No risky water/i.test(l)), JSON.stringify(saidLines.slice(-1)));

  // ================= E1b: boilWater mid-combat =================
  s = await freshGame();
  saidLines.length = 0;
  s.water = [{ liters: 1, quality: 'risky', source: 'Creek source (unknown)' }];
  grantAbility(s, 'beard_moss');
  Game.tbfight = { dummy: true };
  const dt1b = s.dayTicks || 0, kc1b = Math.round(s.kcal || 0);
  Game.boilWater();
  Game.tbfight = null;
  check('E1b boil refuses mid-fight', (s.water || [])[0].quality === 'risky', saidLines.slice(-1)[0] || 'no refusal');
  check('E1b mid-fight boil costs nothing', (s.dayTicks || 0) === dt1b && Math.round(s.kcal || 0) === kc1b, 'no charge');

  // ================= E3: boil button cost quote (static) =================
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const boilBtn = appSrc.split('\n').find(l => l.includes('Boil ${risky}L water') || l.includes('Boil ${risky}'));
  check('E3 boil button quotes its cost', !!boilBtn && /kcal|tick/i.test(boilBtn), boilBtn ? boilBtn.trim() : 'button not found');

  // ================= S1: sleep through camp destruction =================
  s = await freshGame();
  saidLines.length = 0;
  // playerAtHaven is positional; stub it so the storm takes the unsheltered
  // branch at the camp (the map has no far-away tiles in the harness)
  const realPAH = Game.playerAtHaven;
  Game.playerAtHaven = () => false;
  Game.location = 'wild';
  const campTile = Game.tileAt(Game.map.px, Game.map.py);
  campTile.type = 'forest';
  // pitch a tent by hand: grid cell + secret + camp state + inside
  const px = Game.map.px, py = Game.map.py;
  const detail = Game.genDetail(px, py);
  detail[4][5] = 'tent';
  campTile.secrets = campTile.secrets || {};
  campTile.secrets['5,4'] = { condition: 'good', known: true, yours: true, vent: true };
  s.insideTent = { tx: px, ty: py, cx: 5, cy: 4 };
  Game.state.camp = { px, py };
  // storm front pending; sleep starting in part 2 (dusk) so the 2->3
  // transition resolves the storm mid-sleep
  s.stormFront = { telegraphDay: s.day };
  s.dayTicks = T.TICKS_PER_PART * 2;
  Game.state.weather = 'clear';
  s.health = 90;
  Game.sleep();
  const wokeStartled = saidLines.some(l => /wake with a start/i.test(l));
  const dawnRest = saidLines.some(l => /Dawn\. You wake/i.test(l));
  check('S1 storm-wrecked camp wakes the sleeper', wokeStartled, wokeStartled ? 'woke with a start' : 'slept through the wreck');
  check('S1 no dawn rest accounting in wreckage', !dawnRest, dawnRest ? 'dawn rest claimed' : 'no dawn rest');
  check('S1 camp is gone', !Game.state.camp, Game.state.camp ? 'camp survived' : 'camp destroyed');
  check('S1 sleeper dumped outside', !s.insideTent, s.insideTent ? 'still inside' : 'outside');
  Game.playerAtHaven = realPAH;

  // ================= H1: storm water carry bypass =================
  s = await freshGame();
  saidLines.length = 0;
  const cap = Game.carryCapacity();
  s.water = [];
  while (Game.packWeight() + 1 <= cap) s.water.push({ liters: 1, quality: 'clean', source: 'Haven well' });
  const wBefore = Game.packWeight();
  Game.addWater(3, 'clean', 'storm');
  const over = Game.packWeight() > cap;
  check('H1 storm water cannot push pack over capacity', !over, `weight ${Game.packWeight().toFixed(1)}/${cap} (was ${wBefore.toFixed(1)})`);

  // ================= H2: fillWater =================
  s = await freshGame();
  saidLines.length = 0;
  Game.location = 'wild';
  // fillWater gates on the TILE type (playerTile().type), not the detail cell
  const wtile = Game.tileAt(Game.map.px, Game.map.py);
  wtile.type = 'forest'; // dry ground
  const kc0 = Math.round(s.kcal || 0), dt0b = s.dayTicks || 0, w0 = (s.water || []).length;
  Game.fillWater();
  check('H2 dry ground refuses', (s.water || []).length === w0, saidLines.slice(-1)[0]);
  check('H2 dry refusal costs nothing', Math.round(s.kcal || 0) === kc0 && (s.dayTicks || 0) === dt0b, 'no charge');
  // creek
  wtile.type = 'creek';
  Game.fillWater();
  const got = (s.water || []).length - w0;
  check('H2 creek fills 1L', got === 1 && s.water[s.water.length - 1].quality === 'risky', `got ${got}`);
  check('H2 fill costs 1 tick + 10 kcal', (s.dayTicks || 0) - dt0b === 1 && kc0 - Math.round(s.kcal || 0) === 10, `ticks+${(s.dayTicks||0)-dt0b} kcal-${kc0 - Math.round(s.kcal || 0)}`);

  // ================= H3: rest =================
  s = await freshGame();
  saidLines.length = 0;
  s.energy = 40; s.kcal = 5000; s.hydration = 100;
  const dt3 = s.dayTicks || 0, en0 = s.energy;
  Game.doAction('rest');
  check('H3 rest spends 96 ticks', (s.dayTicks || 0) - dt3 === 96, `spent ${(s.dayTicks || 0) - dt3}`);
  check('H3 rest restores energy', s.energy > en0, `${en0} -> ${s.energy}`);
  // crisis: starving
  s.kcal = 0; s.hydration = 100; s.health = 400; s.energy = 40;
  const hp0 = Math.round(s.health);
  Game.doAction('rest');
  check('H3 starving rest heals nothing', Math.round(s.health) === hp0, `health ${hp0} -> ${Math.round(s.health)}`);
  check('H3 starving rest still restores energy', s.energy > 40, `energy ${s.energy}`);
  // mid-combat refusal
  saidLines.length = 0;
  Game.tbfight = { dummy: true };
  const dt4 = s.dayTicks || 0;
  const r = Game.doAction('rest');
  Game.tbfight = null;
  check('H3 rest refuses mid-fight', r === false && (s.dayTicks || 0) === dt4, saidLines.slice(-1)[0] || 'no refusal');

  // ================= H4: gatherCharcoal per-fire-per-day =================
  s = await freshGame();
  saidLines.length = 0;
  s.day = 5;
  litFireNear();
  Game.state.fires.push({ tx: Game.map.px, ty: Game.map.py, cx: 6, cy: 4, till: Game._absTick() + 1000, burn0: 1000 });
  // stand next to first fire
  s.mx = 4; s.my = 4;
  const m0 = Game.materialCount('charcoal');
  Game.gatherCharcoal();
  const m1 = Game.materialCount('charcoal');
  check('H4 first rake yields charcoal', m1 > m0, `${m0} -> ${m1}`);
  saidLines.length = 0;
  Game.gatherCharcoal();
  const m2 = Game.materialCount('charcoal');
  check('H4 same fire refused same day', m2 === m1 && saidLines.some(l => /already raked/i.test(l)), saidLines.slice(-1)[0] || 'no refusal');
  // move to second fire
  s.mx = 6; s.my = 4;
  saidLines.length = 0;
  Game.gatherCharcoal();
  check('H4 different fire allowed', Game.materialCount('charcoal') > m2, 'second fire raked');

  // ================= H5: drinkWater =================
  s = await freshGame();
  saidLines.length = 0;
  s.hydration = 96;
  s.water = [{ liters: 1, quality: 'clean', source: 'Haven well' }];
  const dt5 = s.dayTicks || 0;
  Game.drinkWater();
  check('H5 not-thirsty refusal costs nothing', (s.water || []).length === 1 && (s.dayTicks || 0) === dt5, saidLines.slice(-1)[0] || 'no refusal');
  s.hydration = 40;
  s.water = [{ liters: 1, quality: 'risky', source: 'Creek source (unknown)' }];
  const dt6 = s.dayTicks || 0;
  Game.drinkWater();
  check('H5 risky drink resolves (30% roll)', (s.water || []).length === 0 && (s.dayTicks || 0) - dt6 === 1, saidLines.slice(-1)[0] || 'no line');

  // ================= H6: feedTentFire cap =================
  s = await freshGame();
  saidLines.length = 0;
  // pitch the tent for real: grid cell + yours-secret, or validateInsideTent
  // (correctly) evicts the phantom room
  const h6detail = Game.genDetail(Game.map.px, Game.map.py);
  h6detail[4][5] = 'tent';
  const h6tile = Game.tileAt(Game.map.px, Game.map.py);
  h6tile.secrets = h6tile.secrets || {};
  h6tile.secrets['5,4'] = { condition: 'good', known: true, yours: true, vent: true };
  s.insideTent = { tx: Game.map.px, ty: Game.map.py, cx: 5, cy: 4 };
  const now = Game._absTick();
  const burn0 = 2000;
  (Game.state.fires = Game.state.fires || []).push({ tx: Game.map.px, ty: Game.map.py, cx: 5, cy: 4, till: now + burn0, burn0, inside: true, lastTax: now });
  Game.addMaterial('branch', 50);
  for (let i = 0; i < 6; i++) Game.feedTentFire();
  const f = Game.tentFire();
  check('H6 tent fire capped at 2x initial burn', f && f.till <= now + burn0 * 2 + 1, f ? `till-now=${f.till - now}, cap=${burn0 * 2}` : 'fire died');

  console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
