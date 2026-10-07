# Knowledge-leak sweep — 2026-10-07 (Steve's law: "If you don't know, it doesn't show.")

Auditor: Muse (subagent, flesh-out loop queue #7). READ-ONLY on engine code; no fixes applied.
Engine loaded from `git show HEAD` (never the dirty worktree). HEAD audited: `00188bd`
(Version bump db9acd8-20261007-155432). Probe: `scripts/test-knowledge-leaks-20261007.js`
(seeded mulberry32, SEED=20261007 and SEED=7 — identical results both runs: 55/64 pass,
same 9 failures, deterministic).

## HEADLINE FINDINGS

### F-A (CRITICAL): a previously-fixed leak is LIVE AGAIN — stale-base revert
Commit `2c5eea3` (2026-10-06) fixed the justice-confrontation voice to count only
witnessed crimes. Commit `dddeb76` (2026-10-06, "Fix map seen check") reverted it —
the diff literally restores the pre-fix lines (`index 36fae97..c4b0452`) — and the
SAME commit deleted the proof test (`scripts/test-brawler-corpse-display-20261006.js`)
that would have caught the regression. The sibling fix `fad9c6c` restored the
game.js corpse-loot hunk from the same revert, but the justice.js hunk was never
restored. At HEAD, `justice.js:219-221` counts ALL crimes again:
`const murders = crimes.filter(c => c.type === 'murder').length;`
Probe S4 drives it: an UNWITNESSED murder produces
"⚖ … doesn't raise their voice… 'Someone's dead. And everyone knows whose hands. Talk.'"
— the exact leak 2c5eea3 fixed. Engine owner: re-apply the 2c5eea3 justice.js hunk
(`const known = crimes.filter(c => c.witnessed !== false);`) and restore the proof test.

### F-B (HIGH): the 7 audit-2 leaks were NEVER fixed — df363e0 added only the test
`df363e0` "Knowledge-leak fix pass: patch + proof test for 7 audit leaks" changed ONE
file: the expected-fail proof test. No code patch ever landed (`git log -S` confirms
no commit ever wrote the gated variants). All 7 are live at HEAD (S10):
1. Understudy rehearsing beat — game.js:23177: `(It copies at 50% — it learns fast.)`
   ungated, no tbLearnPattern granted. DRIVEN in S10a: 2 strikes → beat fires while
   `tbPatternKnown('understudy','Your Move')` is false.
2. Understudy performing beat — game.js:23169-23172: `(OPENING STEAL: your next …)`
   + exact observation count, ungated.
3. Understudy steal resolution — game.js:18105: `(OPENING STEAL: anticipated — half damage. Switch weapons.)` ungated.
4. Understudy improv beat — game.js:23157: `(DESPERATE IMPROV: it chains …)` ungated.
5. Union_rep picket summon — game.js:23672: `"PICKET LINE!" A ${pick.name} lumbers in`
   uses the RAW mdef true name while the spawned fighter is gated
   (`monsterDisplayName(pick.id) + ' (picket)'`, game.js:23679). Fix per audit-2:
   `this.monsterNoun(pick.id)`.
6. Union_rep walkout — game.js:23639: `(Allies +8 damage. The rep is UNTARGETABLE
   while coordinating.)` unconditional. Note the sibling beats (organizing 23620,
   solidarity 23630) ARE properly `known ? coached : dread` — the walkout is the
   ungated odd one out.
7. Paparazzo flash resolve — game.js:21282,21288: `(Prediction N/4 — it learns your dodge.)` ungated.
8. Paparazzo exclusive — game.js:23522: `(PREDICTION 4: the flash is now UNBLOCKABLE — break line of sight.)` ungated.
9. Paparazzo still beat — game.js:23564: `(Prediction climbing double.)` ungated.
10. Landlord foreclosure — game.js:23353: `(Its healing climbs too — end this.)` ungated.
(10 sites; audit-2 counted 7 with sub-items.)

### F-C (MEDIUM): wetland arrival text reveals cattail + its food use at L0
game.js:136-137 (ARRIVAL.wetland): title `'Still water, cattails'` and text
`'Cattails mean starch. …'` Cattail is a codex plant (plants.json) whose food use
requires L2 (`uses[0].minLevel: 2`); only oak/hickory trees start as common knowledge
(game.js:1845-1848) — cattail does NOT. Entering a wetland teaches the name AND the
starch use with zero knowledge check. Same class as audit-1's hickory note, but
stronger: it's a USE reveal, not just a name.

## PER-SURFACE VERDICTS

### S1 monster display primitives — CLEAN
`monsterDisplayName` (game.js:12371): descriptor pre-System, villageName/System true
name only when earned. `monsterNoun` (12386): sentence-safe (article-strip,
comma-clause truncation, prose-verb fallback to 'something'). Probed fresh vs
village-named: `gallowdeer` → 'the thing with headlights for eyes, standing too
still' → 'Headlight Harry' once the village names it.

### S2 telegraph cue gating (gallowdeer benchmark) — CLEAN
Declared via the real `encDeclareBeam` path, fresh codex: cue is the bespoke dread
text ("It freezes. Like a deer in headlights…"), no attack true name, no knownCue,
no "You know this one". After granting the pattern: "You know this one: Ocular
Discharge …" + knownCue ("The freeze is the tell…"). `encAttackName` returns
'the attack' pre-learning, the true name post. (Note: `sayTelegraphOnce` is
intentionally silent in combat — the grid is the warning; the cue text is what the
codex/probe reads.)

### S3 corpse-loot itemDisplayName — CLEAN (regression held)
`itemDisplayName` (game.js:24729): non-plant plantIds ('stone_knife', 'effect_*',
'keepsake') show stored names; real plants route through gated `plantDisplayName`;
'meat_*' shows the stored name. The dddeb76 revert of this hunk was repaired by
`fad9c6c`; verified green at HEAD.

### S4 justiceConfront unwitnessed — LEAKING (F-A)
See F-A. The voice counts unwitnessed crimes; an unwitnessed murder draws the
"Someone's dead. And everyone knows whose hands" branch. Witnessed murders still
correctly get the murder branch (no over-correction needed — just restore the filter).

### S5 whoTag occupation — CLEAN
betrayal.js:157: truthful villager's occupation shows only via the journal People
Codex (`journalPerson(vid).occupation.value`); pre-knowledge the tag is the
age/gender descriptor (+ liar's-mask cover when a live lie exists). Probed:
no occupation pre-journal, occupation appears after the journal records it.

### S6 pantry gating — CLEAN
`pantryItemKnown` (game.js:24607): unknown plants hidden, known shown; 'meat_<mid>'
gates on villageName/System arrival; staples (no plantId) always shown. app.js
pantry render calls `pantryItemKnown`; unknown-meat kcal masked with "?".

### S7 journal/codex gates — CLEAN
`codexPlantLine('dandelion')` hides the name pre-L1, shows it post-identification.
`journalPerson` entries exist per villager (name-gated via displayName).

### S8 sentiment-bond gate — CLEAN (mechanism); journal-or-codex surface ABSENT
- `Game.sentimentTaught()` false on fresh run; `channelSentiment` returns
  'You hold it. Nothing happens. Not yet.' pre-teaching, acts post-teaching.
- app.js:10748 gates the 💛 Channel button on `Game.sentimentTaught()`.
- Bond perception (game.js:24396): `(bond N)` only in the say line when taught;
  untaught players get "You clutch your X. You're still here." — no number.
- **Unconfirmed (was already unconfirmed): the bond has NO journal or codex surface
  at all.** grep of journal.js and codex-people.js at HEAD: no bond/keepsake-bond
  entries. The bond lives only in the victory say line and the Channel button.
  Whether a journal-or-codex record of the bond SHOULD exist (and be gated) is a
  design question — flagged for Steve, not decided here.

### S9 monster corpse examine — CLEAN
`corpseForKill` (game.js:24227) registers `descriptor: monsterDisplayName(mdef.id)`
(gated) alongside the internal true `monsterName`; `corpseDesc` (corpses.js:465)
prefers the descriptor. Driven: fresh-codex gallowdeer kill → examine says
"the thing with headlights for eyes…" with no true name. LATENT HAZARD (not a live
leak): the true name rides on the corpse record as `monsterName`; only
corpses.js:465 reads it, behind `c.descriptor ||`. If any future display path reads
`c.monsterName` directly, it leaks. Consider dropping the true name from the record
or renaming the field.

### S10 audit-2 beats — 10 LIVE LEAKS (F-B)
Listed in F-B. S10a drives the rehearsing beat as a player; the rest verified by
code read against HEAD (all unconditional says, no `known ?` gate, no tbLearnPattern
grant at the transitions).

### S11 static scans
- Combat cards: all 6 monster fighter-creation sites (game.js:16593, 16645, 16668,
  18405, 18435, 23679) use `monsterDisplayName` — CLEAN. (registerDeath at 19023
  passes the already-gated fighter `t.name`; corpseForKill at 24227 passes true
  `mdef.name` as internal `monsterName` — see S9 latent hazard.)
- Alien loot grant (game.js:24354): name + flavor announce BY DESIGN (comment:
  "the System's confused narration"), `baseEffect` hidden until first use via
  `alienLootReveal` — CLEAN by design.
- Arrival pools: cattail leak (F-C); all other plant/animal names clear.
- Plant grid icons: no species-specific icons exist — cells render as generic
  'plant'/'bush'/'tree'; species surfaces only through gated examine/perceive —
  CLEAN by construction ("blind but honest", never disabled).
- Perceive gates (perceive.js:166-184): bush on codex.plants level, tree on
  treeLevel — CLEAN. Carexplore examine (carexplore.js:361-371): gated via
  treeName — CLEAN (audit-1 F1 fixed).

## FOR THE ENGINE OWNER (do not fix in this audit)
1. justice.js:219-221 — restore the 2c5eea3 witnessed filter:
   `const known = crimes.filter(c => c.witnessed !== false);` then count from `known`.
   Also restore `scripts/test-brawler-corpse-display-20261006.js` (deleted by dddeb76).
2. game.js:23177, 23154-23158, 18090, 23142 (understudy) — gate on
   `tbPatternKnown` or grant `tbLearnPattern` at the phase transitions (the
   df363e0 test documents the intended AFTER state).
3. game.js:23672 — `pick.name` → `this.monsterNoun(pick.id)`.
4. game.js:23639, 21282, 21288, 23522, 23564, 23353 — gate coaching on `known`
   (pattern exists at 23612/23616 for walkout's siblings).
5. game.js:136-137 — wetland arrival: gate 'cattails'/'starch' on plantKnown or
   reword to descriptor + honest unknown.
6. Consider removing true `monsterName` from corpse records (S9 latent hazard).

## FOR STEVE (design calls, not decided here)
- The bond has no journal/codex surface — is that intended (bond is felt, not
  recorded) or should the journal/codex record it behind the sentiment gate?
- Audit-2's 7 leaks were never fixed in code (df363e0 shipped test-only). The
  understudy's phase beats currently teach nothing while saying everything —
  the intended fix per the test is teach-moments at transitions (like the
  heckler headliner). Confirm that's still the design before the engine owner
  implements.
- Cattail: is wetland plant knowledge common enough that "Cattails mean starch"
  is fine as-is, or should arrival text stay ignorant?

## METHOD NOTES
- Probe script exits 1 (9 documented failures = findings, not noise). Deterministic
  across SEED=20261007 and SEED=7.
- The hot tree moved during the audit (015cb07 → 00188bd); all citations are
  against 00188bd, which the script resolves at runtime via `git show HEAD`.
