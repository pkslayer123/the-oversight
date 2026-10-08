# Dialogue Architecture Map — The Oversight

Steve 2026-10-08: "Conversations are largely nonsense right now. People getting mad I didn't answer a question when I had no good answer option." This document maps the CURRENT architecture before any rethink. Paused patch (honest opt-out, commit a92b30d) is one ingredient, not the architecture.

Files: `src/js/conversation.js` (4472 lines), `src/js/convo-dialogue.js` (469), `src/js/convo-beats.js` (435), `src/js/convo-wants.js` (562), `src/js/convo-mood.js` (234), `src/js/convoTopics.js` (726). Plus touchpoints: `game.js` (remember, askAbout, trust), `truth.js` (doubts/confront), `betrayal.js` (wraps), `party-formal.js` (wraps), `truth.js` (wraps).

## 1. The layer stack (load order = override order)

Modules load in index.html order; later modules REPLACE or WRAP earlier ones. The live `Game.convoChoices` / `Game.convoTurn` are the end of a wrapper chain, not the functions in conversation.js:

1. `game.js:2192` — `convoChoices` (STALE: no `{region}` substitution, old `(avoid the question)` label). Dead at runtime but still in the tree — a trap for readers.
2. `conversation.js:2432` — base `convoChoices` (the "topic grab-bag" menu). `Object.assign(Game, methods)` at :3892 overwrites game.js's.
3. `conversation.js:4384` — REPLACES base to special-case nonverbal thread.
4. `convo-dialogue.js:427` — REPLACES again: the dialogue-model menu. If `dialogueResponses(vid)` returns non-null, the base menu never runs.
5. `betrayal.js:3720` — WRAPS: prepends betrayal choices if any.
6. `party-formal.js:894`, `truth.js:1346` — WRAP for their verbs.

`Game.convoTurn` chain: conversation.js base (:3003) → convo-dialogue.js wraps (dlg: handlers + want post-turn) → convo-beats.js wraps (dlg:subject bridge) → convo-wants.js wraps (:524) → betrayal.js wraps (betrayal: routing).

`Game.dialogueResponses` (the live menu builder): defined in convo-dialogue.js, then OVERRIDDEN by convo-beats.js:278 (beat+topic matrix). `Game.dialogueBeatKind`: defined in convo-dialogue.js, OVERRIDDEN by convo-beats.js (tag-based).

**Finding:** there are effectively THREE menu philosophies layered: (a) conversation.js topic grab-bag, (b) convo-dialogue.js beat-driven responses, (c) convo-beats.js beat+topic matrix. (b) is dead code — fully overridden by (c) except its turn handlers, which are still live. A reader cannot tell which `dialogueResponses` runs without knowing load order.

## 2. Conversation state (convoGet)

