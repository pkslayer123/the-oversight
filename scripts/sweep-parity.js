#!/usr/bin/env node
// sweep-parity.js — parallel parity sweep launcher (2026-10-10, Worker A).
// Spawns N separate node processes (never parallel in one process), each
// running scripts/run-parity-chunk.js on a seed partition, then merges.
// Env: SEEDS="1-20" POLICIES="competent,socialite" DAYS=200 CHUNKS=4
//      OUT=scripts/sweep-parity-results.json
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-20').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part.trim());
  }
  return out;
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS || '1-20');
  const policies = process.env.POLICIES || 'competent,socialite';
  const days = process.env.DAYS || '200';
  const N = parseInt(process.env.CHUNKS || '4', 10);
  const OUT = process.env.OUT || path.join(ROOT, 'scripts', 'sweep-parity-results.json');
  const partitions = Array.from({ length: N }, () => []);
  seeds.forEach((s, i) => partitions[i % N].push(s));
  const t0 = Date.now();
  const jobs = partitions.map((part, i) => new Promise((resolve, reject) => {
    if (!part.length) return resolve(null);
    const out = path.join('/tmp', `parity-chunk-${process.pid}-${i}.json`);
    const env = Object.assign({}, process.env, {
      SEEDS: part.join(','), POLICIES: policies, DAYS: days, OUT: out,
    });
    const child = spawn('node', [path.join(ROOT, 'scripts', 'run-parity-chunk.js')], { env, cwd: ROOT });
    let tail = '';
    child.stdout.on('data', d => { tail += d; });
    child.stderr.on('data', d => { tail += d; });
    child.on('close', code => {
      const lines = tail.split('\n').filter(l => /^\[\d+\/\d+/.test(l));
      console.log(`--- chunk ${i} (seeds ${part.join(',')}) exit ${code} ---`);
      for (const l of lines.slice(-4)) console.log('  ' + l);
      resolve(code === 0 ? out : null);
    });
    child.on('error', reject);
  }));
  const outs = (await Promise.all(jobs)).filter(Boolean);
  const rows = [];
  for (const f of outs) {
    try { rows.push(...JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) { console.log('bad chunk file ' + f); }
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  const el = ((Date.now() - t0) / 1000 / 60).toFixed(1);
  console.log(`merged ${rows.length} runs in ${el} min -> ${OUT}`);
})();
