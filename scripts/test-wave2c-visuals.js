// Wave 2 Group C VISUAL proof (Steve 2026-10-06, worker W1).
// Proves the telegraph/render work against REAL combat and REAL code:
//   1. delegate_beast charge routes to the encircle bucket (not generic chargeLane),
//      with a charge-direction angle for the arrows
//   2. bright_idea burst goes white-hot (biHot) on the last windup tick only
//   3. unknown -> 0 cells everywhere (knowledge gating holds)
//   4. bloom badge paints: detonation ends the monster turn on 'bloom'
//   5. bi declare carries cueText (BACK OFF coaching visible in telegraph UI)
//   6. memory projector resolve payoff text + projectorFire event hook
//   7. mpBeamKeys / beastCircleKeys helpers: gated producers
//   8. tbPatternDesc codexDesc override (delegate_beast learns the encirclement text)
//   9. gwTrap shadow producer contract (sibling's render consumes it)
//  10. app.js renderDetail source presence for the new visuals
// Run: node scripts/test-wave2c-visuals.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function def(id) {
  const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const mlist = Array.isArray(md) ? md : md.monsters;
  return mlist.find(m => m.id === id);
}
const saidLines = [];
function setup(id, opts) {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  if (opts && opts.night) Game.dayPart = 3;
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.health = 99999; s.maxHealth = 99999;
  Game.ensureVillagerPositions();
  Game.audio = new Proxy({}, { get: (t, k) => (...a) => { firedAudio.push(String(k)); } });
  Game.state.scholar.monster = { id, mx: 6, my: 4 };
  Game.startCombat(id);
  const m = Game.tbfight.fighters.find(f => f.kind === 'monster');
  m.hp = 99999; m.maxHp = 99999;
  return m;
}
let firedAudio = [];
// deterministic knowledge control: encTelegraphKnown reads codex patterns
function setKnown(id, known) {
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  const c = Game.state.codex.monsters[id] || (Game.state.codex.monsters[id] = {});
  c.patterns = c.patterns || {};
  const d = def(id);
  if (known) c.patterns[d.attack.name] = 'test-learned';
  else delete c.patterns[d.attack.name];
}
function isKnown(m) { return Game.encTelegraphKnown(m); }

// Extract the REAL tbAllTelegraphCells from app.js and run it against a stub Game.
const _tbSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8')
  .match(/function tbAllTelegraphCells\(\) \{[\s\S]*?\n  \}\n/)[0]
  .replace(/^function tbAllTelegraphCells/, 'function');
function runBuckets(stub) {
  const Game = stub;
  return eval('(' + _tbSrc + ')')();
}

