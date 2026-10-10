# The Scale Ladder — canon

**Status:** designed 2026-10-10. National + global implemented in `src/js/hierarchy.js`.
Village→regional (the Regional Dawn) already existed; this doc completes the ladder.

Steve's scale law (2026-10-05, DIRECTIVES.md): village → regional → national → global,
and the player must FEEL each one — a moment, not a threshold. One system: the System
overlay grows from HUD/abilities into coordination/logistics, tied to the codex —
knowledge → food → power → coordination → species agency. You always walk around as a
person; verbs never change. Transitions are never speedrunnable: deep relationships
take seasons, rival leaders have agendas, feeding a coalition scales hard, viewership
gates System upgrades.

## The four rungs

### 1. VILLAGE — one fire
Haven alone. No mechanics change. `scaleRank()` → `'village'`.

### 2. REGIONAL — two fires is a network (implemented, pre-existing)
- **Bar:** Haven's first-ever link (`state.networkLive`).
- **The beat:** the Regional Dawn — played, with Haven's first gesture (gift 2,000 pantry
  kcal / send the representative 3 days / cold ink). The System overlay visibly grows into
  coordination.
- **Unlocks:** tribute, demands, the climb (renegotiate, bid for primacy), succession.

### 3. NATIONAL — the polity moment
- **Definition:** a polity is **one primary with ≥3 active subordinates** — four fires
  under one head is a realm; two is a pact. (Deliberate design call, 2026-10-10: the
  "three villages plus surplus" sketch Steve rejected as gameable becomes a bar about
  *relationships held*, not villages counted — each subordinate is a live trust/tribute
  relationship, any of which can snap.)
- **Haven's two roads in** (contract: "leads or belongs to"):
  - **LEAD** — Haven is primary of ≥3 active subordinates. The built realm. Earned via
    bidForPrimacy (standing ≥ 90% of theirs, trust ≥ 60, one hard conversation per week)
    or by being the stronger from the start and holding it.
  - **BELONG** — Haven is a subordinate **in good standing** to a primary whose realm
    holds ≥4 villages: link trust ≥ 60, arrears 0, link age ≥ 21 days (the
    valued-subordinate bar, one notch below `kingdomEndingEligible`'s 70). Steve's
    standing rule: you may NOT end the game at the top — joining another kingdom is a
    legitimate earned outcome, and this is its doorway.
- **The region lives without you:** known, unlinked villages bind among themselves
  off-screen (weekly, ~seasonal cadence, `state.foreignPolities`). Haven hears through
  traders — delayed, possibly wrong, never omniscience. Other fires are climbing too;
  a foreign polity that reaches 4+ is the BELONG road's precondition, and a rumor
  ("X has bound Y") is how you learn.
- **The beat — played, never a silent flip.** Staged the morning after the deed that
  earned it (day boundary, like rumor delivery):
  - LEAD → **The First Court**: the subordinate speakers ride in. Choose:
    - **FEAST** — open a shared granary: 5,000 kcal, no strings (trust +10 each,
      proportional if the pantry is thin — honor is proportional, never free).
    - **HOST** — the court sits at Haven's fire seven days; your speaker holds the room
      (representative loaned 7 days — a real absence; trust +6 each).
    - **COLD** — write the law in cold ink: tribute standardized +10%, trust −12 each,
      opinion −5. Fear is a kind of mortar. The realm holds; it doesn't love you.
  - BELONG → **The Binding**: the polity's court summons Haven's speaker. Choose:
    - **SWEAR** — the oath, sealed with 3,000 kcal (trust +12).
    - **SERVE** — seven days of your speaker's life at their court (trust +8).
    - **WALK** — break the link and stay a free fire. **Refusal is a real choice: the
      scale is refused with it** (national stays unachieved; the realm continues
      without Haven). No punishment beyond the relationship's own logic.
  - If the realm dissolves before the court sits (links break mid-beat), the beat dies
    **aloud**, not silently.
- **National unlocks (real, small, honest):**
  - **Polity logistics:** the System's governance layer routes tribute — subordinate
    tribute grain arrives at **×1.25** (the number is said aloud in the arrival line;
    copy and engine agree).
  - **Polity news:** weekly, traders carry word between the polity's fires (delayed,
    possibly wrong).
  - `kingdomEndingEligible()` (the valued-subordinate ending frame) keeps working as
    designed — the BELONG road is its on-ramp.
