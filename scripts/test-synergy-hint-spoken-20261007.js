#!/usr/bin/env node
// SYNERGY HINT SPOKEN IN-LOG PROOF — 2026-10-07 (Steve 2026-10-05).
//
// Item 1: Game.synergyTease (src/js/game.js) at attempt 2 with dm.hint must
// speak tease2 + the shimmer line + the literal dm.hint text in the log —
// not gate the hint behind the pack panel only. Attempt 1 must NOT speak the
// hint; a repeat attempt-2 must not re-speak (seenKey anti-spam).
//
// Item 2 (static): unleash_rage (rage block, src/data/abilities.json) must
// describe the real engine (+100% damage for 3 rounds — no friendly-fire
// targeting exists) with the red-rage voice intact.
//
// Item 3 (report only): one_person_army needs trade_of_blows + unbreakable +
// haymaker all at level 3. This section measures, via the real engine, what
// it takes to get there at HEAD. It does NOT change unlock requirements.
//
// Seeded node harness: full production module list (index.html order minus
// app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js per AGENTS.md);
// window+document stubbed for eval, deleted before playing; mulberry32 RNG.
// Deterministic: SEED env override (default 7). Exit non-zero on ANY failure.
//
// Run:  REPO_ROOT=/tmp/brawler-patched node scripts/test-synergy-hint-spoken-20261007.js
//       SEED=2 REPO_ROOT=/tmp/brawler-patched node scripts/test-synergy-hint-spoken-20261007.js
// Build the extract: git archive <sha> | tar -x -C /tmp/brawler-patched,
// then apply /tmp/patch-dmhint.patch (patch -p1).

const fs = require('fs');
const path = require('path');

