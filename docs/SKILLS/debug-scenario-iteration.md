# Debug Scenario Iteration Skill

**Purpose:** Iterate on game components via debug scenarios, find bugs, check for siblings, fix reliably.

## The Workflow

### 1. Pick a Component
Choose what to iterate on: a monster, a system (combat, dialogue, etc.), a UI element.

### 2. Launch its Debug Scenario
```bash
# List all scenarios by category
node -e "
const fs = require('fs');
eval(fs.readFileSync('src/js/debug-scenarios.js', 'utf8'));
// ... use Game.debugScenarioCategories()
"

# Or run a specific scenario in test mode
node scripts/test-monster-balance.js wave1
```

### 3. Play It Like a Player
- Don't just check if it works — FEEL it
- Is it fun or a chore?
- What's the friction?
- What breaks? What delights?

### 4. When You Find a Bug: Look for Siblings
**This is the key discipline.** A bug is never alone. When you find one:

1. **Name the bug class** — What's the pattern? (e.g., "stale coordinates after travel", "missing null check on optional field", "UI doesn't update after state change")
2. **Grep for the pattern** — Search the codebase for the same pattern elsewhere
   ```bash
   grep -rn "pattern" src/js/ | head -20
   ```
3. **Fix all siblings** — Don't just fix the one you found
4. **Write a regression test** — `scripts/test-<bug-class>.js`

### 5. Verify via Scenario
Re-run the debug scenario. Confirm the fix. Check siblings don't regress.

### 6. Commit with Context
```
Component: what you iterated on
Bug class: the pattern you found
Siblings: other places fixed
Test: scripts/test-*.js
```

## Quick Commands

```bash
# Run all monster scenarios
node scripts/test-monster-balance.js all

# Run specific wave
node scripts/test-monster-balance.js wave1

# Check scenario categories
node scripts/monster-ledger.js

# Find potential siblings (example: stale state after travel)
grep -rn "\.mx\s*=\|\.my\s*=" src/js/game.js | grep -v "s\.mx\|s\.my"
```

## Bug Class Checklist

When you fix a bug, check these common siblings:
- [ ] Same pattern in other monsters/systems?
- [ ] Null/undefined on optional fields?
- [ ] State not cleaned up after transition?
- [ ] UI not refreshing after state change?
- [ ] Coordinates not updated after travel?
- [ ] Event listener not removed?
- [ ] Cache not invalidated?

## The Rule

**"This is how we play. We iterate on the components via debug scenarios and look for siblings when we find an error or bug class."** — Steve, 2026-10-05

Never fix a bug in isolation. Always ask: "Where else does this pattern live?"
