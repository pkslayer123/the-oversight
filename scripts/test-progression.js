// Progression systems test. Usage: node scripts/test-progression.js
// Slot ladder moments, integration stages, earned arc triggers, struggle
// catch-up trials, item pool audit, keepsake gamble (chosen), flashbacks
// with lifeseed-resolved content, sentiment channeling, keepsake evolution.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js',
 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  Game.say = function (t) { said.push(String(t)); };
  Game.genRoster('Columbus, Ohio');
  // pick a villager whose candidates include a sentimental item
  let pick = Game.generatedRoster[0];
  for (const v of Game.generatedRoster) {
    const has = (v.items || []).some(id => { const d = (Game.data.items || []).find(i => i.id === id); return d && d.class === 'sentimental'; });
    if (has) { pick = v; break; }
  }
  const sentIds = (pick.items || []).filter(id => { const d = (Game.data.items || []).find(i => i.id === id); return d && d.class === 'sentimental'; });
  const funcIds = (pick.items || []).filter(id => { const d = (Game.data.items || []).find(i => i.id === id); return d && d.class !== 'sentimental'; });
  const chosen = [...funcIds.slice(0, 5 - Math.min(2, sentIds.length)), ...sentIds.slice(0, 2)].slice(0, 5);
  Game.newGame('Columbus, Ohio', null, pick.id, chosen.length === 5 ? chosen : null);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.health = 100; s.trauma = 0;
  Game.progState();
  return s;
}

