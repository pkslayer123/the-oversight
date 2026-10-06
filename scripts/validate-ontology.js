#!/usr/bin/env node
// ONTOLOGY VALIDATOR (Steve 2026-10-05; hardened 2026-10-06 per codebase audit Phase 0)
// Validates that every system file documents itself via @ontology headers,
// and that the documentation matches the actual code.
// Release is BLOCKED if validation fails.
//
// Hardening (audit Phase 0):
//   - `provides` entries must match DEFINITIONS, not call sites. The old
//     regex matched `\bname\s*\(` anywhere — including the header's own
//     text — so storage.js claimed save()/load()/listSaves() (defined in
//     engine/state.js, not storage.js) and passed.
//   - Scans src/js/engine/ in addition to src/js/.
//   - Validates `consumes`: function entries must be defined in some system
//     file; path entries must start from a known state root.

const fs = require('fs');
const path = require('path');

const SRC_DIRS = [
  path.join(__dirname, '..', 'src', 'js'),
  path.join(__dirname, '..', 'src', 'js', 'engine'),
];
const ERRORS = [];

// ---------------------------------------------------------------------------
// Header parsing (unchanged semantics)
// ---------------------------------------------------------------------------

function parseOntologyHeader(content) {
  const lines = content.split('\n');
  let inBlock = false;
  const header = { system: null, description: null, provides: [], rules: [], consumes: [] };
  let currentSection = null;
  // Strict header grammar: only these line shapes belong to the block.
  // Design comments (// GIVE FOOD: ...) after the header must NOT be consumed.
  const isHeaderLine = (text) => {
    return text === '// @ontology' ||
      text.startsWith('// system:') ||
      text.startsWith('// description:') ||
      text === '// provides:' ||
      text === '// rules:' ||
      text === '// consumes:' ||
      (text.startsWith('//   - ') && currentSection);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '// @ontology') { inBlock = true; continue; }
    if (!inBlock) continue;
    if (!isHeaderLine(trimmed)) break; // end of header block

    const text = trimmed.slice(2).trim();
    if (text.startsWith('system:')) {
      header.system = text.slice(7).trim();
      currentSection = null;
    } else if (text.startsWith('description:')) {
      header.description = text.slice(12).trim();
      currentSection = null;
    } else if (text === 'provides:') {
      currentSection = 'provides';
    } else if (text === 'rules:') {
      currentSection = 'rules';
    } else if (text === 'consumes:') {
      currentSection = 'consumes';
    } else if (text.startsWith('- ') && currentSection) {
      header[currentSection].push(text.slice(2).trim());
    }
  }

  return inBlock ? header : null;
}

// Remove the @ontology header block so header text can't satisfy definition checks.
function stripHeader(content) {
  const lines = content.split('\n');
  let start = -1, end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '// @ontology') { start = i; continue; }
    if (start !== -1 && end === -1 && !lines[i].trim().startsWith('//')) { end = i; break; }
  }
  if (start === -1) return content;
  if (end === -1) end = lines.length;
  return lines.slice(0, start).join('\n') + '\n' + lines.slice(end).join('\n');
}

// ---------------------------------------------------------------------------
// Definition index: DEFINITIONS ONLY, never call sites.
// ---------------------------------------------------------------------------

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return',
  'typeof', 'new', 'in', 'of', 'do', 'else', 'try', 'class', 'with', 'case']);

