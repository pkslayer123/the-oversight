# Conversation System Audit — 2026-10-07

**Auditor:** Subagent (conversation-audit)
**Steve's complaint:** "Conversations still needed a lot of work last I checked. Most of what we discussed was not implemented." / "roughly half the line/response pairs make sense and half look like luck" — coherence is accidental.

## 1. Integration Status

**VERIFIED: The dialogue system IS integrated and live.**

Architecture (load order in index.html):
1. `src/js/conversation.js` (196KB) — base system: `convoChoices`, `convoTurn`, topic menu, `startConvo`
2. `src/js/convo-dialogue.js` (22KB) — overrides `Game.convoChoices` to use dialogue model; defines `dialogueResponses`, `dialogueBeatKind` (regex classification), `dlg:` turn handlers
3. `src/js/convo-beats.js` (17KB) — **LIVE**: overrides `Game.dialogueResponses` with beat+topic matrix; overrides `Game.dialogueBeatKind` to use tags; wraps `convoTurn` for subject-change bridges

Verification (via Node harness loading full production script list):
- `Game.dialogueResponses` is the convo-beats version (references `beatOf`/`topicPool`) ✓
- `Game.beatOf`, `Game.threadBeatTag`, `Game.DIALOGUE_FEATURE_MAP` all exist ✓
- `DIALOGUE_FEATURE_MAP` has **36 features** (task said 22; map is more complete)

**Critical finding:** The existing proof test `scripts/test-conversation-dialogue-20261006.js` does NOT load `convo-beats.js` — it tests the OLD `dialogueResponses`, not the live code path. This is why "most of what we discussed was not implemented" — the tests were passing against dead code.

## 2. Coherence Audit Results

**Method:** Built `scripts/playtest-convo-coherence-20261007.js` — loads FULL production script list in index.html order (including convo-beats.js), starts real conversations with 5 NPCs, takes 3 turns each, captures every NPC line + response options. **20 line/choice pairs examined.**

**Bugs found and fixed: 3**

### Bug 1: `offer/want` beat stuck in infinite loop (CRITICAL)

**Before:**
```
THEM: "I'm not sure, but I want to find a working radio. Been thinking about it for days."
YOU: "How can I help?"
THEM: "Really? ...Okay. Here's the thing —"
YOU: "What do you need?"
THEM: "Really? ...Okay. Here's the thing —"  ← SAME, loops forever
```

**Root cause:** The `dlg:help` handler in `convo-dialogue.js` (line 308) had a comment saying "Route to the want system's favor flow" but never did — it output a hardcoded incomplete line and set `c.offeredHelp = true` without progressing the beat.

**After:**
```
YOU: "How can I help?"
THEM: "Really? ...Okay. I need an extra pair of hands tomorrow. Can you help?"
```
The NPC now states a concrete favor based on their needs (hunger/fear/energy) instead of looping.

**Fix:** `src/js/convo-dialogue.js` — `dlg:help` handler now generates a specific favor from `npcNeeds()` and sets `c.want.stage = 1` to prevent re-looping.

### Bug 2: `threadDry` lost in beats override

**Before:**
```
THEM: "Hey — I found some Chickweed today."
YOU: "And then?"
THEM: "That's... pretty much all of it, honestly."
YOU: "Tell me more."  ← should not be offered; thread is dry
THEM: "That's... pretty much all of it, honestly."  ← loops
```

**Root cause:** `convo-dialogue.js` had `threadDry` logic to suppress "tell me more" when the thread was exhausted, but `convo-beats.js` overrides `dialogueResponses` entirely and didn't include it.

**After:** After the NPC says "That's... pretty much all of it," the `dlg:more` option is removed. Player sees only react/subject/leave.

**Fix:** `src/js/convo-beats.js` — added `threadDry` check to `dialogueResponses`, skipping `dlg:more` entries when dry.

### Bug 3: `threadBeatTag` misclassified all `want` threads as `offer`

**Before:**
```
THEM: "I'm worried about the strangers. Trying not to say it out loud."
BEAT: offer/want
Choices: "How can I help?" / "What's the situation?" / "Can't right now."
```
"How can I help?" is incoherent — the NPC is sharing a worry, not asking for help.

**Root cause:** `threadBeatTag` in `convo-beats.js` returned `'offer'` for ALL `want` threads. But the DIALOGUE_FEATURE_MAP specifies:
- `want_share_news` → share beat
- `want_seek_comfort` → feel beat
- `want_warn_you` → share beat
- `want_curious` → question beat
- `want_just_company` → small beat
- Only `want_ask_favor` → offer beat