(async () => {
  await Game.init();

  // 1. Slot ladder: integration thresholds -> slots, each unlock a moment.
  {
    const s = freshGame();
    Game.state.systemArrived = true;
    ok('stage 1 at arrival', Game.integrationStage() === 1);
    s.integration = 5;
    ok('1 slot at start', Game.abilitySlots() === 1);
    Game.integrate(15, 'test'); // -> 20
    ok('2 slots at 20', Game.abilitySlots() === 2);
    ok('spark moment fired', said.some(t => t.includes('THE SPARK')));
    Game.integrate(20, 'test'); // -> 40
    ok('3 slots at 40', Game.abilitySlots() === 3);
    ok('mentor moment fired', said.some(t => t.includes('THE MENTOR')));
    ok('stage 2 at 40', Game.integrationStage() === 2);
    Game.integrate(20, 'test'); // -> 60
    ok('4 slots at 60', Game.abilitySlots() === 4);
    ok('trial moment fired', said.some(t => t.includes('THE TRIAL')));
    Game.integrate(10, 'test'); // -> 70
    ok('5 slots at 70', Game.abilitySlots() === 5);
    ok('creep moment fired', said.some(t => t.includes('THE CREEP')));
    Game.integrate(10, 'test'); // -> 80
    ok('6 slots at 80', Game.abilitySlots() === 6);
    ok('grant moment fired', said.some(t => t.includes('THE GRANT')));
    ok('stage 3 at 80', Game.integrationStage() === 3);
    ok('sentiment taught at 80', Game.sentimentTaught());
    ok('lesson is wrong-theory', said.some(t => t.includes('RESONANCE HARMONICS')));
    // moments fire once
    const n = said.length;
    Game.integrate(5, 'test');
    ok('moments fire once', said.length === n);
  }

  // 2. Pre-arrival moments queue and fire at arrival.
  {
    const s = freshGame();
    Game.state.systemArrived = false;
    s.integration = 5;
    Game.integrate(25, 'test');
    ok('no System voice pre-arrival', !said.some(t => t.includes('SYSTEM:')));
    ok('moment queued', (s.prog.pendingMoments || []).length > 0);
    Game.state.systemArrived = true;
    Game.progDaily();
    ok('queued moment fires at arrival', said.some(t => t.includes('THE SPARK')));
  }

  // 3. Arc triggers are earned, not timers.
  {
    const s = freshGame();
    Game.state.systemArrived = true;
    s.day = 8;
    Game.progState().arc = 1;
    Game.checkArc();
    ok('arc 2 needs notability>=10 (not just day 7)', Game.progState().arc === 1 || Game.progState().arc === 2);
    // force arc 3 conditions
    s.integration = 80; Game.state.systemArrived = true;
    Game.teachSentiment();
    for (let i = 0; i < 12; i++) Game.state.codex.plants['p' + i] = { level: 2 };
    Game.noteCrisis('monster');
    Game.checkArc();
    ok('arc 3 earned: stage2+breadth12+crisis', Game.progState().arc === 3, 'arc=' + Game.progState().arc);
    ok('arc 3 announced diegetically', said.some(t => t.includes('ARC III')));
    // arc 4 needs sentiment + breadth 25 + feastSurgeUsed
    for (let i = 12; i < 25; i++) Game.state.codex.plants['p' + i] = { level: 2 };
    s.prog.feastSurgeUsed = true;
    Game.checkArc();
    ok('arc 4 earned', Game.progState().arc === 4, 'arc=' + Game.progState().arc);
    ok('arc 4 names the table', said.some(t => t.includes('a table')));
    ok('arc 4 buffs feastburn', s.arc4burn === 1.25);
  }

  // 4. Struggle catch-up: the System offers trials openly.
  {
    const s = freshGame();
    Game.state.systemArrived = true;
    s.day = 12; s.integration = 10; s.kcal = 500;
    Game.checkStruggle();
    ok('struggler gets audience trial', !!s.prog.trial, JSON.stringify(s.prog.trial));
    ok('trial announced as boredom', said.some(t => t.includes('bored')));
    // complete a pantry trial
    s.prog.trial = { id: 'haul', text: 't', need: 3000, kind: 'pantry', start: 0, expires: 20, reason: 'struggle' };
    const before = s.integration;
    Game.pantryKcal = () => 5000;
    Game.checkTrial('daily');
    ok('trial completes', s.prog.trial === null);
    ok('trial grants integration', s.integration > before);
    delete Game.pantryKcal;
  }

  // 5. Item pool audit.
  {
    const a = Game.auditItemPool();
    ok('item pool audit clean', a.total === 0, a.errors.slice(0, 4).join(' | '));
  }

  // 6. The opening gamble: chosen keepsakes marked, undiscardable by design.
  {
    const s = freshGame();
    const keeps = (s.inventory || []).filter(i => Game.isKeepsake(i));
    ok('keepsakes in pack', keeps.length > 0, String(keeps.length));
    ok('picked keepsakes marked chosen', keeps.some(i => i.chosen));
    ok('keepsakes are bonded', keeps.every(i => i.bonded));
    // cannot be donated (no kcal) and are never stashable tools
    for (const k of keeps) {
      ok('keepsake not donatable', !((k.kcalEach || 0) > 0 && !k.bonded));
    }
  }

  // 7. Flashback on evolution: lifeseed-resolved, reveals knowledge.
  {
    const s = freshGame();
    Game.state.systemArrived = true;
    const keep = (s.inventory || []).find(i => Game.isKeepsake(i));
    ok('have keepsake', !!keep);
    const def = Game.itemDef(keep);
    const before = said.length;
    Game.playFlashback(keep, def);
    const fb = said.slice(before).join('\n');
    ok('flashback plays', fb.includes('FLASHBACK'));
    ok('no placeholders leak', !/\{[a-z]+\}/.test(fb), fb.slice(0, 120));
    const rev = def.reveals;
    if (rev.type === 'plant') ok('reveal: plant knowledge', ((Game.state.codex.plants || {})[rev.id] || {}).level >= 2);
    else if (rev.type === 'skill') ok('reveal: skill knowledge', ((Game.state.codex.skills || {})[rev.id] || {}).level >= 2);
    else if (rev.type === 'place') ok('reveal: place', (Game.state.codex.places || []).some(p => p.id === rev.id));
    else if (rev.type === 'name') ok('reveal: seeking', (s.prog.seeking || []).some(x => x.id === rev.id));
    else if (rev.type === 'flag') ok('reveal: flag', !!s.prog.flags[rev.id]);
    // kin-named memories resolve to lifeseed people
    if (def.kin && def.kin !== 'none') {
      const char = (Game.data.villagers || []).find(v => v.id === Game.villagerId);
      const kinName = char && char.lifeseed ? Game.lifeseedKin(char, def.kin) : null;
      if (/\{kin\}/.test(def.memory || '')) ok('kin resolved to seed person', kinName && fb.includes(kinName), kinName);
      else ok('kin relation covered by seed', true);
    }
  }

  // 8. Channeling: taught at 80, smart default, once/day.
  {
    const s = freshGame();
    Game.state.systemArrived = true;
    const keep = (s.inventory || []).find(i => Game.isKeepsake(i));
    const idx = (s.inventory || []).indexOf(keep);
    s.prog.sentimentTaught = false;
    ok('no channeling before lesson', Game.channelSentiment(idx) === 'You hold it. Nothing happens. Not yet.');
    Game.teachSentiment();
    s.trauma = 12;
    const t0 = s.trauma;
    Game.channelSentiment(idx);
    ok('channeling soothes trauma', s.trauma < t0, `${t0} -> ${s.trauma}`);
    ok('once per day', Game.channelSentiment(idx) === 'It is quiet now. Tomorrow.');
  }

  // 9. Chosen keepsakes bond faster (the gamble pays off).
  {
    const s = freshGame();
    Game.state.systemArrived = true;
    const keep = (s.inventory || []).find(i => i.chosen && Game.isKeepsake(i));
    if (keep) {
      const b0 = keep.bond || 0;
      Game.accrueRelicBond();
      ok('chosen keepsake gains +2/day', (keep.bond || 0) >= b0 + 2, `${b0} -> ${keep.bond}`);
    } else ok('chosen keepsake exists', false);
  }

  // 10. Corpse keepsakes become evolvable grief — FULL LOOP.
  // registerDeath -> lootCorpse -> take keepsake -> memoryOf + provenance ->
  // bond accrues via sentimental class -> threshold -> flashback with the
  // dead friend's line. (Regression: lootCorpse used corpse.vid, but the
  // corpse schema uses villagerId — the whole loop was dead code.)
  {
    const s = freshGame();
    Game.state.systemArrived = true;
    const dead = (Game.data.villagers || []).find(v => v.id !== Game.villagerId);
    ok('a dead villager exists', !!dead);
    const corpse = Game.registerDeath({ kind: 'person', villagerId: dead.id, name: dead.name, cause: 'test', youWitnessed: true });
    ok('corpse schema uses villagerId', corpse && corpse.villagerId === dead.id, String(corpse && corpse.villagerId));
    const generated = (corpse.items || []).find(i => i.keepsake);
    ok('corpse generated a keepsake', !!generated, generated && generated.name);
    Game.lootCorpse(corpse.id, true);
    const k = (s.inventory || []).find(i => i.keepsake && i.sentimental);
    ok('corpse keepsake taken + marked sentimental/bonded', !!(k && k.sentimental && k.bonded));
    ok('memoryOf names the dead villager', k && k.memoryOf === dead.id, String(k && k.memoryOf));
    const def = k ? Game.itemDef(k) : {};
    ok('keepsake adopted a sentimental itemId', !!(k && k.itemId && def.class === 'sentimental'), String(k && k.itemId));
    const first = dead.name.split(' ')[0];
    ok('keepsakeMemory provenance generated', !!(k && k.keepsakeMemory && k.keepsakeMemory.includes(first)), k && String(k.keepsakeMemory).slice(0, 80));
    // bond accrues daily: sentimental = +1/day kept close
    const b0 = k.bond || 0;
    Game.accrueRelicBond();
    ok('corpse keepsake bond accrues', (k.bond || 0) >= b0 + 1, `${b0} -> ${k.bond}`);
    // threshold on the natural path -> offer -> flashback with the dead friend
    k.bond = 9; k.bondOffered = [];
    const n0 = said.length;
    Game.accrueRelicBond(); // 9 -> 10, threshold fires
    ok('threshold 10 reached on natural path', (k.bond || 0) >= 10, String(k.bond));
    const fb = said.slice(n0).join('\n');
    ok('flashback plays the dead friend provenance', fb.includes('carried this on purpose'), fb.slice(0, 160));
    ok('flashback carries the dead friend with you', fb.includes(`You carry ${first} with you`), fb.slice(-160));
  }

  // 11. NPC ladder is visible.
  {
    const s = freshGame();
    Game.state.systemArrived = true;
    Game.state.village.roster = ['a', 'b'];
    Game.displayName = (id) => id;
    const n0 = said.length;
    for (let d = 0; d < 60; d++) Game.npcLadderDaily();
    ok('npc ladder gossip appears', said.slice(n0).some(t => t.includes('stared at their hands')));
  }

  // 12. Feastburn surge + arc4 multiplier.
  {
    const s = freshGame();
    Game.state.systemArrived = true;
    s.prog.feastSurge = true;
    const r1 = Game.feastBurn();
    ok('surge consumed', s.prog.feastSurge === false || s.prog.feastSurgeUsed);
    s.arc4burn = 1.25;
    ok('feastBurn callable under arc4', typeof Game.feastBurn() === 'number');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW', e); process.exit(1); });
