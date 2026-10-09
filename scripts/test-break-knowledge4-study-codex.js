// BREAK-IT knowledge 4th pass — DEAD CODE + HONESTY: studyVillageCodex
// (game.js) is the ONLY path that links codices and grows
// systemIntegrationLevel — and the HUD promises "study 1 more village codex
// -> L1". But no UI surface calls it: villageCard actions are petition /
// talk / sharefood only; villageCardAction has no 'study' route. The whole
// integration system is unreachable at runtime; the promise dangles.
//
// BEFORE: Game.villageCardAction(ovId, 'study') -> null (no route).
//         villageCard actions list contains no study action.
//
// AFTER: villageCard offers "Study their codex" when you're AT the village
// (face to face, like talk) and they know your face (trust 10+ — the same
// gate villageTalk uses for real teaching). villageCardAction routes 'study'
// to studyVillageCodex; the link + integration level-up fire.
'use strict';
const fs = require('fs');
const path = require('path');
const h = require('./break-monsters-harness.js');
const SEEDS = [20261008, 7, 424242];

async function run(seed) {
  global.window = global;
  const G = await h.freshGame(seed);
  G.say = () => {};
  let v = (G.state.otherVillages || []).find(x => x.id !== 'haven');
  if (!v) return { seed, skip: 'no other village' };
  // generate it: fresh games spawn villages ungenerated; give it a codex like genVillageProfile would
  v.generated = true;
  v.x = G.map.px; v.y = G.map.py;
  v.knowledgeProfile = { focus: 'forager' };
  const plants = G.data.plants;
  const newPid = plants[12].id;
  v.codex = {
    plants: { [newPid]: { level: 2, identifiedDay: 0 } },
    techniques: { plant_tracking: { level: 2, learnedDay: 0, strategy: 'forager' } },
    recipes: { trail_mix: { known: true, learnedDay: 0 } },
    animals: {},
  };
  G.state.codex.plants = {};
  G.state.codex.recipes = {};
  // put the player AT the village
  G.map.px = v.x; G.map.py = v.y;
  v.trust = 25;
  const out = {};
  // 1. the card must offer a study action when at the village
  const card = G.villageCard(v.id);
  out.cardOffersStudy = !!(card && (card.actions || []).some(a => a.id === 'study'));
  // 2. the action route must reach studyVillageCodex (engine, real call)
  let res = null, err = null;
  try { res = G.villageCardAction(v.id, 'study'); } catch (e) { err = String((e && e.message) || e); }
  if (err) return { seed, error: err };
  out.routeHits = typeof res === 'string' && (res.includes('Learned:') || res.includes('nothing you don\'t already know') || res.includes('You need to be'));
  // 3. studying must link the codex (integration bookkeeping moves)
  const sch = G.state.scholar;
  out.codexLinked = (sch.linkedCodices || []).includes(v.id);
  return { seed, ...out, detail: `cardActions=[${(card.actions||[]).map(a=>a.id).join(',')}] res=${JSON.stringify((res||'').slice(0,60))}` };
}

async function main() {
  let fails = 0, ran = 0;
  // static dead-code assertion: no UI surface wires studyVillageCodex
  const appSrc = fs.readFileSync(path.join(h.ROOT, 'src/js/app.js'), 'utf8');
  const convSrc = fs.readFileSync(path.join(h.ROOT, 'src/js/conversation.js'), 'utf8');
  const betrayalSrc = fs.readFileSync(path.join(h.ROOT, 'src/js/betrayal.js'), 'utf8');
  const uiWires = /studyVillageCodex\s*\(/.test(appSrc) || /studyVillageCodex\s*\(/.test(convSrc)
    || /actionId === 'study'/.test(betrayalSrc);
  console.log(`${uiWires ? 'PASS' : 'FAIL'} | static | UI wires a studyVillageCodex path (villageCard 'study' action)`);
  if (!uiWires) fails++;
  for (const seed of SEEDS) {
    const r = await run(seed);
    if (r.skip) { console.log(`SKIP seed ${r.seed}: ${r.skip}`); continue; }
    if (r.error) { console.log(`ERROR seed ${r.seed}: ${r.error}`); fails++; continue; }
    ran++;
    for (const k of ['cardOffersStudy', 'routeHits', 'codexLinked']) {
      const ok = !!r[k];
      console.log(`${ok ? 'PASS' : 'FAIL'} | seed ${r.seed} | ${k} | ${r.detail}`);
      if (!ok) fails++;
    }
  }
  console.log(fails ? `\n${fails} CHECK(S) FAILED (${ran} seeds)` : `\nALL CHECKS PASSED (${ran} seeds)`);
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
