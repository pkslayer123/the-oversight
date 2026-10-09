// ADVERSARIAL PROOF (Steve 2026-10-08, break-it: audio HONESTY + DEAD CODE).
// Hostile angles:
//   HONESTY: (a) silent-by-design beats must stay silent — hushwolf rush (no
//     wolfSnarl before first contact), nightcourt dive declare (silence IS the
//     telegraph), turtle snap ambush (no warning before the snap); (b) trial
//     outcome honesty — chooseTrialOption must NOT play 'victory' on a failed
//     trial; (c) drama audio mates actually dispatch (phaseShift->patternWindup,
//     ambush->ambushSnap); (d) noticeAudio hooks fire at combat start.
//   DEAD CODE: (e) patternResolve stays removed; (f) nightcourtDive is
//     registered+data-declared but UNREACHABLE (bespoke dive path deliberately
//     skips declareAudio) — proven by a full nightcourt fight sim.
// Run: node scripts/test-audio-break-honesty-20261008.js   (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const audio = [];
const says = [];
function setupFight(monsterId, px, py, mx, my) {
  audio.length = 0; says.length = 0;
  // BREAK-IT combat 2026-10-09: startCombat now REFUSES mid-fight (no more
  // silent clobber). Close any live fight honestly before starting the next.
  if (Game.tbfight && !Game.tbfight.over) { try { Game.tbEnd('fled'); } catch (e) { Game.tbfight = null; } }
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = px; s.my = py; s.health = 200;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  Game.ensureVillagerPositions();
  Game.state.village.roster = [];
  const vpos = Game.state.village.positions || {};
  for (const k of Object.keys(vpos)) vpos[k] = { mx: 8, my: 8 };
  s.mx = px; s.my = py;
  s.monster = { id: monsterId, mx, my };
  Game.startCombat(monsterId);
  const mf = Game.tbfight.fighters.find(f => f.kind === 'monster');
  if (mf) { mf.mx = mx; mf.my = my; }
  const pf = Game.tbFighter('p');
  if (pf) { pf.mx = px; pf.my = py; pf.hp = 1000; pf.maxHp = 1000; }
  return mf;
}
// one full round per step (player wait + AI turns); onStep sees the delta
let curStep = -1;
function drive(maxTurns, onStep) {
  let n = 0;
  while (Game.tbfight && !Game.tbfight.over && n++ < maxTurns) {
    curStep = n;
    const before = audio.length, saysBefore = says.length;
    if (Game.tbIsPlayerTurn()) Game.tbPlayerWait();
    else Game.tbAdvance();
    const m = Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster' && f.alive);
    if (onStep && m) onStep(m, before, audio.length, saysBefore, says.length, n);
  }
  curStep = -1;
}

