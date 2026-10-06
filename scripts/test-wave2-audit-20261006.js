// WAVE-2 GAP AUDIT (Steve 2026-10-06): score each wave-2 monster against the
// 7 Highbeam-Deer criteria behaviorally, via real fights driven by the
// debug scenarios:
//   1. distinct telegraph cue text (not generic fallback)
//   2. attack pattern declared on grid (cells / targetKey)
//   3. windup -> action -> recovery phases, visible (beamPhase transitions)
//   4. audio cues fired at declare + resolve
//   5. knowledge gating: knownCue coaching ONLY when pattern learned
//   6. armor/resistances present and applied
//   7. distinct from wave-mates with same pattern type (cue similarity +
//      distinct phase/duration tells)
//   PLUS: monsters-sent-to-fight — it must attack, never idle-disengage.
// Run: node scripts/test-wave2-audit-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const MDEFS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

const W2 = [
  ['voice_mimic_radio', 'static'], ['mirror_stag', 'griefcounselor'],
  ['review_drone', 'reviewdrone'], ['camera_swarm', 'influencer'],
  ['hype_horn', 'motivationalspeaker'], ['service_mimic', 'customerservice'],
  ['contract_golem', 'termsconditions'], ['delegate_beast', 'middlemanager'],
  ['bright_idea', 'inspiration'], ['memory_projector', 'nostalgia'],
];

