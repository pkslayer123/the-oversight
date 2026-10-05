/* The Oversight — service worker.
   Update policy (v2): the SW is PURELY an offline cache. It never drives
   updates — version.json polling in index.html does that (it works even where
   SWs are unsupported, e.g. older iOS home-screen apps). A new SW installs in
   the background and activates on next load; the update banner flow
   unregisters SWs and wipes caches before navigating, so staleness is
   impossible regardless of SW state.
   CACHE version is bumped per build via scripts/bump-sw-version.sh. */
const VERSION = 'd4bbd7f-20261005-093514';
const CACHE = 'oversight-cache-' + VERSION;

const ASSETS = [
  './', './index.html', './manifest.json', './version.json',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './src/css/main.css',
  './src/js/app.js', './src/js/game.js', './src/js/build.js',
  './src/js/engine/state.js', './src/js/engine/modifiers.js',
  './src/js/engine/calories.js', './src/js/engine/day.js',
  './src/js/engine/forage.js', './src/js/engine/combat.js',
  './src/data/abilities.json', './src/data/animals.json',
  './src/data/background_survivors.json', './src/data/biomes.json',
  './src/data/books.json', './src/data/cell_defs.json',
  './src/data/characterGen.json', './src/data/events.json',
  './src/data/items.json', './src/data/locations.json',
  './src/data/monsters.json', './src/data/plants.json',
  './src/data/recipes.json', './src/data/relicEnhancements.json',
  './src/data/schemas.json', './src/data/shop.json',
  './src/data/synergies.json', './src/data/systemMessages.json',
  './src/data/trials.json', './src/data/villagers.json',
];

self.addEventListener('install', e => {
  // Cache everything fresh for this version, then sit in "waiting" —
  // do NOT skipWaiting here; the page decides when to switch.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        // Only cache successful same-origin basics; game data is versioned by CACHE.
        return resp;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      });
    })
  );
});