- **Anti-speedrun:** the climb is paced in weeks (the table is a weekly verb), trust is
  deed-earned, tribute is real food, foreign polities grow off-screen slowly. No pure
  calendar path exists.

### 4. GLOBAL — the pre-table beat
- **Definition:** the world/audience scale — NOT the table scene (the table is the
  ending). The ladder is a ladder: global requires national first.
- **Bar (provisional v1, tune in playtest):** `nationalLive` AND Haven viewership ≥ 40.
  Viewership is deed-reactive (`recordMoment` +1 per notable event, show stunts +2,
  ledger showmanship, codex breadth) — reaching 40 means roughly a season+ of being
  worth watching. Never a calendar flip.
- **The beat — "The Watchers":** the System announces planetary broadcast tier; the
  audience has picked its favorite fire. Played choice:
  - **CHAMPION** — send your speaker into the light for seven days (real absence).
  - **FEAST** — 5,000 kcal of theater for the cameras.
  - **DECLINE** — say no on camera. The scale still lands (the world's attention isn't
    compliance) but viewership −10 and the refusal is remembered. **No silent option.**
- **Global unlock:** **the world feed** — weekly word from the whole known region
  (the galaxy's cameras see everything and the chat talks).
- **What global means mechanically:** `scaleRank()` → `'global'`. Wave-4/5 gating and
  the endgame deed gate read this. The table itself is future work (endings system).

## The API (for other workers — do not rename)

- `Game.scaleRank()` → `'village'` | `'regional'` | `'national'` | `'global'`.
  Regional = `networkLive` (first link). National = `nationalLive` (the court sat or the
  oath was sworn). Global = `globalLive` (the Watchers beat answered). Read it
  defensively — it never throws.
- `Game.polityOf(villageId)` → `{primary, villages, size, led}` or `null`.
  `led=true` means Haven is the head. Note: the BELONG polity is queried as
  `polityOf(primaryId)`, not `polityOf('haven')`.
- Beats are state-driven so the UI can render them without engine changes:
  - `state.pendingNational = {led, primary, villages[], day}` →
    `Game.answerNationalChoice('feast'|'host'|'cold' | 'swear'|'serve'|'walk')`
  - `state.pendingGlobal = {viewership, day}` →
    `Game.answerGlobalChoice('champion'|'feast'|'decline')`
  - (UI wiring in app.js is a separate workstream — same pattern as
    `state.pendingAccord` / `Game.answerAccord`.)
- `Game.foreignPolities()` — foreign bindings `{primary, subs[], day}` for the region
  view / rumor systems.

## Tuning notes (provisional v1 — Steve: specs are v1 until playtesting proves otherwise)

- Polity bar: primary + ≥3 subordinates (4 fires). Considered ≥2 (too pact-like) and
  ≥5 (unreachable before the endgame); 4 fires is the smallest thing that *feels* like
  a realm.
- Belong standing bar: trust ≥60 / arrears 0 / 21 days (ending eligibility is 70/0/21 —
  national is the doorway, the ending is the room).
- Global viewership bar: 40. Other villages drift 2–60; Haven at 40 is plausibly
  top-of-board without being endgame-only.
- Foreign polity cadence: ~22%/week when ≥2 candidates — seasonal, not scheduled.
- Logistics bonus: ×1.25. Small enough to never replace tribute; big enough to feel
  the System working.

## Change log

- 2026-10-10: ladder designed and national/global implemented (prog-scale workstream).
- 2026-10-10: endgame deed gate retuned (Steve: ~100-day target, every wave
  1-5 must be fought — 5/5/4/3/2 distinct per wave). scaleRank's national+
  bar is unchanged; the gate reads it alongside the per-wave deed bars.
