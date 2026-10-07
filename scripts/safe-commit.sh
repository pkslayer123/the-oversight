#!/bin/bash
# SAFE-COMMIT (Steve 2026-10-07): race-proof commit for the hot shared tree.
# Uses a private index so sibling-staged changes can't leak into your commit.
# REFUSES to commit if the diff shows mass deletions (>50 lines in src/) —
# that's the stale-tree revert signature. Override with --force-delete.
#
# Usage: scripts/safe-commit.sh "commit message" -- path/to/file1 path/to/file2
#        scripts/safe-commit.sh "commit message" --force-delete -- path/...
set -euo pipefail
cd "$(dirname "$0")/.."

FORCE_DELETE=0
if [ "${1:-}" = "--force-delete" ]; then
  FORCE_DELETE=1
  shift
fi

MSG="$1"
shift
if [ "${1:-}" = "--" ]; then shift; fi
PATHS=("$@")

if [ ${#PATHS[@]} -eq 0 ]; then
  echo "ERROR: no paths specified. Use: safe-commit.sh \"msg\" -- path/..."
  exit 1
fi

# Build on a private index from current HEAD
IDX="/tmp/idx-safecommit-$$"
export GIT_INDEX_FILE="$IDX"
BASE=$(git rev-parse HEAD)
git read-tree "$BASE"

# Stage exactly the specified paths from worktree
for p in "${PATHS[@]}"; do
  if [ -e "$p" ]; then
    HASH=$(git hash-object -w "$p")
    # Check if file is tracked (has blob in HEAD) or new
    if git cat-file -e "$BASE:$p" 2>/dev/null; then
      git update-index --cacheinfo "100644,$HASH,$p"
    else
      git update-index --add --cacheinfo "100644,$HASH,$p"
    fi
  else
    echo "WARNING: $p does not exist, skipping"
  fi
done

# MASS-DELETION GUARD: compare private index to base
DELETED_LINES=$(git diff --cached --numstat "$BASE" -- src/ | awk '$2 ~ /^[0-9]+$/ {sum += $2} END {print sum+0}')
if [ "$DELETED_LINES" -gt 50 ] && [ "$FORCE_DELETE" -eq 0 ]; then
  echo ""
  echo "REFUSED: this commit deletes $DELETED_LINES lines in src/."
  echo "This is the stale-tree revert signature. If this is intentional,"
  echo "re-run with --force-delete."
  echo ""
  git diff --cached --stat "$BASE" -- src/ | tail -10
  rm -f "$IDX"
  exit 1
fi

# Verify HEAD didn't move
CURRENT=$(git rev-parse HEAD)
if [ "$CURRENT" != "$BASE" ]; then
  echo "ERROR: HEAD moved during commit ($BASE -> $CURRENT). Aborting."
  rm -f "$IDX"
  exit 1
fi

# Commit and update
TREE=$(git write-tree)
NEW_SHA=$(git commit-tree "$TREE" -p "$BASE" -m "$MSG")
git update-ref refs/heads/$(git branch --show-current) "$NEW_SHA" "$BASE"
rm -f "$IDX"

echo "Committed $NEW_SHA"
echo "$MSG"
