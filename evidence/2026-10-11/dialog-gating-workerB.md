# Ambient-chat knowledge gating — Worker B (dialog-gating)

Date: 2026-10-11. Branch: `dialog-gating`. Proof: `scripts/test-dialog-gating-20261011.js` (ALL GREEN, 2 fresh-spawn seeds + positive cases; seed 20261011).

Canon read first: docs/CANON.md ("If you don't know, it doesn't show"), docs/CONVERSATIONS.md, docs/DIRECTIVES.md ("Discovery, not given: the game must not give away information the player hasn't earned").

## Steve's complaint
"Chat as you move around the world seems to still give you too much info on a fresh spawn."

## Leaks found and fixed (2)

### 1. villageLives ambient narration leaked TRUE villager names (game.js)
- **Before:** `const first = person.name.split(' ')[0]` — every ambient villageLives line ("X had the day of their life", "X came back with N kcal", "X is hurt", "X brought you a sample", "X traded something…", the leech line) used the true first name on a fresh spawn, when the player has earned zero names. The wound-death lines used `person.name` outright, including the awayNews variant (`💀 X died while you were gone`) delivered as chat on return.
- **Fix:** `first = this.displayName(id)` (earned name or observable descriptor); death/awayNews lines use `this.displayName(id)`. One-line-each changes; no plumbing touched.
- **Proof:** fresh-spawn corpus (95+99 lines over 40 rounds × 6 emitters, 2 seeds) contains zero true first names of unrevealed villagers; after `revealName(..., 'intro')` the same emitters DO use the name (4/41 lines).

### 2. overheardDiscussion openers carried unearned knowledge (characterGen.json + game.js)
Five opener lines moved out of the always-on pools into a new data-driven `overheard.gatedOpeners` map (keyed by intelligence voice, `{text, needs}`), merged into the draw pool only when the gate passes:
- analytical "If the System wanted us dead we'd be dead. So what does it want instead?" → `needs: 'system'` (systemArrived). **System concept pre-day-7 — the sharpest violation of the complaint.**
- analytical "The pattern in the attacks — has anyone else noticed it repeats?" → `needs: 'monster'`
- analytical "The third incident followed the same interval as the first two. That's not weather." → `needs: 'monster'`
- observant "The birds went quiet an hour before the last one came. Remember that." → `needs: 'monster'` (hushwolf-telegraph tip + presumes a past attack)
- creative "I say we name the monsters. Everything's less scary with a name." → `needs: 'monster'`
- `needs: 'monster'` = player has any `codex.monsters` entry (created on real encounters/fights). Two new era-neutral analytical openers written so the voice still has safe lines on a fresh spawn.
- **Proof:** 0/194 fresh lines match any gated opener; post-`systemArrived` the System line fires (14/493); after a monster entry the monster lines fire (18/495).

## Audited and already gated (no change)
- **overheardDiscussion speaker names** → `displayName()`; **npcGossipAbout** (truth.js) → `firstRef`/`displayName` (the third-person lie-policing branch is the designed reveal mechanic, rare and luck-gated).
- **npcTakeAction announce** → `displayName` + visible-action lines only ("forages the greens", "rests by the fire") — ambient color, no knowledge.
- **Porcupine tip** (`encAnimalCue`, encounters.js): already gated on `encAnimalKnown` (3 encounters/kill, or regional familiarity via `canShow('animal')`) AND only emitted when the animal is physically on the tile. Verified: `encAnimalCue('gila_monster') === null` fresh; porcupine cue returns the "Never grab it barehanded" text once known. No change needed — the task's "met a porcupine or learned it from someone" condition is exactly the existing gate.
- **encFleeText / encChaseText** → `encAnimalKnown`; **encDescribeAnimal** → descriptor until known.
- **revealName paths** (game.js `revealName`, villagerInitiative `otherSaid` overheard-name line) — intended earning mechanics; the line IS the reveal and immediately records it.
- **theorizeWith 'system' topic** — already gated on `systemArrived` at the conversation.js call site (player-initiated, not ambient).
- **alienPlayers mystery/👁 lines** — purely descriptive ("They move wrong"), no knowledge; known-path names via `apKnowsAlien` → `canShow('alien')`; feed naming triggers `apRevealAlien`.
- **firesideTeaching** — the designed presence-gated human-to-human teaching path (the "learned it from someone" the task allows); teaches via `identifyPlant`, names via `displayName`/`plantDisplayName`.
- **spreadGossip fragments** → `displayName`; **spreadPlantKnowledge** → `plantDisplayName`; **corpses** → `displayName`; **renderTalkLine** → `displayName` at delivery.
- **village.news / simVillageDay** (other villages' hunger/old-age deaths, drama cards) — told-as-story when joining another village; other-village content, out of fresh-spawn scope. Left as-is.

## Flagged, not fixed (outside Worker B area)
1. **Monster theories leak earned counter-knowledge (Worker A/D — conversation path).** `characterGen.theories.*.monsters` is drawable via player-initiated "theorize" on a fresh spawn with lines like "The headlight-eyed one hunts at night" (Highbeam Deer signature), "The Hushpuppy doesn't want to kill you — it wants quiet" (hushwolf counter — the trick Steve's monster-counter law says must be *learned*), "they telegraph. Watch the shoulders, not the eyes." Content-gating gap in the conversation engine, not ambient movement — flagging for whoever owns theorizeWith gating.
2. **temperamentTalk 'sardonic' pool** has a System line ("Relax. If the System wanted us dead we'd be decorative by now.") servable pre-day-7 in player-initiated conversation — same class as Worker D's goal-'answers' fix; era-gate candidate.
3. **Conflict `history` strings** bake true names of two third parties at generation and are spoken in the late-night confession beat (conversation.js:4458/4461) — trust-earned path, but names a third party the player may never have met. Worker A area.
4. **`conflictNote`** ("⚡ old history with X") on the person card uses the true first name of the other party for known conflicts — person-card UI surface, not ambient chat.
5. **Overheard analytical skill-teach** ("(Something in their exchange sticks with you. read people +1)") fires on fresh spawn — shows skill ids, not game facts; kept as the designed village-as-classroom earning path. Judgment call, noted.
6. **village.news true names for other villages** — fire-story context on join; left deliberately.

## Coordination notes
- Shared-worktree hazard is live: the checkout was on `dialog-coherence` (Worker D) mid-run, and `git checkout dialog-gating` is currently BLOCKED by untracked files (`evidence/2026-10-11/dialog-coherence-workerD.md`, `scripts/test-dialog-coherence-20261011.js` show as staged-deleted `D` on that branch — not mine, not touched). To avoid knocking anyone off their branch or sweeping their uncommitted work, this commit was built with the private-index recipe directly against `dialog-gating` (no checkout): base files extracted via `git show dialog-gating:<path>`, my 4 game.js edits + the overheard JSON restructure re-applied to the base copies (verified: diff vs base shows ONLY my changes, 21 + 23 diff lines), committed with `-p dialog-gating`. Proof ran against a clean `/tmp/dg-test` extract of base+my-changes (not the mixed working tree).
- No push / bump / live per instructions. No jest run (no test files touched besides the new proof script, which is node-harness).
