#!/bin/bash
# worktree-release.sh — owner marks its worktree done. Does NOT delete anything.
# Usage: bash scripts/worktree-release.sh <slug> <merged|abandoned>
#   merged:    branch landed on master (or will be) — safe for reaper cleanup
#   abandoned: work dropped by owner decision — reaper lists loudly, never auto-deletes
#              unless the tree is clean AND the branch is fully merged to master.
# Only the owning run should release its own slug.
set -u
WTBASE=~/workspace/worktrees
REG="$WTBASE/REGISTRY.json"
LOCK="$WTBASE/REGISTRY.lock"
slug="${1:?usage: worktree-release.sh <slug> <merged|abandoned>}"
how="${2:?usage: worktree-release.sh <slug> <merged|abandoned>}"
case "$how" in
  merged) status="done-merged" ;;
  abandoned) status="done-abandoned" ;;
  *) echo "FAIL: second arg must be merged|abandoned" >&2; exit 1 ;;
esac

exec 200>"$LOCK"
flock -x 200
python3 - "$slug" "$status" "$REG" <<'EOF'
import json, sys, datetime
slug, status, reg = sys.argv[1:4]
try:
    with open(reg) as f:
        data = json.load(f)
except FileNotFoundError:
    print(f"FAIL: no registry at {reg}", file=sys.stderr); sys.exit(1)
for t in data["trees"]:
    if t["slug"] == slug:
        t["status"] = status
        t["heartbeat_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
        with open(reg, "w") as f:
            json.dump(data, f, indent=2)
        print(f"released {slug} as {status}")
        sys.exit(0)
print(f"FAIL: slug '{slug}' not registered", file=sys.stderr); sys.exit(1)
EOF
rc=$?
flock -u 200
exit $rc
