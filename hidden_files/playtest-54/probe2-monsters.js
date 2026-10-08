// probe2-monsters.js — targeted counterplay probes.
// Usage: node probe2-monsters.js
const { Game, fs, path, ROOT } = require('./harness-load.js');
const out = {};

async function setup(name) {
  const say = [];
  const orig = Game.say;
  Game.say = (t) => say.push(String(t));
  await Game.init();
  Game.debugScenario(name);
  const s = Game.state.scholar;
  Game.startCombat(s.monster.id);
  const f = Game.tbfight;
  const m0 = f.fighters.filter(x => x.kind === 'monster' && x.alive)[0];
  const me = Game.tbFighter('p');
  me.mx = Math.max(1, Math.min(7, m0.mx - 1)); me.my = Math.max(1, Math.min(7, m0.my));
  s.mx = me.mx; s.my = me.my;
  say.length = 0;
  return { say, orig };
}
function restore(orig) { Game.say = orig; }
function turn(pAct) {
  // run until it's player turn again or fight ends; cap advances
  let n = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && n < 60) { Game.tbAdvance(); n++; }
}
function endPlayerTurn() {
  const p = Game.tbFighter('p');
  if (Game.tbIsPlayerTurn() && Game.tbfight && !Game.tbfight.over) {
    if (p && (p.acted || p.moveLeft <= 0)) { try { Game.tbPlayerEndTurn(); } catch (e) {} }
    else { try { Game.tbPlayerWait(); } catch (e) {} }
  }
}

async function probeReviewSidestep() {
  const { say, orig } = await setup('reviewdrone');
  const r = { lines: [] };
  try {
    // wait until telegraph appears, then sidestep perpendicular (change y)
    for (let i = 0; i < 12 && Game.tbfight && !Game.tbfight.over; i++) {
      if (Game.tbIsPlayerTurn()) {
        const p = Game.tbFighter('p');
        const t = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
        if (t && t.telegraph) {
          const ny = Math.max(1, Math.min(7, p.my + 2));
          Game.tbPlayerMove(p.mx, ny);
          r.sidestepTo = [p.mx, p.my];
          r.telegraphCells = (t.telegraph.cells || []).map(c => [c.cx, c.cy]);
          r.threatenedBefore = t.telegraph.threatenedPlayer;
        } else {
          Game.tbPlayerStrike(t.key);
        }
        endPlayerTurn();
      } else Game.tbAdvance();
    }
    const p = Game.tbFighter('p');
    r.playerHp = p ? p.hp : 'dead';
    r.lines = say.filter(l => /DODGE|hits you|miss|line|beam/i.test(l)).slice(0, 12);
    r.outcome = Game.tbfight ? (Game.tbfight.over ? 'OVER' : 'NOT-OVER') : 'null';
  } catch (e) { r.error = String(e && e.stack || e).split('\n').slice(0,3).join('|'); }
  restore(orig); out.reviewdrone_sidestep = r;
}

async function probeInspirationDetonation() {
  const { say, orig } = await setup('inspiration');
  const r = { lines: [] };
  try {
    // stand adjacent and wait through the detonation
    for (let i = 0; i < 14 && Game.tbfight && !Game.tbfight.over; i++) {
      if (Game.tbIsPlayerTurn()) {
        Game.tbPlayerWait();
        endPlayerTurn();
      } else Game.tbAdvance();
    }
    const p = Game.tbFighter('p');
    r.playerHp = p ? p.hp + '/' + p.maxHp : 'dead';
    r.lines = say.filter(l => /detonat|hits you|crater|burst|ember|BRIGHTER|WHITE/i.test(l)).slice(0, 14);
    r.outcome = Game.tbfight ? (Game.tbfight.over ? 'OVER' : 'NOT-OVER') : 'null';
  } catch (e) { r.error = String(e && e.stack || e).split('\n').slice(0,3).join('|'); }
  restore(orig); out.inspiration_detonation = r;
}

async function probeDucksSplit() {
  const { say, orig } = await setup('ducksinarow');
  const r = { lines: [] };
  try {
    // kill a MIDDLE segment (segmentIndex ~6 of 14)
    for (let i = 0; i < 20 && Game.tbfight && !Game.tbfight.over; i++) {
      if (Game.tbIsPlayerTurn()) {
        const p = Game.tbFighter('p');
        const ms = Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive && x.segmentIndex !== undefined);
        if (!ms.length) break;
        ms.sort((a, b) => Math.abs(a.segmentIndex - 6) - Math.abs(b.segmentIndex - 6));
        const t = ms[0];
        const d = Math.max(Math.abs(t.mx - p.mx), Math.abs(t.my - p.my));
        if (d > 2) {
          const nx = Math.max(1, Math.min(7, p.mx + Math.sign(t.mx - p.mx)));
          const ny = Math.max(1, Math.min(7, p.my + Math.sign(t.my - p.my)));
          try { Game.tbPlayerMove(nx, ny); } catch (e) {}
          if (i === 0) r.firstTarget = t.key + ' segIdx ' + t.segmentIndex;
        } else {
          Game.tbPlayerStrike(t.key);
          if (i < 6) r['kill_' + i] = t.key + ' segIdx ' + t.segmentIndex;
        }
        endPlayerTurn();
      } else Game.tbAdvance();
    }
    r.segmentsLeft = Game.tbfight ? Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive).map(x => x.key + ':' + (x.segmentIndex) + (x.isHead ? '(head)' : '')).join(' ') : 'null';
    r.lines = say.filter(l => /split|rejoin|reform|two|half|line/i.test(l)).slice(0, 16);
    const p = Game.tbFighter('p');
    r.playerHp = p ? p.hp : 'dead';
    r.outcome = Game.tbfight ? (Game.tbfight.over ? 'OVER' : 'NOT-OVER') : 'null';
  } catch (e) { r.error = String(e && e.stack || e).split('\n').slice(0,3).join('|'); }
  restore(orig); out.ducks_split = r;
}

