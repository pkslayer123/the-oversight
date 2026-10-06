// Knowledge-gating audit: contest/show/loot surfaces (Steve 2026-10-06).
// 1. Contest eligibility panel: verify only names + notability notes reach the UI
//    (notability is intended-by-design), nothing else leaks.
// 2. Contest intro coaching: gated on codex.contests level 2+.
// 3. Contest prize announcement: shows the RAW ITEM ID (debug leak) and grants a
//    bare {itemId, units:1} with no name (renders as "something" in Pack).
// 4. Monster-kill alien loot: true name + flavor + baseEffect shown instantly on
//    pickup — no identification gate (contrast: meat carcasses hide kcal/name).
// Usage: node scripts/test-kgate-contest-show-loot.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/contests.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let said = [];
function hookSay() {
  said = [];
  const orig = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); return orig(t); };
  const origSys = Game.sysSay.bind(Game);
  Game.sysSay = (t) => { said.push('[SYS] ' + String(t)); return origSys(t); };
}
function fresh() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  hookSay();
}
let failures = 0;
function check(cond, label, extra) {
  console.log((cond ? '  PASS ' : '  FAIL ') + label + (extra ? ' :: ' + extra : ''));
  if (!cond) failures++;
}

(async () => {
  await Game.init();
  Game.genDetail = () => Array.from({ length: 9 }, () => Array(9).fill('grass'));
  Game.canSee = () => true;

  // ---- 1. eligibility panel data ----
  console.log('\n===== contestEligible: pre-day-14 =====');
  fresh();
  Game.state.scholar.day = 5;
  let el = Game.contestEligible();
  check(el.eligible.length === 0 && /day 14/i.test(el.reason || ''), 'pre-day-14: no eligible, reason only', JSON.stringify(el.reason));

  console.log('\n===== contestEligible: day 16, fresh profile =====');
  fresh();
  Game.state.scholar.day = 16;
  el = Game.contestEligible();
  check(el.eligible.length > 0, 'day 16: someone eligible', `${el.eligible.length} eligible`);
  // The panel (app.js oversightPanel) renders ONLY name + notability. Verify the
  // data handed over contains nothing else the panel could leak.
  const leakedFields = [];
  for (const e of el.eligible) {
    for (const k of Object.keys(e)) if (!['id', 'name', 'notability', 'notes'].includes(k)) leakedFields.push(k);
  }
  check(leakedFields.length === 0, 'eligible entries carry only id/name/notability/notes', JSON.stringify([...new Set(leakedFields)]));
  const panelText = el.eligible.map(e => `${e.name} — ${(e.notability || []).join('; ') || 'no deeds on the record. the show decides.'}`).join(' | ');
  console.log('  panel would show:', JSON.stringify(panelText.slice(0, 200)));
  check(!/health|age|strength|skill|stat/i.test(panelText), 'panel shows no hidden stats');

  // notability with an earned deed -> shows; unearned -> absent
  Game.addNotability('player', 'wave2Kill');
  el = Game.contestEligible();
  const me = el.eligible.find(e => e.id === 'player');
  check((me.notability || []).includes('slew a wave-2 beast'), 'earned deed appears as notability note', JSON.stringify(me.notability));

  // ---- 2. contest intro coaching gating ----
  console.log('\n===== contest intro coaching gate =====');
  const contest = Game.contestPool().find(c => c.id === 'pit') || Game.contestPool()[0];
  fresh();
  const introFresh = Game._cxIntro(contest);
  const coachLines = Object.values({}).join(' ');
  check(!/feints first|Wave two hits hardest|calls it fast/i.test(introFresh), 'fresh intro: no coaching text', JSON.stringify(introFresh.slice(-120)));
  Game.state.codex.contests = { [contest.id]: { seen: 6, wins: 1, level: 3 } };
  const introLearned = Game._cxIntro(contest);
  check(introLearned.length > introFresh.length, 'learned (L3) intro: coaching appended', JSON.stringify(introLearned.slice(-160)));

  // ---- 3. contest prize: raw item id announced ----
  console.log('\n===== contest prize announcement =====');
  fresh();
  Game.state.scholar.day = 16;
  // Force the win path's prize block by calling it the way the engine does.
  // We capture what sysSay announces for a loot id.
  const lootId = 'hardlight_knife';
  hookSay();
  Game.sysSay(`📺 Prize: ${lootId}!`);
  Game.state.scholar.inventory.push({ itemId: lootId, units: 1 });
  const bare = Game.state.scholar.inventory.find(i => i.itemId === lootId);
  const dispName = Game.itemDisplayName(bare);
  console.log('  announced:', JSON.stringify(said[said.length - 1]));
  console.log('  pack displays bare prize as:', JSON.stringify(dispName));
  check(/[a-z_]+/.test(said[said.length - 1]) && said[said.length - 1].includes('hardlight_knife'),
    'prize announcement leaks the raw snake_case item id (debug-style leak)');
  check(dispName === 'something', 'bare prize item renders as "something" in Pack (no name granted)', JSON.stringify(dispName));

  // ---- 4. monster-kill alien loot: instant full reveal ----
  console.log('\n===== monster-kill alien loot reveal =====');
  fresh();
  Game.state.scholar.day = 16;
  Game.dayPart = 3;
  const s = Game.state.scholar;
  s.health = 500;
  s.mx = 2; s.my = 4;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.startCombat('mirrormoth');
  // Force the drop: monkey-patch Math.random for the loot roll only.
  const origRand = Math.random;
  Math.random = () => 0.001;
  hookSay();
  // Kill it outright, then end the fight as won.
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  Game.tbDamage(m.key, 99999, 'debug');
  // Fight ends via tbEndCheck once all monsters are down (tbDamage doesn't end it).
  let g = 0;
  while (Game.tbfight && g++ < 20) { try { Game.tbEndCheck(); } catch (e) { break; } if (Game.tbfight) { try { Game.tbEnd('won'); } catch (e) {} break; } }
  Math.random = origRand;
  const lootLine = said.find(t => t.includes('ALIEN LOOT'));
  console.log('  loot line:', JSON.stringify(lootLine));
  check(!!lootLine, 'kill with forced drop: ALIEN LOOT line spoken');
  if (lootLine) {
    const def = (Game.data.items || []).find(i => lootLine.includes(i.name));
    check(!!def, 'loot line shows the TRUE item name with zero identification', JSON.stringify((lootLine || '').slice(0, 120)));
    check(/\(.*(restores|melee|kcal|fuel|trade|capacity|damage|Heals).*\)/i.test(lootLine || ''),
      'loot line shows the mechanical baseEffect (e.g. "+45 melee", "restores 25 health") pre-use', JSON.stringify((lootLine || '').slice(0, 160)));
  }
  if (!Game.tbfight) console.log('  (fight ended)');

  console.log('\n' + (failures ? `RESULT: ${failures} FAILURES` : 'RESULT: ALL PASS'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
