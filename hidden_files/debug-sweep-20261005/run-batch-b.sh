#!/bin/bash
# Batch B runner: each scenario in its own node process, hard-killed at 60s.
cd "$(dirname "$0")" || exit 1
SCENARIOS="ambush mootAccused mootJuror exile mantle keepsake"
for s in $SCENARIOS; do
  echo "=== $s ==="
  timeout 60 node harness.js "$s" > "results/$s.stdout" 2>&1
  code=$?
  if [ $code -eq 124 ]; then
    echo "TIMEOUT(>60s): $s" | tee "results/$s.timeout"
  elif [ $code -ne 0 ]; then
    echo "EXIT $code: $s"
  fi
  tail -1 "results/$s.stdout" 2>/dev/null
done
echo "=== batch done ==="
