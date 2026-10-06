# Knowledge-gating audit 2 — 2026-10-06 (~13:20–14:00 CDT)

Follow-up to `~/workspace/goals/the-scattering-roguelite-survival-game/hidden_files/fleshout-20261006/knowledge-gating-audit-20261006.md` (~02:00 CDT).
Scope: every NEW or CHANGED player-visible surface from the post-audit commits —
wave-2 narration (burden/gallowdeer/paparazzo/heckler/union_rep/understudy),
aggro horror sprite pass, monster sprite quality pass, brawler heat fix,
conversation rethink. Steve's law: "If you don't know, it doesn't show."

Method: read-only code review + node harness checks (plain node, NOT jest;
harness at /tmp/kgate2-harness.js, ephemeral). Drove real combat as a player
with a FRESH codex (no patterns learned): understudy strike-play,
paparazzo stand-still, union_rep summon + walkout. No browser (headless
Chromium hangs here). Did not touch any tracked file except this evidence file.
Note: the worktree is hot — HEAD moved twice during this run (02b096a version
bump, 6658389, 42c020e landed mid-audit); all line numbers below are against
the worktree at audit time.

## REAL LEAKS (all post-audit; play-verified unless noted)

### 1. Understudy phase beats: unconditional coaching, no learning granted (LIVE)
Commit `e069503` (2026-10-06 12:50 UTC) "Understudy: wave-2 escalation bar".
The per-attack telegraphs ARE properly gated (`known ? coached : dread` via
encDeclareDirect), but the phase-transition narration is not — and unlike the
heckler headliner, NO tbLearnPattern is granted at these moments. Same class
as the mirror_stag leak from audit 1 (fixed in 88493c8).

Play-verified with fresh codex (12 strikes, usSeen grew to 12, phase
`performing` — codex never learned):

- Rehearsing beat:
  `"It is doing the thing you do before you do it. Badly. But recognizably. (It copies at 50% — it learns fast.)"`
  — exact fidelity %, ungated.
- Performing beat:
  `"It stands the way you stand. Moves the way you move. \"I've got it now.\" Your Fire-hardened spear — it has seen that one 3 times. It knows where it lands. (OPENING STEAL: your next Fire-hardened spear strike is anticipated — switch weapons.)"`
  — attack true name "OPENING STEAL" (names are earned per encAttackName),
  exact observation count, imperative "switch weapons" coaching. Fallback
  variant `(It copies at 80% — kill it or be unpredictable.)` also ungated.
- Steal resolution (tbPlayerStrike, game.js:15512):
  `"It knew that one was coming — it was already gone. Your Fire-hardened spear glances off its guard. (OPENING STEAL: anticipated — half damage. Switch weapons.)"`
  — ungated coaching + attack name, every time the steal fires.