**After:** `threadBeatTag` now checks `c.want.id` and returns the correct beat per the feature map.

**Additional fix:** `Game.beatOf` was returning a cached `lastBeat` from the opening (before `c.want` was set). Added re-classification for `want` threads in `beatOf`.

**Fix:** `src/js/convo-beats.js` — `threadBeatTag` `case 'want'` now branches on want ID; `Game.beatOf` re-classifies cached beats.

## 3. Before/After Examples

### Example A: Share-news want (was incoherent, now coherent)
**Before:**
- NPC: "I'm worried about the food stores. Trying not to say it out loud."
- Beat: `offer/want`
- Responses: "How can I help?" / "What's the situation?" / "Can't right now."

**After:**
- NPC: "I'm worried about the food stores. Trying not to say it out loud."
- Beat: `news/want` (correctly classified as news)
- Responses: "Tell me more." / "What about them?" / "That doesn't quite add up." (if doubts)

### Example B: Favor request (was looping, now progresses)
**Before:** Infinite "Here's the thing —" loop (see Bug 1 above).

**After:**
- NPC: "I want to find a working radio. Been thinking about it for days."
- YOU: "How can I help?"
- NPC: "Really? ...Okay. I need an extra pair of hands tomorrow. Can you help?"
- (Conversation can now progress to accept/decline, not loop.)

### Example C: Dry thread (was looping, now winds down)
**Before:** "Tell me more." offered repeatedly after NPC said "That's all of it."

**After:** "Tell me more." removed; player can react, change subject, or leave.

## 4. DIALOGUE_FEATURE_MAP — Reachability

All **36 features** remain mapped (none removed):
- INFORMATION: gossip, news, rumors, rumor_spread, teaching, learning
- RELATIONSHIPS: trust, comfort, companionship, personal
- TRANSACTIONS: trade, hawking, favors, promises
- PARTY: invite
- CONFLICT: confrontation, lies, observation
- PERSONAL: past, goals, village, plans, theorize
- WANTS: want_share_news, want_ask_favor, want_seek_comfort, want_warn_you, want_curious, want_just_company
- SYSTEM: secrets, grief, cheer, reactive_q, nonverbal, language, leave

**Proof:** `scripts/test-convo-coherence-fixes-20261007.js` — 46/46 tests pass, including:
- All 6 want IDs map to correct beats
- `beatOf` re-classification works
- `dlg:help` no longer loops
- All 36 features present in map
- `dialogueResponses` is the live beats version

## 5. Remaining Issues

1. **Beat classification by line content (not just want ID):** A `just_company` want can generate an emotional line ("It's okay to be scared...") but gets `small` beat with dismissive responses ("Mmhm." / "Huh."). The line generator and beat classifier are not fully aligned. This is a content-generation issue, not a classification bug — the fix belongs in the opener pools.

2. **Question detection in small talk:** NPC: "Something's shifting in the group. You feel it too, right?" — classified as `small/small`, but it's a question. Responses ("Mmhm." / "Oh nice.") don't answer it. The `threadBeatTag` doesn't detect interrogatives in line text. The tag-at-source approach means the GENERATOR should tag it as `question`, but small-talk openers aren't tagged.

3. **Favor specificity:** The `dlg:help` fix generates generic favors ("I need an extra pair of hands tomorrow"). Ideally it would reference the SPECIFIC want from the opening line ("find a working radio" → "I need radio parts"). This requires parsing the opening or storing the want details — a deeper change.

4. **Existing test gap:** `scripts/test-conversation-dialogue-20261006.js` doesn't load `convo-beats.js`, so it tests dead code. Should be updated to load the full list (or deleted in favor of the new `test-convo-coherence-fixes-20261007.js`).

## 6. Files Changed

- `src/js/convo-beats.js` — `threadBeatTag` want-ID branching; `beatOf` re-classification; `threadDry` in `dialogueResponses`
- `src/js/convo-dialogue.js` — `dlg:help` handler states concrete favor, prevents loop
- `scripts/test-convo-coherence-fixes-20261007.js` — NEW: 46-test proof (all pass)
- `scripts/playtest-convo-coherence-20261007.js` — NEW: playtest harness capturing line/choice pairs

**Commit:** `cfa0a3d` "Conversation coherence fixes: want beat classification, threadDry, dlg:help loop (Steve 2026-10-06)" — **not pushed** (per instructions).
