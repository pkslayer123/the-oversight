// SURVIVALIST adversarial playtest — needs-system break proofs (2026-10-08).
// Attacks as a HOSTILE player against water / fire / rest / weather / needs.
// Seeded (mulberry32 via shared harness) — deterministic per the PROOF-TEST
// RNG STABILITY lesson. Run: node scripts/test-survivalist-needs-20261008.js
const { boot, newWildGame } = require('./survivalist-harness');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra !== undefined ? ' :: ' + extra : ''}`); }
}

function captureSays(Game) {
  const says = [];
  Game.say = (m) => { says.push(String(m)); };
  return says;
}
// depart() is "departure lite" — Haven is a tile, so the player is still ON
// the haven tile after depart(). A truly exposed test must travel out.
function goWild(Game) {
  const targets = (Game.travelTargets() || []).filter(t => !Game.travelBlockage(t.x, t.y));
  for (const t of targets) {
    const tt = Game.tileAt(t.x, t.y);
    if (tt && tt.type !== 'haven' && tt.type !== 'ruin') {
      Game.travelTo(t.x, t.y);
      if (Game.playerTile() && Game.playerTile().type !== 'haven') return true;
    }
  }
  return false;
}
function freshFireTile(Game, s) {
  // test setup: a dirt patch beside the player + a live player fire on it
  const det = Game.genDetail(Game.map.px, Game.map.py);
  s.mx = 4; s.my = 4; det[4][5] = 'dirt'; det[4][5] = 'fire';
  Game.state.fires = [{ tx: Game.map.px, ty: Game.map.py, cx: 5, cy: 4, till: Game._absTick() + 100000 }];
}

(async () => {
  // ---------- 1. COLD-DAY SHIVER TAX (was: zero cost, pure flavor) ----------
  console.log('1. cold-day shiver tax');
  {
    const { Game } = boot(101);
    const s = await newWildGame(Game);
    captureSays(Game);
    if (!goWild(Game)) { console.log('  SKIP: no wild tile in reach'); }
    else {
      Game.location = 'wild';
      Game.dayPart = 0; s.dayTicks = 0; s.actionClock = 0;
      s.kcal = 3000; s.health = 100; s.energy = 100;
      Game.state.weather = 'cold';
      Game.advancePart(); // leave dawn
      Game.state.weather = 'cold';
      Game.advancePart(); // leave midday
      ok('exposed cold day: -40 kcal over two parts', s.kcal === 2960, 'kcal=' + s.kcal + ' tile=' + Game.playerTile().type);
      ok('exposed cold day: health untouched', s.health === 100, 'health=' + s.health);
    }
  }
  {
    // sheltered: the hall hearth protects
    const { Game } = boot(101);
    const s = await newWildGame(Game);
    captureSays(Game);
    Game.location = 'haven';
    Game.dayPart = 0; s.dayTicks = 0; s.actionClock = 0;
    s.kcal = 3000;
    Game.state.weather = 'cold';
    Game.advancePart();
    ok('at haven: no shiver tax', s.kcal === 3000, 'kcal=' + s.kcal);
  }
  {
    // near your own fire: protected
    const { Game } = boot(101);
    const s = await newWildGame(Game);
    captureSays(Game);
    if (!goWild(Game)) { console.log('  SKIP: no wild tile in reach'); }
    else {
      Game.location = 'wild';
      freshFireTile(Game, s);
      Game.dayPart = 0; s.dayTicks = 0; s.actionClock = 0;
      s.kcal = 3000;
      Game.state.weather = 'cold';
      Game.advancePart();
      ok('fireside: no shiver tax', s.kcal === 3000, 'kcal=' + s.kcal);
    }
  }
  {
    // cold_blooded budgets through it
    const { Game } = boot(101);
    const s = await newWildGame(Game);
    captureSays(Game);
    if (!goWild(Game)) { console.log('  SKIP: no wild tile in reach'); }
    else {
      Game.location = 'wild';
      Game.dayPart = 0; s.dayTicks = 0; s.actionClock = 0;
      s.kcal = 3000;
      s.abilities = ['cold_blooded'];
      Game.state.weather = 'cold';
      Game.advancePart();
      ok('cold_blooded: no shiver tax', s.kcal === 3000, 'kcal=' + s.kcal);
    }
  }

  // ---------- 2. COLD-NIGHT WAIT BYPASS (was: fully dodged for free) ----------
  console.log('2. cold-night wait bypass');
  {
    const { Game } = boot(202);
    const s = await newWildGame(Game);
    const says = captureSays(Game);
    if (!goWild(Game)) { console.log('  SKIP: no wild tile in reach'); }
    else {
      Game.location = 'wild';
      Game.dayPart = 2; s.dayTicks = 256; s.actionClock = 0; // dusk
      s.kcal = 3000; s.health = 100; s.energy = 100; s.hydration = 100;
      Game.state.weather = 'cold';
      Game.doAction('wait'); // wait through dusk->night->dawn
      ok('wait through cold night: -12 health bite', s.health === 88, 'health=' + s.health);
      ok('wait through cold night: energy capped at 40', s.energy <= 40, 'energy=' + s.energy);
      ok('bite is named honestly', says.some(m => m.includes('-12 health')), says.slice(-3).join(' | '));
    }
  }
  {
    // sleepers keep their OWN accounting: exactly -18, no double bite
    const { Game } = boot(303);
    const s = await newWildGame(Game);
    captureSays(Game);
    if (!goWild(Game)) { console.log('  SKIP: no wild tile in reach'); }
    else {
      Game.location = 'wild';
      Game.dayPart = 2; s.dayTicks = 256; s.actionClock = 0;
      s.kcal = 3000; s.health = 100; s.energy = 100; s.hydration = 100;
      Game.state.weather = 'cold';
      Game.sleep();
      // dusk shiver tax (-20 kcal) + sleeper exposure (-18 health, no double bite)
      ok('sleeper: no double bite (-18 exactly)', s.health === 82, 'health=' + s.health);
      ok('sleeper: dusk shiver tax still applied', s.kcal < 3000, 'kcal=' + s.kcal);
    }
  }
  {
    // at haven: the night bite does not fire
    const { Game } = boot(202);
    const s = await newWildGame(Game);
    captureSays(Game);
    Game.location = 'haven';
    Game.dayPart = 2; s.dayTicks = 256; s.actionClock = 0;
    s.kcal = 3000; s.health = 100; s.energy = 100; s.hydration = 100;
    Game.state.weather = 'cold';
    Game.doAction('wait');
    ok('haven night: no cold bite', s.health === 100, 'health=' + s.health);
  }

  // ---------- 3. RAIN HAS TEETH ON FRICTION FIRE (was: 77/200 == 77/200) ----------
  console.log('3. rain vs friction fire');
  {
    const { Game, reseed } = boot(4242);
    const s = await newWildGame(Game);
    captureSays(Game);
    s.kcal = 99999;
    Game.npcBatchTurn = () => {}; Game.monsterTurn = () => {}; // freeze world RNG noise
    const det = Game.genDetail(Game.map.px, Game.map.py);
    s.mx = 4; s.my = 4; det[4][5] = 'dirt';
    const spot = [5, 4];
    function attempt(weather, n) {
      let wins = 0;
      for (let i = 0; i < n; i++) {
        reseed(1000 + i); // paired seeds: identical RNG per attempt, both weathers
        Game.state.weather = weather;
        s.dayTicks = 0; s.actionClock = 0; Game.dayPart = 0;
        s.firecraft = { attempts: 0, successes: 0, failures: 0 };
        s.inventory = s.inventory.filter(x => x.material !== 'branch');
        s.inventory.push({ material: 'branch', units: 4, name: 'branches', kg: 0.2 });
        Game.state.fires = [];
        det[spot[1]][spot[0]] = 'dirt';
        try { Game.makeFire(spot[0], spot[1]); } catch (e) {}
        if (det[spot[1]][spot[0]] === 'fire') wins++;
        Game.state.fires = []; det[spot[1]][spot[0]] = 'dirt';
      }
      return wins;
    }
    const N = 200;
    const clearWins = attempt('clear', N);
    const rainWins = attempt('rain', N);
    console.log(`     clear ${clearWins}/${N}  rain ${rainWins}/${N}`);
    ok('rain hurts friction fire (paired seeds)', rainWins < clearWins, `clear=${clearWins} rain=${rainWins}`);
    ok('rain does not make fire impossible', rainWins > 0, `rain=${rainWins}`);
  }

  // ---------- 4. BOIL-WATER BATCH SCALING (was: flat 30 kcal for 10L) ----------
  console.log('4. boil-water batch scaling');
  {
    const { Game } = boot(404);
    const s = await newWildGame(Game);
    const says = captureSays(Game);
    Game.location = 'wild';
    freshFireTile(Game, s);
    s.kcal = 5000;
    s.water = [];
    for (let i = 0; i < 10; i++) s.water.push({ liters: 1, quality: 'risky', source: 'Creek' });
    Game.boilWater();
    const clean = s.water.filter(b => b.quality === 'clean').length;
    ok('10L risky -> 10L clean', clean === 10, 'clean=' + clean);
    ok('10L costs 30 + 5*10 = 80 kcal', s.kcal === 4920, 'kcal=' + s.kcal);
    ok('cost is named honestly', says.some(m => m.includes('-80 kcal')), says.join(' | '));
  }
  {
    const { Game } = boot(404);
    const s = await newWildGame(Game);
    captureSays(Game);
    freshFireTile(Game, s);
    s.kcal = 5000;
    s.water = [{ liters: 1, quality: 'risky', source: 'Creek' }];
    Game.boilWater();
    ok('1L costs 30 + 5 = 35 kcal', s.kcal === 4965, 'kcal=' + s.kcal);
  }
  {
    const { Game } = boot(404);
    const s = await newWildGame(Game);
    const says = captureSays(Game);
    freshFireTile(Game, s);
    s.kcal = 5000;
    s.water = [{ liters: 1, quality: 'clean', source: 'Haven well' }];
    Game.boilWater();
    ok('no risky water: no charge, honest line', s.kcal === 5000 && says.some(m => m.includes('No risky water')), 'kcal=' + s.kcal);
  }

  // ---------- 5. SOFTLOCK: bottomed-out needs (target holds) ----------
  // Village-as-protagonist (Steve 2026-10-04): death passes the mantle — the
  // run does NOT end when the bearer dies. The correct assertion: a
  // bottomed-out bearer DIES (mantle passes or run ends), nothing sticks,
  // no exception, actions stay callable the whole way down.
  console.log('5. softlock probe: bottomed-out needs');
  {
    const { Game } = boot(505);
    const s0 = await newWildGame(Game);
    captureSays(Game);
    if (!goWild(Game)) { console.log('  SKIP: no wild tile in reach'); }
    else {
      Game.location = 'wild';
      const s = Game.state.scholar;
      s.kcal = 0; s.hydration = 0; s.health = 30; s.energy = 0;
      s.water = []; s.inventory = [];
      let threw = null, days = 0;
      // NOTE: playerDeath mutates the SAME scholar object in place (mantle
      // pass: s.villagerId / Game.villagerId change, body stats refresh).
      // Object identity can't detect death — the villagerId can.
      const id0 = Game.villagerId;
      try {
        while (!Game.over && Game.villagerId === id0 && days < 10) {
          // the hostile player keeps acting while dying: wait + forage stay callable
          Game.doAction('wait');
          if (!Game.over && Game.villagerId === id0) Game.doAction('forage');
          days++;
        }
      } catch (e) { threw = e; }
      const mantlePassed = Game.villagerId !== id0;
      ok('no exception while bottomed out', threw === null, threw && threw.message);
      ok('the bearer dies (mantle passes or run ends) — no stuck state',
        !!Game.over || mantlePassed, `days=${days} over=${Game.over} mantlePassed=${mantlePassed}`);
      ok('death came from the spiral, not a hang', days >= 1 && days <= 10, 'days=' + days);
    }
  }

  // ---------- 6. HONESTY: cost labels and promises ----------
  console.log('6. honesty checks');
  {
    // rest names its kcal cost in the result line
    const { Game } = boot(606);
    const s = await newWildGame(Game);
    const says = captureSays(Game);
    Game.location = 'wild';
    s.kcal = 3000; s.energy = 10; s.health = 90;
    Game.dayPart = 1; s.dayTicks = 128; s.actionClock = 0;
    Game.doAction('rest');
    ok('rest names -40 kcal', says.some(m => m.includes('-40 kcal')), says.join(' | '));
    ok('rest actually charged 40 kcal', s.kcal === 2960, 'kcal=' + s.kcal);
  }
  {
    // dry cistern promises water duty — and water duty EXISTS and refills
    const { Game } = boot(607);
    const s = await newWildGame(Game);
    const says = captureSays(Game);
    Game.location = 'haven';
    Game.state.village.water = { clean: 0, dirty: 0 };
    Game.fillWater();
    ok('dry cistern names the fix (water duty)', says.some(m => m.includes('water duty')), says.join(' | '));
    const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
    if (vid && typeof Game.resolveAssignments === 'function') {
      Game.state.village.assignments = Game.state.village.assignments || {};
      Game.state.village.assignments[vid] = { task: 'water' };
      const before = Game.state.village.water.clean;
      Game.resolveAssignments();
      ok('water duty refills the cistern (promise kept)', Game.state.village.water.clean > before,
        `before=${before} after=${Game.state.village.water.clean}`);
    } else {
      console.log('  SKIP water-duty refill: no NPC roster id available');
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
