#!/bin/bash
# worktree-heartbeat.sh — mark a registered worktree as still alive.
# Usage: bash scripts/worktree-heartbeat.sh <slug>
# Workers/coordinators should heartbeat at least every 30 min while active.
set -u
WTBASE=~/workspace/worktrees
REG="$WTBASE/REGISTRY.json"
LOCK="$WTBASE/REGISTRY.lock"
slug="${1:?usage: worktree-heartbeat.sh <slug>}"

exec 200>"$LOCK"
flock -x 200
python3 - "$slug" "$REG" <<'EOF'
import json, sys, datetime
slug, reg = sys.argv[1:3]
try:
    with open(reg) as f:
        data = json.load(f)
except FileNotFoundError:
    print(f"FAIL: no registry at {reg}", file=sys.stderr); sys.exit(1)
for t in data["trees"]:
    if t["slug"] == slug:
        t["heartbeat_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
        with open(reg, "w") as f:
            json.dump(data, f, indent=2)
        print(f"heartbeat {slug}")
        sys.exit(0)
print(f"FAIL: slug '{slug}' not registered", file=sys.stderr); sys.exit(1)
EOF
rc=$?
flock -u 200
exit $rc
