#!/bin/bash
# Bump the service worker cache version to a unique build id: <git-short-hash>-<UTC-timestamp>.
# Run this BEFORE committing any change that should reach players as a new PWA version.
# The "update available" banner only appears when sw.js byte-changes, so a unique
# version per build guarantees the update flow triggers on every deploy.
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
PY
