#!/usr/bin/env node
// adaptive-seeds.js — sequential stopping for win-rate sweeps (2026-10-10).
// Run seeds 1..N in order; after a minimum, re-check every K seeds: compute
// the EXACT Clopper-Pearson 95% interval for the win rate and STOP when it
// excludes the decision threshold (upper < threshold → below target; lower >=
// threshold → target met). Seeds stay the same ordered set, so stopped runs
// are prefixes of full runs and rounds remain comparable — always log N.
//
// No dependencies; the incomplete-beta uses the Numerical Recipes continued
// fraction, verified against reference values in the self-test below.
'use strict';

// Regularized incomplete beta I_x(a,b) via continued fraction (betacf).
function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

// Log-gamma via Lanczos (accurate to ~1e-10); the old Stirling form was
// only good to ~0.3% and biased the CI edges.
function lngamma(z) {
  const g = 7;
  const C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lngamma(1 - z);
  z -= 1;
  let x = C[0];
  for (let i = 1; i < g + 2; i++) x += C[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lb = Math.exp(lngamma(a + b) - lngamma(a) - lngamma(b))
    * Math.pow(x, a) * Math.pow(1 - x, b);
  if (x < (a + 1) / (a + b + 2))
    return lb * betacf(a, b, x) / a;
  return 1 - lb * betacf(b, a, 1 - x) / b;
}

// Inverse of I_x(a,b): bisection, ~60 iterations for 1e-12.
function betaInv(p, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (betai(a, b, mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Exact Clopper-Pearson (1-alpha) interval for k successes in n trials.
function clopperPearson(k, n, alpha) {
  alpha = alpha == null ? 0.05 : alpha;
  if (n <= 0) return [0, 1];
  const lo = k === 0 ? 0 : betaInv(alpha / 2, k, n - k + 1);
  const hi = k === n ? 1 : betaInv(1 - alpha / 2, k + 1, n - k);
  return [lo, hi];
}

// AdaptiveStopper: sequential stopping on the win-rate decision threshold.
// opts: { threshold (default 0.15), alpha (default 0.05), minN (default 20),
//         step (default 5) }
function AdaptiveStopper(opts) {
  opts = opts || {};
  this.threshold = opts.threshold == null ? 0.15 : opts.threshold;
  this.alpha = opts.alpha == null ? 0.05 : opts.alpha;
  this.minN = opts.minN == null ? 20 : opts.minN;
  this.step = opts.step == null ? 5 : opts.step;
  this.checks = [];
  this.stopped = false;
  this.reason = null;
}
// check(n, wins) -> 'below-target' | 'target-met' | null. Call after every
// completed seed; only evaluates on the check schedule (minN, then every step).
AdaptiveStopper.prototype.check = function (n, wins) {
  if (this.stopped) return this.reason;
  if (n < this.minN || (n - this.minN) % this.step !== 0) return null;
  const ci = clopperPearson(wins, n, this.alpha);
  this.checks.push({ n, wins, lo: +ci[0].toFixed(4), hi: +ci[1].toFixed(4) });
  let reason = null;
  if (ci[1] < this.threshold) reason = 'below-target';       // upper < 15%: target missed, stop
  else if (ci[0] >= this.threshold) reason = 'target-met';   // lower >= 15%: target met, stop
  if (reason) { this.stopped = true; this.reason = reason; }
  return reason;
};

AdaptiveStopper.prototype.report = function (seedsPlanned, wins, extra) {
  const last = this.checks.length ? this.checks[this.checks.length - 1]
    : { n: 0, wins: 0, lo: 0, hi: 1 };
  return Object.assign({
    threshold: this.threshold, alpha: this.alpha,
    minN: this.minN, step: this.step,
    seedsPlanned, seedsRun: last.n, wins,
    ci95: [last.lo, last.hi],
    stopped: this.stopped, reason: this.reason || 'exhausted',
    checks: this.checks,
  }, extra || {});
};

if (require.main === module) {
  // Self-test against reference Clopper-Pearson values.
  const cases = [
    // [k, n, lo, hi] — 95% reference values (R binom.test / standard tables)
    [0, 20, 0.0000, 0.1684],
    [1, 20, 0.0013, 0.2487],
    [3, 20, 0.0321, 0.3789],
    [9, 60, 0.0709, 0.2650],
    [20, 20, 0.8316, 1.0000],
  ];
  let ok = true;
  for (const [k, n, elo, ehi] of cases) {
    const [lo, hi] = clopperPearson(k, n, 0.05);
    const pass = Math.abs(lo - elo) < 0.002 && Math.abs(hi - ehi) < 0.002;
    if (!pass) ok = false;
    console.log(`k=${k} n=${n}: [${lo.toFixed(4)}, ${hi.toFixed(4)}] expected [${elo}, ${ehi}] ${pass ? 'PASS' : 'FAIL'}`);
  }
  const st = new AdaptiveStopper({ threshold: 0.15, minN: 20, step: 5 });
  let r = null, stopN = 0;
  for (let n = 1; n <= 60 && !r; n++) { r = st.check(n, 0); if (r) stopN = n; }
  // 0/20: upper=0.1684 > 0.15 (correctly keeps going); 0/25: upper=0.1372 < 0.15 → stop
  console.log('stopper 0 wins:', r === 'below-target' && stopN === 25 && st.checks.length === 2 ? 'PASS' : 'FAIL ' + r + ' n=' + stopN);
  const st2 = new AdaptiveStopper({ threshold: 0.15, minN: 20, step: 5 });
  r = null;
  for (let n = 1; n <= 60 && !r; n++) r = st2.check(n, n); // all wins → lower>=0.15 at n=20
  console.log('stopper all wins:', r === 'target-met' ? 'PASS' : 'FAIL ' + r);
  process.exit(ok ? 0 : 1);
}

module.exports = { betai, betaInv, clopperPearson, AdaptiveStopper };
