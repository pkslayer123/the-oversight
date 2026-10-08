# Dialogue Coherence Rethink — 2026-10-07

Worker: dialogue-coherence rethink (flesh-out loop). All work done from a pristine
HEAD extract (`/tmp/head-dlg`); patches are NEW fragment files only, never applied
to src/. Proof script: `scripts/test-dialogue-coherence-20261007.js`
(seeded mulberry32, default seed 20261007, `SEED` env override, `DLG_ROOT` selects tree).

## Proof results

| tree | seed 20261007 | 42 | 7 | 1234 | 999 | 31337 |
|---|---|---|---|---|---|---|
| pristine HEAD | 0/16 | 0/16 | 0/16 | 0/16 | 0/16 | 0/16 |
| + 6 patches | 17/17 | 17/17 | 17/17 | 17/17 | 17/17 | 17/17 |

All 6 patches `git apply --check -p1` clean against a fresh HEAD extract.
Sibling regression suites on the patched extract: `test-convo-coherence-fixes-20261007`
46/46, `test-convo-coherence-choices` 29/29, `test-convo-beats-20261006` 0 failures
(pass count wobbles run-to-run on both trees — unseeded RNG, no failures).

## Findings, ranked by player-facing impact

### 1. NPC voices were all identical (Speech DNA dead)
`convoSpeechDNA` calls `this.lifeseedVoice(vp)` — which was never defined. Every one
of the 11 villagers returned `plainspoken|measured|none|you`. The journal ontology
promised a per-character voice model; nothing delivered it. Note: commit 4867b39
today only dropped the *ontology consumes-line* for lifeseedVoice; the function is
still missing on HEAD, so this patch implements rather than duplicates sibling work.

Patch-01 derives register/pace/humor/address from temperament + intelligence + age
band: 11 villagers → **7 distinct signatures** (e.g. `formal|slow|dry|you`,
`warm|quick|playful|friend`), stable per villager across turns.

### 2. The want system was dead on the dialogue path
The `dlg:` wrapper in convo-dialogue.js early-returned before convo-wants' turn
wrapper ever ran. Consequences, all demonstrated:
- `convoAdvanceWant` had **zero callers**; `Game.convoWant` was referenced but undefined.
- A villager's want never surfaced during dialogue turns (stage stayed 0).
- Engaging (`dlg:help`) or deflecting (`dlg:cant`) never advanced the arc.

Patch-02/03 extracts `convoWantPostTurn` and runs it for `dlg:` turns; `dlg:help`
engages, `dlg:cant` deflects, dry one-beat threads surface the want instead of looping.

### 3. Phantom seeds — NPCs referenced conversations that never happened
Never-surfaced (stage 0) wants planted seeds; the next conversation opened with
mangled, unheard business:

> `"About they still need help but stopped asking — " There's something…"` (broken quotes, unheard "they")

Patch-02: no seeds for stage-0 wants; the opener keeps its quote layer:
> `"About that news they were bursting to share — Have you heard? No? Good, I get to tell you first."`

Patch-06 rewords all five seed notes so they read as memories, not clauses:
`'the help they asked you for'`, `'the favor they still owe you for'`,
`'that news they were bursting to share'`, `"whatever's been weighing on them"`,
`'what they learned about you last time'`.

### 4. NPC amnesia: loved-one name re-rolled every ask
Ask "who do you love" twice → `"June"` then `"Silas"`. Topic beats never wrote to
`saidFacts`, so nothing was remembered. Patch-05 records `loved:name` via
`convoSaidFact` and reuses it while trust holds:
> loved names across asks: `["June"]` — recorded `loved:name: "June"`, stable.