(async () => {
  await Game.init();
  Game.audio = new Proxy({}, { get: (t, n) => (d) => { audio.push(String(n)); } });
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  const otbDamage = Game.tbDamage.bind(Game);
  const dmgEvents = []; // {key, by, audioLen, step}
  Game.tbDamage = (key, dmg, by) => { dmgEvents.push({ key, by: String(by || ''), audioLen: audio.length, step: curStep }); return otbDamage(key, dmg, by); };
  console.log(`seed=${SEED}`);
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const monstersStr = fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8');

  // ---- 1. hushwolf rush: silent until first contact ----
  dmgEvents.length = 0;
  setupFight('hushwolf', 4, 4, 4, 6);
  const pkey = Game.tbFighter('p').key;
  drive(60);
  const firstHit = dmgEvents.find(e => e.key === pkey);
  ok('hushwolf rush lands a hit in the sim', !!firstHit);
  if (firstHit) {
    const beforeHit = audio.slice(0, firstHit.audioLen);
    ok('HONESTY: no wolfSnarl before first rush contact (rush stays silent)',
      !beforeHit.includes('wolfSnarl'), beforeHit.filter(a => /wolf|snarl/i.test(a)).join(','));
    ok('HONESTY: wolfSnarl fires after first contact (aftermath, not warning)',
      audio.slice(firstHit.audioLen).includes('wolfSnarl'));
    ok('HONESTY: wolfSilence (noticeAudio) fired at combat start', audio.includes('wolfSilence'));
  }

  // ---- 2. nightcourt dive: silence IS the telegraph; nightcourtDive dead ----
  dmgEvents.length = 0;
  setupFight('nightcourt', 4, 4, 2, 2);
  let diveDeclaresSilent = true, diveDeclares = 0, roostHeadTurn = false, diveArmed = false;
  drive(150, (m, before, after, saysBefore, saysAfter) => {
    const newSays = says.slice(saysBefore, saysAfter).join('\n');
    if (/head rotates/.test(newSays)) roostHeadTurn = true;
    // dive declare beat: bespoke branch says the moon-shadow / "No sound" line
    // and sets beamPhase dive/redive with a telegraph. The step must add no audio.
    if (/moon-shadow|No sound\. That is the warning|already turning/.test(newSays) && m.telegraph && !diveArmed) {
      diveArmed = true; diveDeclares++;
      // The monster's voice must be silence — but the System's round metronome
      // ('round') is ambient UI, not a telegraph; it may tick.
      const slice = audio.slice(before, after);
      const monsterVoices = slice.filter(a => a !== 'round');
      if (monsterVoices.length) {
        diveDeclaresSilent = false;
        console.log('    declare-step monster audio:', monsterVoices.join(','));
      }
    }
    if (!m.telegraph) diveArmed = false; // re-arm after resolve
  });
  ok('nightcourt dive declared in the sim', diveDeclares > 0, `declares=${diveDeclares}`);
  ok('HONESTY: dive declare carries no monster voice (silence IS the telegraph; ambient round tick allowed)', diveDeclaresSilent);
  ok('DEAD: nightcourtDive never fires in a full nightcourt fight', !audio.includes('nightcourtDive'));
  ok('DEAD: nightcourtDive synth + data entry REMOVED (dive deliberately silent)',
    !/function nightcourtDive\(\)/.test(appSrc) && !/"declareAudio": "nightcourtDive"/.test(monstersStr));
  if (roostHeadTurn) ok('nightcourtTurn fires at the roost head-turn beat', audio.includes('nightcourtTurn'));
  else console.log('  skip nightcourtTurn roost assertion (no head-turn beat this seed)');
  ok('HONESTY: nightcourtSilence (noticeAudio) fired at combat start', audio.includes('nightcourtSilence'));

  // ---- 3. turtle snap: ambush — silent until the snap itself ----
  dmgEvents.length = 0;
  setupFight('speedbump_turtle', 4, 4, 4, 5);
  const pkey3 = Game.tbFighter('p').key;
  let firstTurtleAudioStep = -1, firstSnapDmgStep = -1;
  drive(80, (m, before, after, _sb, _sa, step) => {
    const slice = audio.slice(before, after);
    if (firstTurtleAudioStep < 0 && slice.some(a => /turtle/i.test(a))) firstTurtleAudioStep = step;
  });
  const snap = dmgEvents.find(e => e.key === pkey3);
  if (snap) firstSnapDmgStep = snap.step;
  ok('turtle snap lands in the sim', !!snap);
  ok('turtle sits silent before the snap turn (no warning beats)',
    firstTurtleAudioStep >= 0 && firstSnapDmgStep >= 0 && firstTurtleAudioStep === firstSnapDmgStep,
    `firstTurtleAudioStep=${firstTurtleAudioStep} firstSnapDmgStep=${firstSnapDmgStep}`);
  ok('turtleSnap fires at resolve', audio.includes('turtleSnap'));
  ok('turtleGrind fires (the snap IS its declaration)', audio.includes('turtleGrind'));

  // ---- 4. trial outcome honesty: victory sting only on TRIUMPH ----
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const realNearFire = Game.nearFire;
  // FAILURE branch: no fire nearby
  Game.nearFire = () => false;
  s.trialOffer = { options: [{ id: 'ember', label: 'Trial of the First Ember' }] };
  audio.length = 0;
  Game.chooseTrialOption('ember');
  const failSays = says.join('\n');
  ok('trial failure path narrates failure', /nothing but smoke and philosophy/.test(failSays));
  ok('HONESTY: failed trial does NOT play the victory sting', !audio.includes('victory'), audio.join(','));
  // SUCCESS branch: fire nearby
  Game.nearFire = () => true;
  s.trialOffer = { options: [{ id: 'ember', label: 'Trial of the First Ember' }] };
  audio.length = 0;
  Game.chooseTrialOption('ember');
  ok('HONESTY: triumphed trial DOES play the victory sting', audio.includes('victory'));
  Game.nearFire = realNearFire;

  // ---- 5. drama audio mates dispatch ----
  const dramaSrc = fs.readFileSync(path.join(ROOT, 'src/js/drama.js'), 'utf8');
  const mBlock = dramaSrc.match(/const DRAMA_AUDIO_MATES = \{([\s\S]*?)\n  \};/);
  const MAP = {};
  if (mBlock) {
    for (const mm of mBlock[1].matchAll(/(\w+):\s*'([^']+)'/g)) MAP[mm[1]] = mm[2];
  }
  ok('DRAMA_AUDIO_MATES extracted', Object.keys(MAP).length >= 5, Object.keys(MAP).join(','));
  // registry keys, statically from app.js (appSrc read at top)
  const unmapped = Object.entries(MAP).filter(([k, v]) => !new RegExp(`\\b${v}\\s*\\(`).test(appSrc));
  ok('every drama audio mate resolves in the CombatAudio registry', unmapped.length === 0, unmapped.map(([k, v]) => `${k}->${v}`).join(','));
  // runtime dispatch through Game.drama with a stubbed Drama layer
  globalThis.Scattering.Drama = new Proxy({}, {
    get: (t, n) => n === 'audioFor' ? ((kind) => MAP[kind] || null) : ((...a) => {}),
  });
  Game.state.systemArrived = true;
  audio.length = 0;
  try { Game.drama('phaseShift', 4, 4, 'strike'); } catch (e) {}
  ok('drama(phaseShift) dispatches patternWindup', audio.includes('patternWindup'), audio.join(','));
  audio.length = 0;
  try { Game.drama('ambush', 4, 4); } catch (e) {}
  ok('drama(ambush) dispatches ambushSnap (arming beat)', audio.includes('ambushSnap'), audio.join(','));
  delete globalThis.Scattering.Drama;
  Game.state.systemArrived = false;

  // ---- 6. patternResolve stays dead-and-removed ----
  ok('DEAD: patternResolve not in the registry', !/patternResolve\(\)\s*\{/.test(appSrc));

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
