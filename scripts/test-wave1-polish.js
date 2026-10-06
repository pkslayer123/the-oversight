// Wave-1 telegraph polish tests (Steve 2026-10-06)
// Covers: lockpick pattern consistency (data vs render), speedbump one fair
// tell + ambushZone dead-class removal, nightlight codex-gated still tell,
// betrayal.js single quote layer via sayLine, glasswing trap grid render.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/betrayal.js',
 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  const said = [];
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); };

  console.log('=== 1. Lockpick: data pattern vs render path ===');
  const lockDef = Game.data.monsters.find(m => m.id === 'lockpick_raccoon');
  ok('lockpick data pattern is direct', lockDef.attack.pattern.type === 'direct');
  ok('lockpick data pattern range 2', lockDef.attack.pattern.range === 2);
  // Drive cornered -> generic engine declare (Disassemble as a weapon)
  Game.debugScenario('lockpick');
  Game.state.codex.monsters['lockpick_raccoon'] = { stage: 'observed', attacksSeen: ['Disassemble'] };
  Game.startCombat('lockpick_raccoon');
  const f1 = Game.tbfight;
  const lm = f1.fighters.find(x => x.kind === 'monster');
  const lp = f1.fighters.find(x => x.key === 'p');
  lm.beamPhase = 'cornered'; lm.mx = lp.mx + 1; lm.my = lp.my;
  Game.tbMonsterTurn(lm);
  ok('lockpick declare telegraph kind is direct (matches data)', lm.telegraph && lm.telegraph.kind === 'direct');
  ok('lockpick telegraph has targetKey', !!(lm.telegraph && lm.telegraph.targetKey));
  ok('lockpick telegraph has no burst cells (no 25-cell mismatch)',
    !(lm.telegraph.cells && lm.telegraph.cells.length > 1));
  // The render path (app.js tbAllTelegraphCells): kind 'direct' + targetKey ->
  // exactly one target tile (lockOn). Replicate the rule here.
  const renderCells = [];
  const tg = lm.telegraph;
  const ptype = (tg.pattern && tg.pattern.type) || 'single';
  if (tg.kind === 'direct' && tg.targetKey) {
    const tgt = f1.fighters.find(x => x.key === tg.targetKey);
    if (tgt) renderCells.push(tgt.mx + ',' + tgt.my);
  } else if (tg.cells && tg.cells.length) {
    for (const c of tg.cells) renderCells.push(c.cx + ',' + c.cy);
  }
  ok('lockpick renders exactly 1 telegraph cell (direct lock-on)', renderCells.length === 1, `got ${renderCells.length}`);
  ok('lockpick telegraph cell is the target tile', renderCells[0] === (lp.mx + ',' + lp.my));
  // Distinct telegraph text present in data (the steal's fair tell)
  ok('lockpick data telegraph text mentions hands', /hands/i.test(lockDef.attack.telegraph || ''));

  console.log('=== 2. Speedbump: one fair tell, ambushZone dead ===');
  const sbDef = Game.data.monsters.find(m => m.id === 'speedbump_turtle');
  ok('speedbump data pattern is ambush (snap, no warning, by design)',
    sbDef.attack.pattern.type === 'ambush');
  // The ONE fair tell: world-view warn cue fires when you close within 2,
  // before combat starts.
  const warnCue = Game.monsterCue('speedbump_turtle', 'warn');
  ok('speedbump has a warn cue (the stillness change)', !!warnCue && /still/i.test(warnCue));
  const rockBadge = (sbDef.encounter.phaseBadges || {}).rock;
  ok('speedbump has a ROCK phase badge', !!rockBadge);
  ok('speedbump codex has a knownCue', !!((sbDef.encounter || {}).knownCue));
  // Combat: the snap never declares — no telegraph, no warning. That's the identity.
  Game.debugScenario('speedbump');
  Game.startCombat('speedbump_turtle');
  const f2 = Game.tbfight;
  const sm = f2.fighters.find(x => x.kind === 'monster');
  const sp = f2.fighters.find(x => x.key === 'p');
  sm.mx = sp.mx + 1; sm.my = sp.my; // adjacent: snap range
  said.length = 0;
  Game.tbMonsterTurn(sm);
  ok('speedbump snap sets NO telegraph (no-warning by design)', sm.telegraph == null);
  ok('speedbump snap announces itself in text', said.some(t => /SNAP/i.test(t)));
  // ambushZone class: dead code removed from the grid renderer.
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok('app.js never reads _tg.ambush (no dead zone telegraph)', !/_tg\.ambush/.test(appSrc));
  ok('app.js never applies the ambushZone cell class', !/' ambushZone'/.test(appSrc));
  ok('tbAllTelegraphCells has no ambush bucket', !/ambush: new Set/.test(appSrc));
  ok('ambush resolve audio still wired (ambushSnap)', /ambushSnap/.test(appSrc));

  console.log('=== 3. Nightlight: codex-gated still tell ===');
  // Unknown player: tell cell is null even in still phase.
  Game.debugScenario('nightlight');
  Game.startCombat('nightlight_catfish');
  const f3 = Game.tbfight;
  const cm = f3.fighters.find(x => x.kind === 'monster');
  const cp = f3.fighters.find(x => x.key === 'p');
  cm.beamPhase = 'still'; cm.mx = cp.mx + 2; cm.my = cp.my;
  delete Game.state.codex.monsters['nightlight_catfish'];
  ok('catfishTellCell null when pattern unknown (knowledge law)',
    Game.catfishTellCell() === null);
  // Known player: shimmer appears on the catfish tile during still.
  // Learn it the honest way: tbLearnPattern (fires when you survive the grasp).
  Game.tbLearnPattern(cm);
  const tell = Game.catfishTellCell();
  ok('catfishTellCell returns the catfish tile when known + still',
    !!tell && tell.x === cm.mx && tell.y === cm.my);
  // Not in still phase: no tell (lure/dark phases stay quiet).
  cm.beamPhase = 'lure';
  ok('catfishTellCell null outside still phase', Game.catfishTellCell() === null);
  cm.beamPhase = 'dark';
  ok('catfishTellCell null in dark phase', Game.catfishTellCell() === null);
  // The still phase itself always fires as text — the fair tell for everyone.
  cm.beamPhase = 'lure'; cm.lureSaid = false;
  cm.mx = cp.mx + 3; cm.my = cp.my;
  said.length = 0;
  Game.tbCatfishTurn(cm);
  ok('lure phase warns (stillness text) at d<=3', said.some(t => /too still/i.test(t)));
  ok('lure advances to still phase', cm.beamPhase === 'still');

  console.log('=== 4. Betrayal: one quote layer ===');
  const feed = [];
  Game.say = (t) => { feed.push(String(t)); };
  Game.displayName = () => 'Vera';
  Game.sayLine('v1', '"Already quoted."');
  ok('pre-quoted line keeps one layer', feed[0] === 'Vera: "Already quoted."', `got ${feed[0]}`);
  Game.sayLine('v1', 'Bare narration.');
  ok('bare line gets wrapped once', feed[1] === 'Vera: "Bare narration."', `got ${feed[1]}`);
  ok('no doubled quotes anywhere', !feed.some(t => /""/.test(t)));
  // The betrayal.js finish path now routes through sayLine (single call site).
  ok('betrayal.js finish uses sayLine', /this\.sayLine\(vid, line\)/.test(
    fs.readFileSync(path.join(ROOT, 'src/js/betrayal.js'), 'utf8')));
  Game.say = origSay;

  console.log('=== 5. Glasswing trap: shadow renders on grid ===');
  Game.debugScenario('glasswing');
  Game.say = () => {};
  for (let i = 0; i < 5 && !Game.state.scholar.gwTrap; i++) Game.monsterTurn();
  const cells = Game.glasswingTrapCells();
  ok('glasswingTrapCells returns contract shape',
    !!cells && !!cells.tile && Array.isArray(cells.splash) && cells.splash.length === 8);
  // Replicate app.js renderDetail gwTrap overlay exactly; the shadow + splash
  // must all paint.
  let painted = 0, shadowDark = null;
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    let style = '';
    if (cells && cells.tile) {
      if (cx === cells.tile.x && cy === cells.tile.y) {
        const turns = Math.min(3, Math.max(1, cells.turns || 1));
        shadowDark = [0.22, 0.42, 0.68][turns - 1];
        style = 'shadow';
      } else if (cells.splash) {
        for (const sc of cells.splash) if (sc && sc.x === cx && sc.y === cy) { style = 'splash'; break; }
      }
    }
    if (style) painted++;
  }
  ok('trap paints 9 grid cells (1 shadow + 8 splash)', painted === 9, `got ${painted}`);
  ok('shadow darkens with turns (turn1 = 0.22)', shadowDark === 0.22);
  Game.state.scholar.gwTrap.turns = 3;
  const c3 = Game.glasswingTrapCells();
  ok('shadow darkest at turn 3 (0.68)', [0.22, 0.42, 0.68][Math.min(3, Math.max(1, c3.turns || 1)) - 1] === 0.68);

  Game.say = origSay;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
