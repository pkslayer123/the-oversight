// Action feedback & cost-clarity tests. Usage: node scripts/test-action-feedback.js
// Steve's report: "I keep examining a tent, not seeing anything happen or
// getting told anything except the day is changing." Two linked problems:
//   1. SILENT ACTIONS — every action must produce an obvious result message,
//      even when there's nothing to find. (Tent examine silently converted
//      into a 97-tick rest.)
//   2. COST CLARITY — no low-effort action (examine, look, listen) may cost
//      more than a small tick budget; expensive actions must carry their
//      cost honestly in button labels and result messages.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// freshGame: new run, player at (4,4), controllable cell at (4,5).
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60;
  const t = Game.playerTile();
  t.stock = 10; t.maxStock = 10;
  return t;
}

// place a cell adjacent to the player (south), optionally with a secret.
function placeCell(t, cell, secret) {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  detail[5][4] = cell;
  t.secrets = t.secrets || {};
  if (secret === null) delete t.secrets['4,5'];
  else if (secret) t.secrets['4,5'] = secret;
  return detail;
}

// probe: run fn, capture new log messages + total ticks consumed.
function probe(fn) {
  const logStart = Game.log.length;
  let ticks = 0;
  const orig = Game.tickAction;
  Game.tickAction = function (n) { ticks += (n || 0); return orig.call(this, n); };
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  Game.tickAction = orig;
  return { msgs: Game.log.slice(logStart).filter(m => m && String(m).trim()), ticks, threw };
}

const LOW_EFFORT_BUDGET = 4; // examine/look/listen must cost <= 4 ticks

