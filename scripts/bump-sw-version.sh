#!/bin/bash
# Bump the service worker cache version to a unique build id: <git-short-hash>-<UTC-timestamp>.
# Run this BEFORE committing any change that should reach players as a new PWA version.
# The "update available" banner only appears when sw.js byte-changes, so a unique
# version per build guarantees the update flow triggers on every deploy.
# Also stamps src/js/build.js so the app can display its own build version
# (title-screen footer) — critical for confirming which build a player is on.
set -euo pipefail
cd "$(dirname "$0")/.."
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
PY
