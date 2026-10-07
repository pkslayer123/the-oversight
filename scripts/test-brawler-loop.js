// Brawler loop playtest (Steve 2026-10-05): play the bully for real.
// Intimidate across temperaments, start a fight, kill someone, then walk
// the formal justice ladder. Verdicts are qualitative — the point is feel.
// Usage: node scripts/test-brawler-loop.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/journal.js', 'src/js/betrayal.js',
 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}
function note(s) { console.log(`  → ${s}`); }

// capture the transcript so the playtest can quote what the player saw
const said = [];
const origRand = Math.random;

function setTemp(vid, t) {
  const vp = Game.data.villagers.find(x => x.id === vid) || (Game.data.background_survivors || []).find(x => x.id === vid);
  vp.personality = vp.personality || {}; vp.personality.temperament = t;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const origSay = Game.say.bind(Game);
  Game.say = (s) => { said.push(String(s)); return origSay(s); };

  const v = Game.state.village;
  const others = () => v.roster.filter(id => id !== Game.villagerId);
  const name = (id) => Game.displayName(id);
  console.log(`\n== BRAWLER PLAYTEST: ${name(Game.villagerId)} at Haven, ${others().length} villagers ==`);

  // ---------- 1. INTIMIDATE: the cautious one yields ----------
  const v1 = others()[0]; setTemp(v1, 'cautious');
  note(`threatening ${name(v1)} (cautious) — "Your food. Now."`);
  const r1 = Game.intimidate(v1);
  ok('cautious yields', r1 === 'yielded');
  ok('stolen rations in inventory', Game.state.scholar.inventory.some(i => i.stolen && (i.units || 0) > 0));
  ok('victim terrified (fear +40)', Game.npcNeeds(v1).fear >= 40);
  ok('victim trust floored (clamped at 0)', ((v.trust || {})[v1] || 0) === 0);
  ok('intimidation recorded on the ladder', Game.justiceState().crimes.some(c => c.type === 'intimidation' && c.victim === v1));
  const heatAfterThreat = Game.justiceHeat();
  note(`heat after one threat: ${heatAfterThreat}`);

  // ---------- 2. INTIMIDATE: the steady one refuses ----------
  const v2 = others()[1]; setTemp(v2, 'steady');
  note(`threatening ${name(v2)} (steady) — expecting a flat no`);
  const r2 = Game.intimidate(v2);
  ok('steady refuses', r2 === 'refused');
  ok('steady takes a trust hit too', ((v.trust || {})[v2] || 0) === 0);

  // ---------- 3. INTIMIDATE: the bold one swings first ----------
  const v3 = others()[2]; setTemp(v3, 'bold');
  Game.npcNeeds(v3).fear = 0;
  Math.random = () => 0.1; // force the 40% "they swing" branch
  note(`threatening ${name(v3)} (bold) — forcing the swing branch`);
  const r3 = Game.intimidate(v3);
  Math.random = origRand;
  ok('bold swings first -> fight', r3 === 'fight' && !!Game.tbfight);
  ok('npc drew first (self-defense frame)', Game.tbfight.aggressor === 'npc');
  // survive their opening: end the fight by fleeing cleanly for the test
  if (Game.tbfight) { Game.tbEnd('fled'); Game.tbfight = null; Game._lastBetrayal = null; }
  note('fled the fight — testing the mechanics, not dying to them');

  // ---------- 4. THE ATTACK: you turn on someone, deliberately ----------
  const v4 = others()[3]; setTemp(v4, 'warm');
  note(`walking up to ${name(v4)} (warm) and turning on them — the classic PK`);
  const started = Game.playerAttacks(v4);
  ok('fight starts', started === true && !!Game.tbfight);
  ok('victim is a hostile fighter', Game.tbfight.fighters.some(f => f.kind === 'hostile' && f.villagerId === v4));
  ok('aggressor is the player', Game.tbfight.aggressor === 'player');

  // ---------- 5. COMBAT DIALOGUE: talk instead of striking ----------
  const hk = 'h_' + v4;
  while (!Game.tbIsPlayerTurn() && Game.tbfight && !Game.tbfight.over) Game.tbAdvance();
  note('on my turn, I try words first');
  Game.state.scholar.inventory.push({ name: 'Jerky', kcalEach: 150, units: 10, spoilDay: 99 });
  for (const tactic of ['beg', 'intimidate', 'reason', 'bribe', 'taunt']) {
    // reset the turn so each tactic gets a clean shot
    const p = Game.tbFighter('p'); if (p) p.acted = false;
    const t = Game.tbFighter(hk); if (!t || !t.alive) break;
    t.fled = false;
    const rr = Game.tbPlayerTalk(hk, tactic);
    ok(`talk tactic '${tactic}' runs clean`, rr === true || rr === false);
    if (Game.tbfight && Game.tbfight.over) break;
    if (Game.tbfight && !Game.tbfight.over) { while (!Game.tbIsPlayerTurn()) Game.tbAdvance(); }
  }
  if (Game.tbfight && Game.tbfight.over) { Game.tbfight = null; Game._lastBetrayal = null; note('fight ended during talk — restarting the kill sequence'); }

  // ---------- 5b. WITNESS RULES: the village only knows what it saw ----------
  // (runs before the kill, while fear/trust baselines are fresh)
  const by1 = others()[6], by2 = others()[7], by3 = others()[8];
  note('a killing WITH witnesses — the village should react, exactly once');
  Game.bumpTrust(by1, 60); // deterministic baseline regardless of earlier chaos
  const fear0 = Game.npcNeeds(by1).fear, trust0 = ((v.trust || {})[by1]) || 0;
  const sayBefore = said.length;
  Game.villageEvent('murder', { victim: by1, witnessed: true });
  ok('witnessed murder scares the village', Game.npcNeeds(by1).fear > fear0);
  ok('witnessed murder costs trust', (((v.trust || {})[by1]) || 0) < trust0);
  const murderLines = said.slice(sayBefore).filter(s => s.includes('The fire feels smaller') || s.includes('look at you differently') || s.includes('never hurt anyone'));
  ok('murder broadcast fires exactly once (no double-fire)', murderLines.length === 1);
  note('a killing with NO witnesses — recorded, but the village must not react');
  const fear1 = Game.npcNeeds(by2).fear, trust1 = ((v.trust || {})[by2]) || 0;
  const sayBefore2 = said.length, heatBefore = Game.justiceHeat();
  Game.villageEvent('murder', { victim: by2, witnessed: false });
  ok('unwitnessed murder: no fear broadcast', Game.npcNeeds(by2).fear === fear1);
  ok('unwitnessed murder: no trust hit', (((v.trust || {})[by2]) || 0) === trust1);
  ok('unwitnessed murder: no say text', said.length === sayBefore2);
  const uwCrime = Game.justiceState().crimes.find(c => c.type === 'murder' && c.victim === by2);
  ok('unwitnessed murder still recorded (unsolved)', !!uwCrime && uwCrime.witnessed === false);
  ok('unwitnessed murder adds no heat', Game.justiceHeat() === heatBefore);
  note('the moot only charges what the village can prove');
  Game.justiceState().crimes.length = 0;
  Game.recordCrime('murder', { victim: by3, witnessed: false, justified: false });
  const noCase = Game.forcePlayerAccusation();
  ok('moot refuses to charge an unprovable murder', noCase === null && Game.justiceState().mootDemanded === false);
  Game.justiceState().crimes.length = 0; // fresh sheet for the ladder walk
  Game.justiceState().stage = 0; // the 5b probe stood the ladder down; reset it

  // ---------- 6. THE KILL: strike until they're down ----------
  if (!Game.tbfight) Game.playerAttacks(v4);
  Game.state.scholar.health = 1000;
  const pf = Game.tbFighter('p'); if (pf) { pf.hp = 1000; pf.maxHp = 1000; }
  let rounds = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 60) {
    const t = Game.tbFighter('h_' + v4);
    if (!t || !t.alive) break;
    if (Game.tbIsPlayerTurn()) {
      const pl = Game.tbFighter('p');
      // close to unarmed range so strikes land
      pl.mx = t.mx; pl.my = t.my; pl.acted = false; pl.hp = 1000;
      Game.tbPlayerStrike('h_' + v4);
    } else Game.tbAdvance();
  }
  ok('the fight resolved', !Game.tbfight || Game.tbfight.over);
  const trauma = Game.state.scholar.trauma || 0;
  ok('killing hurt the killer (trauma > 0)', trauma > 0);
  note(`trauma after the killing: ${trauma}`);
  const murderCrimes = Game.justiceState().crimes.filter(c => c.type === 'murder');
  console.log(`  !! murder crimes on the formal ladder: ${murderCrimes.length}`);
  if (!murderCrimes.length) note('BUG: a witnessed killing never reached the justice ladder — moot/uprising can never fire for it');

  // ---------- 7. THE LADDER: walk cold shoulder -> confrontation -> moot -> uprising ----------
  if (Game.tbfight) { Game.tbfight = null; Game._lastBetrayal = null; }
  Game.justiceState().crimes.length = 0; // fresh sheet for the ladder walk
  Game.recordCrime('murder', { victim: v4, witnessed: true, justified: false });
  Game.recordCrime('attack', { victim: v2, witnessed: true });
  note(`heat with murder+attack: ${Game.justiceHeat()}`);
  Game.justiceTick();
  ok('stage 1: the village goes quiet', Game.justiceStage() === 1);
  ok('cold shoulder line was spoken', said.some(s => s.includes('has shifted')));
  Game.justiceTick();
  ok('stage 2: someone confronts you', Game.justiceStage() === 2 && !!Game.justiceState().confrontedBy);
  // The murder-confrontation voice pool has 3 identity-generated lines; any of
  // them counts (the pool is picked by unseeded Math.random — do NOT assert
  // on just one). The crime is witnessed murder, so the line names it.
  ok('confrontation line was spoken', said.some(s => s.startsWith('⚖ ') && (/steps in front|raise their voice|wasn't you/.test(s))));
  const rr2 = Game.justiceRespond('refuse');
  ok('refusing the confrontation', rr2 && rr2.refused === true);
  Game.justiceTick();
  ok('stage 3: the moot is demanded', Game.justiceStage() === 3 && !!Game.justiceState().mootDemanded);
  // The moot runs its course: exile. The player defies it and stays at Haven.
  // (justiceTick freezes while the moot holds the case — the unified pipeline.)
  const openCase = Game.betrayalState().cases.find(c => (c.status === 'open' || c.status === 'dormant') && c.accused.includes(Game.villagerId));
  ok('the moot opened a real case', !!openCase);
  if (openCase) {
    const res = Game.resolveCase(openCase.id, 'player_exile');
    ok('moot exiles the player', res && res.resolved === true);
  }
  ok('player case closed', !Game.playerCaseOpen());
  note('exiled, but still at Haven. The village will not ask twice.');
  Game.justiceTick();
  ok('stage 4: defied exile -> the village comes at you (uprising)', Game.justiceStage() === 4 && !!Game.tbfight);
  if (Game.tbfight) {
    const atk = Game.tbfight.fighters.filter(f => f.kind === 'hostile');
    const def = Game.tbfight.fighters.filter(f => f.kind === 'villager');
    note(`uprising: ${atk.length} attackers, ${def.length} defenders`);
    ok('uprising is a mob, not an army (2-4 attackers)', atk.length >= 2 && atk.length <= 4);
    ok('uprising is an uprising fight', Game.tbfight.uprising === true);
    Game.tbEnd('fled'); Game.tbfight = null; Game._lastBetrayal = null;
  }

  // ---------- 8. SELF-DEFENSE: the npc draws first, you finish it ----------
  const v7 = others().find(id => id !== v4) || others()[0]; setTemp(v7, 'bold');
  if (!Game.tbfight) Game.startBetrayalCombat(v7, { aggressor: 'npc' });
  Game.state.scholar.health = 1000;
  const p2 = Game.tbFighter('p'); if (p2) { p2.hp = 1000; p2.maxHp = 1000; }
  let r2n = 0;
  while (Game.tbfight && !Game.tbfight.over && r2n++ < 60) {
    const t = Game.tbFighter('h_' + v7);
    if (!t || !t.alive) break;
    if (Game.tbIsPlayerTurn()) {
      const pl = Game.tbFighter('p');
      pl.mx = t.mx; pl.my = t.my; pl.acted = false; pl.hp = 1000;
      Game.tbPlayerStrike('h_' + v7);
    } else Game.tbAdvance();
  }
  if (Game.tbfight) { Game.tbfight = null; Game._lastBetrayal = null; }
  const selfDefCrimes = Game.justiceState().crimes.filter(c => c.type === 'murder' && c.justified);
  console.log(`  !! justified (self-defense) murders on the ladder: ${selfDefCrimes.length}`);

  console.log(`\n== ${pass} passed, ${fail} failed ==`);

  // ---------- 8. REGRESSION (2026-10-05): tbEnd('won') with no monster fighter
  // must not crash on undefined.mdef. Human-only fights are normally routed
  // through the betrayal end path, but 'won' must still be safe if one ever
  // lands here (tbEndCheck routes no-monster fights to 'won').
  Game.tbfight = {
    over: false, result: null, style: 10,
    fighters: [
      { key: 'p', kind: 'player', name: 'You', mx: 4, my: 4, hp: 90, maxHp: 100, alive: true, fled: false },
      { key: 'h_x', kind: 'hostile', name: 'Raider', villagerId: 'gen_reg1', mx: 5, my: 5, hp: 0, maxHp: 30, alive: false, fled: false },
    ],
  };
  let crash = null;
  try { Game.tbEnd('won'); } catch (e) { crash = e; }
  ok("tbEnd('won') with no monster fighter does not throw", crash === null, crash && crash.message);
  ok('fight cleared after monster-less win', Game.tbfight === null);

  // ---------- 9. REGRESSION (2026-10-05): tbPlayerStrike must not throw a
  // TDZ ReferenceError on isHuman (armor block read the const before its
  // declaration — every player strike crashed). Strike both a monster and a
  // hostile human; both must return without throwing.
  Game.tbfight = {
    over: false, result: null, turnIdx: 0, order: ['p', 'm1'],
    fighters: [
      { key: 'p', kind: 'player', name: 'You', mx: 4, my: 4, hp: 100, maxHp: 100, alive: true, fled: false, moveLeft: 4, acted: false },
      { key: 'm1', kind: 'monster', name: 'boar', monsterId: 'thornback_boar', mdef: { id: 'thornback_boar', name: 'Thornback boar', armor: 2 }, mx: 5, my: 5, hp: 60, maxHp: 60, alive: true, fled: false },
    ],
  };
  let strikeCrash = null, strikeRet = null;
  try { strikeRet = Game.tbPlayerStrike('m1'); } catch (e) { strikeCrash = e; }
  ok('tbPlayerStrike on a monster does not throw', strikeCrash === null, strikeCrash && strikeCrash.message);
  Game.tbfight = null;
  Game.tbfight = {
    over: false, result: null, turnIdx: 0, order: ['p', 'h1'],
    fighters: [
      { key: 'p', kind: 'player', name: 'You', mx: 4, my: 4, hp: 100, maxHp: 100, alive: true, fled: false, moveLeft: 4, acted: false },
      { key: 'h1', kind: 'hostile', name: 'Raider', villagerId: 'gen_reg2', mx: 5, my: 5, hp: 30, maxHp: 30, alive: true, fled: false },
    ],
  };
  let strikeCrash2 = null;
  try { Game.tbPlayerStrike('h1'); } catch (e) { strikeCrash2 = e; }
  ok('tbPlayerStrike on a human does not throw', strikeCrash2 === null, strikeCrash2 && strikeCrash2.message);
  Game.tbfight = null;

  console.log(`\n== ${pass} passed, ${fail} failed (with regressions) ==`);
  process.exit(fail ? 1 : 0);
})();
