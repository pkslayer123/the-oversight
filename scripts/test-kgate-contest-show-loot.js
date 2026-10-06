// Knowledge-gating: contest prize + monster-kill alien loot (Steve 2026-10-06).
// FIXED behavior asserted here:
// 1. Contest eligibility panel: only names + notability notes reach the UI.
// 2. Contest intro coaching: gated on codex.contests level 2+.
// 3. Contest prize: diegetic announce ("the System presses something humming
//    into your hands"), NO raw snake_case id, NO mechanical baseEffect; the
//    prize arrives via the shared alienLootGrant path — named in Pack (never
//    "something"), effect gated until first use.
// 4. Monster-kill alien loot: announce shows NAME + FLAVOR only (the System's
//    narration); baseEffect hidden until first use; first use says
//    "Now you understand it. The <name>: <baseEffect>." and flips the flag.
// 5. Save/load: the alienEffectHidden flag survives a JSON round-trip.
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
const SNAKE_ID = /[a-z]+_[a-z_]+/; // raw snake_case id pattern

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
  const leakedFields = [];
  for (const e of el.eligible) {
    for (const k of Object.keys(e)) if (!['id', 'name', 'notability', 'notes'].includes(k)) leakedFields.push(k);
  }
  check(leakedFields.length === 0, 'eligible entries carry only id/name/notability/notes', JSON.stringify([...new Set(leakedFields)]));
  const panelText = el.eligible.map(e => `${e.name} — ${(e.notability || []).join('; ') || 'no deeds on the record. the show decides.'}`).join(' | ');
  check(!/health|age|strength|skill|stat/i.test(panelText), 'panel shows no hidden stats');

  Game.addNotability('player', 'wave2Kill');
  el = Game.contestEligible();
  const me = el.eligible.find(e => e.id === 'player');
  check((me.notability || []).includes('slew a wave-2 beast'), 'earned deed appears as notability note');

  // ---- 2. contest intro coaching gating ----
  console.log('\n===== contest intro coaching gate =====');
  const contest = Game.contestPool().find(c => c.id === 'pit') || Game.contestPool()[0];
  fresh();
  const introFresh = Game._cxIntro(contest);
  check(!/feints first|Wave two hits hardest|calls it fast/i.test(introFresh), 'fresh intro: no coaching text');
  Game.state.codex.contests = { [contest.id]: { seen: 6, wins: 1, level: 3 } };
  const introLearned = Game._cxIntro(contest);
  check(introLearned.length > introFresh.length, 'learned (L3) intro: coaching appended');

  // ---- 3. contest prize: shared reveal path ----
  console.log('\n===== contest prize: diegetic announce, gated effect =====');
  fresh();
  Game.state.scholar.day = 16;
  hookSay();
  // Force the prize block to pick hardlight_knife deterministically.
  const origRoll = Game.rollAlienLoot.bind(Game);
  Game.rollAlienLoot = () => 'hardlight_knife';
  let prizeErr = null;
  try {
    Game._contestEnd({ contestId: contest.id, participant: 'player', phase: 'x', phaseIdx: 0 }, 'won', true);
  } catch (e) { prizeErr = e; }
  Game.rollAlienLoot = origRoll;
  check(!prizeErr, 'prize win path runs clean', prizeErr ? String(prizeErr).slice(0, 120) : '');
  const prizeLine = said.find(t => t.includes('presses something humming'));
  const prizeRaw = said.find(t => /📺 Prize: hardlight_knife/.test(t));
  check(!!prizeLine, 'prize announce is the diegetic descriptor', JSON.stringify(prizeLine || '').slice(0, 160));
  check(!prizeRaw, 'no raw snake_case id in any announce line');
  const prizeAnnounces = said.filter(t => t.startsWith('[SYS]'));
  check(!prizeAnnounces.some(t => /\+45 melee|restores \d+ health|burns \dx/i.test(t)),
    'no mechanical baseEffect in the prize announce', JSON.stringify(prizeAnnounces.slice(-2)));
  const prizeItem = Game.state.scholar.inventory.find(i => i.itemId === 'hardlight_knife');
  check(!!prizeItem, 'prize item granted to inventory');
  if (prizeItem) {
    check(Game.itemDisplayName(prizeItem) !== 'something', 'Pack renders the prize by NAME, never "something"', JSON.stringify(Game.itemDisplayName(prizeItem)));
    check(prizeItem.name === 'Hardlight knife', 'prize carries the true display name', JSON.stringify(prizeItem.name));
    check(prizeItem.alienLoot === true && prizeItem.alienEffectHidden === true, 'prize carries the knowledge-gate flag (alienEffectHidden)');
  }

  // ---- 4. monster-kill alien loot: name+flavor announce, effect gated ----
  console.log('\n===== monster-kill alien loot: gated until first use =====');
  fresh();
  Game.state.scholar.day = 16;
  Game.dayPart = 3;
  const s = Game.state.scholar;
  s.health = 500;
  s.mx = 2; s.my = 4;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.startCombat('mirrormoth');
  const origRand = Math.random;
  Math.random = () => 0.001; // force the drop roll
  hookSay();
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  Game.tbDamage(m.key, 99999, 'debug');
  let g = 0;
  while (Game.tbfight && g++ < 20) { try { Game.tbEndCheck(); } catch (e) { break; } if (Game.tbfight) { try { Game.tbEnd('won'); } catch (e) {} break; } }
  Math.random = origRand;
  const lootLine = said.find(t => t.includes('ALIEN LOOT'));
  check(!!lootLine, 'kill with forced drop: ALIEN LOOT line spoken');
  if (lootLine) {
    check(!/\(.*(restores|melee|kcal|fuel|trade|capacity|damage|Heals).*\)/i.test(lootLine),
      'loot announce shows NO mechanical baseEffect', JSON.stringify(lootLine.slice(0, 160)));
    check(!SNAKE_ID.test(lootLine), 'loot announce shows no raw snake_case id', JSON.stringify(lootLine.slice(0, 120)));
    const def = (Game.data.items || []).find(i => lootLine.includes(i.name));
    check(!!def, 'loot announce still shows the NAME (System narration)', JSON.stringify((lootLine || '').slice(0, 120)));
    check(def && lootLine.includes(def.flavor || '~~~none~~~'), 'loot announce still shows the FLAVOR');
  }
  const lootItem = Game.state.scholar.inventory.find(i => i.alienLoot);
  check(!!lootItem, 'loot item granted with the gate flag');
  if (lootItem) check(lootItem.alienEffectHidden === true, 'effect hidden pre-use');

  // ---- 5. first use = the learning moment ----
  console.log('\n===== first use reveals the effect =====');
  fresh();
  hookSay();
  // useItem path (wrong_bandage: healAmount 25)
  let g1 = Game.alienLootGrant('wrong_bandage');
  g1.entry.units = 2; // keep one after use so we can inspect the flag
  const idx1 = Game.state.scholar.inventory.indexOf(g1.entry);
  Game.useItem(idx1);
  const reveal1 = said.find(t => /Now you understand it/.test(t));
  check(!!reveal1 && /restores 25 health/.test(reveal1), 'useItem: reveal beat names the mechanical effect', JSON.stringify(reveal1 || '').slice(0, 140));
  check(g1.entry.alienEffectHidden === false, 'useItem: flag flipped after first use');
  // second use: no repeat reveal
  const saidBefore = said.length;
  Game.useItem(Game.state.scholar.inventory.indexOf(g1.entry));
  check(said.slice(saidBefore).filter(t => /Now you understand it/.test(t)).length === 0, 'second use: no repeat reveal');
  // eatOne path (mislabeled_beans: 350 kcal)
  hookSay();
  const g2 = Game.alienLootGrant('mislabeled_beans');
  g2.entry.units = 2;
  Game.state.scholar.kcal = 0;
  Game.eatOne(Game.state.scholar.inventory.indexOf(g2.entry));
  const reveal2 = said.find(t => /Now you understand it/.test(t));
  check(!!reveal2 && /350 kcal/.test(reveal2), 'eatOne: reveal beat names the effect', JSON.stringify(reveal2 || '').slice(0, 140));
  // weapon path: equip + first swing
  hookSay();
  const g3 = Game.alienLootGrant('hardlight_knife');
  const idx3 = Game.state.scholar.inventory.indexOf(g3.entry);
  Game.equip(idx3, 'weapon');
  check(Game.state.scholar.equipped.weapon.alienEffectHidden === true, 'equip: gate flag travels to the equipped weapon');
  Game.startCombat('mirrormoth');
  const pm = Game.tbfight.fighters.find(x => x.kind === 'monster');
  // stand adjacent and swing
  const p = Game.tbfight.fighters.find(x => x.kind === 'player');
  pm.mx = p.mx + 1; pm.my = p.my;
  hookSay();
  Game.tbPlayerStrike(pm.key);
  const reveal3 = said.find(t => /Now you understand it/.test(t));
  check(!!reveal3 && /\+45 melee/.test(reveal3), 'first swing: reveal beat names the weapon effect', JSON.stringify(reveal3 || '').slice(0, 140));
  check(Game.state.scholar.equipped.weapon.alienEffectHidden === false, 'first swing: flag flipped on the weapon');
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}

  // ---- 6. save/load round-trip ----
  console.log('\n===== save/load: gate flag survives =====');
  fresh();
  const g4 = Game.alienLootGrant('medfoam_canister');
  const roundTripped = JSON.parse(JSON.stringify(Game.state));
  const rt = roundTripped.scholar.inventory.find(i => i.itemId === 'medfoam_canister');
  check(rt && rt.alienLoot === true && rt.alienEffectHidden === true, 'alienEffectHidden survives JSON save/load round-trip');

  console.log('\n' + (failures ? `RESULT: ${failures} FAILURES` : 'RESULT: ALL PASS'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
