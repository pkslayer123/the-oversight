// Monster batch 2 encounter tests. Usage: node scripts/test-monbatch2.js
// Per monster (mirrormoth, belltoad, lockpick_raccoon, hummice,
// nightlight_catfish):
//  - encounter config: phases, phase badges, knownCue, threat lines
//  - phases fire in order through a driven fight
//  - telegraphs render gated (pre-knowledge) and ungated (post-knowledge)
//  - the personality counterplay works
// Plus: the Highbeam's threat lines are byte-identical (untouched default).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }

function freshFight(id, px, py, mpos, dayPart) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = px; s.my = py; s.kcal = 3000; s.energy = 60; s.health = 100;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  s.inventory = [
    { itemId: 'fire_hardened_spear', units: 1, kcalEach: 0, kg: 0.5, name: 'Fire-hardened spear', bonded: true },
    { name: 'Smoked fish', kcalEach: 400, units: 2, spoilDay: 99 },
  ];
  Game.state.village.positions = {};
  Game.dayPart = dayPart == null ? 3 : dayPart;
  Game.genDetail = flatGrid;
  Game.log = [];
  s.monster = { id, mx: mpos[0][0], my: mpos[0][1] };
  Game.startCombat(id);
  const p = Game.tbFighter('p');
  p.mx = px; p.my = py;
  Game.state.scholar.mx = px; Game.state.scholar.my = py;
  const mons = Game.tbfight.fighters.filter(x => x.kind === 'monster');
  mons.forEach((mo, i) => { const sp = mpos[i] || mpos[0]; mo.mx = sp[0]; mo.my = sp[1]; });
  // deterministic: the random roster can grant fear_aura / pocket_sand, which
  // would make monsters hesitate or start blinded and flake the phase asserts.
  for (const mo of mons) { mo.hesitate = 0; mo.blind = 0; }
  return { s, p, mons };
}
function mon(id) { return Game.tbfight.fighters.find(x => x.kind === 'monster' && (!id || x.mdef.id === id)); }
function forcePlayerTurn() {
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  const p = Game.tbFighter('p');
  p.moveLeft = 12; p.acted = false;
  return p;
}
function mdef(id) { return Game.data.monsters.find(m => m.id === id); }

