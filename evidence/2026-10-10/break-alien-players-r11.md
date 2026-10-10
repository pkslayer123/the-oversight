# Break-it: alien players — r11 (2026-10-10)

Target index 7, round 11. Attacked `src/js/alienPlayers.js` (2742 lines, 74 methods).
Read docs/CANON.md first. **Canon note:** no ALIEN-PLAYERS.md exists in docs/ —
worked from the @ontology header (Steve 2026-10-07: they impersonate HUMANS,
not monsters; exclusive pool) plus CANON.md standing rules ("If you don't know,
it doesn't show", no-silent-actions), same as r6–r10.

This round went deeper than r10 (this morning: activation/deactivation/event-feed
naming leaks, codex name, dead beam flag). Proof:
`scripts/test-break-alien-20261010-r11.js` — **54 checks (18 × 3 seeds), all green.**
Red→green demonstrated: pre-fix, exactly the 4 catch checks fail on all 3 seeds
(12 red); post-fix 54/54. Regression: this morning's suite 122/122, r7's suite
252/252 — all still green. Ontology: 52/52 validated after the header rule addition
(docs/ONTOLOGY.md regenerated).

## Catches (4 — two honesty, one honesty+copy, one knowledge leak), all fixed

**H1 — group chain announced the next fighter BEFORE the chained start confirmed.**
The tbEnd wrap said "👥 The next one steps out of the treeline. No rest. No mercy."
then called apStartEncounter(nextPid). A refused/throwing start left the line hanging
over an empty treeline (same announce-before-confirm class as r8's phantom
alienEncounter fix). Fix: say the line only when the chain lands; on failure the
dispersal is named honestly ("The others melt back into the treeline."). The
consume-first bookkeeping was already correct (no re-entry, no dangle).

**H2 — "+5 fight favor for 'survived a group encounter setup'" granted at FIGHT START.**
apGroupBanter's apAdjustFavor why-copy claimed survival before anything was fought.
Fix: 'faced down a group encounter — the crowd loves a spectacle'. The favor itself
is real (announced with exact n and lane).

**H3 — Wren's feed warning named a timeline with no backing mechanic.**
"A message board post, quickly deleted: 'stay away from the northern treeline
TOMORROW. trust me.'" — r7's verdict on contact warnings was "vague by design:
promise no mechanic, name no timeline"; this one (in apFeedMessage, not
apContactWarning) named one. Nothing in the engine backs a northern-treeline
event. Fix: "for a while" — vague, no timeline, no mechanic promised.

**H4 — apGroupBanter named personas outright pre-reveal.** The banter's own comment
claimed "cover names (safe pre-reveal)" — but there ARE no cover names in
alienPlayers.json. p.name ("Countess Sable", "K'thari Expeditionary (Ret.)",
"Xenobiologist, Meridian Institute") IS the alien truth: the fighter card says
"Stranger" and apCombatIntro stays silent pre-reveal. A group encounter fires at
2 encounters per persona, BEFORE the 3rd-encounter auto-reveal — so the banter
could name them before the player earned it. Same class as this morning's T1/T2/T3;
the banter was assumed safe and missed. Fix: names and persona-specific banter
branches gate on apKnowsAlien for ALL pids (hoisted the existing _allKnown check
to the top and reused it); pre-reveal the team-up is anonymous ("Two figures step
out together. You don't know their names.") with generic lines. Post-reveal the
full personality banter is unchanged (proven in test). Ontology header gained the
(knowledge_persona_names) rule.

## Held — real attacks that resisted

- **Old Tam bond farm:** 15 straight wins → bond 15; lifeline still needs bond>=2,
  7-day cooldown, 40% roll; dead drops gated 3-day global (10/30d forced). The
  farm produces exactly the bounded rewards the design prices. No infinite loop.
- **trackedBy permanence:** the sadistic-package tracker is never cleared, but
  sporting rules (2-day/persona) beat the ×3 weight — 0/60 forced rolls returned
  the tracked rival inside its window. Rate modifier, not a lock (r7's verdict,
  re-verified). Death-continuity checked: playerDeath reuses the scholar object,
  so ap.met/known/favor/trackedBy persist across lives — village-level state,
  consistent with the village-as-protagonist canon.
- **Persona-package stacking:** global 6-day cooldown (single lastPersonaPackageDay),
  1/5 forced fires. Care package 4-day + favor>=20. All cooldowns global, not
  per-persona — no multi-persona stacking.
- **Group chain dispersal:** tbEnd('fled') and tbEnd('lost') with a live alienGroup
  → group deleted, no chained start, no dangling state. Sleep is guarded mid-combat
  ("Not mid-fight — finish it first"), so the dawn contest grab can't orphan a live
  alien fight. Contest rigging winMod is real (-12 cheer bonus via
  contestResolveGroup), not fiction.
- **Dead-code census:** all 74 exported ap* methods have ≥1 runtime call site
  (internal this.fn( or external). No dead exports. apReadinessCheck is debug-only
  by design (not in the ontology gating rule — apEligible is systemArrived + wave 2+).
- **Sibling sweep:** swept the four bug classes in related systems — contests'
  "survived" claims are all post-outcome; no other "tomorrow" promises; the
  announce-before-confirm pattern in apStartEncounter's own intro is unreachable
  in practice (inCombat guarded upstream in checkEncounter) and describes the
  rolled encounter, not the fight start; all other p.name/per.name surfaces in
  the module are apKnowsAlien-gated (swept all ~30); Monster Codex never sees
  alien fighters (identifyMonster only for kind:'monster').

## Landing

- Ready for landing; merge is the coordinator's job. Files changed:
  src/js/alienPlayers.js (4 fixes + ontology rule), scripts/test-break-alien-20261010-r11.js
  (new, 54 checks × 3 seeds), docs/ONTOLOGY.md (regenerated), evidence/2026-10-10/break-alien-players-r11.md (this file).
- No [needs-eyes]: copy-only honesty fixes + message ordering, no feel/combat/UI
  mechanics changes (r7 precedent). Flagging for the coordinator: H4 changes what
  players see in pre-reveal group fights (anonymous team-up) — copy surface Steve
  may want to eyeball.
- Worktree contains only committed work after landing (to be verified).
