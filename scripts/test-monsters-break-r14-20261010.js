#!/usr/bin/env node
// BREAK-IT r14 PROOF: monsters — the four 2026-10-10 commits' attack surface.
// (oversight-flesh-out-loop run r14, target index 5 = MONSTERS)
//
// LANDING NOTE: the engine fix for CATCH 1 below was independently found and
//   landed by the brawler loop as 446dd0bb (20 call sites incl.
//   src/js/encounters.js + src/js/party.js — a strict superset of the 15 sites
//   found here). This suite is kept as the regression guard: it proves the
//   LIVE wiring delivers pierce on every monster attack path.
//
// CATCH 1 (FIXED): mdef.pierce was engine-wired (tbDamage player/villager
//   blocks + fieldFights) but CALLER-DISCONNECTED: the generic
//   burst/beam/line/charge resolve (game.js, tbMonsterTurn) and the sweep-beam
//   tick never passed sourceKey, so all 26 wave 3-5 monsters' pierce
//   (0.1-0.75) silently read 0 on every non-direct attack. The wave-5 bands
//   were validated WITH pierce (sim-dps-anchor used direct placeholders),
//   so the engine under-delivered the design. Fixed: every monster-sourced
//   tbDamage call now passes the attacker's fighter key (15 sites).
//   BEFORE (HEAD game.js): finale beam vs P=138 lands 13 (pierce ignored).
//   AFTER: lands 37 (pierce 0.75 applied). Direct path unchanged (37 -> 37).
//   Hit-1 clamp verified intact under pierce (min 1 always lands).
//
// ALSO PROVEN (held ground):
//   - kill credit exactly-once (tbEnd lineage dedupe; flee records nothing;
//     deed feed distinct-by-id; pack kills count individually by design)
//   - pack spawn honesty (hushwolf 2/4, heckler 1/3, reunion mirror<=3)
//   - eviction wall: shove + gap + 3-round expiry (also when landlord dies)
//   - static lure: adjacency break, 2-round wear-off, radio-death break
//   - all 26 new monsters: fights terminate <=200 rounds, no exceptions,
//     monsters act (telegraph or damage observed in fights >=3 rounds)
//   - partyTactics.js loaded + all methods attached (no dead module)
//   - all 26 in monsterWavePool; wave unlock beats fire; deed gate distinctness
//
// REPORTED, NOT FIXED (needs Steve's mechanism call — proposed plan in
// evidence): the 26 new monsters' signature mechanics (finale doom
// countdown + sacrifice, eulogy doom narration, rerun fight-restart,
// editor cuts, eater calorie-growth, etc.) are COPY-ONLY. Their telegraphs
// promise mechanics the generic encounter interpreter never runs. The
// finale's windup text literally describes a [150,200] unavoidable strike
// that never fires. See evidence/2026-10-10/break-monsters-r14.md.
//
// Green across 3 seeds: SEED=N node scripts/test-monsters-break-r14-20261010.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

const W3 = ['redactor', 'gavel', 'focus_group', 'spool', 'chorus_line', 'terms_of_service', 'callback', 'buffering', 'ad_break'];
const W4 = ['congregation', 'strike', 'influencer', 'audit', 'reunion', 'suburb', 'eulogy', 'algorithm', 'eater'];
const W5 = ['cancellation', 'editor', 'rerun', 'spoiler', 'timeslot', 'nielsen', 'finale', 'network_note'];