const ROOT = process.env.REPO_ROOT || '/tmp/brawler-patched';
try { fs.statSync(path.join(ROOT, 'src', 'js', 'game.js')); }
catch (e) { console.error('FATAL: extract missing at ' + ROOT + ' — build with: git archive <sha> | tar -x -C ' + ROOT + ' && patch -p1 < /tmp/patch-dmhint.patch'); process.exit(2); }

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// Full production script order from index.html at HEAD, minus the DOM-only
// modules (AGENTS.md: app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js).
const order = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/src\/js\/[^"']*\.js/g)]
  .map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i)
  .filter(s => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global; // stub for eval phase only — deleted before playing
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
if (typeof Game.drama !== 'function') Game.drama = () => {};
if (typeof Game.audioEvent !== 'function') Game.audioEvent = () => {};

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
const clearSays = () => says.splice(0);
const logText = () => says.join('\n');

(async () => {
  await Game.init();
  console.log(`seed=${SEED}  extract: ${ROOT}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2600; s.trauma = 0;
  s.synergyAttempts = {};

  // ================= A. dm.hint spoken in-log (item 1) =================
  console.log('A. synergyTease speaks dm.hint at attempt 2');
  const synergies = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/synergies.json'), 'utf8'));
  const syn = synergies.find(x => x.id === 'unstoppable');
  const dm = syn.discovery_method || {};
  check('test synergy has tease1/tease2/hint', !!(dm.tease1 && dm.tease2 && dm.hint), JSON.stringify(dm).slice(0, 80));

  // A1: attempt 1 speaks tease1, does NOT speak the hint.
  clearSays();
  Game.synergyTease(syn, 1);
  const log1 = logText();
  check('attempt-1 speaks tease1 verbatim', log1.includes(dm.tease1), log1.slice(0, 160));
  check('attempt-1 does NOT speak dm.hint', !log1.includes(dm.hint));
  check('attempt-1 sets seenKey (anti-spam armed)', s.synergyAttempts['unstoppable_teased_1'] === 1);

  // A2: attempt 2 speaks tease2 + shimmer + hint verbatim, in that order.
  clearSays();
  Game.synergyTease(syn, 2);
  const log2 = logText();
  const iTease2 = log2.indexOf(dm.tease2);
  const iShimmer = log2.indexOf('Something wants to happen');
  const iHint = log2.indexOf(dm.hint);
  check('attempt-2 speaks tease2 verbatim', iTease2 >= 0, log2.slice(0, 200));
  check('attempt-2 speaks the shimmer line', iShimmer >= 0);
  check('attempt-2 speaks dm.hint verbatim', iHint >= 0);
  check('order is tease2 -> shimmer -> hint', iTease2 >= 0 && iShimmer > iTease2 && iHint > iShimmer,
    `idx tease2=${iTease2} shimmer=${iShimmer} hint=${iHint}`);
  check('attempt-2 sets seenKey', s.synergyAttempts['unstoppable_teased_2'] === 1);

  // A3: repeat attempt-2 does not re-speak anything (seenKey anti-spam).
  const before = says.length;
  Game.synergyTease(syn, 2);
  check('repeat attempt-2 speaks nothing new', says.length === before, `log grew ${before} -> ${says.length}`);

  // A4: a synergy with no hint still teases honestly (no crash, no hint line).
  clearSays();
  Game.synergyTease({ id: 'nohint_test', discovery_method: { tease1: 't1x', tease2: 't2x' } }, 2);
  const log4 = logText();
  check('hintless synergy attempt-2 speaks tease2', log4.includes('t2x'), log4.slice(0, 160));
  check('hintless synergy attempt-2 skips shimmer branch', !log4.includes('Something wants to happen'));

  // ================= B. unleash_rage honesty (item 2, static) =================
  console.log('B. unleash_rage description/flavor honesty (static)');
  const abilRaw = fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8');
  let abilities = null, parseOk = true;
  try { abilities = JSON.parse(abilRaw); } catch (e) { parseOk = false; }
  check('abilities.json parses', parseOk);
  const rage = abilities.find(a => a.id === 'rage');
  check('rage block present', !!rage);
  const desc = rage.description || '', flav = rage.flavor || '';
  check('description drops "nearest thing (friend or foe)"', !/nearest thing/i.test(desc) && !/friend or foe/i.test(desc), desc);
  check('flavor drops the hit-a-friend joke', !/that was a friend/i.test(flav), flav);
  check('description states the real engine (+100% / 3 rounds)', /\+100%/.test(desc) && /3 rounds/.test(desc), desc);
  check('flavor keeps the red-rage voice', /ANGRY/.test(flav) && /red/i.test(flav), flav);
  check('no "friend or foe" anywhere in abilities.json', !/friend or foe/i.test(abilRaw));
  check('escaped \\uXXXX style preserved (em dash as \\u2014)', abilRaw.includes('comes down \\u2014 hold on'));
  // The action effect text was already honest — confirm it still matches.
  const act = (rage.actions || []).find(a => a.id === 'unleash_rage');
  check('action effect text unchanged and honest', !!act && /\+100% damage for 3 rounds/.test(act.effect || ''), (act || {}).effect);

  // ================= C. one_person_army steepness (item 3, REPORT ONLY) =================
  console.log('C. one_person_army unlock steepness — measurement only, no changes');
  const LEGS = ['trade_of_blows', 'unbreakable', 'haymaker'];
  // C1: enumerate every gainAbilityXP call site — which ability ids can ever earn XP?
  const jsFiles = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'));
  const callSites = [];
  for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
    src.split('\n').forEach((line, i) => {
      const m = line.match(/gainAbilityXP\(\s*['"]([^'"]+)['"]/);
      if (m && !/function gainAbilityXP/.test(line)) callSites.push(`${f}:${i + 1} -> ${m[1]}`);
      if (/gainAbilityXP\(a\.id/.test(line)) callSites.push(`${f}:${i + 1} -> <dynamic a.id> (channelSentiment)`);
    });
  }
  const xpIds = new Set(callSites.map(c => c.split(' -> ')[1]));
  console.log('    gainAbilityXP targets at HEAD: ' + [...xpIds].join(', '));
  for (const leg of LEGS) {
    check(`${leg}: NO direct XP call site (uses don't level it)`, ![...xpIds].some(id => id === leg),
      callSites.filter(c => c.endsWith(' -> ' + leg)).join('; '));
  }
  // C2: behavioral — the ability-use path (noteAbilityUse, what useAbility
  // calls) grants zero XP to the three legs.
  s.abilities = s.abilities || [];
  for (const leg of LEGS) {
    if (!s.abilities.find(a => a.id === leg)) s.abilities.push({ id: leg, name: leg, level: 1, xp: 0 });
    else { const e = s.abilities.find(a => a.id === leg); e.level = 1; e.xp = 0; }
  }
  for (const leg of LEGS) Game.noteAbilityUse(leg);
  const xpAfterUse = LEGS.map(leg => s.abilities.find(a => a.id === leg).xp);
  check('noteAbilityUse x3 grants 0 XP to the legs', xpAfterUse.every(x => x === 0), `xp=${xpAfterUse.join(',')}`);

  // C3: the ONLY engine path — channelSentiment's +2/day to every sub-L3
  // ability. Simulate with the real gainAbilityXP (L1->L2: 10, L2->L3: 25,
  // overflow lost on level-up, matching the code).
  function daysToAllL3(perDay) {
    for (const leg of LEGS) { const e = s.abilities.find(a => a.id === leg); e.level = 1; e.xp = 0; }
    let days = 0;
    while (days < 400) {
      days++;
      for (const leg of LEGS) Game.gainAbilityXP(leg, perDay);
      if (LEGS.every(leg => s.abilities.find(a => a.id === leg).level >= 3)) return days;
    }
    return -1;
  }
  const d2 = daysToAllL3(2);   // base keepsake: Math.round(2*1)
  const d3 = daysToAllL3(3);   // chosen keepsake: Math.round(2*1.5)
  const d4 = daysToAllL3(4);   // wedding_ring: Math.round(2*2)
  check('all-L3 via +2/day completes (simulated with real gainAbilityXP)', d2 > 0 && d2 <= 400, `days=${d2}`);
  console.log(`    MEASURED: all three legs L1->L3 takes ${d2} daily channels at +2/day (base keepsake), ` +
    `${d3} at +3/day (chosen keepsake), ${d4} at +4/day (wedding_ring).`);
  console.log('    MEASURED: 0 XP per combat use — brawling itself never deepens the legs.');
  console.log('    NOTE (report only): channelSentiment needs a keepsake + sentimentTaught + trauma<8;');
  console.log('    NOTE: trauma>=8 diverts the channel to soothing (no XP). Brawling generates trauma.');

  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e && e.stack || e); process.exit(2); });
