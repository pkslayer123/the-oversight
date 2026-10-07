// Proof test: animal chase narration — zero silent bolt turns + region common-knowledge (Steve 2026-10-07)
// Played chases, not unit stubs: drives Game.animalTurn through real bolt
// continuations across species and asserts EVERY turn with a live animal
// produces say() text — including the first edgeTurns++ turn and the turkey
// regroup turn. Also asserts scholar.originTags is populated at creation and
// that a native auto-knows `common` animals while an outsider doesn't.
// Usage: node scripts/test-chase-narration-20261007.js   (SEED env override)
// Seeded mulberry32, fixed default. Deterministic; run with >= 2 seeds.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261007', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// window stub for eval-time loads (equipment.js needs window); deleted before play.
global.window = global;
// drama.js touches document at load; minimal stub.
global.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
  head: { appendChild() {} }, body: { appendChild() {} },
};
const SKIP = ['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js'];
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const files = [];
const re = /<script src="(src\/js\/[^"?]+)[^"]*"/g;
let m;
while ((m = re.exec(html))) { if (!SKIP.includes(m[1]) && !files.includes(m[1])) files.push(m[1]); }
for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}
function logText() { return (Game.log || []).map(l => String(l.text || l)).join('\n'); }
function drainLog() { const t = logText(); Game.log = []; return t; }
function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }

async function freshGame(origin) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster(origin);
  Game.newGame(origin, null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = flatGrid;
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  return s;
}
function putAnimal(s, id, mx, my, extra) {
  const cfg = Game.encPreyCfg(id);
  const a = Object.assign({ id, mx, my, aware: 1, stamina: (cfg && cfg.stamina) || 10, pstate: 'bolt', edgeTurns: 0 }, extra || {});
  s.animal = a;
  return a;
}

// Bolt-capable species, one per behavior that can reach pstate 'bolt'.
const CHASE_SPECIES = [
  ['white_tailed_deer', 'wary'], ['cottontail_rabbit', 'skittish'],
  ['gray_fox', 'cunning'], ['wild_turkey', 'flock'],
  ['groundhog', 'alarmed'], ['creek_chub', 'aquatic'],
  ['bullfrog', 'aquatic_ambush'], ['crayfish', 'aquatic_defensive'],
  ['gray_squirrel', 'arboreal'], ['muskrat', 'architect'],
  ['american_woodcock', 'camouflaged'], ['raccoon', 'curious'],
  ['opossum', 'plays_dead'], ['black_bear', 'cautious'],
  ['american_alligator', 'patient'], ['bison', 'unpredictable'],
  ['american_mink', 'semiaquatic'], ['big_brown_bat', 'aerial'],
  ['great_horned_owl', 'ambush'], ['green_heron', 'wading'],
  ['eastern_chipmunk', 'burrowing'], ['eastern_coyote', 'pack'],
  ['prairie_dog', 'social'], ['gray_rat_snake', 'constrictor'],
];