(async () => {
  await Game.init();
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { saidLines.push(String(t)); return origSay(t); };

  console.log('\n== 1+2+3: app.js bucket routing (real tbAllTelegraphCells, stub Game) ==');
  {
    // delegate_beast announced charge -> encircle, not charge; angle captured
    const laneCells = Game.beastLineCells(6, 4, 2, 4, 4, 2);
    const stubBeast = {
      tbfight: { fighters: [
        { kind: 'monster', alive: true, mdef: { id: 'delegate_beast' },
          telegraph: { kind: 'squares', pattern: { type: 'charge' },
            cells: laneCells, turnsLeft: 1 } },
      ] },
      encTelegraphKnown: () => true,
    };
    let out = runBuckets(stubBeast);
    ok(out.encircle.size === laneCells.length, 'beast charge cells route to encircle bucket', String(out.encircle.size));
    ok(out.charge.size === 0, 'beast charge cells do NOT land in generic charge bucket');
    ok(typeof out.encircleAngle === 'number', 'encircle charge angle captured for arrows', String(out.encircleAngle));
    ok(Math.abs(out.encircleAngle - 180) <= 20, 'angle points along the charge lane (beast->player, ~180deg)', String(out.encircleAngle));
    // unknown -> nothing renders
    out = runBuckets({ tbfight: stubBeast.tbfight, encTelegraphKnown: () => false });
    ok(out.encircle.size === 0 && out.charge.size === 0, 'unknown beast: 0 telegraph cells (gating holds)');
  }
  {
    // bright_idea burst: turnsLeft 2 -> burst; turnsLeft 1 -> biHot
    const cells = [{ cx: 3, cy: 3 }, { cx: 4, cy: 4 }];
    const mk = (turnsLeft, knownFn) => ({
      tbfight: { fighters: [
        { kind: 'monster', alive: true, mdef: { id: 'bright_idea' },
          telegraph: { kind: 'squares', pattern: { type: 'burst' }, cells, turnsLeft } },
      ] },
      encTelegraphKnown: knownFn,
    });
    let out = runBuckets(mk(2, () => true));
    ok(out.burst.size === 2 && out.biHot.size === 0, 'bi turnsLeft=2: plain burst bucket (not hot yet)');
    out = runBuckets(mk(1, () => true));
    ok(out.biHot.size === 2 && out.burst.size === 0, 'bi turnsLeft=1: white-hot biHot bucket, not plain burst');
    out = runBuckets(mk(1, () => false));
    ok(out.biHot.size === 0 && out.burst.size === 0, 'bi unknown: 0 cells (gating holds)');
  }

  console.log('\n== 4+5: bloom badge paints + bi declare cueText (BACK OFF in telegraph UI) ==');
  {
    const m = setup('bright_idea', { night: true });
    setKnown('bright_idea', true);
    // Observe phase exactly at each monster turn end (wrapping tbMonsterTurn
    // sidesteps tbCurrent/key bookkeeping entirely).
    const origMT = Game.tbMonsterTurn.bind(Game);
    let sawDet = false, bloomAtEnd = null, emberNext = null;
    let liveCueText = null, liveCue = null;
    Game.tbMonsterTurn = (mm) => {
      const r = origMT(mm);
      if (mm.key === m.key) {
        if (mm.telegraph && mm.telegraph.cueText && !liveCueText) {
          liveCueText = mm.telegraph.cueText;
          try { liveCue = Game.tbTelegraphCue(mm); } catch (e) {}
        }
        if (!sawDet && saidLines.some(l => /WHITE\. The idea detonates/.test(l))) {
          sawDet = true;
          bloomAtEnd = (mm.beamPhase === 'bloom');
        } else if (sawDet && emberNext === null) {
          emberNext = (mm.beamPhase === 'ember');
        }
      }
      return r;
    };
    let n = 0;
    while (Game.tbfight && n++ < 160) {
      const cur = Game.tbCurrent();
      if (!cur) break;
      if (cur.kind === 'player') { if (Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn(); }
      else Game.tbAdvance();
      if (!Game.tbfight) break;
      if (sawDet && emberNext !== null && liveCueText) break;
    }
    Game.tbMonsterTurn = origMT;
    ok(sawDet, 'detonation happened');
    ok(bloomAtEnd === true, "bloom badge paints: monster turn ENDS on 'bloom' (not flipped same-turn)", String(bloomAtEnd));
    ok(emberNext === true, "next monster turn flips bloom -> ember", String(emberNext));
    ok(saidLines.some(l => /gutters down to a dying ember/.test(l)), 'ember narration still fires');
    ok(!!liveCueText && /BACK OFF/.test(liveCueText), 'telegraph.cueText set at declare (known: BACK OFF coaching)', String(liveCueText));
    ok(!!liveCue && /BACK OFF/.test(liveCue), 'tbTelegraphCue surfaces the coaching in the combat UI', String(liveCue && liveCue.slice(0, 90)));
    // unknown variant: dread, no coaching (gating holds)
    const m2 = setup('bright_idea', { night: true });
    setKnown('bright_idea', false);
    const origMT2 = Game.tbMonsterTurn.bind(Game);
    let unkCue = null;
    Game.tbMonsterTurn = (mm) => {
      const r = origMT2(mm);
      if (mm.key === m2.key && mm.telegraph && mm.telegraph.cueText && !unkCue) unkCue = mm.telegraph.cueText;
      return r;
    };
    n = 0;
    while (Game.tbfight && n++ < 80 && !unkCue) {
      const cur = Game.tbCurrent();
      if (!cur) break;
      if (cur.kind === 'player') { if (Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn(); }
      else Game.tbAdvance();
      if (!Game.tbfight) break;
    }
    Game.tbMonsterTurn = origMT2;
    ok(!!unkCue && !/BACK OFF/.test(unkCue), 'unknown bi: cueText is dread only, no coaching (gating holds)', String(unkCue));
  }

  console.log('\n== 6: memory projector resolve payoff ==');
  {
    const m = setup('memory_projector', { night: true });
    setKnown('memory_projector', true);
    const keys = Game.mpBeamKeys();
    // telegraph not declared yet -> no keys; force the spell declare path instead
    ok(keys instanceof Set, 'mpBeamKeys returns a Set');
    let n = 0;
    const say0 = saidLines.length;
    while (Game.tbfight && n++ < 120 && !saidLines.slice(say0).some(l => /The picture LOCKS/.test(l))) {
      const cur = Game.tbCurrent();
      if (!cur) break;
      if (cur.kind === 'player') {
        // stand still (99999 HP tanks it); the spell needs a still target
        if (Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn();
      } else Game.tbAdvance();
      if (!Game.tbfight) break;
    }
    const fresh = saidLines.slice(say0);
    ok(fresh.some(l => /The picture LOCKS/.test(l)), 'bespoke resolve text: The picture LOCKS', fresh.filter(l => /LOCKS/.test(l))[0]);
    ok(fresh.some(l => /edges are sharp/.test(l)), 'resolve keeps the sharp-edges payoff');
    ok(firedAudio.includes('projectorFire'), 'projectorFire audio event fired (synth is audio-worker territory)');
  }
  {
    // mpBeamKeys gating, deterministic: force a beam telegraph
    const m = setup('memory_projector', { night: true });
    m.telegraph = { kind: 'squares', cells: [{ cx: 5, cy: 4 }, { cx: 6, cy: 4 }],
      pattern: { type: 'beam' }, turnsLeft: 2, firing: 0 };
    setKnown('memory_projector', true);
    ok(Game.mpBeamKeys().size === 2, 'mpBeamKeys: known -> cells render');
    setKnown('memory_projector', false);
    ok(Game.mpBeamKeys().size === 0, 'mpBeamKeys: unknown -> 0 cells (gating holds)');
  }

  console.log('\n== 7: beastCircleKeys (closing circle ring, knowledge-gated) ==');
  {
    const m = setup('delegate_beast');
    m.beamPhase = 'circle';
    Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
    const p = Game.tbFighter('p'); p.mx = 4; p.my = 4;
    setKnown('delegate_beast', true);
    const ring = Game.beastCircleKeys();
    ok(ring.size === 16, 'circle ring: 16 cells at chebyshev distance 2 around player', String(ring.size));
    ok(ring.has('2,2') && ring.has('6,6') && ring.has('4,2') && ring.has('2,4'), 'ring geometry correct (corners + edges)');
    ok(!ring.has('4,4'), 'ring excludes the player tile');
    setKnown('delegate_beast', false);
    ok(Game.beastCircleKeys().size === 0, 'unknown: no circle ring (gating holds)');
    setKnown('delegate_beast', true);
    m.beamPhase = 'announce';
    ok(Game.beastCircleKeys().size === 0, 'ring only while pacing circle phase');
  }

  console.log('\n== 8: tbPatternDesc codexDesc wiring ==');
  {
    const d = def('delegate_beast');
    const got = Game.tbPatternDesc(d.attack.pattern, d);
    ok(got.includes('circles wide'), 'beast learns the encirclement text, not the straight-line generic', got.slice(0, 60));
    const other = Game.tbPatternDesc({ type: 'charge' }, def('mirror_stag'));
    ok(other.includes('charges in a straight line'), 'monsters without codexDesc keep the generic text');
    ok(Game.tbPatternDesc({ type: 'charge' }).includes('charges in a straight line'), 'tbPatternDesc stays backward-compatible without mdef');
    // tbLearnPattern writes the override into the codex
    const m = setup('delegate_beast');
    setKnown('delegate_beast', false);
    Game.tbLearnPattern(m);
    const c = Game.state.codex.monsters['delegate_beast'];
    ok(c && c.patterns[d.attack.name] && c.patterns[d.attack.name].includes('circles wide'),
      'tbLearnPattern stores the encirclement codexDesc');
  }

  console.log('\n== 9: gwTrap shadow producer contract ==');
  {
    ok(Game.glasswingTrapCells() === null, 'no trap -> null (nothing renders)');
    Game.state.scholar.gwTrap = { turns: 2, tileX: 5, tileY: 4, monsterId: 'glasswing' };
    const t = Game.glasswingTrapCells();
    ok(!!t && t.tile.x === 5 && t.tile.y === 4 && t.turns === 2, 'trap tile + turns contract');
    ok(Array.isArray(t.splash) && t.splash.length === 8, '8 splash tiles contract', String(t.splash && t.splash.length));
    Game.state.scholar.gwTrap = null;
  }

  console.log('\n== 10: app.js renderDetail source presence for new visuals ==');
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    ok(src.includes('encircleLane'), 'encircleLane class rendered');
    ok(src.includes('➤'), 'direction-arrow overlay rendered');
    ok(src.includes('encircleAngle'), 'charge angle wired from app routing');
    ok(src.includes("' biHot'") || src.includes('" biHot"') || src.includes(' biHot'), 'biHot bucket rendered');
    ok(src.includes('#ffb020'), 'amber encirclement inline style');
    ok(src.includes('255,255,255,.42') || src.includes('255,255,255,.45'), 'white-hot burst inline style');
    ok(src.includes('beastCircleKeys()'), 'circle-ring helper consumed in renderDetail');
    ok(src.includes('mpBeamKeys()'), 'film-beam helper consumed in renderDetail');
    ok(src.includes('#ffca7a'), 'warm amber home-light tint for projector beam');
    ok(src.includes('_gwTrap.tile'), 'gwTrap shadow still rendered (sibling contract intact)');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
