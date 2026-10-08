// Playtest runner: plays one debug scenario as a player in headless node.
// Usage: node run-one.js <scenarioName>
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
const OUT = path.join(ROOT, 'hidden_files/playtest-54/out');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;

const sayLog = [];
const origSay = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); };
let scenarioName = '';

const notes = [];   // player-side notes (exceptions, stuck states)
const actions = []; // player actions taken

function safe(fn, label) {
  try { return fn(); }
  catch (e) { notes.push(label + ' EXCEPTION: ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : e)); return undefined; }
}

const cheb = (a, b) => Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my));
const clamp1 = v => Math.max(1, Math.min(7, v));

function walkToWorldMonster(monsterId) {
  // approach the scenario's world monster until a fight starts (or 30 ticks)
  const s = Game.state.scholar;
  for (let n = 0; n < 30; n++) {
    if (Game.tbfight) return n;
    // GLASSWING TRAP: the darter vanished and a dive shadow is falling on
    // your tile — stand ground and let the ticks fall (any action advances it)
    if (s.gwTrap) { safe(() => Game.tickAction(1), 'tickAction'); continue; }
    const wm = (Game.worldMonsters() || []).find(m => m.id === monsterId);
    const m = wm || (s.monster && s.monster.id === monsterId ? s.monster : null);
    if (!m) { notes.push('world monster gone before contact (faded/fled/trapped?)'); return n; }
    const px = s.mx, py = s.my;
    if (m.mx === px && m.my === py) {
      // same tile: jiggle aside — each real step gives the stance machine a turn
      let jiggled = false;
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        if (safe(() => Game.pathStep(px + sx, py + sy), 'pathStep')) { jiggled = true; break; }
      }
      if (!jiggled) safe(() => Game.tickAction(8), 'tickAction');
      continue;
    }
    const dx = Math.sign(m.mx - px), dy = Math.sign(m.my - py);
    let stepped = false;
    for (const [sx, sy] of [[dx, 0], [0, dy], [dx, dy], [dx, -dy], [-dx, dy]]) {
      if (!sx && !sy) continue;
      if (safe(() => Game.pathStep(px + sx, py + sy), 'pathStep')) { stepped = true; break; }
    }
    if (!stepped) { notes.push('walk blocked at ' + px + ',' + py); return n; }
  }
  return 30;
}

function tryMoveToward(p, t, strikeRange) {
  const foes = Game.tbfight.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive && !x.fled);
  // beam firing? then dodge perpendicular — maximize angular displacement
  let firing = false;
  try { firing = t.beamPhase === 'firing' || (t.telegraph && /fir/i.test(t.telegraph.kind || '')); } catch (e) {}
  const cands = [];
  const moveLeft = p.moveLeft || 0;
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) {
    if (x === p.mx && y === p.my) continue;
    if (foes.some(f => f.mx === x && f.my === y)) continue;
    const stepDist = Math.max(Math.abs(x - p.mx), Math.abs(y - p.my));
    if (stepDist > moveLeft) continue; // path cost may differ, but close enough
    if (!firing && Math.max(Math.abs(x - t.mx), Math.abs(y - t.my)) > strikeRange) continue;
    let score;
    if (firing) {
      // perpendicular dodge: maximize angle change as seen from the monster
      const a0 = Math.atan2(p.my - t.my, p.mx - t.mx);
      const a1 = Math.atan2(y - t.my, x - t.mx);
      let da = Math.abs(a1 - a0); while (da > Math.PI) da = 2 * Math.PI - da;
      score = da * 10 - stepDist * 0.05;
    } else {
      score = -stepDist; // closest useful tile
    }
    cands.push({ x, y, score });
  }
  cands.sort((a, b) => b.score - a.score);
  for (const c of cands.slice(0, 12)) {
    const before = sayLog.length;
    let ok = false;
    try { ok = Game.tbPlayerMove(c.x, c.y); } catch (e) { notes.push('MOVE EX: ' + e.message); return false; }
    const said = sayLog.slice(before).join(' ');
    if (ok && !/No path there|don't stroll through|Too far/.test(said)) { actions.push(`move->${c.x},${c.y}${firing ? '(dodge)' : ''}`); return true; }
  }
  return false;
}

