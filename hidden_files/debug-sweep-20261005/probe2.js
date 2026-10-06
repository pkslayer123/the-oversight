// probe2.js — deeper signature check: teleport player adjacent to monster,
// run several full rounds, scan Game.log for each monster's signature moves.
// Usage: node probe2.js <scenario>
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const name = process.argv[2];
const FILES = ['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js','src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js','src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/journal.js','src/js/party.js','src/js/party-formal.js','src/js/truth.js','src/js/contests.js','src/js/storage.js','src/js/perceive.js','src/js/carexplore.js','src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js','src/js/progression.js','src/js/ledger.js','src/js/villager-agency.js','src/js/codex-people.js','src/js/membership.js','src/js/hierarchy.js','src/js/debug-scenarios.js','src/js/build.js'];

const KEYWORDS = {
  headlight: ['beam', 'FREEZE', 'BELLOWS', 'foghorn', 'antler', 'headlight'],
  flashbulb: ['flash', 'fold', 'wing', 'moth'],
  choir: ['croak', 'chorus', 'throat', 'SHOUT'],
  lockpick: ['steal', 'stole', 'pack', 'fingers', 'buy it off'],
  hummice: ['hum', 'SHOUT', 'choir', 'nibble'],
  nightlight: ['glow', 'still', 'catfish', 'wade'],
};

async function main() {
  const out = { name, loaded: false, error: null };
  global.window = globalThis;
  global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
  global.localStorage = { _m: {}, getItem(k){return this._m[k]??null;}, setItem(k,v){this._m[k]=String(v);}, removeItem(k){delete this._m[k];} };
  let Game = null;
  try {
    for (const f of FILES) eval(fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n//# sourceURL=' + f);
    Game = global.Scattering.Game;
    await Game.init();
    out.loaded = true;
  } catch (e) { out.error = 'load/init: ' + String(e && e.stack || e).split('\n').slice(0,4).join(' | '); return void finish(out); }

  try {
    Game.debugScenario(name);
    const s = Game.state.scholar;
    const mid = s.monster && s.monster.id;
    if (!mid) { out.error = 'no monster placed'; return void finish(out); }
    Game.startCombat(mid);
    const f = Game.tbfight;
    if (!f) { out.error = 'startCombat produced no tbfight'; return void finish(out); }
    const monsters = f.fighters.filter(x => x.kind === 'monster' && x.alive);
    const me = f.fighters.find(x => x.key === 'p');
    const m0 = monsters[0];
    // teleport player adjacent to first monster so strikes land
    me.mx = m0.mx - 1; me.my = m0.my;

    let advances = 0, playerActs = 0;
    const rounds = [];
    for (let i = 0; i < 12 && Game.tbfight && !Game.tbfight.over && advances < 200; i++) {
      if (Game.tbIsPlayerTurn()) {
        const tgt = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
        if (tgt) { Game.tbPlayerStrike(tgt.key); playerActs++; }
        else if (Game.tbPlayerWait) Game.tbPlayerWait();
        // end the player's turn like the UI does
        try { Game.tbPlayerEndTurn(); } catch (e) { out.endTurnError = String(e.message || e); }
      } else {
        Game.tbAdvance(); advances++;
      }
      if (Game.tbfight && i % 4 === 0) rounds.push({ i, round: Game.tbfight.round, playerHp: me.hp + '/' + me.maxHp, monsters: Game.tbfight.fighters.filter(x=>x.kind==='monster').map(x=>x.hp).join(',') });
    }
    const log = Game.log || [];
    const kws = KEYWORDS[name] || [];
    const hits = {};
    for (const kw of kws) {
      const lines = log.filter(l => String(l).toLowerCase().includes(kw.toLowerCase()));
      hits[kw] = lines.length ? lines.slice(-2) : [];
    }
    out.signature = { rounds, playerActs, aiAdvances: advances,
      fightOver: Game.tbfight ? Game.tbfight.over : 'ended(null)',
      result: Game.tbfight ? Game.tbfight.result : null,
      playerHp: me.hp + '/' + me.maxHp,
      monstersHp: Game.tbfight ? Game.tbfight.fighters.filter(x=>x.kind==='monster').map(x=>x.key+':'+x.hp+(x.alive?'':' dead')).join(' ') : 'n/a',
      keywordHits: hits,
      logTail: log.slice(-8) };
  } catch (e) { out.error = String(e && e.stack || e).split('\n').slice(0,5).join(' | '); }
  finish(out);
}
function finish(o){ process.stdout.write(JSON.stringify(o)); }
main().catch(e => finish({ name, loaded: false, error: 'main: ' + String(e && e.stack || e).split('\n').slice(0,4).join(' | ') }));