function indexDefinitions(code) {
  const defs = new Set();
  const add = n => { if (n && n.length > 1 && !KEYWORDS.has(n)) defs.add(n); };
  let m;

  // function NAME(
  const reFn = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = reFn.exec(code))) add(m[1]);

  // method shorthand: NAME(args) {   (line-start; excludes arrows and keywords)
  const reMethod = /^[ \t]*([A-Za-z_$][\w$]*)\s*\(([^;{}]*)\)\s*\{/gm;
  while ((m = reMethod.exec(code))) { if (!m[2].includes('=>')) add(m[1]); }

  // NAME = ...  /  G.NAME = ...  /  Game.NAME = ...  /  this.NAME = ...  /  window.NAME = ...
  // (statement-level assignment)
  const reAssign = /(?:^|[;{}])\s*(?:G\.|Game\.|this\.|window\.)?([A-Za-z_$][\w$]*)\s*=\s*(?![=>])/gm;
  while ((m = reAssign.exec(code))) add(m[1]);

  // NAME: function   (unquoted object-literal key)
  const reKeyFn = /(?:^|[,{])\s*([A-Za-z_$][\w$]*)\s*:\s*function\b/gm;
  while ((m = reKeyFn.exec(code))) add(m[1]);

  // 'NAME':  /  "NAME":   (quoted object-literal key)
  const reQKey = /['"]([A-Za-z_$][\w$]*)['"]\s*:/g;
  while ((m = reQKey.exec(code))) add(m[1]);

  // const/let/var NAME =
  const reConst = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = reConst.exec(code))) add(m[1]);

  // Scattering.NAME =   (engine namespace export)
  const reNs = /Scattering\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = reNs.exec(code))) add(m[1]);

  return defs;
}

// Extract the verifiable name from a provides entry.
// Handles: name(), name(a, b), name() -> {...}, name: value, name: value (code: file.js),
// dotted names (takes the most specific segment).
function providesName(prov) {
  if (prov === '(none documented)') return null;
  let s = prov;
  s = s.replace(/\s*->.*$/, '');              // strip  -> {...}  return annotation
  s = s.replace(/\s*\(code:[^)]*\)\s*$/, ''); // strip  (code: file.js)  citation
  s = s.replace(/\s*\(.*\)\s*$/, '');         // strip  (args)
  s = s.split(':')[0].trim();                 // strip  : value
  if (!s) return null;
  const parts = s.split('.');
  const name = parts[parts.length - 1].replace(/[^A-Za-z0-9_$]/g, '');
  if (!name || name.length < 2) return null;
  return name;
}

// ---------------------------------------------------------------------------
// Consumes validation
// ---------------------------------------------------------------------------

const KNOWN_ROOTS = new Set([
  'village', 'scholar', 'state', 'codex', 'run', 'party',
  'Game', 'Scattering', 'localStorage', 'document', 'window', 'navigator',
  'Math', 'JSON', 'Object', 'Array', 'console', 'performance',
]);