- Improv beat (code-read; didn't drive HP <30% in harness):
  `"\"No no no—\" It stumbles, the copy breaking. Then it comes at you with ALL of it at once. (DESPERATE IMPROV: it chains everything it learned — two of your moves, badly, frantically.)"`
  — phase true name + mechanic description, ungated.

### 2. Union_rep picket summon: true name in narration (LIVE)
Commit `6943235` (2026-10-06 12:04 UTC) "Wave-2 roster". game.js picket-summon
block: `` this.say(`"PICKET LINE!" A ${pick.name} lumbers in, holding a tiny sign. (The rep called backup — from the OLD wave.)`) ``
`pick` is the raw mdef from monsters.json — `pick.name` is the TRUE name.
The spawned fighter itself uses the gated `monsterDisplayName(pick.id)`.
Play-verified with fresh codex: narration said
`"PICKET LINE!" A Glasswing Darter lumbers in, holding a tiny sign.`
while the grid fighter was named `a ... (picket)`-style descriptor
("the thing with headlights for eyes, standing too still (picket)").
monsterDisplayName's contract: "The TRUE name never shows pre-System."
Fix: use `this.monsterNoun(pick.id)` (exists, sentence-safe, gated).

### 3. Union_rep walkout: gated knownCue content handed out free (LIVE)
Commit `6943235`. Play-verified with fresh codex:
`"WALKOUT! WALKOUT!" It climbs onto the bullhorn and stops fighting entirely — full-time coordination. (Allies +8 damage. The rep is UNTARGETABLE while coordinating.)`
The monsters.json knownCue for union_rep — shown ONLY after the pattern is
learned — says the same thing: "at WALKOUT they hit +8 while the rep goes
UNTARGETABLE behind the picket line." The phase narration duplicates it
ungated. Unlike the paparazzo exclusive (below), there is no structural
guarantee the player learned "Grievance Filed" first (walkout fires at half
HP; a player who never took a direct hit reaches it unknowing).

### 4. Paparazzo exclusive beat: gated knownCue content handed out free (LIVE)
Commit `6943235`. Play-verified (stood still, prediction hit 4/4, phase
`exclusive`):
`"GOT IT. The money shot." It knows exactly where you'll go. (PREDICTION 4: the flash is now UNBLOCKABLE — break line of sight.)`
Ungated in code; duplicates the knownCue ("Four shots is all it needs: the
money shot can't be dodged."). Caveat: in the normal flow the first flash
resolve teaches the pattern (tbLearnPattern on resolve), so by exclusive the
player usually knows — but the beat itself is ungated, and the LOS-fizzle
edge case (flash fizzles, pattern never learned, prediction still climbs on
declare) reaches it unknowing. Minor.

### 5. Paparazzo flash resolution: prediction mechanic announced pre-learning (LIVE)
Commit `6943235`, game.js:18471 (telegraph resolve path):
`` this.say(`FLASH. The world goes white — you're frozen mid-step. (Prediction ${m.pzPrediction}/4 — it learns your dodge.)`) ``
Play-verified: fired on the FIRST flash with a fresh codex, before any
learning — `(Prediction 1/4 — it learns your dodge.)`. The miss variant is
the same class: `(Prediction ${m.pzPrediction}/4 anyway — it learns from the miss too.)`.
The declare-time cue IS properly gated (dread vs `(Flash incoming — freeze 1 turn. Prediction N/4.)`),
so the resolve line undercuts it.

### 6. Paparazzo still-beat: mechanics coaching ungated (LIVE)
Commit `6943235`: `"Hold still. Yes. Just like that." Standing still makes it learn you FASTER. (Prediction climbing double.)`
— exact mechanic ("climbing double"), ungated. Code-read (line confirmed,
no known check); the neighboring tracking beat is purely descriptive
(`"Hold still. Hold— STILL." The lens is tracking you now. (It is learning your dodge.)` — borderline-clean).

### 7. Landlord foreclosure: coaching ungated (LIVE)
Commit `3939c53` (2026-10-06 12:48 UTC) "Landlord: the lease actually grows":
`"FORECLOSURE PROCEEDINGS INITIATED." The signs multiply. The rent climbs. (Its healing climbs too — end this.)`
— "(Its healing climbs too — end this.)" is mechanics coaching + imperative,
ungated. Code-read. (The landlord's other beats — rent/notice/lease — are
properly known/unknown split.)

## TEACH-MOMENT REVEALS (borderline-clean — flag for Steve, not leaks)
Coaching fires at the exact moment learning is granted, or describes a
witnessed state change the player must react to NOW:

- Heckler headliner: `"Oh, we've got a LIVE ONE!" It has your number now. (3+ SHAME: answer back next turn or act and take +2.)` —
  fires in the same block as `tbLearnPattern(m)` (game.js:20250); the
  compulsion choice is imminent next turn. Withholding the consequences
  would make the choice blind-unfair. Acceptable.
- Heckler compulsion: `The words become a weight. You WANT to answer back. (Next turn: WAIT to answer (lose the turn, clear 3 shame) or act and take +2 shame.)` —
  fires after learning, same turn. Acceptable.
- Heckler PILE-ON suffix `(PILE-ON: +2 SHAME)` — numeric feedback of a
  witnessed stack, same class as damage numbers. Acceptable.
- Union_rep line-break: `"The line — the LINE is broken!" ... (The walkout collapsed — it is TARGETABLE again. End it.)` —
  witnessed state change; "End it." is mild. Acceptable.

## VERIFIED CLEAN

- **Telegraph declares (all four new monsters)**: `known ? coached : dread`
  splits everywhere — understudy mirror-strike + improv declares, heckler
  direct, paparazzo flash, union_rep grievance. knownCue appends only via
  knownTail after learning. The system from audit 1 holds.
- **Heckler warm-up beat**: `known ? 'It cracks its knuckles. "Oh, this ought to be good." (It is sizing you up — the set starts soon.)' : 'It is watching you the way a cat watches a dropped glass.'` ✓
- **Union_rep organizing + solidarity beats**: known/unknown splits ✓
  (`clipboard` / `STAND TOGETHER!` coached vs `holding a meeting. About you.` dread).
- **Heckler jibes**: `known ? [3 coached jibes] : [2 dread jibes]` ✓.
- **Understudy COLD READ** (commit `6658389`, landed mid-audit at 18:33 UTC):
  `known ? '"Nothing? Then I\'ll do you." ... (COLD READ: it learned your stillness. It attacks with your own body, badly.)' : 'It stops watching. It stands the way you stand. It is coming at you.'` ✓ —
  **bonus finding**: this is the anti-stall prod for re-verify gap #4
  ("understudy passive stall — STILL OPEN"). The re-verify grepped for
  `usBored`/`usProd`/`usWatchCount`; the actual implementation uses
  `usColdRead`/`usWatchTurns`. The prod EXISTS and is knowledge-gated —
  gap #4's verdict should be re-checked (triggered in my harness after ~3
  watching turns).
- **Landlord rent/notice/lease beats**: known/unknown splits ✓.
- **Encounter intros**: `You don't know what that was. <descriptor>.` gating
  intact (observed in harness).
- **Brawler 9209082** (unseen killings leave no heat): mechanical only — no
  new player-visible strings. CLEAN.
- **Brawler 8f9eb4e** (betrayal kills respect loot-as-action): REMOVES a
  leak — the old auto-loot line announced true names via
  `items.find(i => i.id === id).name`; the replacement
  (`Their pack is there, on the body. What is in it is yours to take — or to leave with them.`)
  is name-free, and the corpse pack UI renders through the gated
  `itemDisplayName`. LEAK-FIX, no new leak.
- **Sprite passes** (`7e9e5a1` aggro horror, `0d03d25` quality): sprites.js
  only, zero text surfaces. CLEAN (aggro sprites are diegetic — they show
  when the monster is aggro, which the player witnesses).
- **Burden drawbacks** (`ab551fd`): mechanical dodge-penalty; the single
  this.say in the diff is pre-existing context. CLEAN.
- **Conversation rethink** (`ec31b0f` convo-wants.js, `d28d03f`
  convo-dialogue.js): menu reorganization only — no new information
  surfaces. NPC openers reveal their own needs ("do you have anything to
  eat?" at hunger>70) diegetically through dialogue; secrets stay
  trust-gated in the existing machinery. CLEAN. Two notes: (a) `dlg:doubt`
  is correctly gated on hasDoubts; (b) the seed opener renders
  `"About ${seedNote} — "` where seedNote is meta text
  ('still bursting with news they never got to share') — dialogue-quality
  wart, not a knowledge leak. (Reviewed the committed versions: both files
  are deleted uncommitted in the worktree — sibling churn, not mine.)
- **offerSplit / eligibility panels / food stats**: untouched by the scope
  commits — UNCHANGED (were clean in audit 1).

## UNCHECKED (out of scope or sibling-active)
- `d0bd9b9` disease law pass (claims knowledge-gated; not in the named scope).
- Moderator (wave-2 apex) narration: ungated coaching-looking lines at
  game.js:20436/20446/20463 (e.g. `(The field is wider. The ground itself rejects you. Keep flipping the mute — or go quiet until it loses the thread.)`);
  the mute line at 20467 IS known/unknown split. Not in the six-monster scope.
- Dirty worktree files (sibling-active): game.js duck-snake diff, corpses.js,
  encounters.js, food.js, app.js hunks — not reviewed.
- Audit 1 leak #1 (mirror_stag unconditional cueText): FIXED in `88493c8`
  (cue split into known/unknown variants). Audit 1 leaks #2 (contest prize
  raw id) and #3 (alien loot baseEffect) were not re-checked this run.

## Suggested next actions (for the fixer — game.js edits, NOT done here)
1. Understudy beats: gate on `known` with dread variants (mirror the
   cold-read pattern at game.js:20048), or grant `tbLearnPattern` at the
   performing transition (teach-moment, like the heckler headliner).
2. Picket summon: `pick.name` → `this.monsterNoun(pick.id)`.
3. Walkout / exclusive beats: split into known/unknown variants; keep the
   flavor ungated, gate the numbers (`+8`, `PREDICTION 4`, `UNBLOCKABLE`).
4. Flash resolve: drop or gate the `(Prediction N/4 — it learns your dodge.)`
   parenthetical until the pattern is learned.
5. Landlord foreclosure: gate `(Its healing climbs too — end this.)`.
6. Re-check re-verify gap #4 (understudy stall): the COLD READ prod exists
   and is gated — the STILL OPEN verdict was a name-mismatch in the grep.

## Test results
- Node harness (fresh codex, played as a player): understudy performing /
  rehearsing / steal-resolution beats all fired ungated (3 hits);
  paparazzo exclusive beat + flash-resolve prediction line fired ungated;
  union_rep summon true name + walkout beat fired ungated. All captured
  verbatim above.
- No jest run (nothing here is a jest suite; harness scripts are the
  deterministic repros). No files edited except this evidence file.
