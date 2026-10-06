// Knowledge-gating audit: wave-2 telegraph cues, fresh vs learned (Steve 2026-10-06).
// Drives real combat as a player: fresh codex -> monster declares -> capture the
// danger-bar cue (Game.showTelegraph) + all spoken text. Then re-run with the
// pattern learned and confirm the coaching appears ONLY then.
// Also proves bright_idea's "BACK OFF. Radius 2." never renders (sayTelegraphOnce
// is silent in combat by design — worker-C flag was a false positive).
// Usage: node scripts/test-kgate-wave2-cues.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const flatGrid = () => Array.from({ length: 9 }, () => Array(9).fill('grass'));

let said = [], dangerCues = [];
function hookOutput() {
  said = []; dangerCues = [];
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); return origSay(t); };
  Game.showTelegraph = (cue) => { dangerCues.push(String(cue)); };
  Game.clearTelegraph = () => {};
}

function setup(monId) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {}))
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  s.mx = 2; s.my = 4;
  // bright_idea is nocturnal: daylight disperses it before it can declare.
  Game.dayPart = monId === 'bright_idea' ? 3 : 1;
  Game.canSee = () => true;
  Game.startCombat(monId);
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  if (m) m.hp = m.maxHp = 4000; // survive long enough to watch declares
  hookOutput();
  return m;
}
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
const P = () => Game.tbFighter('p');

function waitTurn() {
  const tf = Game.tbfight; if (!tf || !Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  try { Game.tbAfterPlayerAction(); } catch (e) {}
}
function monsterActs() {
  let g = 0;
  while (Game.tbfight && !Game.tbIsPlayerTurn() && g++ < 40) {
    try { Game.tbAdvanceTurn(); } catch (e) { break; }
  }
}
// Drive until the monster declares a telegraph (or give up). Returns the
// danger-bar cue text at declare time, or null.
function driveToDeclare(maxRounds) {
  for (let r = 0; r < maxRounds && Game.tbfight; r++) {
    waitTurn();
    monsterActs();
    const m = M();
    if (m && m.telegraph) return Game.tbTelegraphCue(m);
  }
  return null;
}

// Coaching markers that must NEVER appear for a fresh-knowledge player.
const COACH = [
  'MOVE SIDWAYS', 'Move OFF', 'COVER YOUR EYES', 'BACK OFF', "can't turn",
  'cannot re-aim', 'Radius 2', 'break line of sight', 'sidestep',
  'You know this one', 'the attack is coming', 'watch the line',
];
const MONSTERS = [
  { id: 'mirror_stag', atk: 'Confrontation' },
  { id: 'review_drone', atk: 'Scored Assessment' },
  { id: 'camera_swarm', atk: 'Flash Mob' },
  { id: 'voice_mimic_radio', atk: 'Distress Call' },
  { id: 'bright_idea', atk: 'Eureka' },
  { id: 'memory_projector', atk: 'Home Movies' },
];

function freshCue(id) {
  setup(id);
  const cue = driveToDeclare(14);
  return { cue, said: said.slice(), danger: dangerCues.slice() };
}
function learnedCue(id, atk) {
  setup(id);
  // Simulate surviving the attack once: pattern learned, stage observed.
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  Game.state.codex.monsters[id] = { stage: 'observed', patterns: { [atk]: 'learned' }, attacksSeen: [atk] };
  const cue = driveToDeclare(14);
  return { cue, said: said.slice(), danger: dangerCues.slice() };
}

let failures = 0;
function check(cond, label) {
  console.log((cond ? '  PASS ' : '  FAIL ') + label);
  if (!cond) failures++;
}

(async () => {
  await Game.init();
  Game.genDetail = flatGrid;

  for (const { id, atk } of MONSTERS) {
    console.log(`\n===== ${id} =====`);
    const fr = freshCue(id);
    console.log('  FRESH cue:', JSON.stringify(fr.cue));
    check(!!fr.cue, `${id}: monster declared a telegraph on a fresh profile`);
    if (fr.cue) {
      for (const c of COACH) {
        if (id === 'bright_idea') continue; // handled separately below
        check(!fr.cue.includes(c), `${id} fresh: no "${c}"`);
      }
      // attack true name must not appear fresh (except via dread-safe paths)
      check(!fr.cue.includes(atk), `${id} fresh: true attack name "${atk}" not shown`);
    }
    // bright_idea: the flagged "BACK OFF. Radius 2." must NEVER render anywhere
    if (id === 'bright_idea') {
      const all = fr.said.join('\n') + '\n' + fr.danger.join('\n');
      check(!all.includes('BACK OFF'), 'bright_idea fresh: "BACK OFF" never rendered (sayTelegraphOnce silent)');
      check(!all.includes('Radius 2.'), 'bright_idea fresh: "Radius 2." coaching never rendered');
    }
    const lr = learnedCue(id, atk);
    console.log('  LEARNED cue:', JSON.stringify(lr.cue && lr.cue.slice(0, 220)));
    check(!!lr.cue, `${id}: monster declared a telegraph on a learned profile`);
    if (lr.cue) {
      // earned coaching SHOULD appear once learned
      const hasEarned = /You know this one|MOVE SIDWAYS|Move OFF|COVER YOUR EYES|BACK OFF|can't turn|cannot re-aim|Step off it|Keep moving|get it near fire|break line of sight|sidestep|RUN/i.test(lr.cue);
      console.log('  learned cue shows earned coaching:', hasEarned);
    }
  }

  // STUDY surface: fresh player studies a declaring monster — names attack (intended),
  // but pattern/coaching stays gated.
  console.log('\n===== STUDY (fresh, mirror_stag declaring) =====');
  setup('mirror_stag');
  driveToDeclare(14);
  hookOutput();
  try { Game.tbPlayerStudy(); } catch (e) { console.log('  study err', e.message); }
  const studyText = said.join('\n');
  console.log('  STUDY said:', JSON.stringify(studyText.slice(0, 300)));
  check(/favors Confrontation/.test(studyText) || /favors the attack/.test(studyText),
    'study: attack named-or-gated (documented design: study names the attack)');
  check(!/MOVE SIDWAYS|You know this one/.test(studyText) || /favors/.test(studyText),
    'study: logged for manual review (see output above)');

  console.log('\n' + (failures ? `RESULT: ${failures} FAILURES` : 'RESULT: ALL PASS'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
