#!/usr/bin/env node
// PROOF: ambient-chat knowledge gating (Worker B, dialog-gating, 2026-10-11).
//
// Steve (2026-10-11): "Chat as you move around the world seems to still give
// you too much info on a fresh spawn." Canon law: "If you don't know, it
// doesn't show."
//
// Fresh-spawn sim: drive 60+ ambient emission opportunities (overheardDiscussion,
// npcTakeAction, villageLives, ambientSocial, villagerInitiative, spreadGossip,
// checkAnimals cue path), collect every emitted line, assert ZERO contain gated
// knowledge:
//   (1) true names of unmet villagers,
//   (2) codex details for unknown items (plant true names, animal cue text /
//       true descriptions),
//   (3) system concepts pre-day-7.
// Positive case: after earning the knowledge, the same emitters DO fire it.
//
// Harness: Math.random is seeded BEFORE eval (modules capture it at load).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261011', 10);

function loadGame(seed) {
  delete globalThis.Scattering;
  Math.random = mulberry32(seed); // SEED BEFORE EVAL
  global.window = global;
  global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1].split('?')[0])
    .filter(f => f.startsWith('src/js/'))
    .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
  for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  delete global.window;
  return globalThis.Scattering.Game;
}

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

function freshGame(Game) {
  Game.say = () => {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const v = Game.state.village;
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.day = 1; Game.dayPart = 1;
  Game.state.systemArrived = false;
  v.knownNames = {};
  v.positions = {};
  const npcs = v.roster.filter(id => id !== Game.villagerId);
  npcs.forEach((id, i) => { v.positions[id] = { mx: 3 + (i % 3), my: 3 + Math.floor(i / 4) }; });
  // keep needs in the talkative band so social/initiative branches can fire
  for (const id of npcs) {
    const n = Game.npcNeeds(id);
    n.hunger = 40; n.fear = 10; n.social = 85; n.energy = 80;
  }
  return { v, s, npcs };
}

// Drive N rounds of every ambient emitter that fires "as you move".
// Returns all emitted lines.
function driveAmbient(Game, rounds) {
  const lines = [];
  Game.say = (m) => lines.push(String(m));
  const v = Game.state.village;
  const npcs = v.roster.filter(id => id !== Game.villagerId);
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  for (let r = 0; r < rounds; r++) {
    v.lastOverheard = 99; // force the overheard cadence gate open
    try { Game.overheardDiscussion(); } catch (e) {}
    const ctx = { announced: 0, night: false };
    for (const rid of npcs) { try { Game.npcTakeAction(rid, detail, ctx); } catch (e) {} }
    try { Game.ambientSocial(true); } catch (e) {}
    try { Game.spreadGossip(); } catch (e) {}
    v.lastInitPart = null;
    try { Game.villagerInitiative(); } catch (e) {}
    if (r % 3 === 0) { try { Game.villageLives(); } catch (e) {} }
  }
  return lines;
}

function trueFirstNames(Game, vids) {
  const out = {};
  for (const vid of vids) {
    try { out[vid] = Game.npcName(vid); } catch (e) { out[vid] = null; }
  }
  return out;
}
function wordRe(s) { return new RegExp('\\b' + String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'); }

(async () => {
  for (const seedRun of [0, 1]) {
    console.log(`--- seed run ${seedRun} (fresh spawn) ---`);
    const Game = loadGame(SEED + seedRun);
    await Game.init();
    const { v, npcs } = freshGame(Game);
    const names = trueFirstNames(Game, npcs);

    // sanity: fresh spawn really is fresh
    check('fresh: no names known', Object.keys(v.knownNames || {}).length === 0);
    check('fresh: system not arrived', !Game.state.systemArrived);
    check('fresh: no monster entries', Object.keys((Game.state.codex || {}).monsters || {}).length === 0);

    const lines = driveAmbient(Game, 40);
    console.log(`  collected ${lines.length} ambient lines over 40 rounds x 6 emitters`);
    check('fresh: ambient volume is meaningful (>30 lines)', lines.length > 30, `${lines.length} lines`);

    // (1) NAMES: a true first name may appear only for a villager whose name
    // was legitimately revealed during the run (the overheard-reveal path).
    const knownAfter = v.knownNames || {};
    const nameLeaks = [];
    for (const line of lines) {
      for (const vid of npcs) {
        const fn = names[vid];
        if (fn && wordRe(fn).test(line) && !knownAfter[vid]) nameLeaks.push(line.slice(0, 100));
      }
    }
    check('fresh: zero unrevealed villager names in ambient chat', nameLeaks.length === 0,
      nameLeaks.length ? `e.g. "${nameLeaks[0]}"` : `${lines.length} lines scanned`);

    // (3) SYSTEM: no system concepts pre-day-7.
    const sysHits = lines.filter(l => /\bSystem\b|◈|⬢|\boverlay\b|\bintegration\b/i.test(l));
    check('fresh: zero system concepts pre-day-7', sysHits.length === 0,
      sysHits.length ? `e.g. "${sysHits[0].slice(0, 100)}"` : `${lines.length} lines scanned`);

    // gated overheard lines never fire fresh
    const gatedHits = lines.filter(l => /If the System wanted us dead|birds went quiet an hour before|name the monsters|pattern in the attacks|third incident followed/i.test(l));
    check('fresh: zero gated overheard openers fire', gatedHits.length === 0,
      gatedHits.length ? `e.g. "${gatedHits[0].slice(0, 100)}"` : 'ok');

    // (2a) PLANTS: true plant names only for plants the run legitimately taught
    // (fireside teaching is the designed human-to-human path). The wrong-name
    // gossip beat is deliberate misinformation — exempt by design.
    const codexPlants = (Game.state.codex || {}).plants || {};
    const plantLeaks = [];
    for (const line of lines) {
      if (/wrong name is loose in the village/.test(line)) continue;
      for (const p of (Game.data.plants || [])) {
        if (codexPlants[p.id]) continue;
        if (wordRe(p.name).test(line)) { plantLeaks.push(`${p.name}: "${line.slice(0, 80)}"`); break; }
      }
    }
    check('fresh: zero unknown plant true-names in ambient chat', plantLeaks.length === 0,
      plantLeaks.length ? `e.g. ${plantLeaks[0]}` : 'ok');

    // (2b) ANIMALS: the hunting-tip cue (e.g. porcupine "Never grab it
    // barehanded") must be null for an unencountered, non-regional animal, and
    // no true animal description may leak for unknown animals.
    const gila = 'gila_monster';
    check('fresh: encAnimalCue null for unmet gila monster', Game.encAnimalCue(gila) === null,
      `got: ${JSON.stringify(Game.encAnimalCue(gila)).slice(0, 60)}`);
    const descLeaks = [];
    for (const line of lines) {
      for (const a of (Game.data.animals || [])) {
        if (Game.encAnimalKnown(a.id)) continue;
        if (a.description && line.includes(a.description)) { descLeaks.push(`${a.id}`); break; }
      }
    }
    check('fresh: zero unknown-animal true descriptions in ambient chat', descLeaks.length === 0,
      descLeaks.length ? descLeaks.slice(0, 3).join(',') : 'ok');
  }

  // ============ POSITIVE CASES: earned knowledge DOES show ============
  console.log('--- positive cases (knowledge earned) ---');
  {
    const Game = loadGame(SEED + 99);
    await Game.init();
    const { v, npcs } = freshGame(Game);

    // (P1) a revealed name appears in the same ambient emitters
    const target = npcs[0];
    const tname = Game.npcName(target);
    Game.revealName(target, 'intro');
    Game.say = () => {};
    const plines = [];
    Game.say = (m) => plines.push(String(m));
    for (let r = 0; r < 15; r++) {
      v.lastOverheard = 99;
      try { Game.overheardDiscussion(); } catch (e) {}
      const detail = Game.genDetail(Game.map.px, Game.map.py);
      const ctx = { announced: 0, night: false };
      for (const rid of npcs) { try { Game.npcTakeAction(rid, detail, ctx); } catch (e) {} }
      try { Game.ambientSocial(true); } catch (e) {}
      if (r % 3 === 0) { try { Game.villageLives(); } catch (e) {} }
    }
    const named = plines.filter(l => wordRe(tname).test(l));
    check('earned: revealed villager name appears in ambient chat', named.length > 0,
      `${named.length}/${plines.length} lines name "${tname}"`);

    // (P2) post-System, the gated System opener can fire.
    // The System line is analytical-voiced; force one analytical villager so
    // the positive case doesn't depend on roster RNG.
    try {
      const ap = (Game.data.villagers || []).find(x => x.id === npcs[0]);
      if (ap) ap.intelligence = Object.assign({}, ap.intelligence, { primary: 'analytical' });
    } catch (e) {}
    Game.state.systemArrived = true;
    const slines = [];
    Game.say = (m) => slines.push(String(m));
    for (let r = 0; r < 500; r++) { v.lastOverheard = 99; try { Game.overheardDiscussion(); } catch (e) {} }
    const sysLine = slines.filter(l => /If the System wanted us dead/.test(l));
    check('earned: system-gated overheard opener fires post-arrival', sysLine.length > 0,
      `${sysLine.length}/${slines.length} lines`);

    // (P3) after a monster encounter, monster-talk openers can fire
    Game.state.systemArrived = false;
    Game.state.codex.monsters = { test_beast: { stage: 'observed' } };
    const mlines = [];
    Game.say = (m) => mlines.push(String(m));
    for (let r = 0; r < 500; r++) { v.lastOverheard = 99; try { Game.overheardDiscussion(); } catch (e) {} }
    const monLine = mlines.filter(l => /birds went quiet an hour before|name the monsters|pattern in the attacks|third incident followed/.test(l));
    check('earned: monster-gated overheard openers fire after encounter', monLine.length > 0,
      `${monLine.length}/${mlines.length} lines`);

    // (P4) porcupine tip fires once the animal is known (3 encounters)
    const pork = 'north_american_porcupine';
    Game.state.codex.animalEncounters = Game.state.codex.animalEncounters || {};
    Game.state.codex.animalEncounters[pork] = 3;
    const cue = Game.encAnimalCue(pork);
    check('earned: porcupine cue fires when known', typeof cue === 'string' && /Never grab it barehanded/.test(cue),
      `got: ${JSON.stringify(cue).slice(0, 70)}`);
  }

  console.log(failures ? `\n${failures} FAILURES` : '\nALL GREEN');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
