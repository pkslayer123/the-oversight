#!/usr/bin/env node
// PLAYTEST (Steve 2026-10-07), DRIFTER archetype run 6 — "the prodigal".
// NEW territory: the voluntary long absence. Live at home ~5 days, walk to a
// distant village, JOIN them (plain voluntary join, home still yours), live
// ~10 days at their fire, then come back. The beats under test:
//   (a) the HOMECOMING beat in returnToVillage (daysAway line variants)
//   (b) scholar.awayNews — the "while you were gone" queue (home deaths)
//   (c) home's pantry/roster while you're away: does home LIVE while you drift?
//   (d) arrival as a stranger: first-sight village read, joining, their pantry,
//       studyVillageCodex, gossip as an outsider
// Played as a player, judged like a player. RNG seeded mulberry32
// (default 20261007, SEED env override).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = parseInt(process.env.SEED || '20261007', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_seed);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// drama.js touches document at load — stub for eval only.
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(),
  getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };

const ORDER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src\/js\/[^\"]+\.js/g) || []);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
global.window = global; // equipment.js needs window at load; deleted after (sync combat path)
for (const f of ORDER) {
  if (SKIP.has(f)) continue;
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL', f, e.message); process.exit(1); }
}
delete global.window;
delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const results = [];
const note = (t) => console.log(t);
const check = (name, cond, extra) => {
  results.push([name, !!cond]);
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
};
const flush = (tag, re, n) => {
  const hit = says.filter(t => re.test(t));
  for (const t of hit.slice(0, n || 8)) note(`   ${tag} ${String(t).slice(0, 210)}`);
  says.length = 0;
};
const dname = (vid) => { try { return Game.displayName(vid); } catch (e) { return String(vid); } };
function giveFood(kcalEach, units, name) {
  Game.state.scholar.inventory.push({ name: name || 'Trail ration', kcalEach, units, spoilDay: 9999, safe: true, kg: 0.2, unit: 'pack', edible: true, foodState: 'ready', foodKind: 'plant', ration: true });
}
function invKcal() {
  return Game.state.scholar.inventory.reduce((t, i) => t + ((i.kcalEach || 0) > 0 && (i.units || 0) > 0 ? (i.units || 0) * (i.kcalEach || 0) : 0), 0);
}
function eatUp() {
  const s = Game.state.scholar;
  let guard = 0;
  while ((s.kcal || 0) < 2200 && guard++ < 60 && !Game.over) {
    const idx = s.inventory.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && i.edible !== false);
    if (idx < 0) break;
    try { Game.eatOne(idx); } catch (e) { break; }
  }
}
function waterUp() {
  // honest needs loop: fill + drink like a player would
  const s = Game.state.scholar;
  says.length = 0;
  try { Game.fillWater(); } catch (e) {}
  try { Game.drinkWater(); } catch (e) {}
  const refused = says.some(t => /pack is full/i.test(t));
  says.length = 0;
  if (refused && (s.hydration || 0) < 40) {
    // too heavy to fill: drop the cheapest calories to make room for water.
    // (a real player would cache food, not die of thirst next to a full pack)
    const idx = s.inventory.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0);
    if (idx >= 0) { s.inventory.splice(idx, 1); note('   (dropped a food stack to make room for water)'); }
  }
}
let captureDay = false;
const captured = [];
function dayTick(label) {
  says.length = 0;
  try { Game.endDay(); } catch (e) { note(`   !! ENDDAY ERROR: ${e.message}`); }
  if (captureDay) { for (const t of says.splice(0)) captured.push(String(t)); }
  eatUp();
  waterUp();
  if (label) {
    const rk = Game.state.scholar.inventory.filter(i => i.ration).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
    note(`   [${label}] day=${Game.state.scholar.day} kcal=${Math.round(Game.state.scholar.kcal || 0)} hp=${Math.round(Game.state.scholar.health || 0)} hyd=${Math.round(Game.state.scholar.hydration || 0)} rationKcal=${Math.round(rk)}`);
  }
}
function walkTo(tx, ty, tag) {
  // drift like a player: node by node through adjacent tiles.
  // travelTargets only offers d<=3 revealed / d==1 fog — direct long hops
  // return null silently, so walk honestly. NOTE: travelTo returns undefined
  // on SUCCESS (only blocks/errors return objects) — detect movement by
  // position, not return value. Returns ALL say lines from the walk (the
  // homecoming beat fires mid-walk when stepping onto the haven tile).
  const allLines = [];
  note(`   walking to (${tx},${ty})${tag ? ' [' + tag + ']' : ''}:`);
  for (let step = 0; step < 24 && !Game.over; step++) {
    const dist = Math.abs(Game.map.px - tx) + Math.abs(Game.map.py - ty);
    if (dist === 0) break;
    const opts = Game.travelTargets().filter(t => t.d === 1);
    if (!opts.length) { note('   !! no adjacent travel targets — stuck'); break; }
    opts.sort((a, b) => (Math.abs(a.x - tx) + Math.abs(a.y - ty)) - (Math.abs(b.x - tx) + Math.abs(b.y - ty)));
    const bx = Game.map.px, by = Game.map.py;
    says.length = 0;
    Game.travelTo(opts[0].x, opts[0].y);
    const lines = says.splice(0);
    for (const l of lines) allLines.push(String(l));
    for (const l of lines.filter(l => /smoke on the horizon|clearing|world ends|blocks you|creek runs fast|fallen tree/i.test(l))) note(`   step ${step + 1}> ${String(l).slice(0, 180)}`);
    if (Game.map.px === bx && Game.map.py === by) { note(`   !! step ${step + 1} didn't move (blocked: ${opts[0].x},${opts[0].y})`); break; }
  }
  note(`   arrived: (${Game.map.px},${Game.map.py}) dist-to-target=${Math.abs(Game.map.px - tx) + Math.abs(Game.map.py - ty)}`);
  return allLines;
}
function homeTrustMap() {
  const v = Game.state.village, out = {};
  for (const rid of (v.roster || [])) out[rid] = (v.trust && v.trust[rid]) || 0;
  return out;
}
const choiceIds = (vid) => Game.convoUI(vid).choices.map(c => c.id);
function honestChat(vid, want) {
  // play the honest path: base menu, pick a small-talk choice if present
  says.length = 0;
  try { Game.startConvo(vid); } catch (e) { return; }
  let ids = choiceIds(vid);
  if (ids.includes('dlg:subject')) { says.length = 0; Game.convoTurn(vid, 'dlg:subject'); ids = choiceIds(vid); }
  const pick = ids.find(i => i === want) || ids.find(i => /^ask:/.test(i));
  if (pick) { says.length = 0; Game.convoTurn(vid, pick); }
  try { Game.endConvo(vid, 'left'); } catch (e) {}
  says.length = 0;
}

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };

  note(`=== DRIFTER RUN 6 — "the prodigal" (seed ${_seed}) ===`);

  // ================= ACT 1: home, days 1-5 =================
  Game.genRoster('Columbus, Ohio');
  const pick = Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, pick.id);
  Game.depart();
  const s = Game.state.scholar;
  giveFood(350, 40, 'Smoked fish'); // road rations (modest: village meals do the work)
  giveFood(300, 30, 'Parched corn');
  // PACK WEIGHT (survivalist loop): water is 1kg/L against the carry limit.
  // A 40kg food haul refuses every fill — the drifter travels light.
  const homeName = Game.state.village.name;
  const meId = Game.villagerId;
  note(`\n=== ACT 1: home days 1-5 (${homeName}, playing as ${dname(meId)}) ===`);
  const homeRoster = (Game.state.village.roster || []).filter(id => id !== meId);
  note(`   household: ${homeRoster.length} (${homeRoster.slice(0, 5).map(dname).join(', ')})`);
  note(`   home pantry day 1: ${Math.round(Game.pantryKcalLive(Game.state.village))} kcal`);
  // live at home: honest chats with a few villagers, trust should move.
  // AND provision home like a real player: forage, keep a day's food, donate
  // the surplus to the pantry. (A drifter who leaves a 5-day pantry for a
  // 10-day drift gets the scattering — and deserves it.)
  for (let d = 0; d < 5 && !Game.over; d++) {
    says.length = 0;
    for (let f = 0; f < 6; f++) { try { Game.doAction('forage'); } catch (e) { break; } }
    says.length = 0;
    if (d > 0) { honestChat(homeRoster[d % homeRoster.length], 'ask:personal'); honestChat(homeRoster[(d + 1) % homeRoster.length], 'ask:village'); }
    // donate surplus: keep rations + ~3000 kcal, give the rest
    const s0 = Game.state.scholar;
    let kept = 0, donated = 0;
    for (let i = s0.inventory.length - 1; i >= 0; i--) {
      const it = s0.inventory[i];
      if (it.ration) continue; // travel food stays packed
      if (!((it.kcalEach || 0) > 0 && (it.units || 0) > 0 && it.edible !== false)) continue;
      const k = (it.kcalEach || 0) * (it.units || 0);
      if (kept + k <= 3000) { kept += k; continue; }
      try { const before = s0.inventory.length; Game.donateToPantry(i); if (s0.inventory.length < before) donated += k; } catch (e) {}
    }
    note(`   (foraged, donated ~${Math.round(donated)} kcal — pantry now ${Math.round(Game.pantryKcalLive(Game.state.village))})`);
    dayTick('home d' + (d + 1));
  }
  const trustBefore = homeTrustMap();
  const pantryBefore = Math.round(Game.pantryKcalLive(Game.state.village));
  const rosterBefore = (Game.state.village.roster || []).slice();
  note(`   home pantry day ${s.day}: ${pantryBefore} kcal | trust sample: ${homeRoster.slice(0, 3).map(id => `${dname(id)}=${trustBefore[id]}`).join(', ')}`);
  note(`   [trace] after Act 1: day=${s.day} lastHavenDay=${s.lastHavenDay}`);

  // ================= ACT 2: the walk to a distant village =================
  note(`\n=== ACT 2: the walk ===`);
  const ovs = (Game.state.otherVillages || []).slice().sort((a, b) =>
    (Math.abs(a.x - Game.map.px) + Math.abs(a.y - Game.map.py)) - (Math.abs(b.x - Game.map.px) + Math.abs(b.y - Game.map.py)));
  const dest = ovs.find(v => v.x !== Game.map.px || v.y !== Game.map.py) || ovs[0];
  check('a distant village exists to drift to', !!dest, dest ? `${dest.name} at (${dest.x},${dest.y})` : 'none');
  walkTo(dest.x, dest.y, 'the walk out');
  // first-sight: the catch-up should have generated them
  const got = (Game.state.otherVillages || []).find(v => v.id === dest.id);
  note(`   first sight: ${got.name} — ${got.population} people, day ${got.day} in, pantry ${Math.round(got.pantryKcal || 0)} kcal, knowledge profile: ${(got.knowledgeProfile || {}).focus || '?'}`);
  check('first-sight read printed (living-world village)', got.generated === true, `generated=${!!got.generated} day=${got.day}`);

  // ================= ACT 3: live at their fire =================
  note(`\n=== ACT 3: ten days at ${got.name}'s fire ===`);
  says.length = 0;
  Game.joinVillage(got.id); // voluntary join — home is still home
  flush('join>', /one of them now/i, 3);
  check('joined village flag set (plain join, no exile archive)', s.joinedVillage === got.id, `joinedVillage=${s.joinedVillage} exiled=${!!s.exiled}`);
  // an outsider asks around — the roster entries are person objects (real names,
  // knowledge-gated behind displayName until you've earned them)
  const them = ((got.roster || []).slice(0, 3));
  note(`   strangers at the fire: ${them.map(p => `${p.name || '?'} (you see: ${dname(p.id || p)})`).join(' | ')}`);
  // eat from their fire the honest way (villageMeal at their fire)
  says.length = 0;
  try { Game.villageMeal(); } catch (e) { note('   villageMeal ERROR: ' + e.message); }
  flush('meal>', /Village meal|wild/i, 3);
  // study their codex — the drifter's knowledge reason to travel
  says.length = 0;
  let codexRes = null;
  try { codexRes = Game.studyVillageCodex(got.id); } catch (e) { note('   studyVillageCodex ERROR: ' + e.message); }
  flush('codex>', /codex|Codex|study|know/i, 4);
  const codexBefore = Object.keys(Game.state.codex.plants || {}).length;
  // 4 lived days at their fire — work for the half-shares like a real guest.
  // (A 7-day drift scatters Haven on this pantry — verified last run. The
  // prodigal's first drift is short: the beat needs >=2 days away, and the
  // pantry supports ~5.)
  const AWAY_DAYS = 4;
  for (let d = 0; d < AWAY_DAYS && !Game.over; d++) {
    says.length = 0;
    for (let f = 0; f < 2; f++) { try { Game.doAction('forage'); } catch (e) { break; } }
    says.length = 0;
    // eat at their fire (villageMeal runs in endDay's away branch; keep pack topped too)
    captureDay = (d === 2);
    dayTick(`${got.name} d${d + 1}`);
    captureDay = false;
    if (d === 2) { // full transcript of one away day: what's draining hp?
      note('   --- full day-3 transcript ---');
      for (const t of captured.splice(0)) note(`   | ${t.slice(0, 220)}`);
    } else {
      flush('day>', /pantry is empty|lean|feast|argument|laughs|gossip|\.{3}/i, 4);
    }
  }
  const codexAfter = Object.keys(Game.state.codex.plants || {}).length;
  note(`   their pantry now: ${Math.round(got.pantryKcal || 0)} kcal (day ${got.day}) | my codex plants: ${codexBefore} -> ${codexAfter}`);
  check('joined village lived its days while I was there', got.day > s.day - 10 - 1, `village day=${got.day} my day=${s.day}`);
  note(`   [${s.joinedVillage ? 'still joined' : 'not joined'}] joinedVillage=${s.joinedVillage}`);

  // ================= ACT 4: the road home =================
  note(`\n=== ACT 4: the road home ===`);
  says.length = 0;
  Game.leaveVillage();
  flush('leave>', /Solo/i, 2);
  const daysAway = (s.day || 1) - (s.lastHavenDay || s.day);
  note(`   days away by the clock: ${daysAway}`);
  note(`   [trace] before walk home: day=${s.day} lastHavenDay=${s.lastHavenDay} at=(${Game.map.px},${Game.map.py})`);
  // walk home like a player — stepping onto the haven tile fires returnToVillage
  const hx = Game.state.village.px ?? 4, hy = Game.state.village.py ?? 4;
  const walkLines = walkTo(hx, hy, 'the long way home');
  const homecomingFired = walkLines.some(t => /walk back into Haven|days gone|You come home after|palisade looks smaller/i.test(t));
  const awayNewsDelivered = walkLines.some(t => /while you were gone/i.test(t));
  check('homecoming beat fired (>=2 days away)', homecomingFired, `${daysAway} days away`);
  note(`   awayNews delivered on return: ${awayNewsDelivered}`);
  for (const t of walkLines.filter(t => /walk back into Haven|days gone|You come home after|palisade looks smaller|while you were gone|missed|glad to see|keep a day's food|unload/i.test(t)))
    note(`   home> ${t.slice(0, 200)}`);
  // the reckoning: what did home do while I was gone?
  const pantryAfter = Math.round(Game.pantryKcalLive(Game.state.village));
  const rosterAfter = (Game.state.village.roster || []).slice();
  const trustAfter = homeTrustMap();
  note(`   home pantry: ${pantryBefore} -> ${pantryAfter} kcal over ${daysAway} days`);
  note(`   home roster: ${rosterBefore.length} -> ${rosterAfter.length} (deaths = awayNews?)`);
  const trustMoved = homeRoster.slice(0, 3).map(id => `${dname(id)}: ${trustBefore[id]} -> ${trustAfter[id] || 0}`);
  note(`   trust drift: ${trustMoved.join(' | ')}`);
  check('home lived (pantry changed while away)', pantryAfter !== pantryBefore || rosterAfter.length !== rosterBefore.length,
    `pantry ${pantryBefore}->${pantryAfter}, roster ${rosterBefore.length}->${rosterAfter.length}`);

  // ================= verdict =================
  note(`\n=== VERDICT ===`);
  note(`   alive=${!Game.over} final day=${s.day} joined=${s.joinedVillage || 'none'} home=${Game.state.village.name}`);
  const fails = results.filter(r => !r[1]);
  note(`   checks: ${results.length - fails.length}/${results.length} passed${fails.length ? ' — FAILS: ' + fails.map(f => f[0]).join('; ') : ''}`);
  note('\nDONE.');
  process.exit(0);
})().catch(e => { console.error('CRASH:', e.message, e.stack && e.stack.split('\n')[1]); process.exit(1); });
