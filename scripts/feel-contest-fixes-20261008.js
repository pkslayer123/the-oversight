// Feel-check the contest-fear fixes as a player: countdown line, dread beat,
// gossip surfacing in the "gossip" talk topic after a contest.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let _seed = 777;
Math.random = () => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; };
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
 'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
 'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
let log = [];
Game.say = t => { log.push(String(t)); };
Game.sysSay = t => { log.push('[SYS] ' + String(t)); };
const show = (n) => log.slice(-n).forEach(t => console.log('  ' + t.split('\n').join('\n  ')));

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.ensureVillagerPositions();
  const s = Game.state.scholar;
  s.day = 20; Game.state.systemArrived = true;
  s.health = 100; s.kcal = 3000; s.trauma = 0;
  Game.state.over = false;

  console.log('=== 1. FIRE: the announcement with the countdown ===');
  const pit = Game.contestPool().find(c => c.id === 'pit');
  Game.fireContest(pit);
  show(4);

  console.log('\n=== 2. RESOLVE next dawn: dread beat -> grab ===');
  log = [];
  s.day = 21;
  Game.resolveContest();
  console.log('  DREAD LINE PRESENT:', log.some(t => /It is today/.test(t)));
  show(6);

  console.log('\n=== 3. Watch-mode win, then ask a villager for gossip ===');
  log = [];
  const v1 = Game.state.village.roster.filter(id => id !== Game.villagerId && Game.isMember(id))[0];
  const ac = { contestId: 'duel', participant: v1, participants: [v1], phase: 'watching', phaseIdx: 0, phases: [], others: [], wounds: 0 };
  Game._contestEnd(ac, 'won', true);
  console.log('  gossip entries:', JSON.stringify(Game.state.village.gossip.map(g => g.action)));
  // Now talk to another villager about gossip
  const v2 = Game.state.village.roster.filter(id => id !== Game.villagerId && id !== v1 && Game.isMember(id))[0];
  // force this villager to have heard it
  const g = Game.state.village.gossip[0];
  if (g && !g.heard.includes(v2)) g.heard.push(v2);
  log = [];
  try {
    const r = Game.askAbout(v2, 'gossip');
    console.log('  askAbout returned ok:', r && r.ok);
  } catch (e) { console.log('  talk threw:', e.message); }
  show(6);
  console.log('\n=== 4. favor after win:', Game.apState().favor, '===');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
