// Wave-2 P0 apply proof (Steve 2026-10-06).
// Proves the wave-2 difficulty designs actually FIRE in live combat —
// not just "runs without crashing":
//   HECKLER: jibes stack SHAME every round -> HEADLINER at 3 -> PILE-ON on the
//     headliner jibe -> compulsion (act feeds it, WAIT answers back and clears 3)
//   LANDLORD: rent comes due on claimed ground, Addendum waves recur,
//     FORECLOSURE phase fires
//   LOOT: heckler 0.12/tier2, landlord 0.2/tier4, union_rep 0.15/tier3
//
// BEFORE/AFTER framing: the pre-escalation heckler (hp 55-75, dmg 10-14,
// jibe gate 0.4/round, headliner at 5) died in ~3 rounds at shame ~0 — the
// set never fired. This test measures the shipped build: the set must fire
// inside a normal-length fight.
//
// Run: node scripts/test-wave2-apply-p0.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function M(id) {
  if (!Game.tbfight) return null;
  const ms = Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive !== false);
  if (id) return ms.find(x => ((x.mdef || {}).id) === id) || ms[0];
  return ms[0];
}
function P() { return Game.tbFighter('p'); }

let said = [];
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const has = (re) => said.some(l => re.test(l));

async function setup(monId) {
  said = [];
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) Game.state.village.positions[rid] = { mx: 0, my: 0 };
  s.mx = 3; s.my = 4; s.monster = null;
  Game.dayPart = 3; Game.canSee = () => true;
  Game.state.codex = Game.state.codex || {}; Game.state.codex.monsters = {};
  Game.genDetail = flatGrid;
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); return origSay(t); };
  Game.startCombat(monId);
  const m = M(monId);
  if (!m) return null;
  m.mx = 6; m.my = 4;
  const p = P(); p.hp = p.maxHp = 2000;
  Game.log = [];
  return m;
}
// Guarded endTurn: exactly one AI round per player action (AGENTS.md turn hygiene).
function endT() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (p) { p.moveLeft = 0; p.acted = true; }
  try { Game.tbAfterPlayerAction(); } catch (e) {}
}
function monsterTurns() {
  let g = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g++ < 40) {
    try { Game.tbAdvance(); } catch (e) { break; }
  }
}
// Fighter bot: close in, strike when adjacent; answer the heckler when compelled.
function botTurn(m, opts) {
  if (!Game.tbfight || !Game.tbIsPlayerTurn()) { endT(); return; }
  const p = P();
  if (!p || !p.alive || !m || !m.alive) { endT(); return; }
  if (opts && opts.answerHeckler && p.hkCompelled) { try { Game.tbPlayerWait(); } catch (e) { endT(); } return; }
  if (opts && opts.camp) { endT(); return; } // landlord: stand your ground, feel the rent
  let d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
  if (d > 1 && p.moveLeft > 0) {
    const nx = Math.min(7, Math.max(1, p.mx + Math.sign(m.mx - p.mx)));
    const ny = Math.min(7, Math.max(1, p.my + Math.sign(m.my - p.my)));
    try { Game.tbPlayerMove(nx, ny); } catch (e) {}
    d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
  }
  if (d <= 1 && !p.acted && Game.tbIsPlayerTurn()) {
    try { Game.tbPlayerStrike(m.key); } catch (e) {}
  }
  endT();
}
function lastLines(n) {
  return said.slice(-n).map(l => '      | ' + l.replace(/\n/g, ' ')).join('\n');
}

