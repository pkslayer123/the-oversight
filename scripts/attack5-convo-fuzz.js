// ATTACK 5 (softlock): fuzz the conversation menu graph.
// Random-walk convos; flag: crashes, menus with no exit, tight loops.
'use strict';
const H = require('./socialite-harness.js');
const { Game, newWorld } = H;

function sig(menu) {
  return (menu || []).map(c => (c && c.id) || '?').sort().join('|');
}

function fuzzOne(seed) {
  newWorld(5);
  // needs for menus: characterGen convo data may be absent — provide minimal
  Game.data = Game.data || {};
  Game.data.villagers = Game.state.village.roster.map(id => ({ id, name: 'V-' + id }));
  const vid = 'v1';
  Game._temper = { v1: 'warm', v2: 'prickly', v3: 'calm', v4: 'bold', v5: 'withdrawn' };
  const st = Game.startConvo(vid);
  if (!st || !Game.convoGet(vid) || !Game.convoGet(vid).active) return { seed, note: 'no convo started' };
  const seen = {};
  let turns = 0, exitSeen = false, noExitStreak = 0;
  for (let i = 0; i < 80; i++) {
    let menu;
    try { menu = Game.buildMenu(vid); } catch (e) { return { seed, crash: 'buildMenu: ' + e.message }; }
    const s = sig(menu);
    seen[s] = (seen[s] || 0) + 1;
    const ids = (menu || []).map(c => c && c.id).filter(Boolean);
    const hasExit = ids.some(id => /leave|goodbye|end/i.test(id));
    if (hasExit) { exitSeen = true; noExitStreak = 0; }
    else {
      noExitStreak++;
      if (noExitStreak > 3) return { seed, deadend: 'no exit for ' + noExitStreak + ' turns; menu=' + s.slice(0, 100), turns };
    }
    if (seen[s] > 10 && !hasExit) return { seed, loop: s.slice(0, 120), turns };
    if (!ids.length) return { seed, deadend: 'empty menu at turn ' + i, turns };
    // hostile player: prefer deep/rare choices, sometimes leave
    let pick;
    const deep = ids.filter(id => /rumor|confront|ask:|deep|more/i.test(id));
    pick = deep.length && (seed % 3) ? deep[(seed + i) % deep.length] : ids[(seed * 7 + i * 13) % ids.length];
    if (i > 40 && ids.some(id => /leave/i.test(id))) pick = ids.find(id => /leave/i.test(id));
    try {
      const r = Game.convoTurn(vid, pick);
      if (r === null && !Game.convoGet(vid).active) break; // ended
    } catch (e) { return { seed, crash: 'convoTurn(' + pick + '): ' + e.message }; }
    turns++;
    const c = Game.convoGet(vid);
    if (!c || !c.active) break;
  }
  return { seed, turns, exitSeen, ok: true };
}

const bad = [];
for (let s = 1; s <= 12; s++) {
  const r = fuzzOne(s * 101 + 7);
  if (!r.ok) bad.push(r);
  else if (!r.exitSeen) bad.push({ seed: r.seed, note: 'never offered an exit in ' + r.turns + ' turns' });
}
console.log('ran 12 fuzz convos; problems:', JSON.stringify(bad, null, 1));
if (!bad.length) console.log('SOFTLOCK FUZZ: held across 12 seeds');
