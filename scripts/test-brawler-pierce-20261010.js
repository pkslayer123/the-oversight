#!/usr/bin/env node
// Brawler adversarial 2026-10-10: ARMOR-PIERCE WIRING.
// BREAK: wave-3/4/5 monsters carry mdef.pierce (0.1-0.75) in data and the
// tbDamage hook reads it via tbFighter(sourceKey) — but ~20 monster attack
// call sites never pass sourceKey, so tbFighter(null) -> null -> pierce 0.
// The whole endgame armor design (MONSTER-WAVES.md: "the Finale's strike
// takes ~70 through god armor — the wall holds") was silently inert; god
// armor was an immunity cell vs the System's immune system.
// FIX: pass the attacker's fighter key at every monster->player/villager
// tbDamage call site (game.js, encounters.js, party.js). Environmental chip
// (shrapnel, leased ground) and non-monster attackers stay null — pierce 0,
// unchanged math.
// Run: node scripts/test-brawler-pierce-20261010.js [SEED]
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
  console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name + (detail && !cond ? ' — ' + detail : ''));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || process.argv[2] || '0xB0A910', 16);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/broadcast.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/corruption.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of FILES) { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('EVAL FAIL', f, e.message); process.exit(2); } }
delete global.window;
const Game = globalThis.Scattering.Game;
Game.say = () => {}; Game.sysSay = () => {};
Game.drama = () => {}; Game.audioEvent = () => {};

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const s = Game.state.scholar;
  s.health = 500; s.maxHealth = 500;
  s.stats = { str: 5, end: 5, per: 5, agi: 5, pre: 5 };
  s.passives = {};
  s.inventory = []; // no burden -> no dodge penalty
  const realArmorBonus = Game.armorBonus.bind(Game);
  Game.armorBonus = () => 138; // godhood plate, stubbed for the wiring proof

  function mkFight(pierce, varmor) {
    Game.tbfight = {
      fighters: [
        { key: 'p', kind: 'player', alive: true, hp: 500, maxHp: 500, mx: 4, my: 4, speed: 3 },
        { key: 'm1', kind: 'monster', alive: true, hp: 1000, maxHp: 1000, mx: 4, my: 5, speed: 3, mdef: { id: 'finale', pierce }, name: 'The Finale' },
        { key: 'v1', kind: 'villager', alive: true, hp: 200, maxHp: 200, mx: 5, my: 5, speed: 3, varmor: varmor || 0, name: 'Test Villager', villagerId: 'tv1' },
      ],
      over: false, round: 1, order: ['p', 'm1', 'v1'], turnIdx: 0,
    };
    s.health = 500;
  }

  console.log('\n== H1. wave-5 pierce applies through god armor (the headline break) ==');
  // Design math (MONSTER-WAVES.md): finale pierce 0.75, P=138, hit 175 ->
  // effP=34.5, r=0.633, absorb=min(174,111)=111, final=64.
  // Broken engine: pierce 0 -> absorb 153 -> final 22 (immunity cell).
  mkFight(0.75, 0);
  const p0 = Game.tbFighter('p').hp;
  Game.tbDamage('p', 175, 'test strike', 'm1', { quiet: true });
  const took = p0 - Game.tbFighter('p').hp;
  ok(took === 64, 'finale pierce 0.75 vs P=138, hit 175 -> 64 lands (pierce applied)', 'took ' + took + ' (22 = pierce silently 0)');

  console.log('\n== H2. pierce-0 monsters unchanged (wave 1/2 regression guard) ==');
  mkFight(0, 0);
  const q0 = Game.tbFighter('p').hp;
  Game.tbDamage('p', 20, 'test strike', 'm1', { quiet: true });
  const took2 = q0 - Game.tbFighter('p').hp;
  // r=138/158=0.8734, absorb=min(19,round(17.47)=17)=17, final=3
  ok(took2 === 3, 'pierce 0 vs P=138, hit 20 -> 3 lands (unchanged)', 'took ' + took2);

  console.log('\n== H3. hit-1 clamp holds with pierce (no reverse immunity cell) ==');
  mkFight(0.75, 0);
  const r0 = Game.tbFighter('p').hp;
  Game.tbDamage('p', 1, 'chip', 'm1', { quiet: true });
  const took3 = r0 - Game.tbFighter('p').hp;
  ok(took3 === 1, 'hit 1 vs pierce 0.75 -> exactly 1 lands (clamp)', 'took ' + took3);

  console.log('\n== H4. villager armor block honors pierce ==');
  // varmor 40, pierce 0.5, hit 60 -> effP=20, r=0.5, absorb=min(59,30)=30 -> 30
  // Broken: r=40/60=0.667, absorb 40 -> 20 lands.
  mkFight(0.5, 40);
  const v0 = Game.tbFighter('v1').hp;
  Game.tbDamage('v1', 60, 'test strike', 'm1', { quiet: true });
  const tookV = v0 - Game.tbFighter('v1').hp;
  ok(tookV === 30, 'pierce 0.5 vs varmor 40, hit 60 -> 30 lands', 'took ' + tookV);

  Game.armorBonus = realArmorBonus;

  console.log('\n== H5. static audit: every monster-sourced tbDamage passes a fighter key ==');
  // Parse game.js + encounters.js + party.js; any tbDamage call whose 4th
  // arg is absent/null must be environmental chip or a non-monster attacker.
  const ENV_LABELS = ['shrapnel', 'paper cuts', 'leased ground', 'shadowbanned ground', 'scorched earth'];
  const NON_MONSTER_SOURCES = ["'you'", "'your gristlefit'", 'v.name'];
  const files = ['src/js/game.js', 'src/js/encounters.js', 'src/js/party.js'];
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // collect full call expressions (may span lines)
    const calls = [];
    let i = 0;
    for (;;) {
      const at = src.indexOf('this.tbDamage(', i);
      if (at < 0) break;
      let depth = 0, j = at + 'this.tbDamage'.length;
      for (; j < src.length; j++) {
        const c = src[j];
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) break; }
        else if (c === "'" || c === '"' || c === '`') {
          const q = c; j++;
          for (; j < src.length && src[j] !== q; j++) if (src[j] === '\\') j++;
        }
      }
      calls.push({ call: src.slice(at, j + 1), line: src.slice(0, at).split('\n').length });
      i = j + 1;
    }
    for (const { call, line } of calls) {
      // split top-level args
      const inner = call.slice(call.indexOf('(') + 1, call.lastIndexOf(')'));
      const args = []; let d = 0, cur = '', qq = null;
      for (let k = 0; k < inner.length; k++) {
        const c = inner[k];
        if (qq) { cur += c; if (c === qq) qq = null; else if (c === '\\') { cur += inner[++k]; } continue; }
        if (c === "'" || c === '"' || c === '`') { qq = c; cur += c; continue; }
        if (c === '(' || c === '[' || c === '{') d++;
        if (c === ')' || c === ']' || c === '}') d--;
        if (c === ',' && d === 0) { args.push(cur.trim()); cur = ''; continue; }
        cur += c;
      }
      args.push(cur.trim());
      const fourth = (args[3] || '').trim();
      const keyed = fourth && fourth !== 'null' && fourth !== 'undefined';
      if (keyed) continue;
      const label = args[2] || '';
      const env = ENV_LABELS.some(e => label.includes("'" + e + "'") || label.includes('"' + e + '"'));
      const nonMonster = NON_MONSTER_SOURCES.some(nm => label.trim() === nm);
      if (!env && !nonMonster) bad.push(f + ':' + line + ' -> ' + call.slice(0, 90));
    }
  }
  ok(bad.length === 0, 'no unkeyed monster-sourced tbDamage calls', bad.slice(0, 5).join(' | '));

  console.log('\n== RESULT: ' + pass + ' pass, ' + fail + ' fail (seed 0x' + SEED.toString(16) + ') ==');
  if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
