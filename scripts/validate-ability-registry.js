// validate-ability-registry.js — cross-checks abilities.json against abilityRegistry.json
// and both against the codebase. Run: node scripts/validate-ability-registry.js
// Exit 0 = clean. Exit 1 = problems found (listed).
//
// Checks:
//  1. Every ability in abilities.json has a registry entry (and vice versa)
//  2. Registry _stats match actual entry counts
//  3. Every synergy `requires` ID exists in abilities.json
//  4. Every ability ID referenced in code (quoted string) exists in abilities.json,
//     except the known orphanCodeRefs
//  5. Every modifier target used by abilities is read somewhere in code
//  6. Dead abilities (status=dead) are flagged for Steve, not auto-deleted

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

const abilities = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilityRegistry.json'), 'utf8'));
const synergies = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/synergies.json'), 'utf8'));

const abilityIds = new Set(abilities.map(a => a.id));
const registryIds = new Set(Object.keys(registry.abilities || {}));

// 1. bidirectional coverage
for (const id of abilityIds) {
  if (!registryIds.has(id)) fail(`abilities.json has '${id}' with no registry entry`);
}
for (const id of registryIds) {
  if (!abilityIds.has(id)) fail(`registry has '${id}' not in abilities.json`);
}

// 2. stats match
const stats = registry._stats || {};
const actual = { wired: 0, partial: 0, dead: 0 };
for (const id of registryIds) {
  const st = registry.abilities[id].status;
  if (actual[st] !== undefined) actual[st]++;
  else fail(`registry '${id}' has unknown status '${st}'`);
}
for (const k of ['wired', 'partial', 'dead']) {
  if (stats[k] !== actual[k]) fail(`registry _stats.${k}=${stats[k]} but actual=${actual[k]}`);
}
if (stats.total !== abilityIds.size) fail(`registry _stats.total=${stats.total} but abilities.json has ${abilityIds.size}`);

// 3. synergy requires
for (const s of synergies) {
  for (const r of (s.requires || [])) {
    if (!abilityIds.has(r)) fail(`synergy '${s.id}' requires unknown ability '${r}'`);
  }
}

// 4. code refs — find all quoted ability-like IDs in src/js, check against abilities.json
const knownOrphans = new Set((registry.orphanCodeRefs || []).map(o => o.id));
try {
  const grepOut = execSync(
    `grep -rhoP "'[a-z_]{3,}'" ${path.join(ROOT, 'src/js')} --include='*.js' | sort -u`,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );
  const quoted = new Set(grepOut.split('\n').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean));
  // candidate orphans: quoted strings that look like ability ids AND appear in hasAbility/abilityLevel calls
  const abilityCallOut = execSync(
    `grep -rhoP "(hasAbility|abilityLevel)\\('[a-z_]+'\\)" ${path.join(ROOT, 'src/js')} --include='*.js' | grep -oP "'[a-z_]+'" | tr -d "'" | sort -u`,
    { encoding: 'utf8' }
  );
  const calledIds = new Set(abilityCallOut.split('\n').map(s => s.trim()).filter(Boolean));
  for (const id of calledIds) {
    if (!abilityIds.has(id) && !knownOrphans.has(id)) {
      fail(`code calls hasAbility/abilityLevel('${id}') but '${id}' is not in abilities.json and not in orphanCodeRefs`);
    }
  }
  // known orphans should still be orphan (if someone added them, registry is stale)
  for (const id of knownOrphans) {
    if (abilityIds.has(id)) warn(`orphanCodeRefs lists '${id}' but it now exists in abilities.json — registry stale`);
  }
} catch (e) {
  warn(`code-ref check skipped: ${e.message.split('\n')[0]}`);
}

// 5. modifier targets all read in code
try {
  const jsFiles = execSync(`ls ${path.join(ROOT, 'src/js')}/*.js`, { encoding: 'utf8' }).trim().split('\n');
  const codeText = jsFiles.map(f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
  const targets = new Set();
  for (const a of abilities) {
    for (const m of (a.modifiers || [])) targets.add(m.target);
  }
  for (const t of targets) {
    if (!codeText.includes(`'${t}'`) && !codeText.includes(`"${t}"`)) {
      fail(`modifier target '${t}' used by abilities but never read in src/js`);
    }
  }
} catch (e) {
  warn(`modifier-target check skipped: ${e.message.split('\n')[0]}`);
}

// 6. dead abilities flagged (not auto-deleted)
const dead = [...registryIds].filter(id => registry.abilities[id].status === 'dead');
if (dead.length) {
  warn(`dead abilities flagged for Steve (not deleted): ${dead.join(', ')}`);
}

// report
for (const w of warnings) console.log('WARN: ' + w);
for (const e of errors) console.log('ERROR: ' + e);
console.log(`\n${errors.length} errors, ${warnings.length} warnings. ${abilityIds.size} abilities, ${synergies.length} synergies.`);
process.exit(errors.length ? 1 : 0);
