// Proof tests for the moot justice-ladder rework (Steve 2026-10-06).
// BEFORE/AFTER: (1) judged crimes kept FULL heat -> after any verdict the
// ladder re-confronted every tick forever (infinite harassment loop, no
// recovery). Now judged crimes count half heat. (2) The moot summons was a
// single generic line regardless of charge/circumstance. Now it names the
// strongest witnessed charge and is voiced by the confronter's identity +
// why it's happening (refused / silence / heat). (3) The moot verdict had
// no social consequence for the accuser. Now the accuser's standing moves
// with the verdict, narrated + gossiped + remembered.
// Usage: node scripts/test-moot-justice-aftermath.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; console.log(`FAIL ${name}`); }
}

async function boot() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tickAction = () => {};
  Game.WILD_DAY_RATE = 0;
  return Game.state.village.roster.filter(id => id !== Game.villagerId);
}

// Drive the ladder to a demanded moot: theft + attack + theft, confrontation, refuse.
function driveToMoot(others) {
  const [A, B, C] = others;
  Game.recordCrime('theft', { victim: A, caught: true });
  Game.recordCrime('attack', { victim: B });
  Game.recordCrime('theft', { victim: C, caught: true });
  Game.justiceTick(); // cold shoulder
  Game.justiceTick(); // confrontation
  Game.justiceRespond('refuse');
  const said = [];
  const orig = Game.say; Game.say = (m) => { said.push(String(m)); return orig.call(Game, m); };
  Game.justiceTick(); // summons + accusation
  Game.say = orig;
  const c = (Game.betrayalState().cases || []).find(x => x.accused.includes(Game.villagerId) && x.status === 'open');
  return { case: c, said };
}

