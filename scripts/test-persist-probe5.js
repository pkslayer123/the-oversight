// PROBE 5: MID-FIGHT save/load must not re-arm consumed once-per-fight gates.
// Hostile: burn shouts, set beam cooldown, break a chorus, stack hum — then
// reload and confirm the fight resumes with every gate still spent.
'use strict';
let fails = 0;
function check(name, cond, extra) {
  if (!cond) { fails++; console.log('FAIL:', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); }
  else console.log('ok:', name);
}
freshGame();
G.startCombat('bulldozer');
check('fight started', !!(G.tbfight && !G.tbfight.over));
// burn the gates the way real play would
G.tbfight.shouts = 2;                 // shout cap spent
G.tbfight._beamCooldown = 2;          // alien beam cooling down
G.tbfight.chorusBrokenUntil = G.tbfight.round + 1;
G.tbfight.humStacks = 3; G.tbfight.humMice = 12;
G.tbfight.terraformScorched = true;
const fid = G.tbfight.id;
G.save();
const key = G.state.runKey;
// hostile: also verify the save blob itself carries the gates
const blob = JSON.parse(storage.getItem(key));
check('blob carries shouts', blob.run.tbfight.shouts === 2, blob.run.tbfight.shouts);
check('blob carries beamCooldown', blob.run.tbfight.beamCooldown === 2, blob.run.tbfight.beamCooldown);
G.load(key);
const f = G.tbfight;
check('fight restored', !!(f && !f.over));
check('fight id stable (once-per-fight gates keyed on it)', f.id === fid, f.id);
check('shouts still spent', f.shouts === 2, f.shouts);
check('beam cooldown still cooling', f._beamCooldown === 2, f._beamCooldown);
check('chorus break still in effect', f.chorusBrokenUntil === 2, f.chorusBrokenUntil);
check('hum stacks not erased', f.humStacks === 3, f.humStacks);
check('scorch flag kept', f.terraformScorched === true);
// multi-round-trip stability: save+load again, gates must not drift
G.save(); G.load(key);
check('second round-trip: shouts still 2', G.tbfight.shouts === 2, G.tbfight.shouts);
check('second round-trip: beam cooldown still 2', G.tbfight._beamCooldown === 2, G.tbfight._beamCooldown);
check('second round-trip: fight id still stable', G.tbfight.id === fid, G.tbfight.id);
console.log(fails === 0 ? 'PROBE5 ALL GREEN' : `PROBE5 ${fails} FAILURES`);
process.exit(fails ? 1 : 0);
