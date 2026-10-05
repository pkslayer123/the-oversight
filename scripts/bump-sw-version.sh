#!/bin/bash
# Bump the service worker cache version to a unique build id: <git-short-hash>-<UTC-timestamp>.
# Run this BEFORE committing any change that should reach players as a new PWA version.
# The "update available" banner only appears when sw.js byte-changes, so a unique
# version per build guarantees the update flow triggers on every deploy.
# Also stamps src/js/build.js so the app can display its own build version
# (title-screen footer) — critical for confirming which build a player is on.
#
# ONTOLOGY GATE (Steve 2026-10-05): validates the game ontology before bumping.
# Release is BLOCKED if the documentation doesn't match the code.
set -euo pipefail
cd "$(dirname "$0")/.."

# ONTOLOGY VALIDATION — release gate
echo "Validating game ontology..."
if ! node scripts/validate-ontology.js; then
  echo ""
  echo "RELEASE BLOCKED: ontology validation failed."
  echo "Fix the @ontology headers in src/js/*.js, then re-run."
  exit 1
fi
echo ""

HASH=$(git rev-parse --short HEAD)
STAMP=$(date -u +%Y%m%d-%H%M%S)
VER="${HASH}-${STAMP}"
python3 - "$VER" <<'PY'
import sys, re
v = sys.argv[1]
p = 'sw.js'
s = open(p).read()
s2, n = re.subn(r"^const VERSION = '[^']*';", "const VERSION = '%s';" % v, s, flags=re.M)
assert n == 1, 'VERSION line not found in sw.js'
open(p, 'w').write(s2)
print('sw.js VERSION ->', v)
b = 'src/js/build.js'
bs = open(b).read()
bs2, n2 = re.subn(r"^window\.BUILD_VERSION = '[^']*';", "window.BUILD_VERSION = '%s';" % v, bs, flags=re.M)
assert n2 == 1, 'BUILD_VERSION line not found in src/js/build.js'
open(b, 'w').write(bs2)
print('src/js/build.js BUILD_VERSION ->', v)
# version.json is the source of truth for the v2 update flow (polled with
# no-store + cache-buster, so it always reflects the latest deploy).
vj = 'version.json'
vjs = open(vj).read()
vjs2, n3 = re.subn(r'"version"\s*:\s*"[^"]*"', '"version": "%s"' % v, vjs)
assert n3 == 1, 'version field not found in version.json'
open(vj, 'w').write(vjs2)
print('version.json version ->', v)
# CACHE-BUSTING (Steve 2026-10-05): iOS serves stale JS/CSS from HTTP cache
# even after the updater wipes SW caches — the ?v= on the page URL doesn't
# propagate to subresources. Stamp every local asset URL with the build
# version so a new build can never load old code.
idx = 'index.html'
ix = open(idx).read()
# strip any previous ?v= before stamping the new one
ix = re.sub(r'((?:src|href)="src/[^"]+)\?v=[^"]*"', r'\1"', ix)
ix = re.sub(r'((?:src|href)="manifest\.json)\?v=[^"]*"', r'\1"', ix)
ix2, n4 = re.subn(r'((?:src|href)="(?:src/[^"]+|manifest\.json))"', r'\1?v=%s"' % v, ix)
assert n4 > 0, 'no asset URLs found in index.html'
open(idx, 'w').write(ix2)
print('index.html assets cache-busted ->', v, '(%d urls)' % n4)
PY