(async () => {
  await Game.init(); // loads data once; setups then do genRoster/newGame/depart
  // ---------- 0. Loot data ----------
  console.log('\n== 0. Loot table (wave-2 > wave-1 gate) ==');
  const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const byId = Object.fromEntries((monsters.monsters || monsters).map(m => [m.id, m]));
  check('heckler loot 0.12 / tier 2',
    byId.heckler.loot && byId.heckler.loot.chance === 0.12 && byId.heckler.loot.tier === 2,
    JSON.stringify(byId.heckler.loot));
  check('landlord loot 0.2 / tier 4',
    byId.landlord.loot && byId.landlord.loot.chance === 0.2 && byId.landlord.loot.tier === 4,
    JSON.stringify(byId.landlord.loot));
  check('union_rep loot 0.15 / tier 3',
    byId.union_rep.loot && byId.union_rep.loot.chance === 0.15 && byId.union_rep.loot.tier === 3,
    JSON.stringify(byId.union_rep.loot));

  // ---------- 1. HECKLER: the set must fire ----------
  console.log('\n== 1. Heckler — the set must fire (played, not scripted) ==');
  {
    const m = await setup('heckler');
    if (!m) { console.log('  FAIL no fight'); fail++; }
    else {
      const naturalHp = m.hp;
      console.log(`  Spawned: The Heckler, ${naturalHp} HP (rolled ${byId.heckler.hp[0]}-${byId.heckler.hp[1]}), armor ${byId.heckler.armor}, direct ${byId.heckler.attack.damage[0]}-${byId.heckler.attack.damage[1]} chip.`);
      console.log('  BEFORE (spec problem statement): old heckler hp 55-75, dmg 10-14, jibe gate 0.4/round, headliner at 5 →');
      console.log('    dead in ~3 rounds at shame ~0. Headliner and compulsion NEVER fired. Direct 10-14 out-threatened the trick.');
      let shameTrace = [], headlinerRound = 0, pileOnRound = 0, compulsionRound = 0;
      let answeredDrop = null, answeredOnce = false;
      for (let r = 1; r <= 14 && Game.tbfight && !Game.tbfight.over; r++) {
        const shameBefore = m.hkShame || 0;
        const wasCompelled = !!((P() || {}).hkCompelled);
        // Answer the FIRST compulsion (proves the counterplay); the penalty
        // probe below acts through a compulsion to measure the cost.
        const answer = wasCompelled && !answeredOnce;
        if (answer) answeredOnce = true;
        botTurn(M('heckler'), { answerHeckler: answer });
        monsterTurns();
        const shameAfter = m.hkShame || 0;
        shameTrace.push(shameAfter);
        if (!headlinerRound && (m.beamPhase === 'headliner' || has(/LIVE ONE/))) headlinerRound = r;
        if (!pileOnRound && has(/PILE-ON/)) pileOnRound = r;
        if (!compulsionRound && has(/The words become a weight/)) compulsionRound = r;
        if (wasCompelled && answer) {
          const line = said.slice().reverse().find(l => /it costs the turn, but the words lose their weight/.test(l));
          const mm = line && line.match(/\(-(\d+) SHAME\)/);
          answeredDrop = mm ? parseInt(mm[1], 10) : (shameBefore - shameAfter);
        }
        console.log(`  R${r}: shame ${shameBefore}->${shameAfter}, phase=${m.beamPhase || 'stalk'}, mHP=${m.hp}/${m.maxHp}`);
        console.log(lastLines(2));
        if (m.hp <= 0) { console.log('  (heckler died — fight over)'); break; }
      }
      console.log(`  AFTER (measured this run): shame trace ${JSON.stringify(shameTrace)}`);
      check('headliner phase reached (the set FIRES)', headlinerRound > 0, `never reached in trace ${JSON.stringify(shameTrace)}`);
      check('shame reached headliner threshold', Math.max(...shameTrace, 0) >= 3, `max ${Math.max(...shameTrace, 0)}`);
      check('PILE-ON fired on headliner jibe', pileOnRound > 0, 'no PILE-ON line');
      check('compulsion offered (the weight)', compulsionRound > 0, 'no compulsion offer');
      check('answer-back (WAIT) clears 3 shame', answeredDrop !== null && answeredDrop >= 3, `drop=${answeredDrop}`);
      try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}

      // Compulsion penalty probe: force the compelled state, then ACT through
      // it (strike) instead of answering back. The shipped design (bf080a1)
      // punishes defiance with +2 shame; the spec draft wrote +1.
      console.log('  -- compulsion penalty probe (act while compelled) --');
      const m2 = await setup('heckler');
      if (m2) {
        m2.hkShame = 3; m2.beamPhase = 'headliner';
        const p2 = P(); p2.hkCompelled = true;
        // move adjacent so the strike lands
        p2.mx = m2.mx - 1; p2.my = m2.my;
        const shameBefore = m2.hkShame || 0;
        try { Game.tbPlayerStrike(m2.key); } catch (e) {}
        const afterStrike = m2.hkShame || 0; // compulsion penalty lands inside the strike
        endT(); monsterTurns();
        const delta = afterStrike - shameBefore;
        console.log(`  struck while compelled: shame ${shameBefore}->${afterStrike} (strike) ->${m2.hkShame} (monster turn), said: ${lastLines(3).replace(/\n/g, ' // ')}`);
        check('compulsion penalty fires when acting defiant', has(/Can.t even listen/) && delta > 0, `delta=${delta}`);
        console.log(`    note: measured penalty = +${delta} (shipped bf080a1; spec draft said +1)`);
        try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
      }
    }
  }

  // ---------- 2. LANDLORD: the lease must grow ----------
  console.log('\n== 2. Landlord — rent, addenda, foreclosure (played, not scripted) ==');
  {
    const m = await setup('landlord');
    if (!m) { console.log('  FAIL no fight'); fail++; }
    else {
      console.log(`  Spawned: The Landlord, ${m.hp} HP (rolled ${byId.landlord.hp[0]}-${byId.landlord.hp[1]}), eviction ${byId.landlord.attack.damage[0]}-${byId.landlord.attack.damage[1]}. Bot camps in place.`);
      let rentRounds = 0, maxAddenda = 0, foreclosureRound = 0;
      for (let r = 1; r <= 18 && Game.tbfight && !Game.tbfight.over; r++) {
        const rentBefore = said.length;
        botTurn(M('landlord'), { camp: true });
        monsterTurns();
        const newLines = said.slice(rentBefore);
        if (newLines.some(l => /takes its cut|RENT/.test(l))) rentRounds++;
        maxAddenda = Math.max(maxAddenda, m.llAddenda || 0);
        if (!foreclosureRound && (m.beamPhase === 'foreclosing' || has(/FORECLOSURE/))) foreclosureRound = r;
        const interesting = newLines.filter(l => /RENT|ADDENDUM|FORECLOSURE|pays rent|NOTICE SERVED/i);
        console.log(`  R${r}: addenda=${m.llAddenda || 0}, phase=${m.beamPhase || 'surveying'}, claimed=${m.llClaimed || 0}, pHP=${(P() || {}).hp}`);
        for (const l of interesting.slice(-3)) console.log('      | ' + l.replace(/\n/g, ' '));
        if (!(P() || {}).alive) { console.log('  (player died — the lease won)'); break; }
      }
      check('RENT comes due on claimed ground', rentRounds >= 2, `rent fired in ${rentRounds} rounds`);
      check('Addendum waves RECUR (2+)', maxAddenda >= 2, `max addenda ${maxAddenda}`);
      check('FORECLOSURE phase fires', foreclosureRound > 0, 'never foreclosed');
      try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
    }
  }

  console.log(`\n== RESULT: ${pass} pass, ${fail} fail ==`);
  process.exit(fail ? 1 : 0);
})();
