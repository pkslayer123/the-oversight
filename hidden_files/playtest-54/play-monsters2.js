// play-monsters2.js — playtest 12 wave-2/trickster monster scenarios as a player.
// Usage: node play-monsters2.js   (from hidden_files/playtest-54/)
// Writes play-monsters2-results.json
const { Game, fs, path, ROOT } = require('./harness-load.js');

const SCENARIOS = ['reviewdrone','influencer','customerservice','inspiration','speedbump',
  'ducksinarow','static','griefcounselor','motivationalspeaker','termsconditions',
  'middlemanager','nostalgia'];

const out = { scenarios: {} };

function snapFighters() {
  const f = Game.tbfight;
  if (!f) return 'null';
  return f.fighters.map(x => {
    const extras = {};
    for (const k of ['beamPhase','hkShame','usWatchTurns','usColdRead','llClaimed','llAddenda','urWalkout','segmentIndex','isHead','telegraph','stunned','blind','hkCompelled']) {
      if (x[k] !== undefined && x[k] !== null && x[k] !== 0 && x[k] !== false) extras[k] = k === 'telegraph' ? String(x.telegraph.cue||'').slice(0,80) : x[k];
    }
    return `${x.key}:${x.name}@(${x.mx},${x.my}) hp${x.hp}/${x.maxHp}${x.alive?'':' DEAD'} ${JSON.stringify(extras)}`;
  }).join('\n    ');
}

function adjMove(p, tx, ty) {
  // move 1 tile toward target if possible
  const dx = Math.sign(tx - p.mx), dy = Math.sign(ty - p.my);
  const nx = Math.max(1, Math.min(7, p.mx + dx)), ny = Math.max(1, Math.min(7, p.my + dy));
  try { Game.tbPlayerMove(nx, ny); } catch (e) { return 'move-throw:' + e.message; }
  return `moved→(${nx},${ny})`;
}