(async () => {
  // ---------- 1. judged crimes count half heat (no double jeopardy) ----------
  {
    await boot();
    Game.recordCrime('theft', { victim: 'x1', caught: true });
    Game.recordCrime('attack', { victim: 'x2' });
    const heatBefore = Game.justiceHeat(); // 35
    for (const cr of Game.justiceState().crimes) cr.caseId = 'case_judged';
    const heatAfter = Game.justiceHeat();
    ok('judged heat is half of unjudged', heatAfter === Math.round(heatBefore * 0.5));
    ok('judged heat < confrontation threshold', heatAfter < 50);
  }

  // ---------- 2. summons names the strongest witnessed charge ----------
  {
    const others = await boot();
    const { case: c, said } = driveToMoot(others);
    ok('case opened', !!c);
    const summons = said.find(s => s.startsWith('⚖') && /moot/i.test(s) && !/waited two days/.test(s));
    ok('summons line exists', !!summons);
    ok('summons names the charge (attack)', summons && /attack/i.test(summons));
    // the old generic line never named a charge; every new summons does
    ok('summons is charge-specific, not generic', summons && /the (attack|thefts|killing|threats)/i.test(summons));
  }

  // ---------- 3. summons never names unwitnessed crimes (knowledge gating) ----------
  {
    await boot();
    const others = Game.state.village.roster.filter(id => id !== Game.villagerId);
    const [A, B, C, D] = others;
    Game.recordCrime('murder', { victim: A, witnessed: false }); // unsolved: village can't prove it
    Game.recordCrime('theft', { victim: B, caught: true });
    Game.recordCrime('attack', { victim: C });
    Game.recordCrime('intimidation', { victim: D });
    Game.justiceTick(); Game.justiceTick();
    Game.justiceRespond('refuse');
    const said = [];
    const orig = Game.say; Game.say = (m) => { said.push(String(m)); return orig.call(Game, m); };
    Game.justiceTick();
    Game.say = orig;
    const summons = said.find(s => s.startsWith('⚖') && /moot/i.test(s));
    ok('summons exists', !!summons);
    ok('summons does not name the unwitnessed killing', summons && !/killing/i.test(summons));
    const c = (Game.betrayalState().cases || []).find(x => x.accused.includes(Game.villagerId) && x.status === 'open');
    ok('moot charges a provable crime, not the unsolved murder', c && c.charge !== 'murder');
  }

  // ---------- 4. silence-timeout summons acknowledges the silence ----------
  {
    await boot();
    const others = Game.state.village.roster.filter(id => id !== Game.villagerId);
    const [A, B, C] = others;
    Game.recordCrime('theft', { victim: A, caught: true });
    Game.recordCrime('attack', { victim: B });
    Game.recordCrime('theft', { victim: C, caught: true });
    Game.justiceTick(); Game.justiceTick();
    const day0 = Game.state.scholar.day;
    const said = [];
    const orig = Game.say; Game.say = (m) => { said.push(String(m)); return orig.call(Game, m); };
    Game.state.scholar.day = day0 + 2;
    Game.justiceTick();
    Game.say = orig;
    const summons = said.filter(s => s.startsWith('⚖')).pop();
    ok('silence summons fires', !!summons);
    ok('silence summons names the silence', summons && /waited|two days|silence/i.test(summons));
  }

  // ---------- 5. no re-confrontation loop after a verdict ----------
  {
    const others = await boot();
    const { case: c } = driveToMoot(others);
    ok('case opened', !!c);
    Game.resolveCase(c.id, 'weregild');
    let reConfront = 0, reMoot = 0;
    for (let i = 0; i < 8; i++) {
      Game.justiceTick();
      if (Game.justiceState().stage === 2) reConfront++;
      if (Game.justiceState().mootDemanded) reMoot++;
    }
    ok('no re-confrontation after verdict', reConfront === 0);
    ok('no re-moot after verdict', reMoot === 0);
  }

  // ---------- 6. acquittal: the accuser pays a social price ----------
  {
    const others = await boot();
    const { case: c, said } = driveToMoot(others);
    ok('case opened', !!c);
    const accuser = c.accuser;
    Game.state.village.trust[accuser] = 30;
    for (const vid of others) c.belief[vid] = 40; // village won't hold it
    const saidAfter = [];
    const orig = Game.say; Game.say = (m) => { saidAfter.push(String(m)); return orig.call(Game, m); };
    Game.conductTrial(c);
    Game.say = orig;
    ok('acquitted', c.status === 'acquitted');
    ok('accuser trust dropped', (Game.state.village.trust[accuser] || 0) < 30);
    const gossip = (Game.state.village.gossip || []).some(g => g.action === 'moot_weak_case' && g.dims && g.dims.who === accuser);
    ok('weak-case gossip seeded against accuser', gossip);
    const gr = ((Game.betrayalState() || {}).grievances || []).some(g => g.by === Game.villagerId && g.against === accuser && g.kind === 'false_accusation');
    ok('player holds a false-accusation grievance', gr);
    const mem = ((Game.state.village.memory || {})[accuser] || []).some(m => m.t === 'moot_weak_case');
    ok('accuser remembers the weak case', mem);
    const aname = Game.displayName(accuser);
    ok('accuser consequence is narrated to the player', saidAfter.some(s => s.includes(aname) && /brought this|wouldn't hold/.test(s)));
  }

  // ---------- 7. conviction: the accuser gains standing ----------
  {
    const others = await boot();
    const { case: c } = driveToMoot(others);
    ok('case opened', !!c);
    const accuser = c.accuser;
    Game.state.village.trust[accuser] = 20;
    const saidAfter = [];
    const orig = Game.say; Game.say = (m) => { saidAfter.push(String(m)); return orig.call(Game, m); };
    Game.resolveCase(c.id, 'weregild');
    Game.say = orig;
    ok('accuser trust rose', (Game.state.village.trust[accuser] || 0) > 20);
    const mem = ((Game.state.village.memory || {})[accuser] || []).some(m => m.t === 'moot_case_held');
    ok('accuser remembers the held case', mem);
    const aname = Game.displayName(accuser);
    ok('accuser vindication is narrated', saidAfter.some(s => s.includes(aname)));
  }

  // ---------- 8. exile path: ladder + exile guards still coherent ----------
  {
    const others = await boot();
    const { case: c } = driveToMoot(others);
    for (const vid of others) c.belief[vid] = -40;
    Game.conductTrial(c);
    ok('exiled after damning conviction', Game.justiceExiled() && Game.justiceStage() === 3);
    ok('exile guards refuse haven comforts', !!Game.justiceExileGuards());
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
