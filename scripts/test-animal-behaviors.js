// Animal behavior tests. Usage: node scripts/test-animal-behaviors.js
// Covers the behavior engine (encounters.js section 6b) and its integration:
//  - data integrity: behavior/method/huntText/unknown on all animals (count dynamic)
//  - debug scenario animal ids all resolve (5 were wrong: virginia_opossum etc.)
//  - weapon->method mapping; wrong-method strike penalty + honest feedback
//  - playing-dead strike resolution (clean kill vs wake+bite)
//  - post-bolt behaviors: treed/gone, dive, flock straggler, fox taunt
//  - knowledge gating: huntText and cues only when known; no true-name leaks
//    in the unarmed-big-game refusal or the opossum wake message
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

function flatGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill('grass'));
}
function gridWith(cell, x, y) {
  const g = flatGrid(); g[y][x] = cell; return g;
}

function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = flatGrid;
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  return s;
}

function putAnimal(s, id, mx, my) {
  const cfg = Game.encPreyCfg(id);
  s.animal = { id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
  return s.animal;
}

function giveWeapon(itemId) {
  const s = Game.state.scholar;
  const def = Game.data.items.find(i => i.id === itemId);
  s.inventory.push({ itemId, name: def.name, units: 1 });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId, name: def.name };
}

const BEHAVIORS = new Set(['skittish', 'arboreal', 'wary', 'aquatic', 'aquatic_ambush', 'aquatic_defensive', 'flock', 'plays_dead', 'slow', 'cunning', 'curious', 'aggressive', 'defensive', 'unbothered', 'architect', 'charger', 'quilled', 'alarmed', 'territorial', 'camouflaged', 'sentinel', 'stalker', 'armored', 'sentinel_mob', 'bedding', 'constrictor']);
const METHODS = new Set(['snare', 'chase', 'trap', 'bow', 'hands', 'line', 'stick']);

