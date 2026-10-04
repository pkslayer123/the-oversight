// UI audit 2 tests: no impossible actions, self bar above the fold, no dup buttons.
// Usage: node scripts/test-ui-audit2.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const appJs = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
}
function plantTree(kind, cx, cy) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  d[cy][cx] = kind;
  return d;
}
function give(itemId, name) {
  Game.state.scholar.inventory.push({ itemId, name: name || itemId, units: 1, kcalEach: 0, kg: 0.8 });
}

(async () => {
  await Game.init();

  // ---------- 1. cellActions: impossible actions never render ----------
  freshGame();
  plantTree('tree', 5, 4);
  let acts = Game.cellActions(5, 4);
  ok('bare hands: no Cut down', !acts.includes('Cut down'));
  ok('bare hands: no Prune branches', !acts.includes('Prune branches'));
  ok('bare hands: Gather fallen always available', acts.includes('Gather fallen'));

  freshGame();
  plantTree('tree', 5, 4);
  give('hand_saw', 'Hand Saw');
  acts = Game.cellActions(5, 4);
  ok('saw: no Cut down', !acts.includes('Cut down'));
  ok('saw: Prune branches offered', acts.includes('Prune branches'));
  ok('saw: Gather fallen offered', acts.includes('Gather fallen'));

  freshGame();
  plantTree('bigtree', 5, 4);
  give('hatchet', 'Hatchet');
  acts = Game.cellActions(5, 4);
  ok('axe: Cut down offered', acts.includes('Cut down'));
  ok('axe: Prune branches not duplicated', !acts.includes('Prune branches'));
  ok('axe: Gather fallen offered', acts.includes('Gather fallen'));

  // prune/gather actually work from the context-bar path
  freshGame();
  plantTree('tree', 5, 4);
  give('hand_saw', 'Hand Saw');
  ok('Game.pruneBranches exists', typeof Game.pruneBranches === 'function');
  ok('Game.gatherFallen exists', typeof Game.gatherFallen === 'function');

  // ---------- 2. doContextAction dispatches the new labels ----------
  ok("doContextAction maps 'Prune branches'", appJs.includes("if (label === 'Prune branches') { Game.pruneBranches(cx, cy); return; }"));
  ok("doContextAction maps 'Gather fallen'", appJs.includes("if (label === 'Gather fallen') { Game.gatherFallen(cx, cy); return; }"));

  // ---------- 3. self bar: above the fold, badges, combat-hidden ----------
  ok('selfBarHTML defined', appJs.includes('function selfBarHTML(st)'));
  ok('self bar has Eat', appJs.includes('data-self="eat"'));
  ok('self bar has Sleep', appJs.includes('data-self="sleep"'));
  ok('self bar has Pack', appJs.includes('data-self="pack"'));
  ok('self bar has Wait', appJs.includes('data-self="wait"'));
  ok('self bar hidden in combat', appJs.includes('if (st.inCombat) return \'\';'));
  ok('eat badge on low kcal', appJs.includes('st.kcal < 500'));
  ok('sleep badge on low energy', appJs.includes('st.energy < 30'));
  ok('sleep soft badge at night', appJs.includes('st.isNight ? \'<span class="dot soft"></span>\''));
  ok('pack badge on overweight', appJs.includes('st.packKg >= st.packCap'));
  ok('ord-self rendered after ord-ctx', appJs.indexOf('class="ord-self"') > appJs.indexOf('class="ord-ctx"'));
  ok('wireSelfBar called', appJs.includes('wireSelfBar();'));
  ok('eat wires Game.eat', appJs.includes("if (a === 'eat') { Game.eat(); rerender(); }"));
  ok('sleep wires Game.sleep', appJs.includes("else if (a === 'sleep') { Game.sleep(); rerender(); }"));
  ok('wait wires Game.doAction', appJs.includes("else if (a === 'wait') { Game.doAction('wait'); rerender(); }"));

  // ---------- 4. no duplicate buttons below the minimap ----------
  ok('no p-eat id', !appJs.includes('id="p-eat"'));
  ok('no p-wait id', !appJs.includes('id="p-wait"'));
  ok('no p-inv id', !appJs.includes('id="p-inv"'));
  ok('no x-sleep id', !appJs.includes('id="x-sleep"'));
  ok('sleepBtnHTML removed', !appJs.includes('sleepBtnHTML'));
  ok('haven keeps sleep hint', appJs.includes('sleepHintHTML()'));
  ok('panelNode is info-only', !/function panelNode[\s\S]{0,600}class="actions"/.test(appJs));

  // ---------- 5. talk-request badge (act-elsewhere signal) ----------
  ok('talkRequestNear defined', appJs.includes('function talkRequestNear()'));
  ok('Talk button gets badge', appJs.includes("it.label === 'Talk' && wantTalk"));

  // ---------- 6. CSS order intact ----------
  ok('CSS: ord-self order 6.5', /\.ord-self\s*\{\s*order:\s*6\.5/.test(css));
  ok('CSS: ord-self before minimap', /\.ord-minimap\s*\{\s*order:\s*11/.test(css));
  ok('CSS: selfbar styles', css.includes('.selfbar'));
  ok('CSS: dot styles', css.includes('.self-btn .dot'));
  ok('CSS: ctx-btn dot styles', css.includes('.ctx-btn .dot'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
