#!/bin/bash
# run-winseek-parallel.sh — run winseek sweep in parallel shards.
# Usage: bash scripts/run-winseek-parallel.sh [n_shards] [seeds_per_shard] [days]
# Each shard runs a disjoint seed range in its own node process, writing its
# own OUT file. Then merge with scripts/merge-winseek.js.
set -u
cd "$(dirname "$0")/.."
# Shard count defaults to the machine's core count (2026-10-10: the old
# hardcoded 6 oversubscribed the 2-core sim box). Still overridable via $1.
N_SHARDS=${1:-$(nproc)}
PER_SHARD=${2:-10}
DAYS=${3:-200}
OUTDIR="scripts/winseek-shards"
mkdir -p "$OUTDIR"
echo "Launching $N_SHARDS shards x $PER_SHARD seeds (DAYS=$DAYS)..."
for ((i=0; i<N_SHARDS; i++)); do
  START=$((i*PER_SHARD+1))
  END=$(((i+1)*PER_SHARD))
  OUT="$OUTDIR/shard-$i.json"
  SEEDS="$START-$END" DAYS="$DAYS" OUT="$OUT" \
    nohup node scripts/sweep-winseek.js > "$OUTDIR/shard-$i.log" 2>&1 &
  echo "  shard $i: seeds $START-$END -> $OUT (pid $!)"
done
echo "Waiting for all shards..."
wait
echo "All shards done. Merging..."
node scripts/merge-winseek.js "$OUTDIR"/shard-*.json
