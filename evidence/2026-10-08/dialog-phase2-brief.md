# Dialogue Phase 2 worker brief — the Scene (Steve-approved rethink §6)

## Context
Phase 1 landed live (master a30d0f1, both endpoints serving). It built: one menu builder
(`Game.buildMenu` + `finalizeMenu` in src/js/conversation.js), honest opt-out with real
consequences, deflect→deflected fix, dead seeds fixed, want↔mood wiring, count-bypasses killed,
"..." on every menu, disposition filter, stranger small-talk gating. Proof:
scripts/test-dialog-phase1-20261008.js (56/56 × 3 seeds). Full report:
evidence/2026-10-08/dialog-phase1-report.md. Rethink:
evidence/2026-10-08/dialog-architecture-rethink.md (§3 pipeline, §5 identity rule, §9 research).

## Mission (rethink Phase 2, §6)
Build the Scene pipeline — five items, each independently playable:

1. **Scene-state unification.** One `Game.getScene(vid)` composing want + mood + relationship
   tier + relDays + current beat/topic into a single object. `buildMenu` and all handlers read
   the Scene instead of re-deriving state in scattered places. The Scene is the unit the
   consequence resolver and menu builder share — no more wants/mood/topics/memory barely
   interacting.
2. **One consequence resolver.** `Game.resolveConsequence(vid, action)` — the single place
   trust/mood/disposition/memory consequences attach. Today they attach in many unrelated
   handlers (dlg:cant, dlg:more, want resolution, trust changes). Every consequence flows
   through the resolver; every `remember()` write needs a later read site (Telltale-theater
   rule from research §9 — audit existing remember() writes, wire reads or stop promising).
3. **Consequence legibility pass on labels.** Research §9: paraphrase mismatch is the #1
   shipped dialogue failure. Every menu label must convey pragmatic intent + tone
   (accept/decline, politeness, truth/lie — the 66% that actually varies). Audit every label
   buildMenu can emit; fix any label whose eventual line's intent/tone the label hides.
4. **Ask/Answer Contract as a validate gate.** Formalize: every NPC question (pendingQ,
   reactiveQ, genericQ, player-asked) MUST offer honest answer + hard truth (where one
   exists) + "I'd rather not say" + "...". Build `Game.validateAskContract(vid)` and run it
   as an assertion in the proof test over all question paths — a missing honest option is a
   test failure, not a design discussion.
5. **Memory-driven "what's alive" menu.** Invert the topic menu: surface open threads,
   fresh memories, want-driven questions, and world events (`lately` system) instead of the
   static topic pool. The subject-change menu becomes "things between us." Extend the
   `t2clock` "it's different now" pattern to every repeated question, not just topic2.

## Steve's laws (non-negotiable)
- Honesty always available, never consequence-free. "I'd rather not say" = boundary, not attack.
- Lying available; cheap now, costly if exposed.
- Disposition: kind/cruel shifts over time; out-of-character options marked + 2× cost.
- Strangers: small talk + shared history only (Phase 1 gating stays).
- No LLM dialogue at runtime. No dialogue timers. One mobile screen (390×844), no scrolling
  for the current beat. No new art/audio required.
- Hide the numbers: consequences named in fiction, never leaked as stats (Firewatch rule).
- Fail forward: refused favors and blown probes produce story, never dead ends.
- Silence stays cheap: one generic react per mood, no bespoke silent branches.

## Proof required (break-it style — Steve: "these break it tests are what we need")
New script scripts/test-dialog-phase2-20261008.js, seeded (mulberry32, fixed default +
SEED override), asserting:
- Scene unity: same vid+state → same Scene object shape; no handler reads raw state that
  the Scene doesn't carry.
- Resolver unity: every trust/mood/disposition/memory change in a played conversation
  flows through resolveConsequence (instrument or audit).
- Contract gate: validateAskContract passes over ALL question paths (the 36 bespoke
  questions + reactive/generic) — honest + boundary + silence present everywhere.
- Legibility: spot-check labels vs eventual lines for pragmatic-intent match.
- Memory theater audit: every remember() write in the conversation system has ≥1 read site.
- Regression: rerun test-dialog-phase1-20261008.js green.
All green on 3 seeds before landing.

## Landing protocol
- Worktree: ~/workspace/worktrees/dialog-phase2 (branch dialog-phase2). NEVER touch
  ~/workspace/the-scattering directly. NEVER remove another run's worktree (cap is 3 —
  if occupied, FAIL LOUDLY, do not prune).
- Rebase onto current master first (`git fetch origin && git rebase origin/master`).
  If rebase conflicts, resolve by hand — never force-push, never reset shared history.
- Commit ONLY with `bash scripts/safe-commit.sh "msg" -- <paths>` (no -m flag; script
  has no exec bit — invoke via bash). After commit: `git read-tree HEAD`.
- Keep @ontology headers accurate — scripts/bump-sw-version.sh BLOCKS release on
  validation failure. If you delete/rename a provided function, update the header first.
- Merge: `git merge --ff-only dialog-phase2` in the main tree. Do NOT bump the version
  (coordinator handles the release). Do NOT merge to master yourself — report ready.
- Never run two jest processes concurrently; ad-hoc jest gets
  --cacheDirectory=/tmp/jest-cache-dialog2. Seed Math.random BEFORE eval in node harnesses.
- Report: commits, proof results (seeds + counts), play verdict (played stranger/friend/
  enemy + kind/cruel arcs — must read like a person), files changed, anything left out.
