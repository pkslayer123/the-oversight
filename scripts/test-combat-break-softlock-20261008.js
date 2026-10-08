#!/usr/bin/env node
// COMBAT BREAK-IT: softlock + retreat-economy (Steve 2026-10-08).
// Attacks:
//   S1. DOOR-FLEE RESET EXPLOIT — door-flee stashed monster HP, but re-engage
//       spawned a fresh full-HP monster: beat it down, duck inside, heal for
//       free, walk out to a full-HP monster. No-cost damage reset.
//   S2. ALL-DEAD — every fighter dead: the fight must end, not hang.
//   S3. PLAYER-DEAD — player dead, monsters alive: must resolve to 'lost',
//       never a stuck UI.
//   S4. DEAD MONSTER TURN — tbAdvance must skip dead/fled fighters, never
//       hand a turn to a corpse.
const H = require('./combat-break-harness.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;

  console.log('--- S1. door-flee re-engage honors stashed monster HP ---');
  {
    s.insideHaven = true;
    Game.state.doorFledMonsters = [{ id: 'bulldozer', mx: 5, my: 4, hp: 3 }];
    Game.exitBuilding();
    const mf = (Game.tbfight && Game.tbfight.fighters || []).find(x => x.kind === 'monster');
    check('S1 fight re-engaged', !!mf);
    check('S1 monster still bleeding (hp ~= 3, not full)', !!mf && mf.hp <= 3,
      mf ? `hp=${mf.hp}/${mf.maxHp}` : 'no monster');
    if (Game.tbfight) Game.tbEnd('fled');
  }

  console.log('--- S2. all fighters dead ends the fight ---');
  {
    const mk = H.synthFight(Game, 'bulldozer', { mhp: 30 });
    for (const f of Game.tbfight.fighters) { f.alive = false; f.hp = 0; }
    const ended = Game.tbEndCheck();
    check('S2 tbEndCheck reports ended', ended === true);
    check('S2 tbfight cleared', Game.tbfight === null);
    check('S2 not in combat', Game.inCombat() === false);
  }

  console.log('--- S3. player dead resolves to lost ---');
  {
    const mk = H.synthFight(Game, 'bulldozer', { mhp: 30, php: 10 });
    const p = Game.tbFighter('p');
    p.alive = false; p.hp = 0;
    Game.maybeCheatDeath = () => false; // deterministic: no cheat-death
    let ended = false;
    try { ended = Game.tbEndCheck(); } catch (e) { console.log('    tbEndCheck threw: ' + e.message); }
    check('S3 tbEndCheck reports ended', ended === true);
    check('S3 tbfight cleared (no stuck UI)', Game.tbfight === null);
    Game.maybeCheatDeath = undefined;
  }

  console.log('--- S4. dead monster never gets a turn ---');
  {
    const mk = H.synthFight(Game, 'bulldozer', { mhp: 30 });
    const m = Game.tbFighter(mk);
    m.alive = false; m.hp = 0;
    // tbAdvance should skip the corpse and land back on the player, not hang
    Game.tbFighter('p').acted = false;
    let threw = null;
    try { Game.tbAdvance(); } catch (e) { threw = e; }
    check('S4 tbAdvance does not throw on all-monsters-dead', !threw, threw && threw.message);
    const cur = Game.tbCurrent && Game.tbCurrent();
    check('S4 current turn is the living player (or fight ended)',
      !Game.tbfight || !cur || cur.key === 'p' || cur.alive,
      'cur=' + (cur && cur.key));
    if (Game.tbfight) Game.tbEnd('fled');
  }

  console.log(`\n${fail ? 'BROKEN' : 'HELD'} — ${pass} pass, ${fail} fail (seed ${H.SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