(async () => {
  await Game.init();

  // ---- 1. THE REPORTED BUG: tent examine must not eat the day ----
  freshGame();
  let t = Game.playerTile();
  placeCell(t, 'tent', { condition: 'good' }); // unknown tent
  let r = probe(() => Game.cellInteract(4, 5));
  ok('tent examine (unknown): says something', r.msgs.length > 0, JSON.stringify(r.msgs));
  ok('tent examine (unknown): costs <= ' + LOW_EFFORT_BUDGET + ' ticks', r.ticks <= LOW_EFFORT_BUDGET, `cost ${r.ticks}`);
  ok('tent examine (unknown): did not throw', !r.threw);

  // known good tent, tapped again — still cheap, still says something
  r = probe(() => Game.cellInteract(4, 5));
  ok('tent examine (known good): says something', r.msgs.length > 0, JSON.stringify(r.msgs));
  ok('tent examine (known good): costs <= ' + LOW_EFFORT_BUDGET + ' ticks', r.ticks <= LOW_EFFORT_BUDGET, `cost ${r.ticks}`);

  // shredded tent
  freshGame(); t = Game.playerTile();
  placeCell(t, 'tent', { condition: 'shredded' });
  r = probe(() => Game.cellInteract(4, 5));
  ok('tent examine (shredded): says something', r.msgs.length > 0);
  ok('tent examine (shredded): cheap', r.ticks <= LOW_EFFORT_BUDGET, `cost ${r.ticks}`);

  // packable tent
  freshGame(); t = Game.playerTile();
  placeCell(t, 'tent', { condition: 'packable' });
  r = probe(() => Game.cellInteract(4, 5));
  ok('tent examine (packable): says something', r.msgs.length > 0);
  ok('tent examine (packable): cheap', r.ticks <= LOW_EFFORT_BUDGET, `cost ${r.ticks}`);

  // explicit Rest is still available and honest about cost
  freshGame(); t = Game.playerTile();
  placeCell(t, 'tent', { condition: 'good', known: true });
  r = probe(() => Game.doAction('rest'));
  ok('explicit rest: says something', r.msgs.length > 0);
  ok('explicit rest: message names the time cost', /most of the|day part|part/i.test(r.msgs.join(' ')), JSON.stringify(r.msgs));

  // ---- 2. examineCell: every cell type says something, costs 2 ticks ----
  const examineCells = ['tree', 'bigtree', 'water', 'tent', 'bush', 'plant', 'fire',
    'rubble', 'dirt', 'grass', 'hall', 'bunk', 'wall'];
  for (const cell of examineCells) {
    freshGame(); t = Game.playerTile();
    placeCell(t, cell, cell === 'tent' ? { condition: 'good' } : undefined);
    r = probe(() => Game.examineCell(4, 5));
    ok(`examineCell(${cell}): says something`, r.msgs.length > 0, JSON.stringify(r.msgs));
    ok(`examineCell(${cell}): costs <= ${LOW_EFFORT_BUDGET} ticks`, r.ticks <= LOW_EFFORT_BUDGET, `cost ${r.ticks}`);
  }
  // examineCell on empty coordinate: says something, costs nothing
  freshGame();
  r = probe(() => Game.examineCell(0, 0));
  ok('examineCell(empty): says something', r.msgs.length > 0);

  // ---- 3. cellInteract across cell types: always feedback ----
  const interactCells = [
    ['tree', undefined], ['bigtree', undefined], ['water', { safe: true }],
    ['bush', undefined], ['plant', undefined], ['fire', undefined],
    ['rubble', undefined],
  ];
  for (const [cell, sec] of interactCells) {
    freshGame(); t = Game.playerTile();
    placeCell(t, cell, sec);
    r = probe(() => Game.cellInteract(4, 5));
    ok(`cellInteract(${cell}): says something`, r.msgs.length > 0, JSON.stringify(r.msgs.slice(0, 2)));
    ok(`cellInteract(${cell}): did not throw`, !r.threw, r.threw && r.threw.message);
  }

  // ---- 4. searchRoom: always says something ----
  freshGame(); t = Game.playerTile();
  placeCell(t, 'hall', undefined);
  r = probe(() => Game.searchRoom(4, 5));
  ok('searchRoom: says something', r.msgs.length > 0);
  ok('searchRoom: cheap', r.ticks <= LOW_EFFORT_BUDGET, `cost ${r.ticks}`);

  // ---- 5. doAction verbs: every one produces feedback ----
  for (const verb of ['forage', 'rest', 'treat', 'wait', 'drink']) {
    freshGame(); t = Game.playerTile();
    r = probe(() => Game.doAction(verb));
    ok(`doAction(${verb}): says something`, r.msgs.length > 0, JSON.stringify(r.msgs.slice(0, 2)));
    ok(`doAction(${verb}): did not throw`, !r.threw, r.threw && r.threw.message);
  }
  // cook with raw food + water on hand (cookAll, not a doAction verb)
  freshGame(); t = Game.playerTile();
  Game.state.scholar.inventory.push({ name: 'beans', units: 2, rawKcal: 300, needsCooking: true });
  Game.state.village.water = { clean: 10 };
  r = probe(() => Game.cookAll());
  ok('cookAll: says something', r.msgs.length > 0);

  // ---- 6. COST HONESTY: expensive actions carry their cost in labels ----
  freshGame(); t = Game.playerTile();
  placeCell(t, 'tree', { known: true });
  // ensure a fellable tree: give the player a real axe-class tool (by item id)
  Game.state.scholar.inventory.push({ id: 'hatchet', name: 'Hatchet', units: 1 });
  let labels = Game.cellActions(4, 5);
  ok('tree actions: Cut down carries cost hint', labels.some(l => /cut down/i.test(l) && /big job/i.test(l)), JSON.stringify(labels));

  freshGame(); t = Game.playerTile();
  placeCell(t, 'bush', undefined);
  labels = Game.cellActions(4, 5);
  ok('bush actions: Clear brush carries cost hint', labels.some(l => /clear brush/i.test(l) && /a while/i.test(l)), JSON.stringify(labels));

  freshGame(); t = Game.playerTile();
  placeCell(t, 'bunk', undefined);
  labels = Game.cellActions(4, 5);
  ok('bunk actions: Rest carries cost hint', labels.some(l => /rest/i.test(l) && /a while/i.test(l)), JSON.stringify(labels));

  freshGame(); t = Game.playerTile();
  placeCell(t, 'tent', { condition: 'good', known: true });
  labels = Game.cellActions(4, 5);
  ok('tent actions (known good): explicit Rest with cost hint', labels.some(l => /rest/i.test(l) && /a while/i.test(l)), JSON.stringify(labels));
  // and tapping it actually rests (the explicit path still works)
  r = probe(() => Game.doAction('rest'));
  ok('tent Rest path: rests and says so', r.msgs.length > 0 && r.ticks >= 32, `ticks=${r.ticks}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
