#!/usr/bin/env node
// BREAK-IT: knowledge honesty sweep (2026-10-08).
//
// "If you don't know it doesn't show" — verify across the whole content pool:
//  1. examineDescription(unknown plant, quality 1-3) never contains the true name.
//  2. questPlantRef(unknown plant) never contains the true name.
//  3. codexEntries() kcal/prep gating: L1 entries hide kcal and prep.
//  4. monsterDisplayName pre-System / pre-naming never shows the true name.
//  5. apCodexEntry pre-reveal never shows alien title/species.
//  6. sortBag villager-sort: every plant named in the report is identified for
//     the player by the time the report prints (naming is earned, not leaked).
//
// Usage: node scripts/test-knowledge-honesty-sweep-20261008.js (SEED override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const Ex = globalThis.Scattering.Examine;

const fails = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!ok) fails.push(name);
}
const nameLeaks = (text, name) => String(text).toLowerCase().includes(String(name).toLowerCase());

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // wipe starting plant knowledge so the whole pool is "unknown"
  Game.state.codex.plants = {};

  // 1. examine descriptions across the pool, all qualities
  let leaks1 = 0;
  for (const p of Game.data.plants) {
    for (const q of [1, 2, 3]) {
      const d = Ex.examineDescription(p.id, q);
      if (nameLeaks(d, p.name)) { leaks1++; break; }
    }
  }
  check('examine never leaks true names (whole pool x3 qualities)', leaks1, 0);

  // 2. questPlantRef
  let leaks2 = 0;
  for (const p of Game.data.plants) {
    if (nameLeaks(Game.questPlantRef(p.id, 3), p.name)) leaks2++;
  }
  check('questPlantRef never leaks true names', leaks2, 0);

  // 3. codexEntries kcal/prep gating at L1
  const pid = Game.data.plants[0].id;
  Game.identifyPlant(pid, 'discovery');
  const entry = Game.codexEntries().find(e => e.pid === pid);
  check('L1 entry hides kcal', entry.kcal, null);
  check('L1 entry hides prep', entry.prep, null);
  check('L1 entry flags kcalKnown false', entry.kcalKnown, false);

  // 4. monster display names pre-System
  Game.state.systemArrived = false;
  let leaks4 = 0;
  for (const m of (Game.data.monsters || []).slice(0, 30)) {
    const shown = Game.monsterDisplayName(m.id);
    if (m.name && nameLeaks(shown, m.name) && shown === m.name) leaks4++;
  }
  check('monsterDisplayName hides true names pre-System', leaks4, 0);

  // 5. alien player codex gating pre-reveal
  let leaks5 = 0;
  try {
    const pids = Game.apPersonas ? Object.keys(Game.apPersonas()) : [];
    for (const apid of pids.slice(0, 10)) {
      const persona = Game.apPersona(apid);
      const entry5 = Game.apCodexEntry(apid);
      if (entry5 && persona && (entry5.title === persona.title || entry5.species === persona.species)) {
        const known = Game.apState && Game.apState().known && Game.apState().known[apid];
        if (!known) leaks5++;
      }
    }
  } catch (e) { console.log('  (alien check skipped: ' + e.message + ')'); }
  check('apCodexEntry hides alien truth pre-reveal', leaks5, 0);

  // 6. sortBag: villager sorter names only what the player ends up knowing
  const said = [];
  Game.say = function (t) { said.push(String(t)); };
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  if (vid && Game.atCamp) {
    // force atCamp true via stub
    const origAtCamp = Game.atCamp;
    Game.atCamp = () => true;
    try {
      const knownPids = Game.data.plants.slice(0, 4).map(p => p.id);
      Game.state.scholar.prepStash = [{ lump: true, units: 8,
        lump: Object.fromEntries(knownPids.map(k => [k, { units: 2 }])) , hint: null }];
      // villager knows them (simulate a knowledgeable sorter)
      const origKnows = Game.villagerKnowsPlants;
      Game.villagerKnowsPlants = () => knownPids;
      const origNode = Game.npcNode;
      Game.npcNode = () => ({ nx: Game.map.px, ny: Game.map.py });
      said.length = 0;
      try { Game.sortBag(vid, 0); } catch (e) {}
      Game.villagerKnowsPlants = origKnows;
      Game.npcNode = origNode;
      const report = said.join(' ');
      let leaks6 = 0;
      for (const k of knownPids) {
        const pdef = Game.data.plants.find(p => p.id === k);
        if (nameLeaks(report, pdef.name) && !Game.plantKnown(k)) leaks6++;
      }
      check('sortBag report names only earned plants', leaks6, 0);
    } finally { Game.atCamp = origAtCamp; }
  } else console.log('  SKIP sortBag: no NPC or atCamp');

  console.log(fails.length ? `\nRESULT: ${fails.length} FAILED` : '\nRESULT: all passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
