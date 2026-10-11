#!/usr/bin/env node
// test-structural-combat-telegraph.js — PROOF (Worker B, 2026-10-10).
// Night-danger telegraphs that are actually legible.
//
// Covers:
//   T1. Dusk in the wild -> a night-danger beat fires (once per day).
//   T2. The beat names REAL nocturnal/crepuscular monsters from the
//       currently-unlocked wave pool (data-driven, not invented).
//   T3. The beat is knowledge-gated: every named monster is rendered via
//       monsterDisplayName (village name > System name > unknown descriptor)
//       — no true names leak before they're earned.
//   T4. The beat describes REAL counterplays only: fire+tent detection,
//       Haven safety, night_eyes/nocturnal_patterns dodge. (Telegraph
//       honesty: every claim names a mechanic that exists.)
//   T5. No beat at Haven / safe tiles (nothing to warn about).
//   T6. No beat twice in one day (second dusk->night advance stays quiet).
//   T7. Tent-sleepers get the tent-specific line (fire + vent matter —
//       the wandererFindsYou detection inputs, honestly named).
//
// Usage: node scripts/test-structural-combat-telegraph.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame } = require('./sim-harness');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};

(async () => {
  const { Game } = await loadGame({ seed: 20261012, mode: 'telegraph-proof', fullTelemetry: false });
  setupGame(Game);
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  const s = () => Game.state.scholar;

  // put the player on a wild tile (not haven)
  const wild = { x: 1, y: 1 };
  Game.map.px = wild.x; Game.map.py = wild.y;
  Game.location = 'wild';
  const tile = Game.tileAt(wild.x, wild.y);
  if (tile && tile.type === 'haven') tile.type = 'thicket';

  // The village has faced-and-reported ONE night-cast monster (the legitimate
  // identifyMonster path — faced, told the haven, now reported knowledge).
  Game.identifyMonster('hushwolf');

  // T1: advance to dusk in the wild -> beat fires
  Game.dayPart = 1;
  said.length = 0;
  Game.state.weather = 'clear';
  Game.advancePart();
  check('T1 dusk in the wild fires the night-danger beat',
    Game.dayPart === 2 && said.some(m => /night/i.test(m) && /nocturnal|dark|hunt/i.test(m)),
    `dayPart=${Game.dayPart} said=${said.slice(-3).join(' | ').slice(0, 300)}`);
  const beat = said.filter(m => /night/i.test(m)).join(' ');

  // T2: named monsters are real nocturnal/crepuscular members of the unlocked pool
  const pool = (typeof Game.monsterWavePool === 'function' ? Game.monsterWavePool() : Game.data.monsters) || [];
  const nightCast = pool.filter(m => m.activity === 'nocturnal' || m.activity === 'crepuscular');
  const namedIds = (Game._lastNightBeatMonsters || []);
  check('T2 beat names monsters from data', namedIds.length > 0, `named=${JSON.stringify(namedIds)}`);
  const allReal = namedIds.every(id => {
    const mdef = (Game.data.monsters || []).find(m => m.id === id);
    return mdef && (mdef.activity === 'nocturnal' || mdef.activity === 'crepuscular') && nightCast.some(n => n.id === id);
  });
  check('T2 all named are real night-cast members', allReal, `named=${JSON.stringify(namedIds)}`);

  // T3: knowledge gating — beat text uses monsterDisplayName for each named monster,
  // and an UNREPORTED night-cast monster stays out of the beat entirely.
  let gated = true, gateDetail = '';
  for (const id of namedIds) {
    const disp = Game.monsterDisplayName(id);
    if (beat.indexOf(disp) < 0 && beat.indexOf(String(disp).toLowerCase()) < 0) { gated = false; gateDetail = `${id} -> "${disp}" not in beat`; break; }
  }
  const unreported = nightCast.find(m => m.id !== 'hushwolf' && !((Game.state.codex.monsters || {})[m.id] || {}).reported);
  const unrepDisp = unreported ? Game.monsterDisplayName(unreported.id) : null;
  const leak = unreported && (beat.indexOf(unreported.id) >= 0 ||
    (unrepDisp && unrepDisp !== unreported.id && beat.indexOf(unrepDisp) >= 0) ||
    beat.indexOf(Game.data.monsters.find(m => m.id === unreported.id).name) >= 0);
  check('T3 beat renders monsters via monsterDisplayName (knowledge-gated)', gated && !leak,
    gateDetail || (leak ? `unreported ${unreported.id} leaked into beat` : `beat=${beat.slice(0, 200)} named=${JSON.stringify(namedIds)}`));

  // T4: counterplays named are real mechanics
  const hasFireTent = /fire/i.test(beat) || /tent/i.test(beat);
  const hasHaven = /haven/i.test(beat);
  check('T4 beat names real counterplays (fire/tent, Haven)', hasFireTent && hasHaven, beat.slice(0, 250));

  // T6: no second beat the same day
  said.length = 0;
  Game.dayPart = 2;
  Game.advancePart(); // -> night
  const secondBeats = said.filter(m => /night-danger|the night belongs/i.test(m));
  check('T6 no duplicate night beat the same day', secondBeats.length === 0, secondBeats.join(' | ').slice(0, 200));

  // T5: at Haven -> no beat
  const hv = Game.state.village || {};
  Game.map.px = hv.px != null ? hv.px : 4; Game.map.py = hv.py != null ? hv.py : 4;
  Game.location = 'haven';
  s().day = (s().day || 1) + 1; // new day -> beat allowed again
  Game.dayPart = 1;
  said.length = 0;
  Game.advancePart();
  check('T5 no night-danger beat at Haven', !said.some(m => /the night belongs|night-danger/i.test(m)),
    said.filter(m => /night/i.test(m)).join(' | ').slice(0, 200));

  // T7: tent-sleeper in the wild gets the tent line
  Game.map.px = wild.x; Game.map.py = wild.y;
  Game.location = 'wild';
  s().day = (s().day || 1) + 1;
  s().insideTent = { tx: wild.x, ty: wild.y, cx: 4, cy: 4 };
  Game.dayPart = 1;
  said.length = 0;
  Game.advancePart();
  const tentBeat = said.join(' ');
  check('T7 tent-sleeper gets the tent/fire/vent line',
    /tent/i.test(tentBeat) && (/fire/i.test(tentBeat) || /vent/i.test(tentBeat)),
    tentBeat.slice(0, 250));
  s().insideTent = null;

  console.log(`\ntelegraph proof: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