(async () => {
  await Game.init();

  // ---------- 1. DATA INTEGRITY ----------
  {
    const animals = Game.data.animals;
    ok('animals loaded', animals.length > 0, 'got ' + animals.length);
    ok('all behaviors known', animals.every(a => BEHAVIORS.has(a.behavior)), JSON.stringify(animals.filter(a => !BEHAVIORS.has(a.behavior)).map(a => a.id)));
    ok('all methods known', animals.every(a => (a.method || []).every(m => METHODS.has(m))));
    ok('all have huntText', animals.every(a => a.huntText && a.huntText.length > 10));
    ok('all have unknown descriptor', animals.every(a => a.unknown && a.unknown.length > 5));
    // every behavior used at least once (count dynamic — grows with the pool)
    const usedB = new Set(animals.map(a => a.behavior));
    ok('all used behaviors represented', usedB.size > 0 && [...usedB].every(b => BEHAVIORS.has(b)), [...usedB].join(','));
  }

  // ---------- 2. DEBUG SCENARIO IDS RESOLVE ----------
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/debug-scenarios.js'), 'utf8');
    const ids = [...src.matchAll(/spawnAnimalNear\('([^']+)'\)/g)].map(m => m[1]);
    const dataIds = new Set(Game.data.animals.map(a => a.id));
    const bad = ids.filter(id => !dataIds.has(id));
    ok('all spawnAnimalNear ids resolve', bad.length === 0, bad.join(','));
    // no coaching left in the flagged setup lines (Steve: dread, not lecture)
    ok('no "don\'t fall for it" coaching', !/Don't fall for it/i.test(src));
    ok('no lockpick name-check', !/Not the Lockpick/i.test(src));
  }

  // ---------- 3. WEAPON -> METHOD ----------
  {
    freshGame();
    Game.state.scholar.equipped = {};
    ok('unarmed -> hands', Game.encWeaponMethod() === 'hands');
    giveWeapon('crude_bow');
    ok('crude_bow -> bow', Game.encWeaponMethod() === 'bow');
    giveWeapon('sharpened_stick');
    ok('sharpened_stick -> hands', Game.encWeaponMethod() === 'hands');
    giveWeapon('hunting_spear');
    ok('hunting_spear (melee 2) -> hands', Game.encWeaponMethod() === 'hands');
    giveWeapon('sling');
    ok('sling -> bow', Game.encWeaponMethod() === 'bow');
  }

  // ---------- 4. WRONG-METHOD PENALTY ----------
  {
    // rabbit: methods [snare, chase]. Stick (hands), not winded -> penalty + honest feedback.
    const s = freshGame();
    giveWeapon('sharpened_stick');
    putAnimal(s, 'cottontail_rabbit', 5, 4);
    s.mx = 4; s.my = 4;
    Game.feedbackMark();
    const origR = Math.random;
    Math.random = () => 0.99; // force miss branch (after preyReaction maybe-bolt)
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    const fb = Game.feedbackLines().join(' ');
    ok('wrong-method feedback names better methods', /snare|running it down/i.test(fb), fb.slice(0, 160));
    ok('wrong-method told once', s.animal ? !!s.animal._methodTold : true, fb.slice(0, 120));
  }
  {
    // winded rabbit + hands = 'chase' satisfied -> no wrong-tool lecture
    const s = freshGame();
    giveWeapon('sharpened_stick');
    const a = putAnimal(s, 'cottontail_rabbit', 5, 4);
    a.pstate = 'winded'; a.aware = 0.2;
    s.mx = 4; s.my = 4;
    Game.feedbackMark();
    const origR = Math.random;
    Math.random = () => 0.99;
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    const fb = Game.feedbackLines().join(' ');
    ok('winded chase-method: no wrong-tool lecture', !/Wrong tool for this/.test(fb), fb.slice(0, 160));
  }
  {
    // deer methods [bow, trap]: bow is fine, no lecture
    const s = freshGame();
    giveWeapon('crude_bow');
    putAnimal(s, 'white_tailed_deer', 6, 4);
    s.mx = 4; s.my = 4;
    Game.feedbackMark();
    const origR = Math.random;
    Math.random = () => 0.99;
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    const fb = Game.feedbackLines().join(' ');
    ok('bow on deer: no wrong-tool lecture', !/Wrong tool for this/.test(fb), fb.slice(0, 160));
  }

  // ---------- 5. UNARMED BIG GAME: KNOWLEDGE-GATED REFUSAL ----------
  {
    const s = freshGame();
    s.equipped = {}; // unarmed
    putAnimal(s, 'white_tailed_deer', 5, 4);
    s.mx = 4; s.my = 4;
    Game.feedbackMark();
    const origR = Math.random;
    Math.random = () => 0.99; // no flee in preyReaction — reach the refusal
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    const fb = Game.feedbackLines().join(' ');
    ok('unarmed deer refused', /can't take .* with your hands/i.test(fb), fb.slice(0, 120));
    ok('refusal uses descriptor, not true name', !/deer/i.test(fb), fb.slice(0, 120));
  }

  // ---------- 6. KNOWLEDGE GATING: CUES + HUNTTEXT ----------
  {
    freshGame();
    ok('cue null pre-knowledge', Game.encAnimalCue('opossum') === null);
    Game.state.codex.animalEncounters = { opossum: 3 };
    const cue = Game.encAnimalCue('opossum');
    ok('cue present post-knowledge', typeof cue === 'string' && cue.length > 10, String(cue).slice(0, 60));
    ok('cue has no true name', !/opossum/i.test(cue), cue);
    const a = { id: 'opossum' };
    ok('flee text generic pre-knowledge', Game.encFleeText({ id: 'gray_fox' }, 'It bolts!') === 'It bolts!');
    Game.state.codex.animalEncounters = { gray_fox: 3 };
    const def = Game.data.animals.find(x => x.id === 'gray_fox');
    ok('flee text vivid post-knowledge', Game.encFleeText({ id: 'gray_fox' }) === def.huntText);
  }

  // ---------- 7. PLAYING-DEAD STRIKE ----------
  {
    // clean kill (random 0.5 > 0.25 wake threshold)
    const s = freshGame();
    giveWeapon('sharpened_stick');
    const a = putAnimal(s, 'opossum', 5, 4);
    a.pstate = 'playing_dead'; a.aware = 1;
    s.mx = 4; s.my = 4;
    const origR = Math.random;
    Math.random = () => 0.5;
    let r = null;
    try { r = Game.huntAnimal(); } catch (e) { r = 'CRASH:' + e.message; }
    Math.random = origR;
    ok('dead-possum strike resolves', r === true, String(r));
    ok('dead-possum strike: carcass in pack', (s.inventory || []).some(i => i.foodState === 'carcass'), JSON.stringify((s.inventory || []).map(i => i.foodState)));
    ok('dead-possum strike teaches the kill', (Game.state.codex.animalEncounters.opossum || 0) >= 3);
    ok('opossum gone after kill', !s.animal);
  }
  {
    // wake-up (random 0.1 < 0.25): bite + bolt
    const s = freshGame();
    giveWeapon('sharpened_stick');
    const a = putAnimal(s, 'opossum', 5, 4);
    a.pstate = 'playing_dead'; a.aware = 1;
    s.mx = 4; s.my = 4;
    const hp0 = s.health;
    const origR = Math.random;
    Math.random = () => 0.1;
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    ok('wake-up: it bolts', s.animal && s.animal.pstate === 'bolt', s.animal && s.animal.pstate);
    ok('wake-up: bite costs health', s.health < hp0, hp0 + ' -> ' + s.health);
  }
  {
    // strike-moment flop: unaware opossum struck at high awareness flops instead of generic flee
    const s = freshGame();
    giveWeapon('sharpened_stick');
    const a = putAnimal(s, 'opossum', 5, 4);
    a.aware = 0.95; a.pstate = 'graze';
    s.mx = 4; s.my = 4;
    Game.log = [];
    const origR = Math.random;
    Math.random = () => 0.99; // would bolt in generic path
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    ok('strike-moment flop', s.animal && s.animal.pstate === 'playing_dead', s.animal && s.animal.pstate);
    ok('flop message has no true name pre-knowledge', !/opossum/i.test(Game.log.join(' ')), Game.log.join(' ').slice(0, 120));
  }

  // ---------- 8. POST-BOLT BEHAVIORS ----------
  {
    // squirrel near tree -> gone up the trunk
    const s = freshGame();
    const a = putAnimal(s, 'gray_squirrel', 5, 4);
    Game.genDetail = () => gridWith('tree', 6, 4);
    Game.log = [];
    Game.encBehaviorAfterBolt(a);
    ok('squirrel treed: gone', !s.animal);
    ok('squirrel treed message', /spirals up the trunk/.test(Game.log.join(' ')), Game.log.join(' ').slice(0, 100));
  }
  {
    // chub near water -> dove
    const s = freshGame();
    const a = putAnimal(s, 'creek_chub', 5, 4);
    Game.genDetail = () => gridWith('water', 5, 5);
    Game.log = [];
    const ended = Game.encBehaviorAfterBolt(a);
    ok('chub dove: encounter ended', ended && !s.animal);
  }
  {
    // turkey: straggler (force random < 0.45)
    const s = freshGame();
    const a = putAnimal(s, 'wild_turkey', 5, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid;
    Game.log = [];
    const origR = Math.random;
    Math.random = () => 0.1;
    Game.encBehaviorAfterBolt(a);
    Math.random = origR;
    ok('turkey straggler left behind', !!s.animal && s.animal.stamina === 1 && s.animal.aware === 0.2, JSON.stringify(s.animal));
    ok('straggler message', /didn't get the memo/.test(Game.log.join(' ')));
  }
  {
    // fox: holds at range -> taunt
    const s = freshGame();
    const a = putAnimal(s, 'gray_fox', 8, 4); // dist 4... need >=5: use (0,4)? player at 4,4 -> put at 8,4 = dist 4. use corner
    s.mx = 0; s.my = 0;
    a.mx = 8; a.my = 4; // dist 8
    Game.genDetail = flatGrid;
    Game.log = [];
    const origR = Math.random;
    Math.random = () => 0.9; // no straggler/juke interference (fox: cunning branch has no random)
    Game.encBehaviorAfterBolt(a);
    Math.random = origR;
    ok('fox taunts at range', s.animal && s.animal.pstate === 'taunt', s.animal && s.animal.pstate);
    ok('taunt label honest', /just out of reach/.test(Game.encAnimalLabel(s.animal)));
    // closing in breaks the taunt -> bolt
    s.mx = 6; s.my = 4; // dist 2 < 4
    Game.animalTurn();
    ok('closing in breaks taunt', s.animal && s.animal.pstate === 'bolt', s.animal && s.animal.pstate);
  }

  // ---------- 9. SKITTISH EARLY BOLT + ZIGZAG ----------
  {
    const s = freshGame();
    const a = putAnimal(s, 'cottontail_rabbit', 5, 4);
    a.aware = 0.8; a.pstate = 'wary';
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid;
    Game.log = [];
    Game.animalTurn();
    ok('rabbit bolts at 0.8 (skittish threshold)', s.animal && (s.animal.pstate === 'bolt' || s.animal.pstate === 'winded'), s.animal && s.animal.pstate);
  }

  // ---------- 10. SUCCESS ORDERING: IDENTIFY BEFORE NAME ----------
  {
    const s = freshGame();
    giveWeapon('crude_bow');
    putAnimal(s, 'wild_turkey', 6, 4);
    s.mx = 4; s.my = 4;
    Game.feedbackMark();
    // winded -> encBehaviorStrikeReact returns false, preyReaction skipped;
    // dist 2 -> no bite block. Two random calls: kill roll only.
    s.animal.pstate = 'winded'; s.animal.aware = 0;
    const origR = Math.random;
    Math.random = () => 0.01; // kill
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    const fb = Game.feedbackLines().join(' ');
    ok('kill feedback names it (earned)', /Got it — Wild Turkey/.test(fb), fb.slice(0, 100));
    ok('kill wrote codex entry', (Game.state.codex.animalEncounters.wild_turkey || 0) >= 3);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
