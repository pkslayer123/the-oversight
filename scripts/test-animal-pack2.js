// Animal pack 2 behavior tests (Steve 2026-10-06): wild_boar (charger),
// north_american_porcupine (quilled), groundhog (alarmed), canada_goose
// (territorial), american_woodcock (camouflaged), north_american_beaver
// (sentinel), bobcat (stalker). One test per behavior/fix, plus:
// tool-readiness gating, tracker-level sign reads, butcher materials.
// Usage: node scripts/test-animal-pack2.js
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
function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
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
const origR = Math.random;

(async () => {
  await Game.init();

  // ---------- 1. DATA: 7 new animals, distinct behaviors ----------
  {
    const ids = ['wild_boar', 'north_american_porcupine', 'groundhog', 'canada_goose', 'american_woodcock', 'north_american_beaver', 'bobcat'];
    const dataIds = new Set(Game.data.animals.map(a => a.id));
    ok('all 7 new animals present', ids.every(id => dataIds.has(id)), ids.filter(id => !dataIds.has(id)).join(','));
    const behs = ids.map(id => Game.data.animals.find(a => a.id === id).behavior);
    ok('all 7 behaviors distinct', new Set(behs).size === 7, behs.join(','));
    ok('all have tell + huntText + unknown', ids.every(id => {
      const a = Game.data.animals.find(x => x.id === id);
      return a.tell && a.tell.length > 10 && a.huntText && a.huntText.length > 10 && a.unknown && a.unknown.length > 5;
    }));
    ok('unknowns leak no true name', ids.every(id => {
      const a = Game.data.animals.find(x => x.id === id);
      const words = a.name.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !['north', 'american'].includes(w));
      return !words.some(w => a.unknown.toLowerCase().includes(w));
    }));
    const boar = Game.data.animals.find(a => a.id === 'wild_boar');
    const cock = Game.data.animals.find(a => a.id === 'american_woodcock');
    ok('boar kcal ~ deer scale', boar.calories >= 15000 && boar.calories <= 30000, String(boar.calories));
    ok('woodcock kcal tiny', cock.calories < 300, String(cock.calories));
    const pork = Game.data.animals.find(a => a.id === 'north_american_porcupine');
    ok('porcupine butchers quills', (pork.butcher || {}).quill >= 10);
    ok('boar butchers tusks', (boar.butcher || {}).tusk >= 1);
  }

  // ---------- 2. BOAR: paws a warning, then charges ----------
  {
    const s = freshGame();
    const a = putAnimal(s, 'wild_boar', 6, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid; Game.log = [];
    Game.animalTurn();
    ok('boar paws warning at dist<=3', a.pstate === 'pawing', a.pstate);
    ok('boar warning text distinct', /paw/i.test(Game.log.join(' ')), Game.log.join(' ').slice(0, 100));
    a.mx = 5; a.my = 4;
    Game.log = [];
    Game.animalTurn();
    ok('boar charges at dist<=1', a.pstate === 'charging', a.pstate);
    Game.log = [];
    const hp0 = s.health;
    Game.animalTurn();
    ok('charge gores', s.health < hp0, hp0 + ' -> ' + s.health);
    ok('boar winded after charge (overcommitted)', a.pstate === 'winded', a.pstate);
  }
  {
    const s = freshGame();
    giveWeapon('crude_bow');
    const a = putAnimal(s, 'wild_boar', 6, 4);
    a.pstate = 'pawing'; a.aware = 0.8;
    s.mx = 4; s.my = 4;
    Game.feedbackMark();
    Math.random = () => 0.99; // no flee in preyReaction — reach the charge hook
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    ok('strike on pawing boar answers with the charge (gored, winded)', s.health < 100 && a.pstate === 'winded', a.pstate + ' hp=' + s.health);
    ok('boar still in encounter (no kill, no flee)', !!s.animal);
  }

  // ---------- 3. PORCUPINE: quills, never bolts ----------
  {
    const s = freshGame();
    const a = putAnimal(s, 'north_american_porcupine', 5, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid; Game.log = [];
    Game.animalTurn();
    ok('porcupine quill warning at dist<=1', /quill/i.test(Game.log.join(' ')), Game.log.join(' ').slice(0, 100));
    s.equipped = {};
    Game.feedbackMark();
    const hp0 = s.health;
    Math.random = () => 0.99;
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    const fb = Game.feedbackLines().join(' ');
    ok('barehanded grab = quills', /Quills/.test(fb) && s.health < hp0, fb.slice(0, 120));
    ok('quills compromise the encounter', a.quilledYou === true);
    for (let i = 0; i < 6 && s.animal; i++) { a.aware = 1; Game.animalTurn(); }
    ok('porcupine never bolts', !!s.animal && s.animal.pstate !== 'bolt', s.animal && s.animal.pstate);
  }

  // ---------- 4. GROUNDHOG: whistle + 2-tile sprint to the burrow ----------
  {
    // 4a. whistle: fresh animal, mid awareness
    const s = freshGame();
    const a = putAnimal(s, 'groundhog', 6, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid; Game.log = [];
    a.aware = 0.55; a.pstate = 'wary';
    Game.animalTurn();
    ok('groundhog whistles once', !!a.whistled && /whistle/i.test(Game.log.join(' ')));
    ok('whistle sets woods-on-edge', !!(s.whAlert && s.whAlert.day === s.day));
  }
  {
    // 4b. sprint: fresh animal, already bolting, mid-grid — 2 tiles/turn
    const s = freshGame();
    const a = putAnimal(s, 'groundhog', 5, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid;
    a.pstate = 'bolt'; a.aware = 1; a.stamina = 4; a.whistled = true;
    const x0 = a.mx;
    Game.animalTurn();
    ok('groundhog sprints 2 tiles', s.animal && Math.abs(a.mx - x0) === 2, `${x0} -> ${a.mx}`);
  }
  {
    // 4c. burrow: at the edge, one turn is enough — down the hole
    const s = freshGame();
    const a = putAnimal(s, 'groundhog', 7, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid; Game.log = [];
    a.pstate = 'bolt'; a.aware = 1; a.stamina = 4; a.whistled = true; a.edgeTurns = 0;
    Game.animalTurn();
    ok('groundhog vanishes down the burrow', !s.animal, JSON.stringify(s.animal));
    ok('burrow text, not treeline', /burrow/.test(Game.log.join(' ')), Game.log.join(' ').slice(0, 120));
  }
  {
    const s = freshGame();
    s.whAlert = { day: s.day };
    Game.genDetail = flatGrid; Game.log = [];
    // playerTile is the haven post-depart(); stub a meadow so spawns can fire
    const origPT = Game.playerTile;
    Game.playerTile = () => ({ type: 'meadow' });
    let spawned = null;
    for (let i = 0; i < 60 && !spawned; i++) {
      try { Game.checkAnimals(); } catch (e) {}
      if (s.animal) spawned = s.animal;
    }
    Game.playerTile = origPT;
    ok('spawn happened', !!spawned);
    if (spawned) {
      ok('next animal spawns wary (woods on edge)', spawned.aware >= 0.5, String(spawned.aware));
      ok('edge announced', /on edge/i.test(Game.log.join(' ')));
    }
  }

  // ---------- 5. GOOSE: advances, never bolts, backing off settles ----------
  {
    const s = freshGame();
    const a = putAnimal(s, 'canada_goose', 7, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid; Game.log = [];
    Game.animalTurn();
    ok('goose advances on you', a.pstate === 'advancing' && a.mx < 7, a.pstate + ' @' + a.mx);
    ok('goose honks', /honk/i.test(Game.log.join(' ')));
    a.mx = 5; a.my = 4;
    const hp0 = s.health;
    Game.animalTurn();
    ok('goose buffets at dist<=1', s.health < hp0, hp0 + ' -> ' + s.health);
    s.mx = 0; s.my = 0; a.mx = 8; a.my = 8;
    Game.animalTurn();
    ok('goose settles when you back off', a.pstate === 'graze', a.pstate);
    s.mx = 4; s.my = 4; a.mx = 6; a.my = 4;
    for (let i = 0; i < 6 && s.animal; i++) { a.aware = 1; Game.animalTurn(); }
    ok('goose never bolts', !!s.animal && s.animal.pstate !== 'bolt', s.animal && s.animal.pstate);
  }

  // ---------- 6. WOODCOCK: invisible until underfoot, then explodes ----------
  {
    const s = freshGame();
    const a = putAnimal(s, 'american_woodcock', 6, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid;
    // hold it at dist 2 (graze wander would muddy the read)
    for (let i = 0; i < 5; i++) { a.mx = 6; a.my = 4; a.pstate = 'graze'; Game.animalTurn(); }
    ok('woodcock unnoticed at dist 2 (notice 1)', a.aware < 0.5, String(a.aware));
    // pin it: it may have wandered during the graze turns
    a.mx = 6; a.my = 4; s.mx = 5; s.my = 4;
    a.aware = 0.8; a.pstate = 'graze';
    Game.log = [];
    Game.animalTurn();
    ok('woodcock explodes from underfoot', a.pstate === 'bolt' && /EXPLODES|whir/i.test(Game.log.join(' ')), Game.log.join(' ').slice(0, 100));
  }

  // ---------- 7. BEAVER: tail-slap ends the hunt + warns the creek ----------
  {
    const s = freshGame();
    const a = putAnimal(s, 'north_american_beaver', 6, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid; Game.log = [];
    a.aware = 0.75;
    Game.animalTurn();
    ok('beaver slaps and dives', !s.animal, JSON.stringify(s.animal));
    ok('slap text is the gunshot', /CRACK/.test(Game.log.join(' ')), Game.log.join(' ').slice(0, 100));
    ok('slap warns the creek', !!(s.whAlert && s.whAlert.day === s.day));
  }

  // ---------- 8. BOBCAT: stalks you; running invites chase; holding ground bores it ----------
  {
    const s = freshGame();
    const a = putAnimal(s, 'bobcat', 7, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid; Game.log = [];
    Game.animalTurn();
    ok('bobcat pads closer', a.mx < 7, `${7} -> ${a.mx}`);
    ok('bobcat stalk text', /circles closer|deciding whether you are/i.test(Game.log.join(' ')), Game.log.join(' ').slice(0, 100));
    Game.log = [];
    for (let i = 0; i < 3 && s.animal; i++) Game.animalTurn();
    ok('bobcat melts away when bored', !s.animal, JSON.stringify(s.animal));
  }
  {
    const s = freshGame();
    const a = putAnimal(s, 'bobcat', 6, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid;
    Game.animalTurn();
    s.mx = 2; s.my = 4;
    Game.log = [];
    Game.animalTurn();
    ok('bobcat follows when you run', /pads after you|invites the chase/i.test(Game.log.join(' ')), Game.log.join(' ').slice(0, 100));
    s.mx = 4; s.my = 4; a.mx = 5; a.my = 4; a.lastDist = 1;
    const hp0 = s.health;
    Game.animalTurn();
    ok('bobcat slashes at dist<=1', s.health < hp0, hp0 + ' -> ' + s.health);
  }
  {
    const s = freshGame();
    giveWeapon('crude_bow');
    const a = putAnimal(s, 'bobcat', 6, 4);
    s.mx = 4; s.my = 4;
    Game.feedbackMark();
    const hp0 = s.health;
    Math.random = () => 0.99;
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    const fb = Game.feedbackLines().join(' ');
    ok('bobcat miss: slashes and melts away', !s.animal && s.health < hp0, fb.slice(0, 140));
  }

  // ---------- 9. TOOL READINESS: missing tools named honestly ----------
  {
    const s = freshGame();
    s.inventory = []; s.tools = []; // deterministic: starting packs are randomized
    const def = Game.data.items.find(i => i.id === 'sharpened_stick');
    s.inventory.push({ itemId: 'sharpened_stick', name: def.name, units: 1 });
    s.equipped = { weapon: { itemId: 'sharpened_stick', name: def.name } };
    const a = putAnimal(s, 'north_american_beaver', 5, 4);
    a.pstate = 'winded'; a.aware = 0;
    s.mx = 4; s.my = 4;
    Game.feedbackMark();
    Math.random = () => 0.99;
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    const fb = Game.feedbackLines().join(' ');
    ok('unprepared hunt names missing tools', /don't have the right tool/i.test(fb) && /trapping|bow/i.test(fb), fb.slice(0, 200));
  }
  {
    const s = freshGame();
    giveWeapon('crude_bow');
    const a = putAnimal(s, 'north_american_beaver', 5, 4);
    a.pstate = 'winded'; a.aware = 0;
    s.mx = 4; s.my = 4;
    Game.feedbackMark();
    Math.random = () => 0.99;
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    const fb = Game.feedbackLines().join(' ');
    ok('proper tool: no unprepared lecture', !/don't have the right tool/.test(fb), fb.slice(0, 160));
  }
  {
    const s = freshGame();
    s.inventory = []; s.tools = []; // deterministic: starting packs are randomized
    ok('snare not ready without wire', Game.encMethodToolReady('snare') === false);
    s.inventory.push({ itemId: 'snare_wire', name: 'Snare wire', units: 1 });
    ok('snare ready with wire', Game.encMethodToolReady('snare') === true);
    ok('line not ready', Game.encMethodToolReady('line') === false);
    s.inventory.push({ itemId: 'fishing_line', name: 'Fishing Line', units: 1 });
    ok('line ready with fishing line', Game.encMethodToolReady('line') === true);
    ok('hands always ready', Game.encMethodToolReady('hands') === true);
  }

  // ---------- 10. TRACKING DEPTH: L1/L2 sign reads ----------
  {
    const s = freshGame();
    const a = putAnimal(s, 'wild_boar', 6, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid;
    // track_read SKILL = the gate (can read sign); tracker ABILITY level = the depth
    Game.state.codex.skills = { track_read: { level: 1 } };
    s.abilities = [{ id: 'tracker', level: 2 }];
    Game.state.codex.animalEncounters = { wild_boar: 3 };
    Game.feedbackMark();
    Game.stalkAnimal();
    const fb = Game.feedbackLines().join(' ');
    ok('L2 tracker reads freshness + gait', /fresh|hours old/.test(fb) && /ambling|running|moving/.test(fb), fb.slice(0, 200));
    ok('known species named in sign', /Wild Boar/i.test(fb), fb.slice(0, 200));
  }
  {
    const s = freshGame();
    putAnimal(s, 'bobcat', 6, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid;
    Game.state.codex.skills = { track_read: { level: 1 } };
    s.abilities = [{ id: 'tracker', level: 2 }];
    Game.state.codex.animalEncounters = {};
    Game.feedbackMark();
    Game.stalkAnimal();
    const fb = Game.feedbackLines().join(' ');
    ok('unknown species reads as something', /something prints/i.test(fb) && !/bobcat/i.test(fb), fb.slice(0, 200));
  }

  // ---------- 11. CUES: knownCue per new behavior, null pre-knowledge ----------
  {
    freshGame();
    const ids = ['wild_boar', 'north_american_porcupine', 'groundhog', 'canada_goose', 'american_woodcock', 'north_american_beaver', 'bobcat'];
    ok('cues null pre-knowledge', ids.every(id => Game.encAnimalCue(id) === null));
    for (const id of ids) Game.state.codex.animalEncounters[id] = 3;
    const cues = ids.map(id => Game.encAnimalCue(id));
    ok('all cues present post-knowledge', cues.every(c => typeof c === 'string' && c.length > 10), JSON.stringify(cues));
    ok('cues leak no true names', !cues.some((c, i) => {
      const a = Game.data.animals.find(x => x.id === ids[i]);
      const words = a.name.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      return words.some(w => c.toLowerCase().includes(w));
    }), cues.join(' | ').slice(0, 200));
  }

  // ---------- 12. PHASE BADGES for new pstates ----------
  {
    freshGame();
    ok('pawing badge', Game.encPreyPhaseBadge({ pstate: 'pawing' }) === '⚠ pawing ground');
    ok('advancing badge', Game.encPreyPhaseBadge({ pstate: 'advancing' }) === '🪿 advancing');
    ok('charging badge', Game.encPreyPhaseBadge({ pstate: 'charging' }) === '💥 charging');
  }

  // ---------- 13. STRIKE NEVER ROUTS THE STANDERS ----------
  {
    // goose struck: no "explodes away" — the strike resolves, it stands
    const s = freshGame();
    giveWeapon('crude_bow');
    const a = putAnimal(s, 'canada_goose', 6, 4);
    a.aware = 1; a.pstate = 'advancing';
    s.mx = 4; s.my = 4;
    Game.feedbackMark(); Game.log = [];
    Math.random = () => 0.99; // guaranteed miss -> encMissReact (retaliation, not flight)
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    ok('goose strike never flees', !!s.animal && s.animal.pstate !== 'bolt', s.animal && s.animal.pstate);
    ok('goose miss retaliates (advancing)', s.animal && s.animal.pstate === 'advancing', s.animal && s.animal.pstate);
    ok('no explode-away text for goose', !/explodes away/i.test(Game.log.join(' ')), Game.log.join(' ').slice(0, 120));
  }
  {
    // boar pawing strike: the charge lands IN the strike (no free 2nd strike)
    const s = freshGame();
    giveWeapon('crude_bow');
    const a = putAnimal(s, 'wild_boar', 6, 4);
    a.pstate = 'pawing'; a.aware = 0.8;
    s.mx = 4; s.my = 4;
    const hp0 = s.health;
    Game.feedbackMark();
    Math.random = () => 0.99;
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    ok('pawing strike gores immediately', s.health < hp0, hp0 + ' -> ' + s.health);
    ok('boar winded after the answered charge', a.pstate === 'winded', a.pstate);
  }
  {
    // beaver: the slap is the only exit — never a generic bolt
    const s = freshGame();
    const a = putAnimal(s, 'north_american_beaver', 6, 4);
    s.mx = 4; s.my = 4;
    Game.genDetail = flatGrid; Game.log = [];
    a.aware = 1; // max awareness, several turns
    for (let i = 0; i < 4 && s.animal; i++) Game.animalTurn();
    ok('beaver slaps instead of bolting', !s.animal && /CRACK/.test(Game.log.join(' ')), Game.log.join(' ').slice(0, 120));
  }
  {
    // charger bite text: tusks, not teeth
    const s = freshGame();
    const def = Game.data.items.find(i => i.id === 'sharpened_stick');
    s.inventory.push({ itemId: 'sharpened_stick', name: def.name, units: 1 });
    s.equipped = { weapon: { itemId: 'sharpened_stick', name: def.name } };
    const a = putAnimal(s, 'wild_boar', 5, 4);
    a.pstate = 'winded'; a.aware = 0; // winded: strike resolves, no charge
    s.mx = 4; s.my = 4;
    Game.feedbackMark();
    // force the bite (0.2 chance): stub random low for bite, then high for miss
    let calls = 0;
    Math.random = () => { calls++; return calls === 1 ? 0.05 : 0.99; };
    try { Game.huntAnimal(); } catch (e) {}
    Math.random = origR;
    const fb = Game.feedbackLines().join(' ');
    ok('boar bite text names the tusk', /tusk/i.test(fb), fb.slice(0, 160));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