async function probeNostalgiaPassive() {
  const { say, orig } = await setup('nostalgia');
  const r = { lines: [] };
  try {
    // never attack: move every turn, see if it ever beams
    for (let i = 0; i < 16 && Game.tbfight && !Game.tbfight.over; i++) {
      if (Game.tbIsPlayerTurn()) {
        const p = Game.tbFighter('p');
        const t = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
        const nx = Math.max(1, Math.min(7, p.mx + (p.mx <= 4 ? 1 : -1)));
        try { Game.tbPlayerMove(nx, p.my); } catch (e) { Game.tbPlayerWait(); }
        endPlayerTurn();
      } else Game.tbAdvance();
    }
    const p = Game.tbFighter('p');
    r.playerHp = p ? p.hp : 'dead';
    r.monsterHp = Game.tbfight ? Game.tbfight.fighters.filter(x => x.kind === 'monster').map(x => x.hp).join(',') : 'null';
    r.lines = say.filter(l => /beam|screen|home|project|hits you|spell|move/i.test(l)).slice(0, 18);
    r.outcome = Game.tbfight ? (Game.tbfight.over ? 'OVER' : 'NOT-OVER') : 'null';
  } catch (e) { r.error = String(e && e.stack || e).split('\n').slice(0,3).join('|'); }
  restore(orig); out.nostalgia_passive = r;
}

async function probeStaticKite() {
  const { say, orig } = await setup('static');
  const r = { lines: [] };
  try {
    // break the act (don't approach 2 rounds), then kite: keep distance, strike when adjacent
    let waits = 0;
    for (let i = 0; i < 30 && Game.tbfight && !Game.tbfight.over; i++) {
      if (Game.tbIsPlayerTurn()) {
        const p = Game.tbFighter('p');
        const t = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
        if (waits < 2) { Game.tbPlayerWait(); waits++; }
        else {
          const d = Math.max(Math.abs(t.mx - p.mx), Math.abs(t.my - p.my));
          if (d <= 2) Game.tbPlayerStrike(t.key);
          else {
            // keep distance: move away
            const nx = Math.max(1, Math.min(7, p.mx + Math.sign(p.mx - t.mx)));
            const ny = Math.max(1, Math.min(7, p.my + Math.sign(p.my - t.my)));
            try { Game.tbPlayerMove(nx, ny); } catch (e) { Game.tbPlayerStrike(t.key); }
          }
        }
        endPlayerTurn();
      } else Game.tbAdvance();
    }
    const p = Game.tbFighter('p');
    r.playerHp = p ? p.hp + '/' + p.maxHp : 'dead';
    r.monsterHp = Game.tbfight ? Game.tbfight.fighters.filter(x => x.kind === 'monster').map(x => x.key + ':' + x.hp).join(' ') : 'null';
    r.lines = say.filter(l => /RUSH|rush|voice|static|radio|hits you|scramble/i.test(l)).slice(0, 18);
    r.outcome = Game.tbfight ? (Game.tbfight.over ? 'OVER:' + JSON.stringify(Game.tbfight.result) : 'NOT-OVER') : 'null';
  } catch (e) { r.error = String(e && e.stack || e).split('\n').slice(0,3).join('|'); }
  restore(orig); out.static_kite = r;
}

async function main() {
  const probes = [probeReviewSidestep, probeInspirationDetonation, probeDucksSplit, probeNostalgiaPassive, probeStaticKite];
  for (const pr of probes) {
    try { await pr(); } catch (e) { out[pr.name] = { error: 'probe: ' + String(e && e.stack || e).split('\n').slice(0,3).join('|') }; }
    process.stderr.write(pr.name + ' done\n');
  }
  fs.writeFileSync(path.join(__dirname, 'probe2-monsters-results.json'), JSON.stringify(out, null, 1));
  process.stdout.write('WROTE probe2-monsters-results.json\n');
}
main().catch(e => { process.stderr.write('FATAL ' + (e && e.stack || e)); process.exit(1); });