(async () => {
  await Game.init();
  console.log('seed=' + SEED + ' modules=' + files.length);

  // ---- 1. ZERO SILENT BOLT TURNS: played chases across species ----
  // Only chase-state turns are asserted (bolt/regroup/taunt): a calm graze
  // turn is the default silence, not a transition. A chase turn that ends
  // in a calm-down narrates the transition (finding-1 scope).
  const CHASE_STATES = { bolt: 1, regroup: 1, taunt: 1 };
  const samples = [];
  let chaseTurns = 0, silentTurns = 0;
  for (const [id, beh] of CHASE_SPECIES) {
    const s = await freshGame('Columbus, Ohio');
    s.mx = 4; s.my = 4;
    putAnimal(s, id, 6, 4, beh === 'plays_dead' ? { floppedOnce: true } : null);
    drainLog();
    for (let t = 0; t < 14 && s.animal; t++) {
      const pre = s.animal.pstate;
      const before = Game.log.length;
      Game.animalTurn();
      const newLines = Game.log.slice(before).map(l => String(l.text || l));
      if (CHASE_STATES[pre]) {
        chaseTurns++;
        if (newLines.length === 0) {
          silentTurns++;
          console.log('SILENT: ' + id + ' turn ' + (t + 1) + ' started=' + pre + ' now=' + (s.animal && s.animal.pstate));
        }
        if (t === 0 && newLines.length) samples.push('[' + id + '] ' + newLines[0]);
      }
      drainLog();
      if ((s.health || 100) <= 0) break; // cornered retaliation ended the scholar; chase over
    }
  }
  ok('played ' + CHASE_SPECIES.length + ' species chases, ' + chaseTurns + ' chase-state turns', chaseTurns > 60, 'got ' + chaseTurns);
  ok('zero silent chase turns across all species', silentTurns === 0, silentTurns + ' silent');

  // ---- 2. FIRST EDGE TURN narrates (held-at-treeline, not a moving icon) ----
  // Deer pinned at the west edge, player 2 tiles off: bolt direction is off
  // the grid, so it can't move — but it's within notice range, so no
  // calm-down. The turn must read as a decision, not silence.
  {
    const s = await freshGame('Columbus, Ohio');
    s.mx = 2; s.my = 4;
    putAnimal(s, 'white_tailed_deer', 0, 4);
    drainLog();
    Game.animalTurn();
    const txt = drainLog();
    ok('first edgeTurns++ turn narrates (deer)', txt.length > 0, JSON.stringify(txt.slice(0, 80)));
    ok('edge-hold line reads as a decision, not movement', /treeline/i.test(txt), JSON.stringify(txt.slice(0, 100)));
    ok('edge-hold line is knowledge-gated vivid for a native', /tail flicking|measuring the gap/i.test(txt), JSON.stringify(txt.slice(0, 120)));
  }
  // Chase that ends in a calm-down narrates the transition too.
  {
    const s = await freshGame('Columbus, Ohio');
    s.mx = 7; s.my = 4;
    putAnimal(s, 'white_tailed_deer', 0, 4);
    drainLog();
    Game.animalTurn();
    const txt = drainLog();
    ok('bolt->graze calm-down narrates', /not following/i.test(txt), JSON.stringify(txt.slice(0, 100)));
  }
  // Outsider gets the plain fallback + descriptor, never the true name.
  {
    const s = await freshGame('Accra, Ghana');
    s.mx = 7; s.my = 4;
    putAnimal(s, 'white_tailed_deer', 0, 4);
    drainLog();
    Game.animalTurn();
    const txt = drainLog().toLowerCase();
    ok('outsider edge line never names the deer', !txt.includes('deer') && !txt.includes('white_tailed'), JSON.stringify(txt.slice(0, 100)));
  }

  // ---- 2b. FOX TAUNT hold turn narrates (toying at range) ----
  {
    const s = await freshGame('Columbus, Ohio');
    s.mx = 4; s.my = 4;
    putAnimal(s, 'gray_fox', 0, 4, { pstate: 'taunt', aware: 0.6 }); // dist 4: holds
    drainLog();
    Game.animalTurn();
    const txt = drainLog();
    ok('taunt hold turn narrates (fox)', /toying/i.test(txt), JSON.stringify(txt.slice(0, 100)));
  }

  // ---- 3. TURKEY REGROUP turn narrates (the gathering turn) ----
  {
    const s = await freshGame('Columbus, Ohio');
    s.mx = 4; s.my = 4;
    putAnimal(s, 'wild_turkey', 6, 4, { pstate: 'regroup', flutterHops: 0 });
    drainLog();
    Game.animalTurn();
    const txt = drainLog();
    ok('regroup turn narrates (turkey)', txt.length > 0, 'silent regroup turn');
    ok('regroup line names the window', /window holds/i.test(txt), JSON.stringify(txt.slice(0, 100)));
    ok('no duplicated wings-half-folded in regroup line', (txt.match(/wings half-folded/gi) || []).length <= 1, JSON.stringify(txt.slice(0, 140)));
  }

  // ---- 4. SCHOLAR CARRIES ORIGIN TAGS (finding 2, layer a) ----
  {
    const s = await freshGame('Columbus, Ohio');
    const tags = (s.originTags || []).map(t => String(t).toLowerCase());
    ok('scholar.originTags populated at creation', tags.length > 0, JSON.stringify(tags));
    ok("native tags include north_america", tags.includes('north_america'), JSON.stringify(tags));
    const s2 = await freshGame('Accra, Ghana');
    const tags2 = (s2.originTags || []).map(t => String(t).toLowerCase());
    ok('outsider tags lack north_america', !tags2.includes('north_america'), JSON.stringify(tags2));
  }

  // ---- 5. REGION COMMON-KNOWLEDGE: native knows, outsider doesn't ----
  {
    const s = await freshGame('Columbus, Ohio'); // 0 encounters: codex cleared
    ok('Columbus native auto-knows common deer', Game.encAnimalKnown('white_tailed_deer'));
    ok('Columbus native auto-knows common rabbit', Game.encAnimalKnown('cottontail_rabbit'));
    ok('Columbus native auto-knows common raccoon', Game.encAnimalKnown('raccoon'));
    ok('Columbus native auto-knows common turkey', Game.encAnimalKnown('wild_turkey'));
    ok('native does NOT auto-know desert javelina (honest gate)', !Game.encAnimalKnown('javelina'));
    const s2 = await freshGame('Accra, Ghana');
    ok('Accra outsider does NOT auto-know deer', !Game.encAnimalKnown('white_tailed_deer'));
    ok('Accra outsider does NOT auto-know rabbit', !Game.encAnimalKnown('cottontail_rabbit'));
  }

  // ---- 6. Knowledge-gated chase lines: vivid for known, plain for unknown ----
  {
    await freshGame('Columbus, Ohio'); // deer known via region
    const s = Game.state.scholar; s.mx = 4; s.my = 4;
    putAnimal(s, 'white_tailed_deer', 6, 4);
    const vivid = Game.encChaseText(s.animal);
    ok('known chase line is vivid + named', /white tail flashing/i.test(vivid), JSON.stringify(vivid.slice(0, 110)));
    await freshGame('Accra, Ghana'); // deer unknown
    const s2 = Game.state.scholar; s2.mx = 4; s2.my = 4;
    putAnimal(s2, 'white_tailed_deer', 6, 4);
    const plain = Game.encChaseText(s2.animal);
    ok('unknown chase line is plain + descriptor', !/deer/i.test(plain) && /white tail up/i.test(plain), JSON.stringify(plain.slice(0, 110)));
  }

  console.log('\n--- sample bolt lines (seed ' + SEED + ') ---');
  for (const l of samples.slice(0, 10)) console.log('  ' + l);
  console.log('\n=== ' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ') ===');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH: ' + (e && e.stack || e)); process.exit(2); });
