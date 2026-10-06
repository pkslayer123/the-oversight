// KNOWLEDGE FEEL: monster arc (Highbeam Deer / gallowdeer) — played as a player.
// One continuous first fight: ignorant contact -> windup dread -> survive
// discharge -> pattern learned -> observed coaching -> the kill -> slain.
// Then a second fight with knowledge. Measures FEEL, not just gates.
// Usage: node scripts/play-knowledge-feel-monster.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/corpses.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function drain() { const l = Game.log.join('\n'); Game.log.length = 0; return l; }
function show(title, log, maxLines) {
  const lines = log.split('\n').filter(l => l.trim());
  console.log(`\n### ${title} (${lines.length} lines)`);
  for (const l of lines.slice(0, maxLines || 14)) console.log('  | ' + l.slice(0, 230));
  if (lines.length > (maxLines || 14)) console.log(`  ... (${lines.length - (maxLines || 14)} more)`);
}
// move with fallbacks: try the target, then shorter/alternate steps
function tryMove(p, nx, ny) {
  const cands = [[nx, ny]];
  // fallbacks: shorter moves, then lateral alternatives
  for (let s = 2; s >= 1; s--) {
    const fy = p.my + Math.sign(ny - p.my) * s;
    if (fy !== ny) cands.push([p.mx, fy]);
  }
  cands.push([Math.min(8, p.mx + 1), p.my], [Math.max(0, p.mx - 1), p.my]);
  for (const [cx, cy] of cands) {
    if (cx < 0 || cx > 8 || cy < 0 || cy > 8 || (cx === p.mx && cy === p.my)) continue;
    const before = Game.log.length;
    const r = Game.tbPlayerMove(cx, cy);
    // tbPlayerMove says "No path there" on failure — detect via position change
    if (p.mx === cx && p.my === cy) { Game.log.length = before; return true; }
    Game.log.length = before;
    if (r) return true;
  }
  return false;
}
// evasive but STAYS IN THE ARENA: sidestep north/south at FULL speed (3),
// never touch the edge
function evasiveBot(p, deer) {
  if (!p || !p.alive || !deer || !deer.alive) return;
  const d = Math.max(Math.abs(deer.mx - p.mx), Math.abs(deer.my - p.my));
  if (d <= 2 && !p.acted) { Game.tbPlayerStrike(deer.key); return; }
  // committed lateral mover: 3 squares perpendicular to the beam
  const dir = (p.my % 2 === 0) ? -1 : 1;
  const ny = Math.min(7, Math.max(1, p.my + dir * 3));
  tryMove(p, p.mx, ny);
}
function driveTurn(botFn) {
  if (!Game.tbfight) return 'no-combat';
  const cur = Game.tbCurrent();
  if (!cur) return 'ended';
  if (cur.kind === 'player') {
    // GOD-MODE for the knowledge arc: this run measures TEXT/UI beats, not
    // combat balance (that's the combat worker's job). Heal the FIGHTER so
    // every knowledge beat fires live.
    try { const fp = Game.tbFighter('p'); if (fp && fp.hp < 400) fp.hp = 400; } catch (e) {}
    botFn(Game.tbFighter('p'), Game.tbfight.fighters.find(f => f.kind === 'monster'));
    if (Game.tbfight && Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn();
  } else { Game.tbAdvance(); }
  return Game.tbfight ? 'ok' : 'ended';
}
// kill bot: close in and strike relentlessly
function killBot(p, deer) {
  if (!p || !p.alive || !deer || !deer.alive) return;
  const d = Math.max(Math.abs(deer.mx - p.mx), Math.abs(deer.my - p.my));
  if (d <= 2 && !p.acted) { Game.tbPlayerStrike(deer.key); return; }
  if (!p.acted) {
    const nx = Math.min(8, Math.max(0, p.mx + Math.sign(deer.mx - p.mx)));
    const ny = Math.min(8, Math.max(0, p.my + Math.sign(deer.my - p.my)));
    if (!tryMove(p, nx, ny)) tryMove(p, p.mx, p.my + 1);
  }
}
function newFight() {
  const s = Game.state.scholar;
  s.health = 100; s.mx = 2; s.my = 4;
  s.monster = { id: 'gallowdeer', mx: 6, my: 4 };
  Game.startCombat('gallowdeer');
}

(async () => {
  await Game.init();
  console.log('=== KNOWLEDGE FEEL: MONSTER ARC (gallowdeer / Highbeam Deer) ===');
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100;
  {
    const tiles = Game.map.tiles; let best = null;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const t = tiles[y][x];
      if (!t || t.type === 'haven' || t.type === 'ruin') continue;
      const d = Math.abs(x - 3) + Math.abs(y - 3);
      if (d < 2) continue;
      if (!best || d > best.d) best = { x, y, d };
    }
    Game.map.px = best.x; Game.map.py = best.y;
    tiles[best.y][best.x].visited = true; tiles[best.y][best.x].revealed = true;
    s.insideHaven = false;
  }
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) {
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  Game.dayPart = 3;
  drain();

  console.log('\n--- BEAT 0: ignorant ---');
  console.log('display:', JSON.stringify(Game.monsterDisplayName('gallowdeer')));
  console.log('monsterKnown:', Game.monsterKnown('gallowdeer'), '| pattern known:', Game.tbPatternKnown('gallowdeer', 'Ocular Discharge'));

  // ================= FIGHT 1 (all beats live) =================
  console.log('\n=== FIGHT 1 (ignorant) ===');
  newFight();
  show('first-contact', drain(), 10);

  // BEAT 1b: capture the ignorant windup IMMEDIATELY (turn 0 — the windup is
  // only 1 player-turn long, so grab it before driving)
  {
    const d0 = Game.tbfight.fighters.find(f => f.kind === 'monster');
    const tg0 = d0 && d0.telegraph;
    console.log('\n--- BEAT 1b: IGNORANT WINDUP (turn 0) ---');
    console.log('telegraph state:', tg0 ? `turnsLeft=${tg0.turnsLeft} firing=${tg0.firing}` : 'none');
    console.log('beam-lane cells shown pre-knowledge:', Game.tbBeamLaneCells().size, '(want 0 — you see it freeze, not the lane)');
    console.log('cue shown:', JSON.stringify(String(Game.tbTelegraphCue(d0) || '').slice(0, 300)));
  }

  const beats = { discharge: 0, codexLine: null, observedAt: null };
  let guard = 0, phase = 'firing', botFn = evasiveBot;
  while (guard++ < 400) {
    const r = driveTurn(botFn);
    if (r !== 'ok') { console.log('fight 1 ended:', r, '| phase was:', phase); break; }
    for (const l of Game.log) {
      if (/Ocular Discharge!|lances FROM ITS EYES/.test(l)) beats.discharge++;
      const m = /📖 Codex: (.*)/.exec(l);
      if (m && !beats.codexLine) beats.codexLine = m[1];
    }
    const e = (Game.state.codex.monsters || {})['gallowdeer'] || {};
    const d = Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster');
    if (phase === 'firing' && beats.discharge > 0) {
      phase = 'learned';
      console.log('\n--- BEAT 2: DISCHARGE SURVIVED ---');
      console.log('player HP:', Math.round(s.health), '| pattern known now:', Game.tbPatternKnown('gallowdeer', 'Ocular Discharge'));
      console.log('pattern-learned moment:', JSON.stringify((beats.codexLine || '(none)').slice(0, 200)));
      show('log at discharge', drain(), 10);
    }
    if (phase === 'learned' && (e.stage === 'observed' || e.stage === 'slain')) {
      phase = 'observed';
      beats.observedAt = `roundsSeen=${e.roundsSeen}`;
      console.log('\n--- BEAT 3: OBSERVED ---', beats.observedAt, '| attacksSeen:', JSON.stringify(e.attacksSeen));
      console.log('pattern known by now:', Game.tbPatternKnown('gallowdeer', 'Ocular Discharge'));
      show('log at observed', drain(), 10);
    }
    // only go for the kill AFTER the pattern is learned (a real fight takes
    // 4-6 spear hits; the deer always gets its discharge off — don't
    // short-circuit the arc the way an early wound would)
    if (phase === 'observed' && d && Game.tbPatternKnown('gallowdeer', 'Ocular Discharge')) { d.hp = Math.min(d.hp, 15); phase = 'killing'; botFn = killBot; console.log('\n(pattern learned — wounding deer to land the kill for the slain beat)'); }
    if (phase === 'killing' && d && !d.alive) { phase = 'dead'; break; }
  }
  show('BEAT 4: kill log', drain(), 18);
  const e4 = (Game.state.codex.monsters || {})['gallowdeer'] || {};
  console.log('stage after fight 1:', e4.stage, '| roundsSeen:', e4.roundsSeen);
  console.log('display now:', JSON.stringify(Game.monsterDisplayName('gallowdeer')));
  console.log('meat in pack:', JSON.stringify(s.inventory.filter(i => /carcass|meat/i.test(i.name || '')).map(i => Game.itemDisplayName(i))));

  // ================= FIGHT 2 (knowledgeable) =================
  console.log('\n=== FIGHT 2 (knowledgeable) ===');
  newFight();
  show('first contact, knowledgeable', drain(), 10);
  guard = 0; let saw = false;
  while (guard++ < 80 && !saw) {
    const r = driveTurn(evasiveBot);
    if (r !== 'ok') { console.log('fight 2 ended:', r); break; }
    const d = Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster');
    if (d && d.telegraph && d.telegraph.turnsLeft > 0 && d.telegraph.firing <= 0) {
      saw = true;
      console.log('beam-lane cells shown WITH knowledge:', Game.tbBeamLaneCells().size, '(want >0)');
      console.log('knowledgeable windup cue:', JSON.stringify(String(Game.tbTelegraphCue(d) || '').slice(0, 300)));
      show('log lines at knowledgeable windup', Game.log.join('\n').split('\n').slice(-6).join('\n'), 8);
    }
  }
  try { Game.tbEnd('fled'); } catch (e) {}
  drain();

  // ================= BEAT 6: village naming =================
  console.log('\n=== BEAT 6: VILLAGE NAMING ===');
  const e6 = Game.ensureMonsterEntry('gallowdeer');
  console.log('start: namingKicked:', !!e6.namingKicked, '| proposals:', Object.keys(e6.proposals || {}).length, '| villageName:', JSON.stringify(e6.villageName || null));
  for (let day = 0; day < 6; day++) {
    try { Game.spreadMonsterNews(); } catch (e) {}
    try {
      const ev = Game.state.codex.monsters['gallowdeer'];
      if (ev && ev.namingKicked && !ev.villageName) {
        for (const rid of (Game.state.village.roster || []).slice(0, 10)) {
          if (!ev.proposals[rid] && Math.random() < 0.7) ev.proposals[rid] = Game.generateMonsterName('gallowdeer', rid);
        }
      }
    } catch (e) {}
    try { Game.monsterNamingCheck('gallowdeer'); } catch (e) {}
    const evb = (Game.state.codex.monsters || {})['gallowdeer'] || {};
    if (evb.villageName) { console.log(`day ${day + 1}: named "${evb.villageName}"`); break; }
  }
  const e6b = (Game.state.codex.monsters || {})['gallowdeer'] || {};
  console.log('end: namingKicked:', !!e6b.namingKicked, '| proposals:', Object.keys(e6b.proposals || {}).length, '| villageName:', JSON.stringify(e6b.villageName || null));
  console.log('display after naming:', JSON.stringify(Game.monsterDisplayName('gallowdeer')));
  show('naming log', drain(), 10);
  console.log('\n=== MONSTER ARC DONE ===');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
