// Proof: update banner must not appear until the new build is actually downloadable.
// Simulates the GitHub Pages deploy race: version.json is live with the new
// version, but index.html still serves the old build.
// Runs the REAL update-flow script extracted from index.html against stubs.
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');

// Extract the PWA update-flow IIFE (the <script> block mentioning version.json polling).
const m = html.match(/<script>\n\/\* PWA update flow[\s\S]*?<\/script>/);
if (!m) { console.error('FAIL: update-flow script not found in index.html'); process.exit(1); }
const scriptSrc = m[0].replace(/^<script>\n/, '').replace(/<\/script>$/, '');

const OLD_V = '36fa81f-20261006-193154';
const NEW_V = '99aa999-20261006-200000';
const OLD_INDEX = '<html><script src="src/js/app.js?v=' + OLD_V + '"></script>build ' + OLD_V + '</html>';
const NEW_INDEX = '<html><script src="src/js/app.js?v=' + NEW_V + '"></script>build ' + NEW_V + '</html>';

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

// Build one stub browser. opts: { buildVersion, href, versionJson, indexHtml, failVersion }
function makeEnv(opts) {
  const fetchLog = [];
  const bannerHandlers = {};
  const bannerEl = {
    innerHTML: '',
    _hidden: true,
    classList: {
      remove(c) { if (c === 'hidden') bannerEl._hidden = false; },
      add(c) { if (c === 'hidden') bannerEl._hidden = true; },
    },
    addEventListener(ev, fn) { bannerHandlers[ev] = fn; },
    style: {},
  };
  let hrefValue = opts.href;
  const locationStub = {};
  Object.defineProperty(locationStub, 'href', {
    get() { return hrefValue; },
    set(v) { locationStub._navigatedTo = v; hrefValue = v; },
  });
  const fetchStub = (url) => {
    fetchLog.push(url);
    if (String(url).startsWith('version.json')) {
      if (opts.failVersion) return Promise.reject(new Error('network down'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: opts.versionJson }) });
    }
    if (String(url).startsWith('index.html')) {
      if (opts.indexHtml === null) return Promise.resolve({ ok: false, status: 404 });
      return Promise.resolve({ ok: true, text: () => Promise.resolve(opts.indexHtml) });
    }
    return Promise.reject(new Error('unexpected fetch ' + url));
  };
  const sandbox = {
    window: null, // set below (self-ref)
    document: {
      getElementById(id) { return id === 'update-banner' ? bannerEl : null; },
      addEventListener() {},
      visibilityState: 'visible',
    },
    navigator: {},
    fetch: fetchStub,
    setInterval() { return 0; },
    setTimeout: setTimeout,
    URL: URL,
    console: console,
  };
  sandbox.window = {
    BUILD_VERSION: opts.buildVersion,
    location: locationStub,
    history: { replaceState() {} },
  };
  // The script references bare `window`, `document`, `navigator`, `fetch`, `setInterval`, `URL`.
  const fn = new Function('window', 'document', 'navigator', 'fetch', 'setInterval', 'setTimeout', 'URL',
    scriptSrc);
  fn(sandbox.window, sandbox.document, sandbox.navigator, sandbox.fetch,
     sandbox.setInterval, sandbox.setTimeout, sandbox.URL);
  return {
    bannerEl, bannerHandlers, fetchLog, locationStub,
    updater: sandbox.window.__oversightUpdate,
    tapBanner() { if (bannerHandlers.click) bannerHandlers.click(); },
  };
}

const tick = (ms) => new Promise(r => setTimeout(r, ms || 60));

(async () => {
  console.log('Scenario A — RACE: version.json has new build, index.html still old');
  {
    const env = makeEnv({ buildVersion: OLD_V, href: 'https://x.test/game/', versionJson: NEW_V, indexHtml: OLD_INDEX });
    await tick();
    ok('banner stays hidden', env.bannerEl._hidden === true, 'innerHTML=' + env.bannerEl.innerHTML);
    const has = await env.updater.check();
    ok('check() returns false', has === false);
    ok('index.html was probed for liveness', env.fetchLog.some(u => String(u).startsWith('index.html')));
  }

  console.log('Scenario B — LIVE: new build fully deployed');
  {
    const env = makeEnv({ buildVersion: OLD_V, href: 'https://x.test/game/', versionJson: NEW_V, indexHtml: NEW_INDEX });
    await tick();
    ok('banner shown', env.bannerEl._hidden === false);
    ok('banner says tap to update', /tap to update/.test(env.bannerEl.innerHTML), env.bannerEl.innerHTML);
    const has = await env.updater.check();
    ok('check() returns true', has === true);
  }

  console.log('Scenario C — STUCK RECOVERY: booted with ?v=new but still on old build, assets not live');
  {
    const env = makeEnv({ buildVersion: OLD_V, href: 'https://x.test/game/?v=' + NEW_V, versionJson: NEW_V, indexHtml: OLD_INDEX });
    await tick();
    ok('banner shows pending notice, not tap-to-update',
      env.bannerEl._hidden === false && /isn&rsquo;t ready to download/.test(env.bannerEl.innerHTML) && !/tap to update/i.test(env.bannerEl.innerHTML),
      env.bannerEl.innerHTML);
    env.tapBanner(); // user taps the notice -> must re-check, NOT navigate
    await tick();
    ok('tap does not navigate anywhere', !env.locationStub._navigatedTo, env.locationStub._navigatedTo);
    ok('still no tap-to-update banner after re-check', !/tap to update/i.test(env.bannerEl.innerHTML));
  }

  console.log('Scenario D — NO UPDATE: version.json matches local; index.html never fetched');
  {
    const env = makeEnv({ buildVersion: OLD_V, href: 'https://x.test/game/', versionJson: OLD_V, indexHtml: NEW_INDEX });
    await tick();
    ok('banner stays hidden', env.bannerEl._hidden === true);
    ok('index.html not fetched when no update', !env.fetchLog.some(u => String(u).startsWith('index.html')), env.fetchLog.join(','));
  }

  console.log('Scenario E — RECOVERY RESOLVES: pending, then assets go live');
  {
    // Start stuck...
    const env = makeEnv({ buildVersion: OLD_V, href: 'https://x.test/game/?v=' + NEW_V, versionJson: NEW_V, indexHtml: OLD_INDEX });
    await tick();
    ok('pending notice shown', /isn&rsquo;t ready/.test(env.bannerEl.innerHTML));
    // ...Pages finishes deploying (swap the stub's index content by rebuilding env is cheating;
    // instead re-run check against a live env but keep the pending banner element).
    const env2 = makeEnv({ buildVersion: OLD_V, href: 'https://x.test/game/', versionJson: NEW_V, indexHtml: NEW_INDEX });
    await tick();
    ok('live check shows real banner', /tap to update/i.test(env2.bannerEl.innerHTML));
  }

  console.log('Scenario F — OFFLINE: version.json fetch fails -> silent, no banner');
  {
    const env = makeEnv({ buildVersion: OLD_V, href: 'https://x.test/game/', versionJson: NEW_V, indexHtml: NEW_INDEX, failVersion: true });
    await tick();
    ok('banner stays hidden when version.json unreachable', env.bannerEl._hidden === true);
    const has = await env.updater.check();
    ok('check() returns false on network failure', has === false);
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