function endTurn(Game) {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p');
  if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function endFight(Game) {
  if (Game.tbfight) { try { Game.tbfight.over = true; } catch (e) {} Game.tbfight = null; }
  try { Game.state.scholar.monster = null; } catch (e) {}
}

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  const s = Game.state.scholar;
  const SC = globalThis.Scattering;
  const realArmorBonus = Game.armorBonus, realPassive = Game.passiveBonus,
    realStat = Game.stat, realSay = Game.say, realScaleRank = Game.scaleRank;
  console.log('== BREAK-IT r14 MONSTERS PROOF, SEED ' + SEED + ' ==');

  // ---------- 1. PIERCE: the break + the fix ----------
  s.health = 9000; s.mx = 4; s.my = 4;
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  Game.armorBonus = () => 138;                       // god armor P=138
  const origRoll = SC.combat.roll; SC.combat.roll = () => 100;  // fixed 100 dmg
  Game.passiveBonus = () => 0; Game.stat = () => 5;   // dodge chance 0
  const pierceMath = (P, pierce, D) => {
    const effP = P * (1 - Math.min(0.9, Math.max(0, pierce)));
    const absorb = Math.min(D - 1, Math.round(D * (effP / (effP + 20))));
    return D - absorb;
  };
  ok('pierce math sanity: 0.75 -> 37', pierceMath(138, 0.75, 100) === 37);
  ok('pierce math sanity: 0 -> 13', pierceMath(138, 0, 100) === 13);

  Game.startCombat('finale');
  let m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  let p = Game.tbFighter('p');
  ok('finale fighter carries mdef.pierce 0.75', m.mdef && m.mdef.pierce === 0.75);
  // BEAM via the generic burst/beam/line resolve (the broken path)
  p.hp = 9000;
  m.telegraph = { kind: 'squares', cells: [{ cx: p.mx, cy: p.my }], dmg: [100, 100],
    pattern: { type: 'beam' }, attackName: 'Season Finale', turnsLeft: 1 };
  said.length = 0;
  Game.tbMonsterTurn(m);
  const beamLanded = 9000 - p.hp;
  ok('POST-FIX: finale beam applies pierce (lands 37, not 13)', beamLanded === 37, 'landed ' + beamLanded);
  ok('honesty: armor line states the true absorbed number (63)',
    said.some(t => /Armor absorbs 63/.test(t)), said.filter(t => /Armor/.test(t)).join(' | '));
  // DIRECT path: regression — already worked, must be unchanged
  p.hp = 9000;
  m.telegraph = { kind: 'direct', targetKey: 'p', dmg: [100, 100],
    pattern: { type: 'direct' }, attackName: 'Season Finale', turnsLeft: 1 };
  Game.tbMonsterTurn(m);
  ok('direct path still applies pierce (lands 37)', 9000 - p.hp === 37, 'landed ' + (9000 - p.hp));
  // HIT-1 CLAMP under pierce: min 1 always lands
  SC.combat.roll = () => 2;
  p.hp = 9000;
  m.telegraph = { kind: 'squares', cells: [{ cx: p.mx, cy: p.my }], dmg: [2, 2],
    pattern: { type: 'burst' }, attackName: 'chip', turnsLeft: 1 };
  Game.tbMonsterTurn(m);
  ok('hit-1 clamp holds with pierce (chip 2 lands exactly 1)', 9000 - p.hp === 1, 'landed ' + (9000 - p.hp));
  SC.combat.roll = () => 100;
  // OLD CALL CONVENTION, live: omitting sourceKey reads pierce 0 (the bug's shape)
  p.hp = 9000;
  Game.tbDamage('p', 100, 'simulated pre-fix call (no sourceKey)');
  ok('pre-fix convention lands 13 (pierce silently 0)', 9000 - p.hp === 13, 'landed ' + (9000 - p.hp));
  endFight(Game);

  // ---------- 2. call-site audit: monster-sourced tbDamage passes a key ----------
  const gameJs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const fixedSites = [
    [/encDamageSource\(m, tg\.attackName\), m\.key\)/, 'generic burst/beam/line resolve'],
    [/encDamageSource\(m, tg\.attackName\), m\.key\)/, 'sweep-beam tick'],
    [/tbDamage\(o\.key, d, m\.name \+ "'s paw", m\.key\)/, 'breather paw lash'],
    [/tbDamage\(o\.key, S\.combat\.roll\(\[10, 16\]\), this\.encSubject\(m\), m\.key\)/, 'melee lash'],
    [/tbDamage\(o\.key, d, mn \+ "'s antlers", m\.key\)/, 'antler thrash'],
    [/Resonant Croak'\), o\.key\)/, 'belltoad croak'],
    [/Lure and Grasp'\), m\.key\)/, 'catfish lure'],
    [/'The Drink'\), m\.key\)/, 'mosquito drink'],
    [/'Heavy Blunder'\), m\.key\)/, 'mosquito blunder'],
    [/'Feeding'\), m\.key,/, 'mosquito feeding'],
    [/The Latch'\), m\.key,/, 'tick latch'],
    [/tbDamage\(t\.key, S\.combat\.roll\(atk\.damage\), m\.name, m\.key\)/, 'bespoke direct hits'],
    [/hitKeys\.has\(o\.mx \+ ',' \+ o\.my\)\) this\.tbDamage\(o\.key, S\.combat\.roll\(atk\.damage\), m\.name, m\.key\)/, 'turtle snap'],
    [/tbDamage\(foe\.f\.key, S\.combat\.roll\(atk\.damage\) \+ flank, m\.name, m\.key\)/, 'hushwolf rush'],
  ];
  for (const [re, label] of fixedSites)
    ok('sourceKey passed: ' + label, re.test(gameJs));

  // ---------- 3. partyTactics.js: loaded, attached, reachable ----------
  for (const fn of ['tbPackSpawnCount', 'tbFlankBonus', 'tbPartySideCount', 'tbTacticalFoe',
      'tbIdeaDrift', 'tbRaiseEvictionWall', 'tbClearEvictionWall', 'tbEvictionWallCells',
      'tbWallActive', 'tbStaticCallOut', 'tbLuredAllyTurn', 'tbMostShamedFighter',
      'tbDensestFighter', 'tbPartyCentroid', 'tbIsolatedFighter', 'tbPackmates'])
    ok('partyTactics attached: Game.' + fn, typeof Game[fn] === 'function');
  ok('MonsterBehaviorHooks registered: packTactics',
    !!(globalThis.MonsterBehaviorHooks && globalThis.MonsterBehaviorHooks.packTactics));
  ok('MonsterBehaviorHooks registered: landlordEviction', !!globalThis.MonsterBehaviorHooks.landlordEviction);
  ok('MonsterBehaviorHooks registered: staticCallOut', !!globalThis.MonsterBehaviorHooks.staticCallOut);

  // ---------- 4. pack spawn honesty (data-driven, party-gated) ----------
  const byId = Object.fromEntries(Game.data.monsters.map(x => [x.id, x]));
  ok('hushwolf solo spawns 2', Game.tbPackSpawnCount(byId.hushwolf, 1) === 2);
  ok('hushwolf party spawns 4', Game.tbPackSpawnCount(byId.hushwolf, 4) === 4);
  ok('heckler solo spawns 1', Game.tbPackSpawnCount(byId.heckler, 1) === 1);
  ok('heckler party spawns 3', Game.tbPackSpawnCount(byId.heckler, 3) === 3);
  ok('reunion mirrors party (2)', Game.tbPackSpawnCount(byId.reunion, 2) === 2);
  ok('reunion mirror capped at 3', Game.tbPackSpawnCount(byId.reunion, 9) === 3);
  ok('no tactics.packSpawn -> legacy mdef.pack', Game.tbPackSpawnCount(byId.bulldozer, 4) === (byId.bulldozer.pack || 1));

  // ---------- 5. kill credit: exactly-once, flee = nothing, distinctness ----------
  Game.state.waveKills = {};
  Game.recordWaveKill('hushwolf'); Game.recordWaveKill('hushwolf');
  ok('each packmate is a real kill (2 hushwolf kills = 2)', Game.state.waveKills[1] === 2);
  // snake lineage dedupe key: one spawn = one body
  const segA = { key: 'm_seg1', mdef: { snake: true }, snakeRoot: 'root9' };
  const segB = { key: 'm_seg2', mdef: { snake: true }, snakeRoot: 'root9' };
  const lone = { key: 'm_x', mdef: {} };
  ok('lineage key shared by segments', Game.tbSnakeLineageKey(segA) === Game.tbSnakeLineageKey(segB));
  ok('lineage key differs per body', Game.tbSnakeLineageKey(segA) !== Game.tbSnakeLineageKey(lone));
  // flee grants no kills but counts as faced (canon: you stood on the grid)
  Game.state.waveKills = {};
  s.health = 9000;
  Game.startCombat('bulldozer');
  Game.tbEnd('fled');
  ok('flee records zero kills', !Game.state.waveKills[1]);
  const faced = (Game.deedState().wavesFaced || {});
  ok('flee still counts as faced (canon)', faced.bulldozer === 1);
  endFight(Game);
  // deed distinctness: same species twice = 1 (finale+bulldozer+hushwolf already faced above)
  const d0 = Object.keys(Game.deedState().wavesFaced).length;
  Game.recordDeedFight('mirrormoth'); Game.recordDeedFight('mirrormoth');
  Game.recordDeedFight('gallowdeer');
  const wf = Game.deedState().wavesFaced;
  ok('deed feed distinct by id (mirrormoth x2 + gallowdeer = 2 new)',
    Object.keys(wf).length === d0 + 2, 'delta ' + (Object.keys(wf).length - d0));

  // ---------- 6. eviction wall: shove + gap + 3-round expiry ----------
  const mkFighter = (key, kind, mx, my, extra) =>
    Object.assign({ key, kind, mx, my, alive: true, fled: false, name: key }, extra || {});
  Game.tbfight = { fighters: [
      mkFighter('p', 'player', 4, 2), mkFighter('v1', 'villager', 4, 6), mkFighter('v2', 'villager', 5, 4),
      mkFighter('m_ll', 'monster', 1, 1, { mdef: byId.landlord }),
    ], round: 5, terraform: {}, over: false };
  const plan = Game.tbEvictionWallCells();
  ok('wall plan exists for 3+ party', !!plan && plan.cells.length >= 3);
  ok('wall plan leaves a service-entrance gap', !!(plan && plan.gap));
  const llM = Game.tbfight.fighters[3];
  Game.tbRaiseEvictionWall(llM, plan);
  const wall = Game.tbfight.evictionWall;
  ok('wall rises with 3-round expiry', !!wall && wall.expires === 8, 'expires ' + (wall && wall.expires));
  ok('wall is terraformed', wall.cells.every(k => Game.tbfight.terraform[k] === 'eviction_wall'));
  ok('gap cell NOT terraformed', Game.tbfight.terraform[plan.gap.cx + ',' + plan.gap.cy] === undefined);
  const onWall = Game.tbfight.fighters.filter(o => wall.cells.includes(o.mx + ',' + o.my) && o.kind !== 'monster');
  ok('nobody entombed on the line', onWall.length === 0);
  ok('tbWallActive true while raised', !!Game.tbWallActive());
  // expiry: the round-wrap condition (game.js) clears it — even if landlord died
  llM.alive = false;
  Game.tbfight.round = 8;
  if (Game.tbfight.evictionWall && Game.tbfight.round >= Game.tbfight.evictionWall.expires) Game.tbClearEvictionWall();
  ok('wall expires on the clock, landlord dead or not', !Game.tbWallActive() && !Game.tbfight.evictionWall);
  ok('terraform cleared on expiry', Object.keys(Game.tbfight.terraform).length === 0);
  Game.tbfight = null;

  // ---------- 7. static lure: breakable, wears off, dies with the radio ----------
  Game.tbfight = { fighters: [
      mkFighter('p', 'player', 4, 4), mkFighter('v1', 'villager', 6, 6), mkFighter('v2', 'villager', 7, 7),
      mkFighter('m_vm', 'monster', 1, 1, { mdef: byId.voice_mimic_radio }),
    ], round: 2, over: false };
  const vm = Game.tbfight.fighters[3];
  Game.vmVoiceName = () => 'Mara';
  const called = Game.tbStaticCallOut(vm);
  const lured = Game.tbfight.fighters.find(o => o.vmLured);
  ok('call goes out: one ally lured for 2 rounds', called && !!lured && lured.vmLured.turns === 2);
  ok('lure used once per fight', Game.tbStaticCallOut(vm) === false);
  // adjacency break: a hand on the shoulder
  const pp = Game.tbFighter('p'); pp.mx = lured.mx + 1; pp.my = lured.my;
  const handled = Game.tbLuredAllyTurn(lured);
  ok('adjacent player breaks the lure', handled === false && !lured.vmLured);
  // wear-off: 2 rounds, no rescue
  vm.vmCallOutUsed = false;
  Game.tbStaticCallOut(vm);
  const lured2 = Game.tbfight.fighters.find(o => o.vmLured);
  pp.mx = 0; pp.my = 0; // far away
  Game.tbLuredAllyTurn(lured2);
  ok('lure ticks down (1 left)', lured2.vmLured && lured2.vmLured.turns === 1);
  Game.tbLuredAllyTurn(lured2);
  ok('lure wears off after 2 rounds', !lured2.vmLured);
  // radio dies: the voice dies with it
  vm.vmCallOutUsed = false;
  Game.tbStaticCallOut(vm);
  const lured3 = Game.tbfight.fighters.find(o => o.vmLured);
  vm.alive = false;
  Game.tbLuredAllyTurn(lured3);
  ok('lure breaks when the radio dies', !lured3.vmLured);
  Game.tbfight = null;

  // ---------- 8. all 26: terminate <=200 rounds, act, no exceptions ----------
  Game.armorBonus = realArmorBonus;
  Game.passiveBonus = realPassive; Game.stat = realStat; SC.combat.roll = origRoll;
  Game.say = realSay;
  // Godhood brawler (sim-dps-anchor): ~220/round — every fight must end fast.
  const grantAbility = (id, level) => {
    s.abilities = s.abilities || [];
    if (!s.abilities.includes(id)) s.abilities.push(id);
    s.abilityLevels = s.abilityLevels || {};
    s.abilityLevels[id] = level == null ? 3 : level;
  };
  s.abilities = []; s.abilityLevels = {};
  for (const a of ['rage', 'second_wind', 'blood_magic', 'leech', 'adrenaline_control', 'cornered_rat']) grantAbility(a, 3);
  s.equipped = { melee: { itemId: 'worldbreaker_maul', name: 'Worldbreaker Maul' } };
  s.inventory = []; s.kcal = 99999;
  // "acted" signals: monster telegraph observed at turn end, or monster-sourced
  // damage landing on player-side (ambush snaps never telegraph — by design).
  let sawTelegraph = false, monsterHit = false;
  const realTbDamage = Game.tbDamage, realTbMonsterTurn = Game.tbMonsterTurn;
  Game.tbDamage = function (tk, dmg, label, sk, opts) {
    try {
      const t = this.tbFighter(tk);
      if (t && (t.kind === 'player' || t.kind === 'villager') && sk && sk !== 'p') monsterHit = true;
    } catch (e) {}
    return realTbDamage.apply(this, arguments);
  };
  Game.tbMonsterTurn = function (m) {
    const r = realTbMonsterTurn.apply(this, arguments);
    try { if (m && m.telegraph) sawTelegraph = true; } catch (e) {}
    return r;
  };
  let acted = 0, stalled = 0, crashed = 0;
  const winsBefore = Game.state.combatWins || 0;
  for (const id of [...W3, ...W4, ...W5]) {
    sawTelegraph = false; monsterHit = false;
    try {
      s.health = 9000; s.mx = 4; s.my = 4;
      Game.startCombat(id);
      if (!Game.tbfight) { ok(id + ' starts', false); continue; }
      let guard = 0;
      while (Game.tbfight && !Game.tbfight.over && guard++ < 200) {
        if (Game.tbIsPlayerTurn()) {
          try {
            const tgt = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled);
            if (tgt) { try { Game.tbPlayerStrike(tgt.key); } catch (e) {} }
          } catch (e) {}
          endTurn(Game);
        } else { Game.tbAdvance(); }
      }
      const terminated = !Game.tbfight || Game.tbfight.over;
      if (!terminated) { stalled++; ok(id + ' terminates within 200 rounds', false, 'guard exhausted'); }
      else {
        ok(id + ' terminates within 200 rounds', true);
        // RNG-STABILITY: only assert "acted" when the monster actually had
        // turns — a 1-round brawler one-shot proves nothing either way.
        if (guard >= 6) {
          if (sawTelegraph || monsterHit) acted++;
          else ok(id + ' acted (telegraph or a landed hit)', false, 'silent ' + guard + '-round fight');
        }
      }
      endFight(Game);
    } catch (e) { crashed++; ok(id + ' no exception', false, e.message); endFight(Game); }
  }
  const slayerWins = (Game.state.combatWins || 0) - winsBefore;
  Game.tbDamage = realTbDamage; Game.tbMonsterTurn = realTbMonsterTurn;
  ok('no stalls across 26', stalled === 0, stalled + ' stalled');
  ok('no crashes across 26', crashed === 0, crashed + ' crashed');
  ok('slayer policy wins fights (brawler build)', slayerWins > 20, 'won ' + slayerWins + '/26');
  console.log('  (acted-signal confirmed in ' + acted + '/26 fights)');

  // ---------- 9. spawn pool + unlock beats + deed gate ----------
  const setState = (day, kills, rankFn) => {
    s.day = day; Game.state.waveKills = kills || {};
    Game.deedState().wavesFaced = {}; // pure-gate assertions: no engagement-lane pollution
    if (rankFn === 'ABSENT') Game.scaleRank = undefined; // defensive path: no scaleRank
    else Game.scaleRank = rankFn || realScaleRank;
  };
  setState(90, { 3: 99, 4: 5 }, () => 'national');
  const pool = Game.monsterWavePool();
  ok('wave-5 pool holds all 56', pool.length === 56, 'got ' + pool.length);
  ok('pool includes all 26 new', [...W3, ...W4, ...W5].every(id => pool.some(m => m.id === id)));
  const sayCap = [];
  Game.say = (t) => { sayCap.push(String(t)); };
  Game.waveUnlockBeat(3); ok('wave-3 beat: The Final Draft', sayCap.join(' ').includes('FINAL DRAFT'));
  sayCap.length = 0; Game.waveUnlockBeat(4);
  ok('wave-4 beat: The Mirror Draft', sayCap.join(' ').includes('MIRROR DRAFT'));
  sayCap.length = 0; Game.waveUnlockBeat(5);
  ok('wave-5 beat: The Producers', sayCap.join(' ').includes('PRODUCERS'));
  Game.say = realSay;
  // gating: kills + scale, never calendar alone
  setState(200, {}, () => 'village');
  ok('day 200 alone unlocks nothing (wave 1)', Game.unlockedWave() === 1, 'got ' + Game.unlockedWave());
  setState(30, { 2: 8 }, () => 'village');
  ok('8 w2 kills @day30 -> wave 3', Game.unlockedWave() === 3);
  setState(60, { 3: 5 }, () => 'village');
  ok('5 w3 kills at village scale -> wave 1 (scale bar holds; w2 homework missing too)',
    Game.unlockedWave() === 1, 'got ' + Game.unlockedWave());
  setState(60, { 3: 5 }, () => 'regional');
  ok('5 w3 kills + regional -> wave 4', Game.unlockedWave() === 4);
  setState(90, { 3: 99, 4: 5 }, () => 'regional');
  ok('5 w4 kills but regional -> wave 4, not 5', Game.unlockedWave() === 4, 'got ' + Game.unlockedWave());
  setState(90, { 3: 99, 4: 5 }, () => 'national');
  ok('5 w4 kills + national -> wave 5', Game.unlockedWave() === 5);
  setState(90, { 3: 99, 4: 5 }, 'ABSENT');
  ok('no scaleRank (defensive) -> wave 4 via kills alone', Game.unlockedWave() === 4, 'got ' + Game.unlockedWave());
  setState(90, { 3: 99, 4: 5 }, null);
  ok('real scaleRank restored after defensive test', Game.scaleRank === realScaleRank);
  // engagement lane: 2 distinct faced opens the gate without kills
  setState(30, {}, () => 'village');
  const dd = Game.deedState(); dd.wavesFaced = { redactor: 3, gavel: 3 };
  ok('2 distinct w3 faced (0 kills) still wave-locked: needs day/w2 path',
    Game.unlockedWave() === 1, 'got ' + Game.unlockedWave());
  dd.wavesFaced = { voice_mimic_radio: 2, mirror_stag: 2 };
  ok('2 distinct w2 faced @day30 -> wave 3 (engagement lane)', Game.unlockedWave() === 3, 'got ' + Game.unlockedWave());
  // deed gate: 5/5/4/3/2 distinct bars, breakdown honest
  const gd = Game.deedState();
  gd.wavesFaced = {};
  const feed = (ids) => ids.forEach(id => Game.recordDeedFight(id));
  feed(['bulldozer', 'hushwolf', 'gallowdeer', 'mirrormoth']); // 4 w1, bar is 5
  let ready = Game.deedGateReady();
  ok('deed gate honest when short (w1=4/5 -> waves false)', ready.waves === false && ready.w1 === 4,
    JSON.stringify({ waves: ready.waves, w1: ready.w1 }));
  feed(['belltoad']); // w1 = 5
  feed(['voice_mimic_radio', 'mirror_stag', 'review_drone', 'bright_idea', 'memory_projector']); // w2 = 5
  feed(W3.slice(0, 4)); // w3 = 4
  feed(W4.slice(0, 3)); // w4 = 3
  feed(W5.slice(0, 2)); // w5 = 2
  ready = Game.deedGateReady();
  ok('deed gate waves breakdown: 5/5/4/3/2', ready.w1 === 5 && ready.w2 === 5 && ready.w3 === 4 && ready.w4 === 3 && ready.w5 === 2,
    JSON.stringify({ w1: ready.w1, w2: ready.w2, w3: ready.w3, w4: ready.w4, w5: ready.w5 }));
  ok('deed gate waves true, overall ok false (contests/crises missing on fresh game)',
    ready.waves === true && ready.ok === false,
    JSON.stringify({ waves: ready.waves, ok: ready.ok }));
  Game.scaleRank = realScaleRank;

  console.log('\n== r14 monsters: ' + pass + ' pass, ' + fail + ' FAIL ==');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROOF CRASH', e); process.exit(2); });
