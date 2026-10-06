// PLAY the moot arc AS A PLAYER, end to end: crimes -> cold shoulder ->
// confrontation -> refuse -> moot summons -> accusation -> defense window ->
// verdict -> aftermath. Prints everything the player would see.
// Usage: node scripts/play-moot-as-player.js [run=guilty|acquit|exile]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const RUN = (process.argv[2] || 'guilty').replace('run=', '');
const transcript = [];
const origSay = Game.say;
Game.say = function (m) { transcript.push('  ' + String(m)); return origSay.call(this, m); };
const origSysSay = Game.sysSay;
Game.sysSay = function (m) { transcript.push('  [SYS] ' + String(m)); return origSysSay.call(this, m); };
function section(t) { transcript.push('\n=== ' + t + ' ==='); }
function note(t) { transcript.push('  [note] ' + t); }
function dumpLog() { transcript.push('\n--- output (as the player sees it) ---'); for (const l of Game.log.slice(-60)) transcript.push(l); }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tickAction = () => {};
  const v = Game.state.village;
  const others = () => v.roster.filter(id => id !== Game.villagerId);
  const [A, B, C] = others();
  note('I am ' + Game.displayName(Game.villagerId) + ' (' + (Game.npcTemper ? Game.npcTemper(Game.villagerId) : '?') + ')');
  note('others: ' + others().slice(0, 4).map(id => Game.displayName(id)).join(', '));

  section('I steal, and I hit someone. Witnessed.');
  Game.recordCrime('theft', { victim: A, caught: true });
  Game.recordCrime('attack', { victim: B });
  Game.recordCrime('theft', { victim: C, caught: true }); // enough heat to climb the ladder
  note('heat=' + Game.justiceHeat());

  section('day passes — the village goes quiet');
  Game.justiceTick();
  note('stage=' + Game.justiceStage());
  // advance 2 day-parts so silence-timeout machinery has room; not needed for this arc

  section('heat holds — confrontation comes');
  Game.justiceTick();
  const j0 = Game.justiceState();
  note('stage=' + Game.justiceStage() + ' confrontedBy=' + (j0.confrontedBy || 'none') +
    (j0.confrontedBy ? ' (' + Game.displayName(j0.confrontedBy) + ')' : ''));

  section('I refuse to pay');
  const r = Game.justiceRespond('refuse');
  note('respond=' + JSON.stringify(r));

  section('the village goes formal — the summons');
  Game.justiceTick();
  note('stage=' + Game.justiceStage() + ' mootDemanded=' + !!Game.justiceState().mootDemanded);

  section('the accusation lands');
  const bs = Game.betrayalState ? Game.betrayalState() : {};
  const cases = bs.cases || [];
  const myCase = cases.find(c => (c.status === 'open') && c.accused.includes(Game.villagerId));
  note('case: ' + (myCase ? (myCase.charge + ' by ' + Game.displayName(myCase.accuser) + ' mootIn=' + myCase.mootIn) : 'NONE'));
  if (myCase) {
    try {
      const h = Game.caseDossierHtml(myCase);
      note('dossier accuser gated OK: ' + (/ACCUSER/.test(h) ? 'has ACCUSER section' : 'no ACCUSER section'));
    } catch (e) { note('dossier failed: ' + e.message); }
  }

  section('defense window — I work the case');
  if (myCase) {
    // press the accuser
    try {
      const choices = Game.convoChoices(myCase.accuser).map(c => c.id);
      note('choices vs accuser: ' + choices.join(', '));
      const press = choices.find(id => /press/i.test(id));
      if (press) { note('pressing the accuser...'); }
    } catch (e) { note('convoChoices failed: ' + e.message); }
    // bribe investigation
    try {
      const out = Game.askAbout && Game.askAbout(C, 'moot_bribes');
      note('bribe investigation: ' + (out ? 'hooked' : 'not hooked'));
    } catch (e) { note('bribe investigation failed: ' + e.message); }
  }

  section('the moot — verdict');
  if (myCase) {
    if (RUN === 'acquit') {
      // stack belief pro-acquit so the verdict acquits: every voter strongly disbelieves
      for (const vid of others()) myCase.belief[vid] = 40;
    } else if (RUN === 'exile') {
      for (const vid of others()) myCase.belief[vid] = -40;
    }
    try { Game.WILD_DAY_RATE = 0; } catch (e) {}
    const res = Game.conductTrial(myCase);
    note('trial result: ' + JSON.stringify(res && { trial: !!res.trial, awaitingPlayerVote: !!res.awaitingPlayerVote, resolved: !!res.resolved, path: res && res.path, acquitted: !!res.acquitted }));
  }

  section('aftermath — what does the world look like now?');
  const j = Game.justiceState();
  note('justice stage=' + j.stage + ' exiled=' + !!j.exiled + ' mootDemanded=' + !!j.mootDemanded);
  note('player trust=' + ((v.trust || {})[Game.villagerId]));
  note('coldWar=' + ((Game.betrayalState() || {}).coldWar || 0));
  try {
    const g = Game.state.gossip || [];
    note('gossip entries: ' + g.length + (g.length ? ' (latest: ' + JSON.stringify(g[g.length - 1]).slice(0, 120) + ')' : ''));
  } catch (e) { note('gossip n/a'); }
  try {
    const hist = (Game.state.journal || []).filter(e => /moot|trial|exile/i.test(JSON.stringify(e)));
    note('journal moot entries: ' + hist.length);
  } catch (e) { note('journal n/a'); }
  // exile enforcement check
  const refusal = Game.justiceExileGuards();
  note('exile guards say: ' + (refusal ? refusal.slice(0, 60) + '...' : 'null'));

  dumpLog();
  fs.writeFileSync('/tmp/moot-play-' + RUN + '.txt', transcript.join('\n'));
  console.log(transcript.join('\n'));
  console.log('\n[full transcript also at /tmp/moot-play-' + RUN + '.txt]');
})();
