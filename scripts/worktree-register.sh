#!/bin/bash
# worktree-register.sh — create an isolated worker worktree AND register it.
# Usage: bash scripts/worktree-register.sh <slug> <owner> <purpose>
#   slug:    short unique name, e.g. break-food, playtest-hunter, dialog-phase2
#   owner:   loop/agent id that owns it, e.g. oversight-flesh-out-loop
#   purpose: one-line description, e.g. "break-it: food economy"
#
# Fails loudly (nonzero exit + message) when: disk >85%, registry cap hit,
# slug already registered, worktree creation fails.
# On success prints the worktree path. Registry: ~/workspace/worktrees/REGISTRY.json
# (Steve 2026-10-08: "We need more worktree slots and a better cleanup system.")
set -u
REPO=~/workspace/the-scattering
WTBASE=~/workspace/worktrees
REG="$WTBASE/REGISTRY.json"
LOCK="$WTBASE/REGISTRY.lock"

slug="${1:?usage: worktree-register.sh <slug> <owner> <purpose>}"
owner="${2:?usage: worktree-register.sh <slug> <owner> <purpose>}"
purpose="${3:?usage: worktree-register.sh <slug> <owner> <purpose>}"

# Disk guard (same 85% rule as the loops' pre-flight)
usepct=$(df -h ~ | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
if [ "$usepct" -gt 85 ]; then
  echo "FAIL: disk use ${usepct}% > 85% — refusing to create worktree $slug" >&2
  exit 1
fi

exec 200>"$LOCK"
flock -x 200

python3 - "$slug" "$owner" "$purpose" "$REPO" "$WTBASE" "$REG" <<'EOF'
import json, os, subprocess, sys, datetime

slug, owner, purpose, repo, wtbase, reg = sys.argv[1:7]
now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

os.makedirs(wtbase, exist_ok=True)
if os.path.exists(reg):
    with open(reg) as f:
        data = json.load(f)
else:
    data = {"cap": 6, "trees": []}
cap = data.get("cap", 6)
trees = data["trees"]

active = [t for t in trees if t.get("status") == "active"]
if any(t["slug"] == slug for t in trees):
    print(f"FAIL: slug '{slug}' already registered (status: {[t['status'] for t in trees if t['slug']==slug][0]})", file=sys.stderr)
    sys.exit(1)
if len(active) >= cap:
    print(f"FAIL: worktree cap hit ({len(active)}/{cap} active). Run scripts/worktree-reap.sh or wait for a slot — do NOT prune someone else's tree.", file=sys.stderr)
    sys.exit(1)

path = os.path.join(wtbase, slug)
# Create the worktree+branch. -f: slug branch may exist from a prior released run.
r = subprocess.run(["git", "worktree", "add", path, "-b", slug],
                   cwd=repo, capture_output=True, text=True)
if r.returncode != 0:
    # Branch may already exist (released earlier) — attach to it.
    r2 = subprocess.run(["git", "worktree", "add", path, slug],
                        cwd=repo, capture_output=True, text=True)
    if r2.returncode != 0:
        print(f"FAIL: git worktree add {slug}: {r.stderr.strip() or r2.stderr.strip()}", file=sys.stderr)
        sys.exit(1)

trees.append({
    "slug": slug, "path": path, "branch": slug,
    "owner": owner, "run_id": os.environ.get("WT_RUN_ID", now),
    "purpose": purpose, "created_at": now, "heartbeat_at": now,
    "status": "active",
})
with open(reg, "w") as f:
    json.dump(data, f, indent=2)
print(path)
EOF
rc=$?
flock -u 200
exit $rc