function playOneTurn() {
  const f = Game.tbfight;
  if (!f || f.over) return;
  const p = Game.tbFighter('p');
  if (!p || !p.alive) { notes.push('player dead/unavailable'); return; }
  const foes = f.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive && !x.fled);
  if (!foes.length) {
    // no live foes but the fight isn't over — reinforcements may be incoming
    // (belltoad chorus). WAIT advances the round so they can arrive.
    safe(() => Game.tbPlayerWait(), 'tbPlayerWait');
    actions.push('wait (no live foes)');
    return;
  }
  const w = Game.equippedWeapon();
  const range = w.range || 1;
  // strike range: whitenoise heron is a statue — whiffs at range>1; get adjacent
  const strikeRange = (scenarioName === 'whitenoise') ? 1 : range;
  foes.sort((a, b) => cheb(a, p) - cheb(b, p));
  const t = foes[0];
  const dist = cheb(t, p);
  // flyer airborne + short weapon: the shadow/lane is the fight — wait for landing
  let airborne = false;
  try { airborne = Game.flyerAirborne(t) && Game.encUsesFifo(t) && range <= 2; } catch (e) {}
  if (!p.acted && dist <= strikeRange && !airborne) {
    safe(() => Game.tbPlayerStrike(t.key), 'tbPlayerStrike');
    actions.push(`strike ${t.key}(${t.name}) d=${dist}`);
  } else if (!p.acted && airborne) {
    safe(() => Game.tbPlayerWait(), 'tbPlayerWait');
    actions.push('wait (flyer airborne)');
    return;
  }
  // spend remaining movement: close in if out of range, else sidestep
  // (burns moveLeft; turn auto-advances when exhausted)
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn() && (Game.tbFighter('p').moveLeft || 0) > 0 && guard++ < 6) {
    const pp = Game.tbFighter('p');
    const live = Game.tbfight.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive && !x.fled);
    if (!live.length) break;
    live.sort((a, b) => cheb(a, pp) - cheb(b, pp));
    if (!tryMoveToward(pp, live[0], strikeRange)) break;
  }
  // still our turn with moves left but nothing useful: end it
  safe(() => { if (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn(); }, 'tbPlayerEndTurn');
}

(async () => {
  const name = process.argv[2]; scenarioName = name;
  const result = { name, verdict: null, setup: '', setupEx: null, played: '', notes: [], keywords: {}, fighters: [], log: [] };
  await Game.init();
  safe(() => Game.debugScenario(name), 'debugScenario');
  const setupLines = sayLog.filter(l => l.includes('🐞 SCENARIO')).join(' ');
  result.setup = setupLines || '(no scenario say)';
  const monsterId = Game.state.scholar.monster ? Game.state.scholar.monster.id : null;
  const steps = walkToWorldMonster(monsterId);
  result.walkSteps = steps;
  let turns = 0;
  const p0 = Game.tbFighter ? null : null;
  const pStartHp = Game.tbfight ? (Game.tbFighter('p') || {}).hp : (Game.state.scholar.hp || 100);
  const foeStart = Game.tbfight ? Game.tbfight.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile')).map(x => `${x.key}:${x.name}:${x.hp}/${x.maxHp}`).join(',') : '';
  while (Game.tbfight && !Game.tbfight.over && turns < 50) {
    turns++;
    if (!Game.tbIsPlayerTurn()) { notes.push('stuck: fight active but never returned to player turn'); break; }
    playOneTurn();
  }
  result.turns = turns;
  const f = Game.tbfight;
  result.fightEnded = !f || !!f.over;
  result.fightResult = f ? f.result : 'no-fight';
  if (f) result.fighters = f.fighters.map(x => `${x.key}:${x.kind}:${x.name}@${x.mx},${x.my} hp=${x.hp}/${x.maxHp} alive=${x.alive} fled=${x.fled}`).slice(0, 12);
  result.actions = actions;
  result.notes = notes;
  // keyword hits for signature mechanics
  const KW = {
    headlight: ['freez', 'aiming', 'beam', 'headlight'],
    flashbulb: ['flash', 'wing', 'fold', 'dazzl'],
    choir: ['croak', 'chorus', 'throat'],
    lockpick: ['steal', 'stole', 'pack', 'food'],
    hummice: ['hum', 'harmony', 'swarm'],
    nightlight: ['glow', 'still', 'lure', 'water'],
    glasswing: ['shadow', 'land', 'ground', 'dive'],
    sunbasker: ['sun', 'bask', 'flatten', 'shade'],
    bulldozer: ['charg', 'bulldoz', 'lane', 'trample'],
    hushpuppy: ['quiet', 'silent', 'rush', 'hush'],
    whitenoise: ['still', 'static', 'statue', 'unfold'],
  };
  const joined = sayLog.join('\n').toLowerCase();
  const kwHits = {};
  for (const k of (KW[name] || [])) {
    const re = new RegExp(k, 'gi');
    kwHits[k] = (joined.match(re) || []).length;
  }
  result.keywords = kwHits;
  // keep full log for report writing (may be long — cap)
  result.log = sayLog.slice(0, 400);
  result.logTruncated = sayLog.length > 400;
  result.totalLines = sayLog.length;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(result, null, 1));
  console.log(name, 'turns=' + turns, 'ended=' + result.fightEnded, 'result=' + result.fightResult, 'notes=' + notes.length, 'lines=' + sayLog.length);
})().catch(e => { console.error('RUNNER FATAL:', e.stack.split('\n').slice(0, 8).join(' | ')); process.exit(1); });
