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

## 7. Mood system (convo-mood.js) — [child report pending]

## 8. Want system (convo-wants.js) — [child report pending]

## 9. Topic/ask system (convoTopics.js) — [child report pending]

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
