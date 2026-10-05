// New-player gaps + skill generalization. Usage: node scripts/test-newplayer-gaps.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/betrayal.js',
 'src/js/codex-people.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
async function freshGame() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game.state;
}
function sayCapture() {
  const msgs = [];
  Game.say = (m) => { msgs.push(String(m)); };
  return msgs;
}

(async () => {
  // ============ ITEM 1: BARREN HAVEN ============
  await freshGame();
  {
    // Haven grounds (outside) must have forageable plants now
    Game.state.scholar.insideHaven = false;
    const t = Game.tileAt(Game.map.px, Game.map.py);
    delete t.detail; // regen
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    let forageables = 0;
    for (const row of detail) for (const c of row) if (c === 'plant' || c === 'bush') forageables++;
    ok('Haven grounds has a teaching patch (plant/bush cells)', forageables >= 3, `found=${forageables}`);
  }
  {
    // newGame points outward: an NPC line + a journal note.
    // Use the real say (log-backed) — mock capture proved flaky in harness.
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    const logText = (Game.log || []).join('\n');
    ok('newGame: an NPC points past the treeline', /treeline/i.test(logText));
    const notes = (Game.state.codex.notes || []);
    ok('newGame: journal keeps the outward hint', notes.some(n => /treeline/i.test(n.text || '')));
  }

  // ============ ITEM 2: SYSTEM VOICE BEFORE DAY 7 ============
  await freshGame();
  {
    const msgs = sayCapture();
    Game.state.systemArrived = false;
    const pid = Game.data.plants.map(p => p.id).find(id => !Game.plantKnown(id));
    Game.identifyPlant(pid, 'test');
    const sysLines = msgs.filter(m => /SYSTEM:/i.test(m));
    ok('identifyPlant pre-System: NO System voice', sysLines.length === 0, sysLines.slice(0, 2).join(' | '));
    ok('identifyPlant pre-System: still announces the ID', msgs.some(m => /IDENTIFIED/i.test(m)));
  }
  {
    const msgs = sayCapture();
    Game.state.systemArrived = true;
    const pid = Game.data.plants.map(p => p.id).find(id => !Game.plantKnown(id));
    Game.identifyPlant(pid, 'test');
    ok('identifyPlant post-System: System voice allowed', msgs.some(m => /SYSTEM:/i.test(m)));
    Game.state.systemArrived = false;
  }

  // ============ ITEM 3: BARE "A" DESCRIPTORS ============
  await freshGame();
  {
    Game.state.systemArrived = false;
    const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
    let bad = 0;
    for (const vid of roster.slice(0, 6)) {
      const ref = Game.firstRef(vid);
      if (ref === 'A' || /^A[.?!,]?$/.test(ref)) bad++;
    }
    ok('firstRef never returns bare "A" for unknowns', bad === 0, `bad=${bad}`);
    // known people get first names
    const known = roster[0];
    Game.state.village.knownNames = Game.state.village.knownNames || {};
    Game.state.village.knownNames[known] = true;
    const refK = Game.firstRef(known);
    const v = Game.data.villagers.find(x => x.id === known) || Game.data.background_survivors.find(x => x.id === known) || {};
    ok('firstRef returns first name when known', refK === String(v.name || '').split(' ')[0], `got=${refK}`);
  }
  {
    // gossip about an unknown target: no '"A?' in the line
    Game.state.systemArrived = false;
    const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
    const a = roster[0], target = roster[1];
    let badLines = 0, checked = 0;
    for (let i = 0; i < 20; i++) {
      try {
        const g = Game.npcGossipAbout(a, target);
        if (g && g.line) { checked++; if (/"A\?|"A,|"A\./.test(g.line)) badLines++; }
      } catch (e) {}
    }
    ok(`gossip lines never truncate unknowns to "A" (checked ${checked})`, badLines === 0, `bad=${badLines}`);
  }

  // ============ ITEM 4: WEEK-ONE HUNGER ============
  await freshGame();
  {
    const msgs = sayCapture();
    const s = Game.state.scholar;
    s.kcal = 1100;
    s._hungerNoted = null;
    Game.tickAction(1);
    ok('hunger beat fires below 1200', msgs.some(m => /Hunger gnaws/i.test(m)), msgs.slice(-2).join(' | '));
  }
  {
    const msgs = sayCapture();
    const s = Game.state.scholar;
    s.kcal = 400;
    s._hungerNoted = null;
    Game.tickAction(1);
    ok('starving beat fires below 500', msgs.some(m => /stomach is a fist/i.test(m)));
  }
  {
    // curve: naive week-1 drops the bar by day 3 (lesson legible), survives the week
    const s = Game.state.scholar;
    const kcalByDay = [];
    for (let d = 1; d <= 7; d++) {
      s.mx = 4; s.my = 4;
      Game.map.px = 3; Game.map.py = 2;
      for (let f = 0; f < 3; f++) { try { Game.doAction('forage', {}); } catch (e) {} }
      try { Game.eat(); } catch (e) {}
      kcalByDay.push(Math.round(s.kcal));
      s.hydration = 100; s.energy = 100; // isolate food
      try { Game.endDay(); } catch (e) { break; }
      if (Game.over) break;
    }
    ok('week-1 curve: bar drops by day 3 (lesson lands)', kcalByDay[2] < 1500, `d3=${kcalByDay[2]}`);
    ok('week-1 curve: naive player survives the week on buffer+share', !Game.over, `died day ${kcalByDay.length}`);
  }

  // ============ ITEM 5: SKILL GENERALIZATION ============
  await freshGame();
  {
    // fishKnown: occupation gate (test char may or may not be a fisher — check both ways)
    const v = Game.data.villagers.find(x => x.id === Game.villagerId) || {};
    const occ = String(v.formerOccupation || '').toLowerCase();
    const occFisher = /fisher|fisherman|fishing|angler|sailor|deckhand/i.test(occ);
    ok(`fishKnown matches occupation (${v.formerOccupation})`, Game.fishKnown() === occFisher, `got=${Game.fishKnown()}`);
    // force-blind: strip occupation match by testing the learned flag path directly
    const wasWise = Game.state.codex.fishWise;
    Game.state.codex.fishWise = false;
    // (occupation still applies — so test the flag flip instead)
    Game.state.codex.fishWise = true;
    ok('fishKnown true when learned', Game.fishKnown());
    Game.state.codex.fishWise = wasWise;
    const occWood = /lumberjack|carpenter|forester|arborist|woodworker|cabin/i.test(occ);
    ok(`woodloreKnown matches occupation`, Game.woodloreKnown() === occWood || Game.state.codex.woodWise);
    Game.state.codex.woodWise = true;
    ok('woodloreKnown true when learned', Game.woodloreKnown());
    Game.state.codex.woodWise = false;
    // herbKnown/trackKnown read skills first (background grants), so the test
    // must account for background: blind only if no skill AND no occupation match
    const herbBlind = !Game.skillKnown('herbal_medicine', 1) && !Game.skillKnown('wound_care', 1)
      && !/nurse|medic|doctor|herbalist|pharmacist|paramedic|veterinarian|dentist|midwife|botanist/i.test(occ);
    ok('herbKnown blind iff no skill and no medical background', Game.herbKnown() === !herbBlind, `herbKnown=${Game.herbKnown()} occ=${occ}`);
    const trackBlind = !Game.skillKnown('track_read', 1) && !Game.skillKnown('animal_behavior', 1)
      && !/hunter|tracker|scout|guide|ranger|soldier/i.test(occ);
    ok('trackKnown blind iff no skill and no tracking background', Game.trackKnown() === !trackBlind, `trackKnown=${Game.trackKnown()} occ=${occ}`);
    Game.learnSkill('herbal_medicine', 1, 'test');
    ok('herbKnown true via herbal_medicine skill', Game.herbKnown());
    Game.learnSkill('track_read', 1, 'test');
    ok('trackKnown true via track_read skill', Game.trackKnown());
  }
  {
    // fishing works blind and knowledgeable — force a blind character
    await freshGame();
    const vv = Game.data.villagers.find(x => x.id === Game.villagerId) || {};
    vv.formerOccupation = 'accountant'; // definitely not a fisher
    Game.state.codex.fishWise = false;
    ok('test char is blind at fishing', !Game.fishKnown());
    const msgs = sayCapture();
    const s = Game.state.scholar;
    Game.map.px = 3; Game.map.py = 1;
    const t = Game.tileAt(3, 1); t.type = 'creek';
    let caught = 0;
    for (let i = 0; i < 30; i++) {
      s.kcal = 2000;
      Game.state.codex.fishWise = false; // pin blind: the learn-as-you-go flip is tested separately
      const before = (s.inventory || []).length;
      try { Game.fish(); } catch (e) {}
      if ((s.inventory || []).length > before) caught++;
    }
    ok('blind fishing sometimes catches (not disabled)', caught > 0 && caught < 15, `caught ${caught}/30`);
    // knowledgeable rate is higher
    Game.state.codex.fishWise = true;
    let caughtKnown = 0;
    for (let i = 0; i < 30; i++) { s.kcal = 2000; const before = (s.inventory || []).length; try { Game.fish(); } catch (e) {} if ((s.inventory || []).length > before) caughtKnown++; }
    ok('knowledgeable fishing catches more than blind', caughtKnown > caught, `blind=${caught} known=${caughtKnown}`);
    const blindMsg = msgs.some(m => /unimpressed|thrash/i.test(m));
    ok('blind fishing is honest about it', blindMsg);
  }
  {
    // woodlore: knowledgeable felling yields more (average over several rolls)
    const yields = { blind: 0, lore: 0 };
    const TRIALS = 20;
    for (const mode of ['blind', 'lore']) {
      for (let i = 0; i < TRIALS; i++) {
        await freshGame();
        Game.say = () => {};
        if (mode === 'lore') Game.state.codex.woodWise = true;
        const s = Game.state.scholar;
        s.mx = 4; s.my = 4;
        // tool-gating: felling needs an axe-class tool (Steve's design)
        s.inventory.push({ itemId: 'hatchet', id: 'hatchet', name: 'Hatchet', units: 1, kg: 1.5 });
        const t = Game.tileAt(Game.map.px, Game.map.py);
        delete t.detail;
        const detail = Game.genDetail(Game.map.px, Game.map.py);
        detail[4][5] = 'tree';
        try { Game.cutTree(5, 4); } catch (e) {}
        const w = (s.inventory || []).find(x => x.itemId === 'wood');
        yields[mode] += w ? w.units : 0;
      }
    }
    ok('woodlore yields more than blind cutting (avg)', yields.lore > yields.blind, `blind=${yields.blind} lore=${yields.lore} over ${TRIALS}`);
  }
  {
    // crafting: L1 blind attempt allowed (not blocked), L0 blocked
    await freshGame();
    Game.say = () => {};
    const msgs = sayCapture();
    Game.state.codex.recipes = {}; // backgrounds may grant recipes; pin to unknown
    Game.state.scholar.inventory.push({ material: 'vine', units: 5, name: 'Vine', kg: 0.1 }, { material: 'stick', units: 5, name: 'Stick', kg: 0.2 });
    const r0 = Game.craft('snare');
    ok('craft L0 (never seen): blocked with honest message', r0 === null && msgs.some(m => /don't know how/i.test(m)));
    Game.learnRecipe('snare', 1);
    msgs.length = 0;
    let successes = 0;
    for (let i = 0; i < 20; i++) {
      Game.state.scholar.inventory.push({ material: 'vine', units: 5, name: 'Vine', kg: 0.1 }, { material: 'stick', units: 5, name: 'Stick', kg: 0.2 });
      try { if (Game.craft('snare')) successes++; } catch (e) {}
    }
    ok('craft L1 (seen): attempt allowed, low success (blind)', successes > 0 && successes < 15, `successes=${successes}/20`);
    ok('craft L1: warns it\'s from memory', msgs.some(m => /only SEEN|from memory/i.test(m)));
  }
  {
    // medicine: herbKnown changes the eat outcome for medicinal plants
    await freshGame();
    const msgs = sayCapture();
    const s = Game.state.scholar;
    const med = Game.data.plants.find(p => p.medicinal);
    ok('medicinal plant exists in data', !!med);
    if (med) {
      Game.state.codex.plants[med.id] = { identifiedDay: 0, level: 1, harvests: 0, tastings: 0 };
      s.inventory.push({ plantId: med.id, units: 3, kcalEach: 50, spoilDay: 99, safe: true, kg: 0.1, name: med.name, edible: true });
      s.kcal = 0; s.health = 80;
      Game.learnSkill('herbal_medicine', 1, 'test');
      Game.eat();
      ok('herbKnown: medicinal eating heals more', s.health > 82, `health=${s.health}`);
      ok('herbKnown: message is deliberate', msgs.some(m => /deliberately|the way you were taught/i.test(m)));
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