(async () => {
  await Game.init();
  const IDS = ['mirrormoth', 'belltoad', 'lockpick_raccoon', 'hummice', 'nightlight_catfish'];

  // ---------- 1. CONFIG ----------
  for (const id of IDS) {
    const e = mdef(id).encounter;
    ok(`${id}: encounter block`, !!e);
    ok(`${id}: fifo+gate+pain`, e && e.fifo === true && e.telegraphGate === 'pattern' && e.painSwitch === true);
    ok(`${id}: phases legible`, e && e.phases.length >= 4 && e.phases[0] !== e.phases[1]);
    ok(`${id}: badges for every phase`, e && e.phases.every(ph => (e.phaseBadges || {})[ph]));
    ok(`${id}: knownCue`, e && typeof e.knownCue === 'string' && e.knownCue.length > 20);
    ok(`${id}: threat lines`, e && e.threatLines && e.threatLines.notice && e.threatLines.pain && e.threatLines.snap);
  }
  // the Highbeam's lines are the untouched default
  {
    freshFight('gallowdeer', 2, 4, [[7, 4]], 3);
    const mo = mon('gallowdeer');
    const L = Game.encThreatLines(mo);
    ok('deer notice line unchanged', L.notice === "The deer's head swings toward {who}. Another light in its eyes. You're all on the list now.");
    ok('deer pain line unchanged', L.pain === "It staggers — and its burning gaze fixes on {who}. Pain gets noticed.");
    ok('deer snap line unchanged', L.snap === "Too close. The deer's gaze SNAPS to {who} — proximity overrules patience.");
    ok('deer badges unchanged', Game.encPhaseBadge(mo) === '' && (function () { mo.beamPhase = 'aim'; return Game.encPhaseBadge(mo) === ' 👁 AIMING'; })());
  }

  // ---------- 2. MOTH: land -> fold -> flash -> recover, flank works ----------
  {
    freshFight('mirrormoth', 4, 5, [[4, 4]], 3);
    const mo = mon('mirrormoth');
    let t = 0;
    while (mo.beamPhase !== 'land' && t++ < 8 && !mo.telegraph && mo.alive) Game.tbMonsterTurn(mo);
    ok('moth: lands in range', mo.beamPhase === 'land', mo.beamPhase);
    Game.tbMonsterTurn(mo);
    ok('moth: folds (declare)', mo.beamPhase === 'fold' && !!mo.telegraph, mo.beamPhase);
    ok('moth: facing locked at fold', mo.mothFacing && typeof mo.mothFacing.x === 'number');
    ok('moth: badge reads', Game.encPhaseBadge(mo) === ' 🦋 FOLDING', Game.encPhaseBadge(mo));
    // telegraph pre-knowledge: diegetic, no coaching
    const cue0 = Game.tbTelegraphCue(mo);
    ok('moth: pre-knowledge cue is diegetic', /folds its wings/.test(cue0) && !/FORWARD/.test(cue0), cue0.slice(0, 60));
    // flank: stand behind the facing
    const fc = mo.mothFacing;
    const p = Game.tbFighter('p');
    p.mx = Math.max(0, Math.min(8, mo.mx - Math.sign(fc.x || 0)));
    p.my = Math.max(0, Math.min(8, mo.my - Math.sign(fc.y || 0)));
    const hp0 = p.hp;
    Game.tbMonsterTurn(mo); // resolve
    ok('moth: flash misses behind the facing', Math.round(p.hp) === Math.round(hp0), `${Math.round(hp0)} -> ${Math.round(p.hp)}`);
    ok('moth: no blind behind', !p.blindTurns);
    ok('moth: recover after flash', mo.beamPhase === 'recover', mo.beamPhase);
    Game.tbMonsterTurn(mo); // cooldown turn
    ok('moth: recover -> stalk', mo.beamPhase === 'stalk' && (mo.encCooldown || 0) === 0, mo.beamPhase);
  }
  // front: it hurts and blinds
  {
    freshFight('mirrormoth', 4, 5, [[4, 4]], 3);
    const mo = mon('mirrormoth');
    let t2 = 0;
    while (mo.beamPhase !== 'land' && t2++ < 8 && !mo.telegraph && mo.alive) Game.tbMonsterTurn(mo);
    Game.tbMonsterTurn(mo); // fold (declare)
    const p = Game.tbFighter('p'); // inside flash range, in front arc
    const hp0 = p.hp;
    Game.tbMonsterTurn(mo); // resolve
    ok('moth: flash hits in front', p.hp < hp0, `${Math.round(hp0)} -> ${Math.round(p.hp)}`);
    ok('moth: blinds 1 round', p.blindTurns === 1, String(p.blindTurns));
    // codex gate: surviving teaches the pattern -> coaching appears
    const cue1 = Game.tbTelegraphCue(mo);
    ok('moth: post-knowledge cue coaches the flank', /FORWARD/.test(cue1), cue1.slice(-80));
  }

  // ---------- 3. TOAD: swell -> chorus -> quiet; SHOUT breaks it ----------
  {
    freshFight('belltoad', 4, 2, [[4, 4], [4, 5]], 2);
    const ms = Game.tbfight.fighters.filter(x => x.kind === 'monster');
    Game.tbMonsterTurn(ms[0]);
    ok('toad: swells (declare)', ms[0].beamPhase === 'swell' && !!ms[0].telegraph, ms[0].beamPhase);
    ok('toad: badge reads', Game.encPhaseBadge(ms[0]) === ' 🐸 SWELLING');
    Game.tbMonsterTurn(ms[1]);
    ok('toad2: swells too', !!ms[1].telegraph);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 3; // inside both bursts
    const hp0 = p.hp;
    Game.tbMonsterTurn(ms[0]); // resolve -> chorus joins
    ok('toad: chorus joined (pack)', /chorus ×2/.test(Game.log.join('\n')));
    ok('toad: both throats spent', ms[0].beamPhase === 'quiet' && ms[1].beamPhase === 'quiet',
      `${ms[0].beamPhase}/${ms[1].beamPhase}`);
    ok('toad: chorus hurts (two croaks)', hp0 - p.hp >= 12, `${Math.round(hp0)} -> ${Math.round(p.hp)}`);
    ok('toad: no friendly fire', ms[1].hp === ms[1].maxHp, `${ms[1].hp}/${ms[1].maxHp}`);
  }
  // SHOUT
  {
    freshFight('belltoad', 4, 2, [[4, 4], [4, 5]], 2);
    const ms = Game.tbfight.fighters.filter(x => x.kind === 'monster');
    Game.tbMonsterTurn(ms[0]); Game.tbMonsterTurn(ms[1]);
    ok('toad: telegraphs pending', !!(ms[0].telegraph && ms[1].telegraph));
    forcePlayerTurn();
    ok('shout: succeeds', Game.tbPlayerShout() === true);
    ok('shout: cancels telegraphs', !ms[0].telegraph && !ms[1].telegraph);
    ok('shout: toads scattered+quiet', ms.every(mo => mo.beamPhase === 'quiet' || mo.beamPhase === 'stalk'));
    ok('shout: limited to 2/fight', (function () {
      forcePlayerTurn(); Game.tbPlayerShout();
      forcePlayerTurn();
      return Game.tbPlayerShout() === false; // third shout refused
    })());
  }

  // ---------- 4. LOCKPICK: case -> grab -> bolt; hit drops, food buys off ----------
  {
    freshFight('lockpick_raccoon', 4, 6, [[4, 4]], 3);
    const { s } = { s: Game.state.scholar };
    const mo = mon('lockpick_raccoon');
    ok('lockpick: opens casing', mo.beamPhase === 'case', mo.beamPhase);
    ok('lockpick: badge reads', Game.encPhaseBadge(mo) === ' 👀 CASING');
    Game.tbMonsterTurn(mo);
    ok('lockpick: case -> grab', mo.beamPhase === 'grab', mo.beamPhase);
    Game.tbMonsterTurn(mo);
    ok('lockpick: steals the weapon', s.equipped.weapon === null && mo.stolen && /spear/i.test(mo.stolen.name), JSON.stringify(mo.stolen));
    ok('lockpick: grab -> bolt', mo.beamPhase === 'bolt', mo.beamPhase);
    // hit it while bolting -> drops + flees
    mo.lockpickHit = true;
    Game.tbMonsterTurn(mo);
    ok('lockpick: drops loot when hit bolting', mo.fled === true && mo.stolen === null);
    ok('lockpick: spear returned', s.equipped.weapon && /spear/i.test(s.equipped.weapon.name));
  }
  // buy it off
  {
    freshFight('lockpick_raccoon', 4, 6, [[4, 4]], 3);
    const s = Game.state.scholar;
    const mo = mon('lockpick_raccoon');
    Game.tbMonsterTurn(mo); Game.tbMonsterTurn(mo);
    ok('lockpick2: stole', !!mo.stolen);
    const food0 = s.inventory.find(i => i.kcalEach > 0).units;
    forcePlayerTurn();
    ok('offer: succeeds', Game.tbPlayerOfferFood() === true);
    ok('offer: raccoon leaves', mo.fled === true);
    ok('offer: spear back', s.equipped.weapon && /spear/i.test(s.equipped.weapon.name));
    ok('offer: food consumed', s.inventory.find(i => i.kcalEach > 0).units === food0 - 1);
  }
  // cornered: hurt mid-grab -> fights
  {
    freshFight('lockpick_raccoon', 4, 6, [[4, 4]], 3);
    const mo = mon('lockpick_raccoon');
    Game.tbMonsterTurn(mo); // case -> grab
    mo.lockpickHit = true;
    const handled = Game.tbLockpickTurn(mo);
    ok('lockpick: hurt mid-grab -> cornered, falls through', handled === false && mo.beamPhase === 'cornered');
  }

  // ---------- 5. HUMMICE: stacks climb, deaths drop them, moving thins ----------
  {
    freshFight('hummice', 4, 3, [[4, 4], [5, 4], [4, 5], [5, 5]], 3);
    const ms = Game.tbfight.fighters.filter(x => x.kind === 'monster');
    for (const mo of ms) Game.tbMonsterTurn(mo); // all declare
    ok('hum: all declare hum', ms.every(mo => mo.beamPhase === 'hum' || mo.beamPhase === 'tide'), ms.map(mo => mo.beamPhase).join(','));
    const p = Game.tbFighter('p');
    Game.tbMonsterTurn(ms[0]); // resolve 1
    ok('hum: stacks climb on resolve', Game.tbfight.humStacks === 1, String(Game.tbfight.humStacks));
    // kill one -> stacks drop by 2, survivors scatter
    ms[1].alive = false; ms[1].hp = 0;
    const px0 = ms[2].mx, py0 = ms[2].my;
    Game.tbfight.round++; // fresh round so decay can also run
    Game.tbMonsterTurn(ms[2]);
    ok('hum: death drops the pitch', Game.tbfight.humStacks <= 1, String(Game.tbfight.humStacks));
    // keep moving thins it (clear its pending telegraph so only the decay is measured)
    Game.tbfight.humStacks = 2;
    Game.tbfight.humDecayRound = -1;
    ms[0].telegraph = null;
    p.mx = 0; p.my = 0; // 4+ tiles moved
    Game.tbMonsterTurn(ms[0]);
    ok('hum: moving thins the stack', Game.tbfight.humStacks === 1, String(Game.tbfight.humStacks));
  }

  // ---------- 6. CATFISH: lure -> still -> grasp -> dark -> lure ----------
  {
    freshFight('nightlight_catfish', 2, 4, [[5, 4]], 3);
    const mo = mon('nightlight_catfish');
    const p = Game.tbFighter('p');
    ok('catfish: opens luring', mo.beamPhase === 'lure', mo.beamPhase);
    ok('catfish: badge reads', Game.encPhaseBadge(mo) === ' 💡 LURING');
    Game.tbMonsterTurn(mo); // d=3 -> still
    ok('catfish: still at range 3', mo.beamPhase === 'still', mo.beamPhase);
    p.mx = 3; p.my = 4; Game.state.scholar.mx = 3; Game.state.scholar.my = 4;
    const hp0 = p.hp;
    Game.tbMonsterTurn(mo); // d=2 -> grasp
    ok('catfish: grasp at range 2', mo.beamPhase === 'dark' && p.hp < hp0, `${mo.beamPhase} ${Math.round(hp0)}->${Math.round(p.hp)}`);
    ok('catfish: codex learns the lure', Game.tbPatternKnown('nightlight_catfish', 'Lure and Grasp'));
    const cue = Game.tbTelegraphCue(mo);
    ok('catfish: post-knowledge coaching', /never wade/i.test(cue) || /glow is a mouth/i.test(cue), cue.slice(-60));
    Game.tbMonsterTurn(mo); Game.tbMonsterTurn(mo); // dark 2 -> 0
    ok('catfish: re-lures', mo.beamPhase === 'lure', mo.beamPhase);
    // ranged strike is the counterplay (reposition: it drifted while dark)
    mo.mx = 5; mo.my = 4; mo.beamPhase = 'lure';
    p.mx = 3; p.my = 4; Game.state.scholar.mx = 3; Game.state.scholar.my = 4;
    forcePlayerTurn();
    const mhp0 = mo.hp;
    Game.tbPlayerStrike(mo.key);
    ok('catfish: spear reaches it at range 2', mo.hp < mhp0, `${mhp0} -> ${mo.hp}`);
  }
  // never chases: lure turn doesn't move it
  {
    freshFight('nightlight_catfish', 0, 0, [[5, 4]], 3);
    const mo = mon('nightlight_catfish');
    Game.tbMonsterTurn(mo);
    ok('catfish: does not chase', mo.mx === 5 && mo.my === 4, `(${mo.mx},${mo.my})`);
  }

  // ---------- 7. descriptor gating: no true-name leaks ----------
  {
    const STOP = new Set(['the']);
    for (const id of IDS) {
      const md = mdef(id);
      const words = md.name.toLowerCase().split(' ');
      const leak = words.find(w => w.length > 4 && md.unknown.toLowerCase().includes(w));
      ok(`${id}: no true-name word in descriptor`, !leak, leak || '');
      ok(`${id}: unknown descriptor present`, !!(md.unknown && md.unknown.length > 5));
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e.stack); process.exit(2); });