Per-villager record at `state.village.convos[vid]` (note: startConvo reads `v.convos`, convoGet writes `v.conv` — TWO keys; see §9). Fields: active, exchanges, budget (3–7 turns), thread, depth, transcript (cap 200), pendingQ, reactiveQ, genericQ, askedQs, answered, recalled, heldBeats/heldAsk (one-beat turns), choosingSubject, threadLog, threadDryFor, reactDryCount, lastBeat {tag,topic,line}, want, mood (-3..3), moodGuardUsed/moodGraceUsed, trust via `state.village.trust[vid]` (talk caps at 40), teachSkill/learnedOnce, rumorDone/rumorTarget(s), pendingTrade/pendingHawk, windingDown, count (conversation #), lastDay.

## 3. How a conversation runs

**Open** (`startConvo`): modal (kills other active convos), costs 10 kcal + 1 tick, sets engaged. Priority: talk request (if `v.talkRequests[vid]` undelivered) → resume opener (unfinished thread) → `convoOpening` (prototype want/secret/taught-plant hooks, else small-talk). Opener line is regex-scanned: `convoMatchReactive` (bespoke reactive match) → `convoGenericQ` (yn/howru/greet/open classification). Transcript + sayLine.

**Turn** (`convoTurn` via wrapper chain): choiceId dispatched through dlg: handlers → question handlers (ans:/react:/gq:) → thread handlers (more, rumor:, trade, teach, theorize, observe, confront:, invite_party, etc.) → wind-down checks (budget exhausted → winddown choices → leave).

**Close** (`endConvo`): plants open threads in topic ledger, temperament-voiced exit line (+ close/lapse beats), trust += 3 (cap 40), mood lingers into trust (±3), checkPromises, conflict fallout.

## 4. Question paths (the four machineries)

### 4a. pendingQ — bespoke questions (36 in characterGen.json convo.questions)
NPC asks via held-beat ask (`hb.ask` → pendingQ). Menu (conversation.js:2432): each data answer as `ans:<qid>:<aid>`, then `deflect_q`, then `leave`. Answer: no trust/mood effect by default; react shown; `remember(vid,'you_said',qid=aid)`; 50% follow-up beat. deflect_q: trust −1, mood −1, "Something shutters."
- **Paused patch (a92b30d)** adds engine-guaranteed `honest_pass` opt-out + `convoHonestPassReact` pool + 15 data `honest_opt_out` flags + guilt-trip react rewrites.
- **Live-path caveat:** the base menu only runs when `dialogueResponses` returns null (beat tag 'question'). `threadBeatTag` checks `c.pendingQ` — BUT short-circuits `if (!thread) return 'small'` BEFORE the pendingQ check. A pendingQ with null thread misclassifies as small talk (latent bug; in real flow thread is 'small' so it works).

### 4b. reactiveQ — REACTIVE_DEFS (10 defs in conversation.js:108)
Bespoke reactive questions matched from NPC lines ("Did you see that?"). Menu: data answers as `react:<rid>:<aid>`. Answers carry `trust` deltas applied directly (+2/−1 etc.) and mood follows `sign(trust)`. Special actions: `look_treeline` (contextual scene), `ask_real` (draws a real pendingQ from preferred list).
- **Sibling fixes in paused patch:** rq_heard 'no' ("Just the wind." → called a liar, −1) relabeled to honest "I didn't hear anything." (0); rq_personal 'later' (−1, "withdraw a fraction") made free.

### 4c. genericQ — convoGenericAnswers
Regex-classified opener questions (yn/howru/greet/open). "I don't know." / "I don't know yet." are first-class, mostly trust-neutral (yn:unsure gets +0 while yes/no get +1 — the honest answer is already slightly disfavored, worth noting).

### 4d. The question the player asks (ask: topics → convoAskTopic)
Player-initiated topics (village/past/goal/plans/gossip/personal/theorize + generated). Deep topics trust-gated (past 20+, goal 35+, theorize 25+). One-shot per conversation (askedTopics). Gossip delegates to game.js askAbout with quote-hygiene.

## 5. Answer generation per path (who builds the menu)

| Situation | Builder | Menu shape |
|---|---|---|
| pendingQ/reactiveQ/genericQ | conversation.js base (via null dialogueResponses) | answers-first, narrowed (Rule 4) |
| trade / hawker | conversation.js base | focused deal/no/not-today |
| spread_rumor (active) | conversation.js base | two-step: target → type |
| nonverbal | conversation.js wrapper | gestures + listen + interpreter |
| choosingSubject | conversation.js base | topic grab-bag (asks) |
| everything else (share/feel/want/small beats) | convo-beats.js dialogueResponses | 2–4 beat+topic replies + subject + leave |

## 6. Reaction & penalty attachment points

- **Trust:** `trustGain(vid,n)` (caps talk at 40); direct `t[vid] ±= n` in handlers; reactive answers (`ad.trust`); dlg:comfort +2, dlg:react +0.5 (farmed — fixed with reactDryCount), dlg:cant −1, deflect_q −1, endConvo +3; mood lingers ±3 at close.
- **Mood:** `convoMoodShift(vid,±1)` — see §7. Attached at: deflect_q (−1), reactive answers (sign of trust), dlg:comfort (+1), dlg:doubt (−1), endConvo goodbye.
- **Memory:** `remember(vid, type, note)` → `state.village.memory[vid]` (cap 20, day-stamped). `you_said` records answers; `convoSaidFact`/`convoFactRecalled` track told facts; wrongly-accused memories exist (detective).
- **Knowledge:** teach/learn flows gate on codex; `noteAskedQ`/`villageAskedQs` prevent repeat questions village-wide.

## 7. Mood system (convo-mood.js, 234 lines)

Temperature model: integer −3..+3 per conversation (`c.mood`), re-derived fresh each conversation from trust + npcMood (never stored per villager). Bands: warm ≥2, friendly 1, neutral 0, cool −1, tense ≤−2. Init clamps to [−2,2] — a conversation can never START at ±3.

- `convoMoodShift(vid, delta)`: one-shot GUARD absorbs a warming move when receptivity<0 ("Something in them almost softens — then doesn't. Not yet."); one-shot GRACE absorbs a cooling move when receptivity>0. Otherwise clamps and queues a band-crossing stage-direction beat via `convoMoodFlush` → `c.heldBeats` (continuer reveals it — one-beat-turns rule).
- `convoMoodReceptivity(vid)`: scores LIVED MEMORY over last 5 days (warm kinds: gift/comforted/promise_kept/shared_fear…; hurt kinds: promise_broken/hostile/confronted/ignored/rumor_about_them…), not personality. Clamped ±3, used only as sign.
- `convoMoodSilence`: silence is temperature-dependent (warm: +1 comfortable quiet; cool: −1 pointed; tense: flat).
- `convoMoodGoodbye`: warm send-off / tense clipped goodbye.
- `convoMoodMod`: c.mood×5 (−15..+15) for success rolls elsewhere.
- Consumers: react branches shift mood by sign of trust delta ("warmth_from_trust"); endConvo nudges trust by ±mood ("mood_lingers"). Nothing gates menus on mood directly — it's a reaction layer, not a gate.

**Bugs/gaps found:** (1) `convoMoodBeat` pool missing `up:cool` (tense→cool warming falls back to generic "The mood shifts, subtly."). (2) Want deflect sets `resolution='deflected'` but resolve recomputes `stage>=2 → 'engaged'` — deflected wants resolve as ENGAGED (see §8). (3) `convoMoodInit` has no caller in either file — verified called from startConvo.

## 8. Want system (convo-wants.js, 562 lines)

Six wants: `share_news` (bursting to tell), `ask_favor` (needs help — food/company/watch), `seek_comfort` (scared/grieving), `warn_you` (danger knowledge), `curious` (wants to know YOU, trust-gated 40+), `just_company` (fallback). Selection: seeds first (`state.village.convoSeeds[vid]`, 7-day expiry), else weighted lottery on needs (hunger/fear/energy/social, recent attacks, days-since-talk). **Personality plays no role despite the header comment claiming it.**

Lifecycle: `c.want = {id, def, stage, fromSeed}`; stages 0 unspoken → 1 surfaced → 2 engaged → 3 resolved. Surfacing via `convoWantPostTurn` (turns≥1 → heldBeat `{wantSurface:true}`); seed-wants surface immediately in startConvo wrapper. Engage: `dlg:help/comfort/empathize` → stage 2. Deflect: `dlg:cant` → stage 3. Resolve in endConvo wrapper: stage≥2 → 'engaged' planting a seed (next conversation's opener); stage 0 → 'unestablished', plants nothing (phantom-seed fix).

**Bugs found:** (1) **Deflect resolves as engaged** — `convoAdvanceWant` sets stage=3/resolution='deflected', but `convoResolveWant` recomputes `stage>=2?'engaged'`, so refusing a favor plants the ENGAGED seed. `ask_favor` deflect plants the `repay` seed ("the favor they still owe you for") — for a favor that was refused. (2) `repay` and `closeness` seeds reference wantIds that don't exist in WANTS — they sit unreadable until 7-day expiry. (3) Want `thread` ('small'/'personal') is written but never read — dead data; 'personal' exists in neither beat tags nor any consumer. (4) Wants never touch mood or trust; the want system and mood system share only `c.heldBeats` and never interact. (5) `'ignore'` playerKind documented, unhandled. (6) Surfacing comment says "second or third beat"; code does turns≥1 (first post-turn).

**Design note:** wants give conversations DIRECTION, mood gives them TEMPERATURE, and they never talk to each other. Nobody's in a bad mood because their favor was refused — the `HURT_KINDS: 'deflected'` slot in mood receptivity suggests someone intended that wiring and it was never built.

## 9. Topic/ask system (convoTopics.js, 726 lines — "topic2")

Generated topic layer coexisting with legacy topics in conversation.js. Every line composed from villager identity (backstory, fear, hope, occupation, temperament, intel type) + live run state — never a pooled list (unique-person law).

**9 topic2 defs** (`t2defs()`): `lately` (live run events only — naming debates, mourning, threats, betrayals, hunger, gratitude), `you` (30/deep — what they think of the PLAYER, from memory entries), `fears` (25/deep), `others` (20 — gossip target via grievance/close/random), `advice` (20), `oldworld` (15), `skills` (0), `systemtake` (system-arrived), `loved` (40/deep — lost love's name rolled ONCE at trust 60+, persisted via saidFacts).

**Generation:** `t2gen_<topic>` openers + `t2fol_<topic>` 3-stage follow-ups; `t2pick` → `convoPick` (per-villager no-repeat); `t2fill` chokepoint (fillTalkLine + {fear}/{hope}/{quirk}/{habit} + pronouns); `t2clock` hashes trust-band+day+exiles+grief+memory — re-asking after the clock moves prefixes a "it's different now" line.

**Gating:** `t2gate` — minTrust OR convo-count escape hatch (count≥4 unlocks 40+ topics at trust 10). **Design-vs-code tension:** "intimacy is earned" framing vs bypasses that unlock `loved` after 4 conversations regardless of trust.

**Menu integration:** `topic2Asks` feeds conversation.js's ask menu (~2621); t2 topics get first crack at topic budget; gossip verbs exempt from cap. `topic2SubjectOpts` is DEAD (zero callers, still in ontology provides). `convoThreadBeat` double-runs `fillTalkLine` on topic2 beats (t2fill already filled). Legacy topics (village/past/goal/plans/gossip/personal/spread_rumor) remain in conversation.js's `convoAskTopic` switch. Single trust write for topics: +2 (cap 40) on past/goal/deep asks, owned by conversation.js.

**Change-over-run done right:** `t2clock`/`t2changeLine` — re-asked topics acknowledge elapsed time. This is the model for the whole rethink: the game notices that time passed.

## 10. Coherence breakdowns (observed)

1. **Three menu philosophies, one runtime.** conversation.js grab-bag vs convo-dialogue.js beat-responses (dead except turn handlers) vs convo-beats.js matrix. The override chain is load-order-dependent and undocumented in one place (this file is the first).
2. **`v.convos` vs `v.conv`.** startConvo iterates `v.convos` to kill other active conversations; convoGet stores at `v.conv`. If both keys ever populate, the modal kill-switch misses.
3. **Stale `convoChoices` in game.js:2192.** Dead at runtime (overwritten), but it's the first hit for "where are choices built" — misleads every reader.
4. **`threadBeatTag` null-thread short-circuit** (§4a): pendingQ with null thread → 'small' → wrong menu.
5. **Answer options don't always say what the player means** (Steve's core complaint): bespoke answers presume player facts (mechanical skill, food theft, "yesterday"); deflect framed as rude while being the only honest move; reactive 'no' called the player a liar. Partially addressed by paused patch.
6. **Penalty asymmetry:** answering honestly is free, but *asking* deep topics costs nothing while *declining* personal questions cost trust (rq_personal 'later' −1, fixed in patch). The economy of honesty is inconsistent across paths.
7. **genericQ yn:unsure gets +0 vs +1 for yes/no** — the honest "I don't know" is mechanically disfavored.
8. **Transcript/sayLine double paths:** gossip does `say`-capture surgery with quote hygiene; teach/learn, rumor, trade each have bespoke capture. No single "NPC says X" funnel.
9. **Mood is re-derived per conversation** (never stored) but `c.mood` deltas accumulate within it and linger into trust at close — the relationship temperature has no persistence beyond trust.
10. **Budget (3–7 turns) vs one-beat turns:** heldBeats pause the exchange counter in ways that make "how long have we talked" unpredictable; wind-down can trigger mid-question.

## 11. What the paused patch covers (and doesn't)

Covers: guaranteed honest opt-out on pendingQ, guilt-trip react rewrites (data), two reactive honesty punishments, presumption softening on 6 answers, `honest_opt_out` flags.
Doesn't cover: the layer-stack confusion, menu-philosophy unification, penalty asymmetry, persistence of mood, transcript funnel, budget/hold-beat accounting, or any of §§7–9 (pending child reports).
