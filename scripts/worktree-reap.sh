#!/bin/bash
# worktree-reap.sh — safe cleanup of dead worktrees. Run at loop pre-flight.
# Usage: bash scripts/worktree-reap.sh [--dry-run]
#
# AUTO-REMOVES a tree only when ALL of these hold:
#   1. registry status is done-merged, OR the branch is fully merged to master
#      AND the tree is clean AND (status is done-* OR heartbeat is stale > 12h)
#   2. `git status --short` inside the tree is empty (no uncommitted work, ever)
# NEVER touches: active trees with fresh heartbeats, trees with uncommitted
# changes, branches not merged to master (unless owner marked done-merged).
# STALE trees (active, heartbeat > 4h) are REPORTED loudly, never deleted —
# the owning loop's next run decides their fate.
# (Steve 2026-10-08: "We need more worktree slots and a better cleanup system."
#  This replaces the 2026-10-08 cross-loop war rule "never remove, fail loudly"
#  with ownership-aware safe cleanup.)
set -u
REPO=~/workspace/the-scattering
WTBASE=~/workspace/worktrees
REG="$WTBASE/REGISTRY.json"
LOCK="$WTBASE/REGISTRY.lock"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

exec 200>"$LOCK"
flock -x 200
python3 - "$REPO" "$WTBASE" "$REG" "$DRY" <<'EOF'
import json, os, subprocess, sys, datetime

repo, wtbase, reg, dry = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] == "1"
now = datetime.datetime.now(datetime.timezone.utc)

def sh(*args, cwd=repo):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    return r.returncode, r.stdout.strip(), r.stderr.strip()

try:
    with open(reg) as f:
        data = json.load(f)
except FileNotFoundError:
    data = {"cap": 6, "trees": []}

merged_branches = set()
rc, out, _ = sh("git", "branch", "--merged", "master", "--format=%(refname:short)")
if rc == 0:
    merged_branches = set(out.split())

removed, stale, kept = [], [], []
kept_trees = []
for t in data["trees"]:
    slug, path, branch, status = t["slug"], t["path"], t["branch"], t.get("status", "active")
    hb = t.get("heartbeat_at", t.get("created_at", ""))
    try:
        age_h = (now - datetime.datetime.fromisoformat(hb)).total_seconds() / 3600
    except Exception:
        age_h = 999

    exists = os.path.isdir(path)
    if not exists:
        continue  # tree already gone — drop the registry entry
    rc, dirty, _ = sh("git", "status", "--short", cwd=path)
    is_clean = (rc == 0 and dirty == "")
    is_merged = branch in merged_branches

    auto = False
    reason = ""
    if status == "done-merged" and is_clean:
        auto, reason = True, "owner released as merged, tree clean"
    elif status == "done-abandoned" and is_clean and is_merged:
        auto, reason = True, "owner abandoned, tree clean, branch fully merged"
    elif is_merged and is_clean and (status.startswith("done") or age_h > 12):
        auto, reason = True, f"branch merged to master, tree clean ({status}, heartbeat {age_h:.1f}h old)"

    if auto:
        if dry:
            removed.append(f"[dry-run] would remove {slug} ({reason})")
        else:
            r1 = sh("git", "worktree", "remove", "--force", path)
            r2 = sh("git", "branch", "-d", branch)
            if r1[0] == 0:
                removed.append(f"removed {slug} ({reason})")
                continue  # drop registry entry
            else:
                stale.append(f"LOUD: failed to remove {slug}: {r1[2][:200]}")
    else:
        if age_h > 4 and status == "active":
            stale.append(f"LOUD: stale worktree {slug} — owner={t.get('owner')}, purpose={t.get('purpose')}, heartbeat {age_h:.1f}h old, merged={is_merged}, clean={is_clean}. NOT removed — owning run decides.")
        elif not is_clean:
            stale.append(f"LOUD: {slug} has UNCOMMITTED changes — never auto-removing. Owner must commit or release.")
    kept_trees.append(t)

data["trees"] = kept_trees
if not dry:
    with open(reg, "w") as f:
        json.dump(data, f, indent=2)
sh("git", "worktree", "prune")

print("=== worktree-reap ===")
for line in removed: print(line)
for line in stale: print(line)
active = [t["slug"] for t in kept_trees if t.get("status") == "active"]
print(f"active: {len(active)}/{data.get('cap', 6)} — {', '.join(active) or 'none'}")
if not removed and not stale:
    print("nothing to reap.")
EOF
rc=$?
flock -u 200
exit $rc
