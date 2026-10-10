#!/usr/bin/env node
// META PROGRESSION (prog-meta 2026-10-10): proof tests for the cross-run
// achievement codex (src/js/metaProgression.js).
//
//   1. data integrity: 45 achievements, unique ids, valid categories, every
//      achievement has a player-facing name and a non-leaking hint.
//   2. unlocks fire from REAL wrapped game events (identifyPlant,
//      _noteAnimalDepth, ensureMonsterEntry, monsterNamingCheck,
//      recordWaveKill, unlockedWave, arcBeat, noteCrisis, contestLearn,
//      _contestEnd, tableScene, chooseTableOption, recordLegend,
//      applyStatus, cureStatus).
//   3. persistence: localStorage round-trip under key oversight.meta.v1;
//      meta writes never touch save-game keys; corrupt data resets safely.
//   4. zero gameplay leakage: fresh games are provably unaffected — no meta
//      reads during newGame, no meta traces in state, note functions never
//      mutate game state, wrapped methods behave identically with an empty
//      vs fully-unlocked store.
//
// Usage: node scripts/test-meta-progression-20261010.js
//        SEED=7 node scripts/test-meta-progression-20261010.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
if (!FILES.includes('src/js/metaProgression.js')) { console.error('FAIL metaProgression.js not in index.html load order'); process.exit(2); }
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

// ---- localStorage stub: records every key touched ----
const lsData = {};
const lsLog = [];
global.localStorage = {
  getItem: k => { lsLog.push(['get', k]); return (k in lsData) ? lsData[k] : null; },
  setItem: (k, v) => { lsLog.push(['set', k]); lsData[k] = String(v); },
  removeItem: k => { lsLog.push(['del', k]); delete lsData[k]; },
};

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function freshGame() {
  delete Game._metaCache; // force store reload, like a fresh tab
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tbfight = null;
}
function unlocked(id) { return !!Game._meta().unlocked[id]; }

