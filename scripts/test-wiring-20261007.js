// Wiring proof test (Steve 2026-10-07): lockon re-lock at fire time,
// ambush-zone arming beat, audio emitters for knowledge reveals.
// Source/static assertions over src/js/game.js. Run: node scripts/test-wiring-20261007.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'js', 'game.js');
const src = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
// body of a Game method: text between "name() {" (first occurrence) and the
// next method definition at the same indent.
function methodBody(startMarker, endHint) {
  const s = src.indexOf(startMarker);
  if (s < 0) return null;
  const rest = src.slice(s);
  const next = rest.search(/\n    [A-Za-z_$][\w$]*\(/);
  return next > 0 ? rest.slice(0, next) : rest;
}

// --- (a) lockon re-lock at fire time ---
const lockonBranch = src.indexOf("} else if (ptype === 'lockon') {");
check('lockon branch exists in resolve path', lockonBranch > 0);
const lockonRegion = lockonBranch > 0 ? src.slice(lockonBranch, lockonBranch + 1600) : '';
check('re-lock re-calls patternCells with locked target current square',
  lockonRegion.includes('patternCells(tg.pattern, m.mx, m.my, locked.mx, locked.my)'));
check('re-lock updates tg.aim/tg.aimKey to fire-time square',
  lockonRegion.includes('tg.aim = { x: locked.mx, y: locked.my }') &&
  lockonRegion.includes('tg.aimKey = locked.key'));
check('re-lock refreshes warned cells (player-visible)',
  lockonRegion.includes('this.warnCells(tg.cells, 1)'));
check('re-lock falls back to nearestEnemy when locked target is gone',
  lockonRegion.includes('nearestEnemy(f.fighters, m)'));
check('declare pins aimKey for lockon patterns',
  src.includes("if (pat.type === 'lockon' && !aimKey) { aim = { x: foe.f.mx, y: foe.f.my }; aimKey = foe.f.key; }"));
check('lockon resolve branch sits before the generic re-aim branch',
  lockonBranch > 0 && src.indexOf("} else if (ptype !== 'beam'", lockonBranch) > lockonBranch);

// --- (b) ambush arming beat ---
const seedBody = methodBody('tbSeedAmbushZone(m, pattern, opts) {');
check('tbSeedAmbushZone method exists', !!seedBody);
check('seed rejects non-ambush-zone patterns', seedBody && seedBody.includes("pattern.type !== 'ambush-zone'"));
check('seed marks the circle on the grid', seedBody && seedBody.includes('this.warnCells(cells, 99)'));
check('seed uses knowledge-gated windup text',
  seedBody && seedBody.includes("telegraphText(zone.pattern, 'windup', known)"));

const tickBody = methodBody('tbAmbushZoneTick() {');
check('tbAmbushZoneTick method exists', !!tickBody);
check('arming beat uses combat.js zoneArmed', tickBody && tickBody.includes('S.combat.zoneArmed(z.pattern, fr.mx, fr.my)'));
check('arming beat says the knowledge-gated arming text',
  tickBody && tickBody.includes("telegraphText(z.pattern, 'arming', known)"));
check('arming beat fires an audio event', tickBody && tickBody.includes("this.audioEvent('telegraph', { urgency: 1, pattern: 'ambush-zone' })"));
check('armed zone fires after its beat', tickBody && tickBody.includes('z.beatsLeft -= 1'));
check('zone fire hits fighters inside the zone cells',
  tickBody && tickBody.includes('cells.some(c => c.cx === fr.mx && c.cy === fr.my)'));
check('zone fire plays ambushSnap', tickBody && tickBody.includes("this.audioEvent('ambushSnap')"));
check('zone never hits its seeder', tickBody && tickBody.includes('fr.key !== z.seededBy'));

const afterPlayer = methodBody('tbAfterPlayerAction() {');
check('tbAmbushZoneTick invoked after player action',
  afterPlayer && afterPlayer.includes('this.tbAmbushZoneTick()'));
const advance = methodBody('tbAdvance() {');
check('tbAmbushZoneTick invoked in tbAdvance (sync path)',
  advance && advance.includes('this.tbAmbushZoneTick()'));
const advanceAsync = methodBody('tbAdvanceOneAsync() {');
check('tbAmbushZoneTick invoked in tbAdvanceOneAsync (async path)',
  advanceAsync && advanceAsync.includes('this.tbAmbushZoneTick()'));

// --- (c) audio emitters for knowledge reveals ---
const revealCalls = (src.match(/this\.audioEvent\('knowledgeReveal'/g) || []).length;
check('knowledgeReveal emitters exist (>=4)', revealCalls >= 4);
const identify = methodBody('identifyPlant(pid, source, teacherName) {');
check('plant unlock emits knowledgeReveal',
  identify && identify.includes("this.audioEvent('knowledgeReveal', { kind: 'plant', id: pid })"));
const tech = methodBody('checkKnowledgeAbilitySynergy(skillId, level) {');
check('technique unlock emits knowledgeReveal',
  tech && tech.includes("this.audioEvent('knowledgeReveal', { kind: 'technique', id: techId })"));
const syn = methodBody('unlockSynergy(syn) {');
check('synergy discovery emits knowledgeReveal',
  syn && syn.includes("this.audioEvent('knowledgeReveal', { kind: 'synergy', id: syn.id })"));
const integIdx = src.indexOf('SYSTEM INTEGRATION L${newLevel}');
const integRegion = integIdx > 0 ? src.slice(integIdx, integIdx + 600) : '';
check('integration level-up emits knowledgeReveal',
  integRegion.includes("this.audioEvent('knowledgeReveal', { kind: 'integration', level: newLevel })"));

// --- ontology ledger ---
check('ontology provides lists tbSeedAmbushZone/tbAmbushZoneTick',
  src.includes('tbSeedAmbushZone(m, pattern, opts) -> zone | null, tbAmbushZoneTick()'));
check('ontology rules list lockon_relock', src.includes('lockon_relock'));
check('ontology rules list ambush_zone_beat', src.includes('ambush_zone_beat'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
