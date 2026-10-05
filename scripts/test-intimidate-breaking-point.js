// Intimidation breaking point (Steve 2026-10-05): shaking down the same
// terrified villager repeatedly must not farm forever. Second shakedown
// telegraphs ("Not again"), third breaks them: they snap (fight) or flee
// the village. Also covers the "your hands connect" grammar fix.
// Usage: node scripts/test-intimidate-breaking-point.js
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
const origRand = Math.random;

function setTemp(vid, t) {
  const vp = Game.data.villagers.find(x => x.id === vid) || (Game.data.background_survivors || []).find(x => x.id === vid);
  vp.personality = vp.personality || {}; vp.personality.temperament = t;
}
function newWorld() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
}

(async () => {
  await Game.init();
  const said = [];
  const origSay = Game.say.bind(Game);
  Game.say = (s) => { said.push(String(s)); return origSay(s); };

  // ---------- 1. first shakedown: yields, no warning ----------
  newWorld();
  let v = Game.state.village;
  const me = () => Game.villagerId;
  const others = () => v.roster.filter(id => id !== me());
  const vic = others()[0]; setTemp(vic, 'cautious');
  // make sure they have food to hand over
  try { Game.state.village['pack_' + vic] = null; } catch (e) {}
  said.length = 0;
  const r1 = Game.intimidate(vic);
  ok('1st threat: yields', r1 === 'yielded');
  ok('1st threat: no warning yet', !said.some(s => s.includes('Not again')));

  // ---------- 2. second shakedown: yields + telegraphed warning ----------
  said.length = 0;
  const r2 = Game.intimidate(vic);
  ok('2nd threat: still yields', r2 === 'yielded');
  ok('2nd threat: warns "Not again"', said.some(s => s.includes('Not again')));
  ok('warning recorded as a threat memory', ((v.memory || {})[vic] || []).filter(m => m.t === 'you_threatened').length >= 2);

  // ---------- 3a. third shakedown: SNAP branch (force coin flip) ----------
  said.length = 0;
  Math.random = () => 0.1; // < 0.5 → snap
  const r3 = Game.intimidate(vic);
  Math.random = origRand;
  ok('3rd threat: breaks (not yielded)', r3 === 'fight');
  ok('snap starts a fight', !!Game.tbfight);
  ok('snap: NPC is the aggressor (self-defense frame)', Game.tbfight && Game.tbfight.aggressor === 'npc');
  ok('snap says the breaking line', said.some(s => s.includes('breaks — not away from you')));
  if (Game.tbfight) { Game.tbEnd('fled'); Game.tbfight = null; Game._lastBetrayal = null; }

  // ---------- 3b. third shakedown: FLED branch (force coin flip) ----------
  newWorld(); v = Game.state.village;
  const vic2 = others()[0]; setTemp(vic2, 'withdrawn');
  Game.intimidate(vic2); Game.intimidate(vic2);
  said.length = 0;
  Math.random = () => 0.9; // >= 0.5 → flee
  const r4 = Game.intimidate(vic2);
  Math.random = origRand;
  ok('3rd threat (withdrawn): breaks (not yielded)', r4 === 'fled');
  ok('fled: victim leaves the roster', !v.roster.includes(vic2));
  ok('fled: recorded in exiles as fled', (v.exiles || []).some(e => e.vid === vic2 && e.how === 'fled'));
  ok('fled: the village watched', said.some(s => s.includes('nobody stops them')));
  ok('fled: still a crime on the ladder', Game.justiceState().crimes.some(c => c.type === 'intimidation' && c.victim === vic2));

  // ---------- 4. fear >= 95 breaks on the FIRST threat ----------
  newWorld(); v = Game.state.village;
  const vic3 = others()[0]; setTemp(vic3, 'cautious');
  Game.npcNeeds(vic3).fear = 96;
  said.length = 0;
  Math.random = () => 0.9;
  const r5 = Game.intimidate(vic3);
  Math.random = origRand;
  ok('fear 96: first threat breaks them', r5 === 'fled' || r5 === 'fight');

  // ---------- 5. spacing threats out does NOT break them ----------
  newWorld(); v = Game.state.village;
  const vic4 = others()[0]; setTemp(vic4, 'cautious');
  Game.intimidate(vic4);
  // age the memory past the 3-day window
  for (const m of ((v.memory || {})[vic4] || [])) if (m.t === 'you_threatened') m.day -= 10;
  Game.npcNeeds(vic4).fear = 0; // fear decayed too
  said.length = 0;
  const r6 = Game.intimidate(vic4);
  ok('old threats forgotten: yields again, no warning', r6 === 'yielded' && !said.some(s => s.includes('Not again')));

  // ---------- 6. grammar: "your hands connect", not "connects" ----------
  newWorld(); v = Game.state.village;
  const foe = others()[1]; setTemp(foe, 'warm');
  said.length = 0;
  try {
    Game.playerAttacks(foe);
    let guard = 0;
    while (Game.tbfight && guard++ < 6) {
      if (Game.tbIsPlayerTurn()) { Game.tbPlayerStrike(Game.tbFighter('h_' + foe) ? 'h_' + foe : undefined); }
      else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
      if (!Game.tbfight) break;
    }
    if (Game.tbfight) { Game.tbEnd('fled'); Game.tbfight = null; Game._lastBetrayal = null; }
  } catch (e) { /* combat sim best-effort */ }
  const strikeLines = said.filter(s => /hands connect/.test(s));
  ok('unarmed strike grammar: "your hands connect"', strikeLines.length > 0 && strikeLines.every(s => !s.includes('hands connects')));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