function validateConsumes(entry, globalDefs) {
  if (entry === '(none documented)') return null;
  // function-style: name( ... )  — must be defined in some system file
  const fnMatch = entry.match(/^([A-Za-z_$][\w$]*)\s*\(/);
  if (fnMatch) {
    return globalDefs.has(fnMatch[1])
      ? null
      : `consumes '${entry}' — '${fnMatch[1]}' not defined in any system file`;
  }
  // path-style: root.rest — root must be a known state root
  const root = entry.split('.')[0].split(' ')[0].split('(')[0];
  if (/^[A-Za-z_$][\w$]*$/.test(root)) {
    return KNOWN_ROOTS.has(root)
      ? null
      : `consumes '${entry}' — unknown root '${root}'`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// File validation
// ---------------------------------------------------------------------------

function validateFile(filepath, globalDefs, fileDefs) {
  const rel = path.relative(path.join(__dirname, '..'), filepath);
  const content = fs.readFileSync(filepath, 'utf8');
  const header = parseOntologyHeader(content);

  if (!header) {
    ERRORS.push(`${rel}: MISSING @ontology header block`);
    return null;
  }

  if (!header.system) ERRORS.push(`${rel}: @ontology missing 'system:'`);
  if (!header.description) ERRORS.push(`${rel}: @ontology missing 'description:'`);

  // provides: definitions only (header text stripped — it can't vouch for itself)
  // Exception: explicit delegation — `name() (delegates to file.js)` is verified
  // against the cited file instead of the local one.
  const defs = fileDefs.get(filepath);
  for (const prov of header.provides) {
    const name = providesName(prov);
    if (!name) continue;
    const delMatch = prov.match(/\(delegates to ([A-Za-z0-9_.-]+\.js)\)/);
    if (delMatch) {
      const target = path.join(path.join(__dirname, '..', 'src', 'js'), delMatch[1]);
      if (!fs.existsSync(target)) {
        ERRORS.push(`${rel}: provides '${prov}' — delegation target '${delMatch[1]}' not found`);
      } else if (!fileDefs.get(target) || !fileDefs.get(target).has(name)) {
        ERRORS.push(`${rel}: provides '${prov}' — '${name}' not defined in '${delMatch[1]}'`);
      }
      continue;
    }
    if (!defs.has(name)) {
      ERRORS.push(`${rel}: provides '${prov}' — '${name}' not defined in this file`);
    }
  }

  // consumes: functions must exist somewhere; paths must have known roots
  for (const con of header.consumes) {
    const err = validateConsumes(con, globalDefs);
    if (err) ERRORS.push(`${rel}: ${err}`);
  }

  // rules: each must cite code location (skip placeholder)
  for (const rule of header.rules) {
    if (rule === '(none documented)') continue;
    if (!rule.includes('(code:')) {
      ERRORS.push(`${rel}: rule '${rule}' — missing (code:) citation`);
    }
  }

  return header;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function collectFiles() {
  const files = [];
  for (const dir of SRC_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.js')) files.push(path.join(dir, f));
    }
  }
  return files.sort();
}

function main() {
  const files = collectFiles();
  console.log(`Validating ${files.length} system files (src/js + src/js/engine)...\n`);

  // Pass 1: build definition indexes (header-stripped code)
  const fileDefs = new Map();
  const globalDefs = new Set();
  for (const fp of files) {
    const code = stripHeader(fs.readFileSync(fp, 'utf8'));
    const defs = indexDefinitions(code);
    fileDefs.set(fp, defs);
    for (const d of defs) globalDefs.add(d);
  }

  // Pass 2: validate headers against the indexes
  const systems = [];
  for (const fp of files) {
    const header = validateFile(fp, globalDefs, fileDefs);
    if (header && header.system) {
      systems.push({ file: path.relative(path.join(__dirname, '..', 'src', 'js'), fp), ...header });
    }
  }

  // Generate the systems table for ONTOLOGY.md
  const ontologyPath = path.join(__dirname, '..', 'docs', 'ONTOLOGY.md');
  if (fs.existsSync(ontologyPath) && ERRORS.length === 0) {
    let doc = fs.readFileSync(ontologyPath, 'utf8');
    const marker = '<!-- Generated by validate-ontology.js — do not edit manually -->';
    const idx = doc.indexOf(marker);
    if (idx !== -1) {
      const table = systems.map(s =>
        `### ${s.system} (\`${s.file}\`)\n${s.description}\n\n` +
        `**Provides:** ${s.provides.length ? s.provides.join(', ') : '—'}\n\n` +
        `**Rules:**\n${s.rules.length ? s.rules.map(r => `- ${r}`).join('\n') : '—'}\n\n` +
        `**Consumes:** ${s.consumes.length ? s.consumes.join(', ') : '—'}\n`
      ).join('\n');
      doc = doc.slice(0, idx + marker.length) + '\n\n' + table + '\n';
      fs.writeFileSync(ontologyPath, doc);
      console.log('Updated docs/ONTOLOGY.md with validated systems\n');
    }
  }

  if (ERRORS.length > 0) {
    console.error('ONTOLOGY VALIDATION FAILED:\n');
    ERRORS.forEach(e => console.error(`  ✗ ${e}`));
    console.error(`\n${ERRORS.length} error(s). Release blocked.`);
    process.exit(1);
  }

  console.log(`✓ All ${systems.length} systems validated`);
  console.log('Ontology matches code. Release permitted.');
}

main();
