// Verify: deflected 'past' ask no longer journals occupation/backstory,
// while a real 'past' answer still teaches. (Steve 2026-10-06)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js', 'src/js/progression.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : (fail++, console.log(`FAIL ${n}${x ? ' — ' + x : ''}`)); };

(async () => {
  await Game.init();
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.systemArrived = false;
  Game.state.codex.people = {};
  Game.state.village.trust = Game.state.village.trust || {};

  // find a withdrawn/prickly villager with a real occupation
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  let vid = null;
  for (const id of roster) {
    const t = Game.npcTemper(id);
    const v = (Game.data.villagers || []).find(x => x.id === id) || (Game.data.background_survivors || []).find(x => x.id === id) || {};
    if ((t === 'withdrawn' || t === 'prickly') && v.formerOccupation) { vid = id; break; }
  }
  ok('setup: deflect-capable villager with occupation', !!vid, vid || 'none found');
  if (!vid) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }

  const realRandom = Math.random;
  // --- deflected ask ---
  Game.state.village.trust[vid] = 10;
  Game.startConvo(vid);
  Math.random = () => 0.1; // force the <0.55 deflect roll
  const line = Game.convoAskTopic(vid, 'past');
  Math.random = realRandom;
  ok('deflect: got a shutdown line', /before|talk about/i.test(String(line)), String(line).slice(0, 80));
  const e = (Game.state.codex.people || {})[vid];
  ok('deflect: no occupation journaled', !(e && e.occupation && e.occupation.value));
  ok('deflect: no backstory journaled', !(e && e.backstory && e.backstory.value));
  ok('deflect: occupationLabel still null', Game.occupationLabel(vid) === null);

  // --- genuine ask (high trust, fresh convo) ---
  Game.state.village.trust[vid] = 90;
  Game.startConvo(vid);
  const line2 = Game.convoAskTopic(vid, 'past');
  const e2 = (Game.state.codex.people || {})[vid];
  ok('genuine: occupation journaled', !!(e2 && e2.occupation && e2.occupation.value), String(line2).slice(0, 80));
  ok('genuine: occupationLabel shows it', Game.occupationLabel(vid) === e2.occupation.value);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