### 5. Bare "A" reference for unnamed villagers
`displayName.split(' ')[0]` on `"A person, maybe 40s"` produced `"A keeps to
themselves."` Patch-05 uses the existing `firstRef()` (game.js, documented "never
collapses to bare A"):
> `"the person in their 40s, with a slouched posture keeps to themselves. Can't tell if that's wisdom or just tired."`

### 6. `convoComposeBeat` dropped the closing quote
`'"Huh. Let me think about that." "I was a blacksmith…'` — the trailing `"` was
lost in composition. Patch-02 keeps the quote layer:
> `"Huh. Let me think about that." "I was a blacksmith, back when that meant something."`

### 7. Infinite `dlg:react` "Anyway." loop on dry threads
Once a thread dried out, "Mm." / "Anyway." was offered forever. Patch-03/04 adds
`reactDryCount`; after two dry reacts the choice is suppressed from the menu.

### 8. Recap verb existed but was unreachable
`convoRecapChoice` was implemented and never menued. Patch-04 offers `recap` on
the beats dialogue menu when `threadLog ≥ 2`:
> `"We started on their past, then got onto what they want."`

Gap (sibling's lane): the **base** menu still lacks recap — Steve asked for it on
every menu. Flagged, not patched (sibling owns conversation.js menus right now).

### 9. `goon` continuer missing on the dialogue path
Queued beats (`heldBeats`) died unspoken when the menu was dialogue-path.
Patch-04 unshifts `goon` when beats are held.

### 10. Monster naming debate had no dialogue surface
The codex naming system (`seedMonsterNames`, proposals, voting) was fully built
but invisible in conversation. Patch-05 adds a `naming` lately event, gated on the
player having heard gossip or seen the monster ("if you don't know, it doesn't
show"), with real single-quoted villager proposals. The true name never leaks:
> `"Have you heard what they're calling something huge? Enzo is pushing 'Big Ugly'. Everyone's got a name for it and nobody agrees."`

## Secondary observations (not patched)
- `dlg:` turns never increment `c.exchanges`, so the budget wind-down never fires
  on the dialogue path. The patches use a dedicated `wantTurns` counter instead;
  unifying the exchange budget is follow-up work.
- The `'you'`-topic closer is keyed to temper, not the trust band — minor.
- Drift markers prepend onto the base-temper voice line — minor mixed signal.

## Patch inventory
`~/workspace/goals/the-scattering-roguelite-survival-game/hidden_files/dialogue-rethink-20261007/`
- `patch-01-lifeseed-voice.diff` — implement `lifeseedVoice` (journal.js)
- `patch-02-want-dialogue-path.diff` — `convoWantPostTurn`, no phantom seeds, quote hygiene, engage/deflect, `convoWant` accessor
- `patch-03-dialogue-postturn.diff` — `reactDryCount`, dry-thread wind-down
- `patch-04-beats-menu.diff` — `recap` on beats menu, `goon` continuer
- `patch-05-topics-facts-naming.diff` — saidFacts recording, `firstRef()`, naming lately event
- `patch-06-seed-note-wording.diff` — seed notes read as memories

## Full proof output (seed 20261007, patched)
```
=== Dialogue Coherence Rethink Proof (seed 20261007, root /tmp/head-patched) ===
NPCs: 11

--- 1. voice signature diversity ---
  distinct signatures: 7 of 11
PASS: lifeseedVoice is defined
PASS: >=6 distinct voice signatures across roster

--- 2. want surfaces on dlg: path ---
  want selected: curious
  dlg: turns played: 3, want stage: 1
PASS: want surfaces on the dialogue path (stage>=1)
PASS: Game.convoWant accessor exists

--- 3. phantom seeds ---
  want=ask_favor stage 0 -> seed: none
PASS: no seed planted for a want that never surfaced
  seed opener: "About that news they were bursting to share — Have you heard? No? Good, I get to tell you first."
PASS: seed opener has balanced quotes

--- 4. loved-name stability ---
  loved names across asks: ["June"]
  recorded loved:name: "June"
PASS: loved name recorded and stable across asks

--- 5. others-talk reference ---
  forced unnamed: gen_x4df2lr -> A person, maybe 40s, with a slouched pos (gated=true)
  others line: "the person in their 40s, with a slouched posture keeps to themselves. Can't tell if that's wisdom o
PASS: no bare "A" reference in others-talk

--- 6. convoComposeBeat quotes ---
  composed: "Huh. Let me think about that." "I was a blacksmith, back when that meant something."
PASS: composed beat keeps its closing quote

--- 7. dlg:react wind-down ---
  reactDryCount after one dry react: 3
PASS: dry reacts are counted
  dlg:react in menu after dry x2: false
PASS: dlg:react winds down on a dry thread

--- 8. recap verb ---
  recap in menu: true (choices: recap,dlg:subject,leave)
PASS: recap choice appears on long threads
  recap line: "We started on their past, then got onto what they want."
PASS: recap turn returns a re-anchor line

--- 9. goon continuer ---
  dialogue path: true, goon in menu: true
PASS: goon continuer offered when beats are held

--- 10. monster naming in dialogue ---
  lately event kind: naming
  lately line: "Have you heard what they're calling something huge? the person in their 40s, with a slouched posture is pushing 'Big Ugly'. Everyone's got a name for
PASS: naming debate surfaces as a lately event
PASS: naming line never leaks the true name
PASS: naming line carries a villager proposal

=== Results: 17 pass, 0 fail ===
```
(Pristine HEAD: 0 pass, 16 fail on all six seeds — every break reproduced before the fix.)
