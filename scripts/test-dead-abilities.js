// Test for 6 dead abilities fixed (Steve 2026-10-05)
// Verifies: thief, chitin_skin, adrenaline_control, patient_aim,
//           second_skin/wanderer, trust.gain_mult
// Usage: node scripts/test-dead-abilities.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/carexplore.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  console.log('=== TEST 1: thief ability (Light Fingers) ===');
  {
    // Verify the code path exists in takeFromPantry
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    check('takeFromPantry checks hasAbility(thief)', src.includes("hasAbility('thief')"));
    check('thief gives 50% no-trust-loss chance', src.includes('Math.random() < 0.5') && src.includes('palm the food cleanly'));
    check('thief caught = -20 trust', src.includes('- 20') && src.includes('Caught red-handed'));
  }

  console.log('\n=== TEST 2: chitin_skin (armor.flat) ===');
  {
    // Give the player chitin_skin and check armorBonus
    Game.state.scholar.abilities = [{ id: 'chitin_skin', level: 1 }];
    const bonus = Game.armorBonus();
    check('armorBonus includes chitin_skin +30', bonus >= 30);
    
    Game.state.scholar.abilities = [];
    const bonus2 = Game.armorBonus();
    check('armorBonus is 0 without ability/equipment', bonus2 === 0);
  }

  console.log('\n=== TEST 3: adrenaline_control (combat.dodge_chance) ===');
  {
    Game.state.scholar.abilities = [{ id: 'adrenaline_control', level: 1 }];
    const dodge = Game.modTarget('combat.dodge_chance', 0);
    check('modTarget returns dodge chance > 0', dodge > 0);
    
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    check('dodge calculation includes combat.dodge_chance', src.includes("modTarget('combat.dodge_chance'"));
  }

  console.log('\n=== TEST 4: patient_aim (combat.strike_damage round 1) ===');
  {
    Game.state.scholar.abilities = [{ id: 'patient_aim', level: 1 }];
    const mult = Game.modTarget('combat.strike_damage', 1, { round: 1 });
    check('modTarget returns 2x for patient_aim (with round context)', mult === 2);
    
    const multNoCtx = Game.modTarget('combat.strike_damage', 1, { round: 2 });
    check('modTarget returns 1x on round 2 (condition not met)', multNoCtx === 1);
    
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    check('tbPlayerStrike checks f.round === 1', src.includes('f.round === 1'));
    check('tbPlayerStrike applies combat.strike_damage', src.includes("modTarget('combat.strike_damage'"));
  }

  console.log('\n=== TEST 5: second_skin / wanderer (travel.cost_mult) ===');
  {
    Game.state.scholar.abilities = [{ id: 'second_skin', level: 1 }];
    const mult = Game.modTarget('travel.cost_mult', 1);
    check('second_skin gives 0.85x travel cost', Math.abs(mult - 0.85) < 0.01);
    
    Game.state.scholar.abilities = [{ id: 'wanderer', level: 1 }];
    const mult2 = Game.modTarget('travel.cost_mult', 1);
    check('wanderer gives 0.9x travel cost', Math.abs(mult2 - 0.9) < 0.01);
    
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    check('microMove uses travel.cost_mult', src.includes("modTarget('travel.cost_mult'"));
  }

  console.log('\n=== TEST 6: trust.gain_mult (hoarder, chitin_skin, fear_aura) ===');
  {
    Game.state.scholar.abilities = [{ id: 'hoarder', level: 1 }];
    const reduced = Game.trustGainMult(10);
    check('hoarder reduces trust gain (10 -> 8)', reduced === 8);
    
    Game.state.scholar.abilities = [];
    const normal = Game.trustGainMult(10);
    check('normal trust gain unchanged (10 -> 10)', normal === 10);
    
    Game.state.scholar.abilities = [{ id: 'fear_aura', level: 1 }];
    const reduced2 = Game.trustGainMult(10);
    check('fear_aura reduces trust gain (10 -> 9)', reduced2 === 9);
    
    Game.state.scholar.abilities = [{ id: 'chitin_skin', level: 1 }];
    const reduced3 = Game.trustGainMult(10);
    check('chitin_skin reduces trust gain (10 -> 8)', reduced3 === 8);
  }

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