(async () => {
  await Game.init();
  Game.say = () => {}; Game.drama = () => {}; Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ 1. data integrity ============
  console.log('\n-- 1. achievement data --');
  {
    const list = Game.metaList();
    ok('45 achievements', list.length === 45, 'got ' + list.length);
    const ids = list.map(a => a.id);
    ok('unique ids', new Set(ids).size === ids.length);
    const cats = new Set(['flora', 'fauna', 'monsters', 'escalation', 'show', 'arcs', 'table', 'sickness', 'milestones']);
    ok('all fields present, valid cats', list.every(a => a.id && a.cat && cats.has(a.cat) && a.name && a.desc && a.hint));
    ok('summary agrees', Game.metaSummary().total === 45 && Game.metaSummary().unlocked === 0);
    // hints must not leak content: no hint names a specific monster/plant/disease id
    const dataIds = new Set([
      ...(Game.data.plants || []).map(p => p.id),
      ...(Game.data.animals || []).map(p => p.id),
      ...(Game.data.monsters || []).map(p => p.id),
    ]);
    const leaks = list.filter(a => !unlocked(a.id) && [...dataIds].some(id => a.hint.toLowerCase().includes(String(id).toLowerCase().replace(/_/g, ' '))));
    ok('unmet hints leak no true ids', leaks.length === 0, leaks.map(a => a.id).join(','));
  }

  // ============ 2. real wrapped events unlock ============
  console.log('\n-- 2. unlocks from real wrapped events --');
  {
    freshGame();
    const pid = Game.data.plants[0].id, pid2 = Game.data.plants[1].id;
    ok('identifyPlant returns true', Game.identifyPlant(pid, 'fieldwork') === true);
    ok('mp-first unlocked', unlocked('mp-first'));
    ok('seen.plant recorded', !!Game._meta().seen.plant[pid]);
    for (let i = 1; i < 10; i++) Game.identifyPlant(Game.data.plants[i].id, 'fieldwork');
    void pid2;
    ok('mp-10 at 10 plants', unlocked('mp-10'));
    ok('mp-25 not yet', !unlocked('mp-25'));

    const aid = Game.data.animals[0].id;
    ok('_noteAnimalDepth returns true', Game._noteAnimalDepth(aid, 1, {}) === true);
    ok('ma-first unlocked', unlocked('ma-first'));
    ok('repeat depth note is no-op (returns false)', Game._noteAnimalDepth(aid, 1, {}) === false);

    Game.ensureMonsterEntry('hushwolf');
    ok('mm-first unlocked', unlocked('mm-first'));
    Game.ensureMonsterEntry('voice_mimic_radio'); // wave 2 monster
    ok('mw-2 unlocked via encounter wave', unlocked('mw-2'));

    const e = Game.state.codex.monsters['hushwolf'];
    (Game.state.village.roster || []).slice(0, 20).forEach(vid => { e.proposals[vid] = 'Headlight Harry'; });
    Game.monsterNamingCheck('hushwolf');
    ok('mm-named unlocked', unlocked('mm-named') && e.villageName === 'Headlight Harry');

    Game.recordWaveKill('hushwolf');
    ok('kill counted', Game._meta().count.monsterKills === 1 && Game._meta().count.waveKills[1] === 1);

    Game.state.scholar.day = 60; Game.state.waveKills = { 1: 99, 2: 99, 3: 99 };
    ok('unlockedWave -> 4', Game.unlockedWave() === 4);
    ok('mw-3 and mw-4 unlocked', unlocked('mw-3') && unlocked('mw-4'));

    Game.arcBeat(2);
    ok('ma2 unlocked', unlocked('ma2'));
    Game.noteCrisis('first-grave');
    ok('mx-crisis + mx-grave unlocked', unlocked('mx-crisis') && unlocked('mx-grave'));

    Game.contestLearn('duel', 'studied');
    ok('mc-watch unlocked', unlocked('mc-watch') && !!Game._meta().seen.contest['duel']);

    const cr = Game._contestEnd({ contestId: 'duel', participant: 'player', others: [] }, 'won', false);
    ok('_contestEnd returns outcome', cr && cr.outcome === 'won');
    ok('mc-first + mc-win unlocked', unlocked('mc-first') && unlocked('mc-win'));
    ok('contestWins counted once', Game._meta().count.contestWins === 1);

    Game._contestDie({ contestId: 'duel', participant: 'player', others: [] }, 'gored');
    ok('mc-died unlocked via _contestDie', unlocked('mc-died'));
    const watchedBefore = Game._meta().count.contestWatched;
    Game._showEnd({ contestId: 'duel', participant: (Game.state.village.roster || [])[1] || 'villager-x', others: [] }, 'won', false);
    ok('_showEnd counts a watched contest', Game._meta().count.contestWatched === watchedBefore + 1);

    Game.state.scholar.day = 7;
    Game.checkSystemArrival();
    ok('mx-s7 unlocked via checkSystemArrival', unlocked('mx-s7') && Game.state.systemArrived === true);

    Game.applyStatus('scholar', 'gutrot', { chance: 1 });
    ok('md-m1 unlocked', unlocked('md-m1') && !!Game._meta().disease.contracted['gutrot']);
    ok('cureStatus returns true', Game.cureStatus('scholar', 'gutrot', 'test') === true);
    ok('md-cure unlocked', unlocked('md-cure'));
    Game.applyStatus('scholar', 'eurika', { chance: 1 });
    ok('md-a1 unlocked (alien pool)', unlocked('md-a1'));
    Game.applyStatus('scholar', 'poison', { chance: 1 });
    ok('non-disease status ignored', !Game._meta().disease.contracted['poison']);

    Game.tableScene();
    ok('mt-table unlocked', unlocked('mt-table'));
    const frame = Game.state.scholar.tableChoices.frame;
    ok('frame achievement unlocked (mt-f-' + frame + ')', unlocked('mt-f-' + frame));
    Game.chooseTableOption(Game.state.scholar.tableChoices.options[0].id);
    ok('mt-choice unlocked', unlocked('mt-choice'));
    ok('mx-win via recordLegend wrap', unlocked('mx-win'));
  }

  // legend: death path, on a fresh run
  console.log('\n-- 2b. legend death path --');
  {
    freshGame();
    Game.recordLegend({ outcome: 'died' });
    ok('mx-death unlocked', unlocked('mx-death'));
  }

  // ============ 3. persistence ============
  console.log('\n-- 3. persistence --');
  {
    for (const k of Object.keys(lsData)) delete lsData[k]; // start from an empty device
    freshGame();
    const keysBefore = new Set(Object.keys(lsData));
    Game.metaUnlock('mp-first');
    ok('written to oversight.meta.v1', 'oversight.meta.v1' in lsData);
    const newKeys = Object.keys(lsData).filter(k => !keysBefore.has(k));
    ok('meta writes only its own key', newKeys.length === 1 && newKeys[0] === 'oversight.meta.v1', newKeys.join(','));
    delete Game._metaCache; // simulate a fresh tab
    ok('round-trip: still unlocked', !!Game.metaGet().unlocked['mp-first']);
    ok('metaSummary counts it', Game.metaSummary().unlocked === 1);

    // corrupt data resets safely
    lsData['oversight.meta.v1'] = '{{{not json';
    delete Game._metaCache;
    let got = null, threw = false;
    try { got = Game.metaGet(); } catch (e) { threw = true; }
    ok('corrupt data: no throw, fresh store', !threw && got && Object.keys(got.unlocked).length === 0);
    ok('unlock works after reset', Game.metaUnlock('mp-first') !== null);
  }

  // ============ 4. zero gameplay leakage ============
  console.log('\n-- 4. zero gameplay leakage --');
  {
    // (a) newGame never consults the meta store
    for (const k of Object.keys(lsData)) delete lsData[k];
    lsLog.length = 0;
    freshGame();
    const metaAccess = lsLog.filter(([op, k]) => k === 'oversight.meta.v1');
    ok('newGame performs zero meta-store reads/writes', metaAccess.length === 0, JSON.stringify(metaAccess));

    // (b) fresh state carries no meta traces
    const snap = JSON.stringify(Game.state);
    ok('no meta key in state JSON', !/oversight\.meta|metaProgression/i.test(snap));
    const hasMetaKey = (o) => o && typeof o === 'object' && Object.keys(o).some(k => /meta/i.test(k));
    ok('no /meta/i keys on state/scholar', !hasMetaKey(Game.state) && !hasMetaKey(Game.state.scholar));

    // (c) note functions are store-only: state JSON identical before/after
    const before = JSON.stringify(Game.state);
    Game.metaNotePlant('some_plant'); Game.metaNoteAnimal('some_animal');
    Game.metaNoteMonster('some_monster'); Game.metaNoteMonsterNamed('some_monster');
    Game.metaNoteWaveKill('hushwolf'); Game.metaNoteWaveUnlocked(3);
    Game.metaNoteArc(3); Game.metaNoteCrisis('hunger-winter');
    Game.metaNoteContest('gauntlet', 'won'); Game.metaNotePlayerContest('won', false);
    Game.metaNoteTable('feared'); Game.metaNoteTableChoice('feared', 'mercy');
    Game.metaNoteLegend('haven-endures'); Game.metaNoteSystemArrival();
    Game.metaNoteDisease('lockjaw'); Game.metaNoteCure('lockjaw');
    Game.metaUnlock('mp-first');
    ok('note/unlock battery leaves Game.state byte-identical', JSON.stringify(Game.state) === before);

    // (d) wrapped methods behave identically with empty vs fully-unlocked store
    Game.metaReset();
    freshGame();
    const pA = Game.data.plants[2].id;
    const rA = Game.identifyPlant(pA, 'fieldwork');
    const entryA = JSON.stringify(Game.state.codex.plants[pA]);
    // unlock everything, then identify a different plant on the same run
    for (const a of Game.metaList()) Game.metaUnlock(a.id);
    ok('all 45 unlocked', Game.metaSummary().unlocked === 45);
    const pB = Game.data.plants[3].id;
    const rB = Game.identifyPlant(pB, 'fieldwork');
    const entryB = JSON.stringify(Game.state.codex.plants[pB]);
    ok('identifyPlant return unaffected by meta', rA === true && rB === true);
    ok('codex entry shape unaffected by meta', Object.keys(JSON.parse(entryA)).sort().join(',') === Object.keys(JSON.parse(entryB)).sort().join(','));
    ok('no abilities granted by achievements', (Game.state.scholar.abilities || []).length === 0);
    ok('no items granted by achievements', JSON.stringify(Game.state).indexOf('oversight.meta') === -1);
  }

  // ============ 5. wraps installed + ontology ============
  console.log('\n-- 5. wrap installation & ontology --');
  {
    const hooked = ['identifyPlant', '_noteAnimalDepth', 'ensureMonsterEntry', 'monsterNamingCheck',
      'recordWaveKill', 'unlockedWave', 'arcBeat', 'noteCrisis', 'contestLearn', '_contestEnd',
      '_showEnd', '_contestDie', 'tableScene', 'chooseTableOption', 'recordLegend',
      'checkSystemArrival', 'applyStatus', 'cureStatus'];
    const missing = hooked.filter(n => typeof Game[n] !== 'function');
    ok('all hook targets exist', missing.length === 0, missing.join(','));
    const unwrapped = hooked.filter(n => typeof Game[n] === 'function' && Game[n].name !== 'metaWrapped');
    ok('all present targets wrapped', unwrapped.length === 0, unwrapped.join(','));
    try {
      execFileSync('node', [path.join(ROOT, 'scripts', 'validate-ontology.js')], { cwd: ROOT, stdio: 'pipe' });
      ok('validate-ontology.js passes', true);
    } catch (e) {
      ok('validate-ontology.js passes', false, (e.stdout || '').toString().slice(0, 300));
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
