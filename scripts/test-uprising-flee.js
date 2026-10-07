// Uprising FLEE viability (Steve 2026-10-06): the uprising prompt offers
// FIGHT, FLEE, or TALK — this test proves FLEE is a live, meaningful option:
// a real escape route the prompt names, a sane destination, and social
// consequences (not a mechanical flag-flip).
// Usage: node scripts/test-uprising-flee.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/journal.js', 'src/js/betrayal.js',
 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}
function note(s) { console.log(`  → ${s}`); }

const said = [];
const origRand = Math.random;

function setupUprising(insideHaven) {
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = v.roster.filter(id => id !== Game.villagerId);
  v.trust = v.trust || {};
  for (const rid of roster) v.trust[rid] = 3 + Math.floor(origRand() * 6);
  const friend = roster[roster.length - 1];
  v.trust[friend] = 70;
  try { Game.recordCrime('theft', { victim: roster[0] }); } catch (e) {}
  try { Game.recordCrime('attack', { victim: roster[1] }); } catch (e) {}
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.insideHaven = insideHaven;
  Game.map.px = 3; Game.map.py = 3;
  Game.justiceState().stage = 3;
  Game.justiceState().exiled = true;
  Game.state.doorFledMonsters = null;
  const tb = Game.startVillageUprising('test: theft + assault + defiance');
  return { tb, roster, friend };
}

(async () => {
  await Game.init();
  const origSay = Game.say.bind(Game);
  Game.say = (s) => { said.push(String(s)); return origSay(s); };

  // ============ PART 1: INSIDE THE HALL — the spawn and the prompt ============
  console.log('== PART 1: spawn sanity (inside hall) ==');
  let { tb, roster, friend } = setupUprising(true);
  ok('uprising started', !!tb);
  const atk = tb.fighters.filter(f => f.kind === 'hostile');
  const dfn = tb.fighters.filter(f => f.kind === 'villager');
  const spots = atk.map(f => f.mx + ',' + f.my);
  ok('mob, not army (2-4 attackers)', atk.length >= 2 && atk.length <= 4);
  ok('attackers do NOT stack on one tile', new Set(spots).size === spots.length);
  note(`attacker tiles: ${spots.join(' ')}`);
  const detail = Game.genDetail(3, 3);
  ok('no attacker spawns on a door tile',
    atk.every(f => (detail[f.my] && detail[f.my][f.mx]) !== 'door'));
  const dsp = dfn.map(f => f.mx + ',' + f.my);
  ok('defenders do not stack either', new Set(dsp).size === dsp.length);
  ok('the triad is offered', said.some(s => s.includes('FIGHT, FLEE, or TALK')));
  ok('flee names the doors (desperate, concrete)',
    said.some(s => /doors are behind you/i.test(s)));
  ok('no casual flee framing', !said.some(s => /just (run|leave)|simply flee/i.test(s)));

  // ============ PART 2: THE FLEE — walk to the door, for real ============
  console.log('\n== PART 2: flee through the door ==');
  let guard = 0;
  while (!Game.tbIsPlayerTurn() && guard++ < 12 && Game.tbfight && !Game.tbfight.over) {
    try { Game.tbAdvance(); } catch (e) { break; }
  }
  ok('reached the player turn', Game.tbIsPlayerTurn());
  const traumaBefore = Game.state.scholar.trauma || 0;
  said.length = 0;
  let moved = false;
  try { moved = Game.tbPlayerMove(4, 6); } catch (e) { note('move threw: ' + e.message); }
  ok('walking to the door escapes', moved === true);
  ok('combat ended', !Game.tbfight);
  ok('player is outside the hall', Game.state.scholar.insideHaven === false);
  ok('flee aftermath fired', said.some(s => s.includes('You run. Behind you, the village')));
  ok('monster-flee fiction does NOT leak ("thicket")',
    !said.some(s => s.includes('The thicket keeps its secrets')));
  ok('exile is permanent', Game.justiceState().exiled === true && Game.justiceState().stage === 4);
  ok('attackers trust cratered to 0',
    atk.every(f => ((Game.state.village.trust || {})[f.villagerId] || 0) === 0));
  ok('the village will talk (gossip seeded)',
    (Game.state.village.gossip || []).some(g => g.action === 'fled_uprising'));
  ok('running your own uprising leaves a mark (trauma)',
    (Game.state.scholar.trauma || 0) > traumaBefore);
  ok('defenders who stood with you are named',
    said.some(s => s.includes('stood with you')));
  ok('no stale monster stash (no phantom bulldozer next building exit)',
    Game.state.doorFledMonsters === null);

  // ============ PART 3: OUTSIDE — treeline prompt + node-barrier flee ============
  console.log('\n== PART 3: outside on the grounds ==');
  ({ tb } = setupUprising(false));
  ok('outside uprising started', !!tb);
  ok('flee names the treeline outside',
    said.some(s => /treeline/i.test(s)));
  const atk2 = tb.fighters.filter(f => f.kind === 'hostile');
  const spots2 = atk2.map(f => f.mx + ',' + f.my);
  ok('outside attackers do not stack either', new Set(spots2).size === spots2.length);
  // The node-barrier flee: stub the 50/50 to BREAK CONTACT (rand < 0.5)
  // and walk to an edge.
  Math.random = () => 0.1;
  guard = 0;
  while (!Game.tbIsPlayerTurn() && guard++ < 12 && Game.tbfight && !Game.tbfight.over) {
    try { Game.tbAdvance(); } catch (e) { break; }
  }
  const p2 = Game.tbFighter('p');
  said.length = 0;
  let fledOutside = false;
  try {
    // Stage the player one step from the west edge (a real player walks here
    // over a couple of turns while the mob closes in), then step through.
    p2.mx = 1; p2.my = 4; p2.moveLeft = 3;
    Game.state.scholar.mx = 1; Game.state.scholar.my = 4;
    const stepOk = Game.tbPlayerMove(0, 4);
    note(`step to edge ok: ${stepOk}, player at ${p2.mx},${p2.my}`);
    fledOutside = !Game.tbfight;
  } catch (e) { note('outside flee threw: ' + e.message); }
  Math.random = origRand;
  ok('node-barrier flee ends the uprising', fledOutside);
  ok('outside flee aftermath fired',
    said.some(s => s.includes('You run. Behind you, the village')));
  ok('outside flee exiles permanently', Game.justiceState().exiled === true);
  ok('no thicket line outside either',
    !said.some(s => s.includes('The thicket keeps its secrets')));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  Math.random = origRand;
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); Math.random = origRand; process.exit(2); });
