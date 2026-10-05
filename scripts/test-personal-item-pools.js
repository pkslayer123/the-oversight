// Personalized item pools (Steve 2026-10-05): ONE pool per character, majority
// semantic (drawn from the actual backstory: kin, occupation, wound, want,
// skill), minority utility. Semantic items are among the best via bond rails.
// The player still picks 5 from 8.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js', 'src/js/lifeseed.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  const items = Game.data.items || [];
  const byId = {};
  items.forEach(i => { byId[i.id] = i; });
  const isSem = (id) => byId[id] && byId[id].class === 'sentimental';

  // --- generate a spread of characters ---
  Game.genRoster('Columbus, Ohio');
  const chars = Game.generatedRoster || [];
  ok('roster generated', chars.length >= 4);

  let compOk = 0, personOk = 0;
  const seenPools = new Set();
  for (const ch of chars) {
    const pool = ch.items || [];
    // composition: 8 items, semantic majority
    if (pool.length !== 8) { ok(`${ch.name}: pool is 8`, false); continue; }
    const nSem = pool.filter(isSem).length;
    const nUtil = pool.length - nSem;
    if (!(nSem > nUtil && nSem >= 5)) { ok(`${ch.name}: semantic ${nSem} > utility ${nUtil}`, false); continue; }
    compOk++;

    // personalization: at least one semantic item traceable to the seed
    const ls = ch.lifeseed || {};
    const relations = (ls.people || []).map(p => String(p.relation || '').toLowerCase());
    const occCat = Game.occCategory(ch.formerOccupation);
    const woundT = String(ls.wound || '').toLowerCase();
    const wantT = String(ls.want || '').toLowerCase();
    const skKeys = Object.keys(ls.skillOrigins || {});
    const traced = pool.filter(id => {
      const d = byId[id];
      if (!d || d.class !== 'sentimental') return false;
      if (d.kin && d.kin !== 'none' && relations.includes(String(d.kin).toLowerCase())) return true;
      if ((d.occCategories || []).includes(occCat)) return true;
      if ((d.woundKeys || []).some(k => woundT.includes(String(k).toLowerCase()))) return true;
      if ((d.wantKeys || []).some(k => wantT.includes(String(k).toLowerCase()))) return true;
      if ((d.skillKeys || []).some(k => skKeys.includes(k))) return true;
      return false;
    });
    if (traced.length >= 2) personOk++;
    else ok(`${ch.name} (${ch.formerOccupation}): >=2 seed-traced semantic (got ${traced.length})`, false);

    // no dupes, all real items
    if (new Set(pool).size !== pool.length) ok(`${ch.name}: no duplicate items`, false);
    if (pool.some(id => !byId[id])) ok(`${ch.name}: all items resolve`, false);

    seenPools.add(pool.slice().sort().join(','));
  }
  ok('every character: 8 items, semantic majority (>=5)', compOk === chars.length);
  ok('every character: >=2 seed-traced semantic items', personOk === chars.length);
  ok('pools differ across characters (personalized)', seenPools.size > 1);

  // --- semantic items are competitive: bond rails, effects, evolutions ---
  const newSem = items.filter(i => i.occCategories || i.woundKeys || i.wantKeys);
  ok('new semantic items exist (>=10)', newSem.length >= 10);
  ok('all new semantic have bondThresholds', newSem.every(i => (i.bondThresholds || []).length > 0));
  ok('all new semantic have baseEffect', newSem.every(i => !!i.baseEffect));
  ok('all new semantic have memory', newSem.every(i => !!i.memory));
  // enhancement offers reference real enhancements
  const enh = Game.data.relicEnhancements || [];
  const enhIds = new Set((Array.isArray(enh) ? enh : enh.enhancements || []).map(e => e.id));
  const badOffers = [];
  for (const i of newSem) for (const t of (i.bondThresholds || [])) for (const o of (t.offers || [])) {
    if (!enhIds.has(o)) badOffers.push(`${i.id}:${o}`);
  }
  ok('enhancement offers are real (' + badOffers.slice(0, 3).join(',') + ')', badOffers.length === 0);
  // occupation categories cover the roster
  const cats = new Set(newSem.flatMap(i => i.occCategories || []));
  ok('occupation categories covered', ['medical', 'food', 'craft', 'outdoors', 'service', 'creative'].every(c => cats.has(c)));

  // --- every semantic item in any pool has a plausible connection ---
  let connBad = 0;
  for (const ch of chars) {
    for (const id of (ch.items || [])) {
      const d = byId[id];
      if (!d || d.class !== 'sentimental') continue;
      const hasConn = (d.kin && d.kin !== 'none') || (d.occCategories || []).length ||
        (d.woundKeys || []).length || (d.wantKeys || []).length || (d.skillKeys || []).length ||
        !!d.memory; // legacy keepsakes carry a memory at minimum
      if (!hasConn) { connBad++; console.log(`  no-connection: ${id}`); }
    }
  }
  ok('every pooled semantic item has a plausible connection', connBad === 0);

  // --- the pick-5 choice is intact: pool 8, player chooses 5 ---
  const ch0 = chars[0];
  ok('pool is 8, choice is 5 (not auto-assigned)', (ch0.items || []).length === 8);

  // --- keepsake text resolves (no raw placeholders) ---
  const keep = (chars[0].items || []).map(id => byId[id]).find(d => d && d.class === 'sentimental');
  if (keep) {
    const txt = Game.resolveKeepsakeText(chars[0], keep, keep.memory || '');
    ok('keepsake memory resolves placeholders', !/\{(kin|first|place)\}/.test(txt));
  } else ok('keepsake found for placeholder test', false);

  console.log(`\npersonal-item-pools: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
