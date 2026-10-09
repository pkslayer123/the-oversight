# Break-it: SHOWS & BROADCAST — 2026-10-09 (run: oversight-flesh-out-loop)

Target 13: shows & broadcast. Canon: docs/CONTESTS.md (+ CANON.md first).
Worktree: `~/workspace/worktrees/break-shows`, commits 31975ac0 + c0d6756b (branch break-shows).
Proof: `scripts/test-break-shows-20261009.js` — 64/64 PASS × 3 seeds (777, 424242, 12345).
Prior-round regression: `scripts/test-break-contest-20261009.js` — 76/76 PASS.
Ontology: validate-ontology.js — 52/52 systems, release permitted.

## CATCHES (all fixed, all proven)

### 1. Ratings-stunt double prize — EXPLOIT (fixed)
The stunt (`prize: true` in `do`) paid TWICE: the fan care package (via
apCarePackage in _showEnd) AND an alien curio (via the generic `prize`
grant at the bottom of _showEnd). Proof pre-fix: inventory 7→9, two
apGrantItem calls per stunt. Canon (docs/CONTESTS.md): "Stunt = 200 kcal +
4 trauma → prize" and "ratings summons stunt wins a care package" —
singular. Fix: removed `prize: true` from the stunt; the care package IS the
prize. Post-fix: exactly 1 grant per stunt. Also made a care-package whiff
(rate-limited) say so out loud instead of returning false silently.

### 2. Care-package snacks were dinner — EXPLOIT + canon violation (fixed)
apCarePackage granted `300 + rand*400 + favor*5` kcal of "fan-approved
snacks" — up to ~800 kcal, a free day of food every 4 days. Canon:
"fan care packages (wacky, never dinner)". Worse: it made the stunt
kcal-POSITIVE (spend 200, get 400+ back — measured 2000→2400 pre-fix),
a farmable loop. Fix: snacks are now a taste — `30 + rand*40` kcal.
Post-fix: stunt nets −100..−200 kcal as labeled.

### 3. Stunt free at 0 kcal — EXPLOIT (fixed)
contestChoose floored negative kcal at 0 with no gate: a starving player
could do the 200-kcal stunt for free and collect the prize. "Your body is
the budget" was unenforced. Fix: new `do.reqKcal` honored in contestChoose
— blocked out loud ("You don't have the body for that — it takes 200 kcal
and you've got N. Eat first."), no phase advance, no costs, no prize.
Button stays honest instead of disabled. Only the stunt uses reqKcal.

### 4. Show prize could be dinner — HONESTY (fixed)
_showEnd's prize filter (`origin: 'alien' && tier <= 1`) included
"Can labeled BEANS" — 350 kcal, `class: 'food'`, honestly edible per its
own baseEffect. "Never dinner" violated — dinner wearing a joke label.
Fix: grant filter now excludes `kcalEach` / food-class items. 4 wacky
curios remain (fusion pellet, wrong bandage, audience token, spare battery).

### 5. Phone-it-in lied — HONESTY (fixed)
Copy said "The numbers don't move" while +1 showbiz favor landed
SILENTLY (sayFavor only announces |n|≥3). Fix: copy now reads "The numbers
don't move up…" and the quiet favor is announced:
"The System files it under: showed up. (+1 showbiz favor, quietly.)"

### 6. Recast used a second casting formula — consistency (fixed)
resolveContest's recast weighted by the old `1 + notabilityNotes*2`
while casting had been unified on the ONE shared `notabilityWeight`
(depth + impact, Steve 2026-10-09). Fix: recast now calls
`this.notabilityWeight(e.id)` — one casting weight everywhere.

### 7. Trauma costs unlabeled — HONESTY (fixed)
Stunt sub said "200 kcal, full commitment" (hid 4 trauma); phone-it-in
sub said "minimum viable effort" (hid 2 trauma). Canon: expensive buttons
name their cost. Subs now: "200 kcal, 4 trauma — full commitment" /
"2 trauma, minimum viable effort".

## HELD (attacked, resisted — why)

- **2/week budget**: contestTick enforces `showBudget.used >= 2` with weekly
  reset; summons increments the same counter at schedule time. 42-day
  simulation with forced ratings-dip: no week exceeded 2; `__summons`
  fires and consumes a slot. Exhausted budget → tick returns null.
- **Eligibility**: exiled player, dead player (health 0), gravely-wounded
  villagers (hp ≤ 20), children (<15) excluded from BOTH contestEligible
  and showEligible. Recast re-derives from living eligible; full wipe →
  cancelled with the System's disappointment on record.
- **TV doesn't kill**: zero `next: 'DIE'` / `do.die` in any show, watch, or
  together phase; contestChoose clamps show/summons damage to leave ≥1 HP
  (verified: 5 HP vs [50,60] → survives at 1, modal resolves). DIE terminals
  route to `_showEnd(ac, 'lost')` for show kinds.
- **Broadcast frame**: fireShow / fireRatingsSummons set `state.broadcast.live`;
  _showEnd / _showVillagerEnd always call broadcastEnd (idempotent, explicit
  exit card). Player show, villager watch, summons stunt/phone/refuse all
  lift the frame; activeContest cleared in every path. No phantom
  contestant: pulled villager still a member after.
- **Decline choice is real**: "sometimes you get a choice, sometimes not" —
  the choice branch prepends a real Participate/Refuse phase (Refuse runs
  _contestRefuse sequence); the grabbed branch says so explicitly.
- **Dead-code sweep**: broadcast.js in index.html + all 5 fns runtime-fired
  during a summons lifecycle; contestEngine.js loaded (Object.assign(G))
  and contestResolveVillager returns real outcomes; fan clubs move on show
  beats (apAdjustFavor showbiz lane); eligibility panel implemented in
  app.js (oversightPanel, not the old stub).
- **Stunt "numbers tick up"**: real — showbiz favor +3, announced with the
  favor readout via sayFavor (|n|≥3 announces). Held.

## Notes for the coordinator
- Commit carries [needs-eyes]: the snack nerf and prize removal change
  feel/economy — Steve should playtest the summons loop.
- No push/bump — "merged locally, pending ship" per the brief; the merge
  itself is the coordinator's landing step (this worker stops at the
  worktree).
- Sibling-sweep: the same bug classes were checked in adjacent paths —
  prize filter is the only grant site for shows; reqKcal is generic in
  contestChoose so future costed choices can use it; recast was the only
  divergent weight.