async function playOne(name) {
  const say = [];
  const orig = Game.say;
  Game.say = (t) => { say.push(String(t)); };
  const r = { name, say: [], fightersStart: null, turns: [], outcome: null, error: null };
  try {
    await Game.init();
  } catch (e) { r.error = 'init: ' + e.message; Game.say = orig; out.scenarios[name] = r; return; }
  try { Game.debugScenario(name); }
  catch (e) { r.error = 'scenario: ' + (e && e.stack || e); Game.say = orig; out.scenarios[name] = r; return; }
  r.setupSay = say.splice(0).join('\n');
  const s = Game.state.scholar;
  const mid = s.monster && s.monster.id;
  r.mid = mid;
  try {
    Game.startCombat(mid);
  } catch (e) { r.error = 'startCombat: ' + (e && e.stack || e).split('\n').slice(0,4).join('|'); Game.say = orig; out.scenarios[name] = r; return; }
  let f = Game.tbfight;
  if (!f) { r.error = 'no tbfight after startCombat'; Game.say = orig; out.scenarios[name] = r; return; }
  r.fightersStart = snapFighters();
  // teleport player adjacent to first monster (interior tiles)
  const mons0 = f.fighters.filter(x => x.kind === 'monster' && x.alive);
  const m0 = mons0[0];
  const me = Game.tbFighter('p');
  me.mx = Math.max(1, Math.min(7, m0.mx - 1)); me.my = Math.max(1, Math.min(7, m0.my));
  s.mx = me.mx; s.my = me.my;
  if (me.mx === m0.mx && me.my === m0.my) me.mx = Math.max(1, m0.mx - 2);

  const wRange = (Game.equippedWeapon && Game.equippedWeapon().range) || 2;
  const pickTarget = () => {
    const ms = Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive);
    if (!ms.length) return null;
    if (name === 'ducksinarow') {
      // strike the tail (highest segmentIndex), per knownTactics
      ms.sort((a, b) => (b.segmentIndex || 0) - (a.segmentIndex || 0));
    }
    return ms[0];
  };
  const dist = (a, b) => Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my));

  let playerActs = 0, advances = 0, struck = 0;
  const turnLog = [];
  const sayMark = [0];
  const sayNew = () => { const n = say.slice(sayMark[0]); sayMark[0] = say.length; return n; };
  sayNew(); // drain start-of-combat lines (keep separate)
  r.combatIntro = say.splice(0, say.length).join('\n').slice(0, 1200);

  let staticWaits = 0, fledByBarrier = false;
  while (Game.tbfight && !Game.tbfight.over && playerActs < 30 && advances < 400) {
    if (Game.tbIsPlayerTurn()) {
      const p = Game.tbFighter('p');
      const tgt = pickTarget();
      if (!tgt) break;
      const tl = [];
      try {
        if (name === 'static' && staticWaits < 4) {
          // counterplay probe: do NOT approach, wait. (weakness: "don't go toward the crying")
          Game.tbPlayerWait(); staticWaits++;
          tl.push('wait(no-approach)');
        } else if (name === 'motivationalspeaker' && p.hkCompelled) {
          // counterplay: WAIT to answer back, clear 3 shame
          Game.tbPlayerWait();
          tl.push('wait(answer-back)');
        } else if (name === 'inspiration' && tgt.telegraph) {
          // counterplay: back off when it brightens (burst radius 2)
          const away = adjMove(p, 2 * p.mx - tgt.mx, 2 * p.my - tgt.my);
          tl.push('telegraph-seen→' + away);
        } else if (name === 'griefcounselor' && tgt.telegraph) {
          // counterplay: sidestep the 6-tile charge line (move perpendicular)
          const px = p.mx, py = p.my;
          const perpX = Math.max(1, Math.min(7, px + (tgt.mx === px ? 1 : 0)));
          const perpY = Math.max(1, Math.min(7, py + (tgt.my === py ? 1 : 0)));
          try { Game.tbPlayerMove(perpX, perpY); tl.push(`sidestep→(${perpX},${perpY})`); } catch (e) { tl.push('sidestep-throw:' + e.message); }
        } else if (name === 'termsconditions' || name === 'nostalgia') {
          // counterplay: keep moving; never end turn standing still
          if (dist(p, tgt) > wRange) { tl.push(adjMove(p, tgt.mx, tgt.my) + ' (approach)'); }
          else { Game.tbPlayerStrike(tgt.key); struck++; tl.push('strike'); }
          if (Game.tbIsPlayerTurn()) {
            // use remaining movement to relocate
            const nx = Math.max(1, Math.min(7, p.mx + (p.mx <= 4 ? 1 : -1)));
            const ny = Math.max(1, Math.min(7, p.my + (p.my <= 4 ? -1 : 1)));
            try { Game.tbPlayerMove(nx, ny); tl.push(`relocate→(${nx},${ny})`); } catch (e) { tl.push('relocate-throw:' + e.message); }
          }
        } else if (name === 'reviewdrone' && tgt.telegraph) {
          // counterplay: move off the projected line — probe what telegraph carries
          tl.push('telegraph-dump:' + JSON.stringify(tgt.telegraph).slice(0, 300));
          const away = adjMove(p, 2 * p.mx - tgt.mx, 2 * p.my - tgt.my);
          tl.push('dodge→' + away);
        } else {
          if (dist(p, tgt) > wRange) { tl.push(adjMove(p, tgt.mx, tgt.my) + ' (approach)'); }
          else { const ok = Game.tbPlayerStrike(tgt.key); struck++; tl.push('strike→' + tgt.key + ':' + ok); }
        }
      } catch (e) { tl.push('THROW:' + e.message); }
      // end player turn like UI would
      try {
        const p2 = Game.tbFighter('p');
        if (Game.tbIsPlayerTurn() && Game.tbfight && !Game.tbfight.over && p2 && (p2.acted || p2.moveLeft <= 0)) Game.tbPlayerEndTurn();
        else if (Game.tbIsPlayerTurn() && p2 && !p2.acted) Game.tbPlayerWait();
      } catch (e) { tl.push('endTurn-throw:' + e.message); }
      playerActs++;
      const newLines = sayNew();
      turnLog.push({ act: playerActs, round: Game.tbfight ? Game.tbfight.round : -1, tl,
        php: (() => { const pp = Game.tbFighter('p'); return pp ? pp.hp + '/' + pp.maxHp : 'gone'; })(),
        mhp: Game.tbfight ? Game.tbfight.fighters.filter(x => x.kind === 'monster').map(x => x.key.slice(0, 12) + ':' + x.hp + (x.alive ? '' : 'X')).join(' ') : 'fight-null',
        lines: newLines });
    } else {
      try { Game.tbAdvance(); } catch (e) { turnLog.push({ act: 'adv-throw', lines: [String(e.message)] }); break; }
      advances++;
    }
    if (!Game.tbfight) break;
  }
  r.turns = turnLog;
  r.playerActs = playerActs; r.advances = advances; r.struck = struck;
  const ff = Game.tbfight;
  r.outcome = ff ? (ff.over ? 'OVER result=' + JSON.stringify(ff.result) : 'NOT-OVER (round ' + ff.round + ')') : 'fight-null (ended)';
  r.fightersEnd = snapFighters();
  r.sayTail = say.slice(-30).join('\n');
  r.threw = say.filter(l => /THROW/.test(l)).length;
  Game.say = orig;
  out.scenarios[name] = r;
}

async function main() {
  for (const n of SCENARIOS) {
    try { await playOne(n); } catch (e) {
      out.scenarios[n] = { name: n, error: 'playOne: ' + (e && e.stack || e) };
      try { Game.say = Game.say; } catch (_) {}
    }
    process.stderr.write(n + ' done\n');
  }
  fs.writeFileSync(path.join(__dirname, 'play-monsters2-results.json'), JSON.stringify(out, null, 1));
  process.stdout.write('WROTE play-monsters2-results.json\n');
}
main().catch(e => { process.stderr.write('FATAL ' + (e && e.stack || e)); process.exit(1); });