function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function P() { return Game.tbFighter('p'); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
const saidLines = [];
let firedAudio = [];

async function newFight(id, scenario) {
  saidLines.length = 0; firedAudio = [];
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.dayPart = 3; // night: all scenarios fire
  Game.state.scholar.health = 500;
  Game.debugScenario(scenario);
  const s = Game.state.scholar; s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.monsters = {}; // UNKNOWN baseline
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  if (!Game.tbfight) return null;
  const pf = P(); pf.hp = pf.maxHp = 9000;
  const m = Game.tbfight.fighters.find(f => f.kind === 'monster' && (f.mdef || {}).id === id);
  if (m) { m.hp = m.maxHp = 90000; }
  // harness placement: player 3 tiles left of the monster (game code untouched)
  const pl = P(); pl.mx = Math.max(0, m.mx - 3); pl.my = m.my;
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
  return m;
}
function learnPattern(id) {
  const d = MDEFS.find(m => m.id === id);
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  const c = Game.state.codex.monsters[id] || (Game.state.codex.monsters[id] = {});
  c.patterns = c.patterns || {};
  c.patterns[d.attack.name] = 'audit-learned';
}

(async () => {
  await Game.init();
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { saidLines.push(String(t)); return origSay(t); };
  Game.audio = new Proxy({}, { get: (t, k) => (...a) => { firedAudio.push(String(k)); } });
  const origAudioEvent = Game.audioEvent.bind(Game);
  Game.audioEvent = (name, opts) => { firedAudio.push(String(name)); return origAudioEvent(name, opts); };

  const report = [];
  const unknownCues = {};

  for (const [id, scenario] of W2) {
    const d = MDEFS.find(m => m.id === id);
    const r = { id, name: d.name, pattern: (d.attack.pattern || {}).type };
    const m = await newFight(id, scenario);
    if (!m) { console.log('  FAIL fight never started: ' + id); fail++; continue; }
    // Drive until first declare (telegraph appears) or 30 turns.
    let declared = false, turns = 0, firstTelegraph = null, phasesSeen = [];
    for (turns = 0; turns < 30 && !declared; turns++) {
      endTurn();
      if (!Game.tbfight || Game.tbfight.over) break;
      if (m.beamPhase && !phasesSeen.includes(m.beamPhase)) phasesSeen.push(m.beamPhase);
      if (m.telegraph && !firstTelegraph) {
        declared = true; firstTelegraph = m.telegraph;
        r.declarePhase = m.beamPhase; r.turnsLeft = m.telegraph.turnsLeft;
      }
    }
    r.declaredInTurns = declared ? turns : -1;
    // Criterion 2: grid declaration
    if (declared) {
      const tg = firstTelegraph;
      r.tgKind = tg.kind; r.cells = (tg.cells || []).length;
      r.targetKey = !!tg.targetKey; r.patternType = (tg.pattern || {}).type;
      r.cueUnknown = Game.tbTelegraphCue(m);
      r.audioAtDeclare = firedAudio.slice();
    } else if (id === 'service_mimic') {
      // rush: no telegraph by design. Capture the rush behavior instead.
      r.cueUnknown = '(no telegraph by design — rush)';
    }
    // Keep driving: full windup -> action -> recovery cycle, resolve damage.
    const p0hp = P().hp;
    const audioAtStart = firedAudio.length;
    for (let i = 0; i < 40 && Game.tbfight && !Game.tbfight.over; i++) {
      endTurn();
      if (m.beamPhase && !phasesSeen.includes(m.beamPhase)) phasesSeen.push(m.beamPhase);
    }
    r.phasesSeen = phasesSeen;
    r.audioLater = firedAudio.slice(audioAtStart);
    r.dmgToPlayer = p0hp - P().hp;
    r.stillAlive = m.alive;
    unknownCues[id] = r.cueUnknown || '';

    // Criterion 5: knowledge gating — re-run known.
    await newFight(id, scenario);
    learnPattern(id);
    const m2 = Game.tbfight.fighters.find(f => f.kind === 'monster' && (f.mdef || {}).id === id);
    m2.hp = m2.maxHp = 90000;
    let cueKnown = null;
    for (let i = 0; i < 30 && !cueKnown; i++) {
      endTurn();
      if (m2.telegraph) cueKnown = Game.tbTelegraphCue(m2);
      if (!Game.tbfight || Game.tbfight.over) break;
    }
    r.cueKnown = cueKnown;
    report.push(r);
  }

  // ===== SCORECARD =====
  console.log('\n======== WAVE-2 SCORECARD ========\n');
  for (const r of report) {
    const d = MDEFS.find(m => m.id === r.id);
    const atk = d.attack || {}, pat = atk.pattern || {}, enc = d.encounter || {};
    console.log(`## ${r.name} (${r.id}) — pattern ${r.pattern}`);
    // 1. distinct cue
    const generic = /It shifts\. Something is coming/.test(r.cueUnknown || '');
    console.log(`  1. cue: ${r.cueUnknown ? (generic ? 'GENERIC FALLBACK' : 'distinct') : 'n/a (rush)'} — "${(r.cueUnknown || '').slice(0, 90)}…"`);
    // 2. grid
    console.log(`  2. grid: declared@turn ${r.declaredInTurns}, kind=${r.tgKind || 'none'}, cells=${r.cells || 0}, targetKey=${!!r.targetKey}, windup=${r.turnsLeft}`);
    // 3. phases
    console.log(`  3. phases: data=[${(enc.phases || []).join('→')}] seen=[${(r.phasesSeen || []).join('→')}]`);
    // 4. audio
    const au = (r.audioAtDeclare || []).concat(r.audioLater || []);
    const encAudio = Object.keys(enc).filter(k => /audio/i.test(k)).map(k => enc[k]);
    console.log(`  4. audio: fired=[${[...new Set(au)].join(',')}] dataHooks=[${encAudio.join(',')}]`);
    // 5. gating
    const kc = enc.knownCue, kt = enc.knownTactics;
    let gate = 'n/a (no knownCue)';
    if (kc) {
      const leakU = (r.cueUnknown || '').includes(kc);
      const showK = (r.cueKnown || '').includes(kc);
      gate = `knownCue: leak-in-unknown=${leakU}, shows-when-known=${showK}`;
      if (kt) gate += ` | knownTactics: leak=${(r.cueUnknown || '').includes(kt)}, known=${(r.cueKnown || '').includes(kt)}`;
    }
    console.log(`  5. gate: ${gate}`);
    // 6. armor/resist
    console.log(`  6. armor=${d.armor}, resistances=${JSON.stringify(d.resistances)}`);
    // fight law
    console.log(`  LAW: dealt ${r.dmgToPlayer} dmg to player, monster alive=${r.stillAlive}`);
    console.log('');
  }
  // 7. distinctness: pairwise cue similarity (unknown cues)
  console.log('== cue uniqueness (unknown cue Jaccard bigrams, flag >0.4) ==');
  const toks = id => new Set((unknownCues[id] || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(w => w.length > 3));
  for (let i = 0; i < report.length; i++) for (let j = i + 1; j < report.length; j++) {
    const a = toks(report[i].id), b = toks(report[j].id);
    if (!a.size || !b.size) continue;
    const inter = [...a].filter(x => b.has(x)).length;
    const jac = inter / (a.size + b.size - inter);
    if (jac > 0.4) console.log(`  SIMILAR: ${report[i].id} ~ ${report[j].id} (${jac.toFixed(2)})`);
  }
  console.log(`\nasserts: pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})();
