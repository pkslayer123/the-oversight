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
- **Haven's six roads in** (Steve approved all six 2026-10-10; contract: "leads or
  belongs to" is now one of six):
  - **LEAD** — Haven is primary of ≥3 active subordinates. The built realm. Earned via
    bidForPrimacy (standing ≥ 90% of theirs, trust ≥ 60, one hard conversation per week)
    or by being the stronger from the start and holding it.
  - **BELONG** — Haven is a subordinate **in good standing** to a primary whose realm
    holds ≥4 villages: link trust ≥ 50, arrears 0, link age ≥ 14 days (the
    valued-subordinate bar, two notches below `kingdomEndingEligible`'s 70; tuned
    2026-10-10, r4: 21d→14d, 60→50 — see evidence/2026-10-10/winrate-iter4-scale.md
    (oracleV2 replication) and evidence/2026-10-10/winrate-iter4-scale-onramp.md
    (winseek + oracle-v2 measurement; exploit audit). Steve's
    standing rule: you may NOT end the game at the top — joining another kingdom is a
    legitimate earned outcome, and this is its doorway.
  - **COVENANT** — Haven holds covenant links with ≥3 other villages: a league with
    **no primary**. Peer links (`kind: 'covenant'`, no primary/subordinate) — mutual
    defense (any member's call is answered with two villagers for three days, or
    refused aloud at −10 trust league-wide) + a shared tribute pool (2,000 kcal/week
    per fire, real food in and out; famine draws are written in the council's book).
    Decisions by council vote (played). Any member can trigger a succession-style
    crisis — concede (better terms), hold the line (they may secede), or release them
    with honor.
  - **TRADE** — Haven holds trade links with ≥3 other villages: an economic polity.
    Pooled trade routes pay tariff income weekly (1,000 kcal/route, real food in;
    400 kcal route upkeep, real food out). **No mutual defense obligation** — when a
    member asks for help, Haven may refuse aloud (the charter allows it, −4 trust) or
    send help as a priced favor (1,500 kcal repaid after).
  - **CONQUEST** — Haven holds ≥3 subordinates **taken by force** (`raidVillage` /
    `answerRaid`: muster a war party, then strike, offer terms, or withdraw). Real
    costs: casualties via registerDeath, wounds marked, raiders gone three days,
    hatred (opinion −40), tribute under duress (7,000 kcal/week, trust 15). Conquered
    fires can sabotage tribute or revolt while trust < 30. Distinct from
    courtship-based primacy bids: force, not climbing.
  - **REFUSE** — a played, permanent refusal of the scale itself, offered on every
    national beat. Real benefits: every kcal stays in Haven's pantry (no oath, no
    court, no tithe, no pool shares). Real costs: no ×1.25 polity logistics, no
    league to call when the late waves come, the table stays distant —
    coalition-or-death stays honest (wave 5 stays locked at regional). The bilateral
    relationships survive; only the polity is refused. The offer never returns
    (`state.scaleRefused`).
- **Shape priority** (documented design call): when several shapes qualify at once,
  the beat stages in order lead → belong → covenant → trade. Walking away from a
  league table defers only that shape 14 days — the next qualifying shape's beat
  stages instead, so walking is how the player picks their road.
- **The region lives without you:** known, unlinked villages bind among themselves
  off-screen (weekly, ~seasonal cadence, `state.foreignPolities`). Haven hears through
  traders — delayed, possibly wrong, never omniscience. Other fires are climbing too;
  a foreign polity that reaches 4+ is the BELONG road's precondition, and a rumor
  ("X has bound Y") is how you learn.
- **The beats — played, never a silent flip.** Staged the morning after the deed that
  earned it (day boundary, like rumor delivery). Every beat also offers REFUSE:
  - LEAD → **The First Court**: the subordinate speakers ride in. Choose:
    - **FEAST** — open a shared granary: 5,000 kcal, no strings (trust +10 each,
      proportional if the pantry is thin — honor is proportional, never free).
    - **HOST** — the court sits at Haven's fire seven days; your speaker holds the room
      (representative loaned 7 days — a real absence; trust +6 each).
    - **COLD** — write the law in cold ink: tribute standardized +10%, trust −12 each,
      opinion −5. Fear is a kind of mortar. The realm holds; it doesn't love you.
  - CONQUEST → **The Iron Court**: the speakers kneel because they lost. Choose:
    - **YOKE** — tribute +10%, trust −12 each, opinion −10. Fear is mortar.
    - **MERCY** — the yoke eases: tribute back to courtship terms (4,000 kcal/week),
      trust +8 each, opinion +10, conquered flags cleared (sabotage/revolt end).
    - **RELEASE** — open the cages: every conquered link breaks with honor, the
      war-realm dissolves, national stays unachieved.
  - BELONG → **The Binding**: the polity's court summons Haven's speaker. Choose:
    - **SWEAR** — the oath, sealed with 3,000 kcal (trust +12).
    - **SERVE** — seven days of your speaker's life at their court (trust +8).
    - **WALK** — break the link and stay a free fire. **Refusal is a real choice: the
      scale is refused with it** (national stays unachieved; the realm continues
      without Haven). No punishment beyond the relationship's own logic.
  - COVENANT → **The Founding Council**: no throne, no kneeling. Choose the founding act:
    - **PACT** — swear the war-pact (mutual defense; trust +8 each). The shared pool
      opens beside it.
    - **POOL** — found the shared granary: every fire pours 2,000 kcal in, said aloud
      (trust +6 each). The war-pact is sworn beside it.
    - **WALK** — leave the table for now (this shape's offer defers 14 days).
  - TRADE → **The Charter**: pooled routes, tariff, the no-swords clause in plain ink.
    - **SIGN** — seal at the table rate: 1,000 kcal/week tariff per route (trust +6 each).
    - **BARGAIN** — demand 1,500: each fire answers aloud by opinion (≥10 accepts at
      trust −5; refuses at trust −3, table rate stands).
    - **WALK** — leave the table for now (this shape's offer defers 14 days).
  - If the realm/league dissolves before the beat's answer, the beat dies
    **aloud**, not silently.
- **National unlocks (real, small, honest):**
  - **Polity logistics:** the System's governance layer routes tribute — subordinate
    tribute grain arrives at **×1.25** (the number is said aloud in the arrival line;
    copy and engine agree). Only while national; refused scales get tribute whole.
  - **Polity news:** weekly, traders carry word between the polity's fires (delayed,
    possibly wrong).
  - **League pool** (covenant): shared granary, drawn in famine via
    `Game.drawLeaguePool(kcal)` — real food both directions.
  - **Tariff income** (trade): weekly per-route tariff, real food.
  - `kingdomEndingEligible()` (the valued-subordinate ending frame) keeps working as
    designed — the BELONG road is its on-ramp.
- **Knowledge never gates the scale:** peer proposals, raids, and all four new beats
  are never knowledge-gated — force and trade don't ask what you know.
- **Anti-speedrun:** the climb is paced in weeks (the table is a weekly verb), trust is
  deed-earned, tribute is real food, foreign polities grow off-screen slowly. No pure
  calendar path exists.
- **National is a live state, not a title (2026-10-10, break-it r4):** when the realm
  dissolves — no qualifying polity and no pending beat — `nationalLive` and `globalLive`
  clear and any pending global summons dies, all said aloud. A polity is a live
  relationship; burning the realm after the court sits keeps nothing (this closed a real
  exploit: dodging BELONG-road tribute upkeep while keeping wave-5/`scaleRank`). The
  oath's trust is proportional to the kcal actually sealed, like the feast-court and the
  accord gift.

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
  - `state.pendingNational = {led, shape, primary, villages[], day}` →
    `Game.answerNationalChoice('feast'|'host'|'cold' | 'swear'|'serve'|'walk' | 'pact'|'pool' | 'sign'|'bargain' | 'yoke'|'mercy'|'release' | 'refuse')`
    (`shape` is one of `lead|belong|covenant|trade|conquest`; `'refuse'` is offered on
    every beat and permanently refuses the scale via `state.scaleRefused`; `'walk'` on
    covenant/trade defers that shape 14 days via `state._natDefer`)
  - `state.pendingGlobal = {viewership, day}` →
    `Game.answerGlobalChoice('champion'|'feast'|'decline')`
  - (UI wiring in app.js is a separate workstream — same pattern as
    `state.pendingAccord` / `Game.answerAccord`.)
- Peer-polity API: `Game.proposeCovenant(vid)` / `Game.proposeTrade(vid)` (played
  courtship bands, counter-offers via `pendingCounter.kind`), `Game.raidVillage(vid)` /
  `Game.answerRaid('strike'|'terms'|'withdraw')`, `Game.covenantCrisis(linkId, why)` /
  `Game.answerCovenantCrisis(linkId, 'concede'|'hold'|'release')`,
  `Game.answerDefenseCall(linkId, 'send'|'refuse')` (covenant),
  `Game.answerTradeCall(linkId, 'send'|'refuse')` (trade),
  `Game.leaguePool()` / `Game.drawLeaguePool(kcal)`, `Game.refuseTheScale()`.
- `Game.foreignPolities()` — foreign bindings `{primary, subs[], day}` for the region
  view / rumor systems.

## Tuning notes (provisional v1 — Steve: specs are v1 until playtesting proves otherwise)

- Polity bar: primary + ≥3 subordinates (4 fires). Considered ≥2 (too pact-like) and
  ≥5 (unreachable before the endgame); 4 fires is the smallest thing that *feels* like
  a realm.
- Belong standing bar: trust ≥50 / arrears 0 / 14 days (ending eligibility is 70/0/21 —
  national is the doorway, the ending is the room).
- Global viewership bar: 40. Other villages drift 2–60; Haven at 40 is plausibly
  top-of-board without being endgame-only.
- Foreign polity cadence: ~30%/week when ≥2 candidates (bal-scale 2026-10-10;
  was 22%), 65% grow-bias toward existing polities — seasonal, not scheduled,
  but a 4-realm forms in ~2 months so the BELONG road is reachable by ~day 80.
- Village count: 3–4 (bal-scale 2026-10-10; was 2–3). With 2 villages national
  was mathematically unreachable (LEAD needs 3 subs, covenant/trade 3 peers,
  BELONG a foreign 4-realm). Canon: villages are NEAR (~500m, PROGRESSION.md #5).
- Early contact: villages within 4 tiles are heard of at ~28%/day for the
  first 15 days (bal-scale 2026-10-10; base curve unchanged after) — the
  nearest fire is known ~day 4–5, not ~day 22 (PROGRESSION.md #5: contact
  happens EARLY).
- Logistics bonus: ×1.25. Small enough to never replace tribute; big enough to feel
  the System working.
- Covenant pool share: 2,000 kcal/week per fire (2,500 when accepted on a
  counter's terms; halved for 4 weeks after a conceded crisis). Famine draws
  unlimited against the pool balance.
- Trade tariff: 1,000 kcal/week per route in, 400 kcal upkeep out (1,200 when
  accepted on a counter's terms; 1,500 when bargained up at the charter).
  Priced favor: 1,500 kcal repaid after.
- Raid casualties: 15% death / 30% wounded (7 days) per raider, 2–4 raiders.
  Duress tribute 7,000 kcal/week (trust 15); bloodless yield 5,000 (trust 25);
  mercy resets to 4,000 courtship terms. Rebellion while trust < 30: 5%/week
  revolt, 12%/week sabotage (half tribute "lost on the road").
- Defense calls: covenant 15%/week per link (warOath); trade help requests
  12%/week per link (chartered). Answering costs two villagers for three days.
- Shape priority: lead > belong > covenant > trade. League-table walk defers
  that shape 14 days.

## Change log

- 2026-10-10: ladder designed and national/global implemented (prog-scale workstream).
- 2026-10-10: endgame deed gate retuned (Steve: ~100-day target, every wave
  1-5 must be fought — 5/5/4/3/2 distinct per wave). scaleRank's national+
  bar is unchanged; the gate reads it alongside the per-wave deed bars.
- 2026-10-10: all six national shapes implemented (prog2-national workstream,
  Steve approved 2026-10-10): covenant (league of equals — mutual defense +
  shared pool, council votes played, member-triggered crises), trade league
  (pooled routes, tariff income, no mutual defense — refusals aloud), conquest
  (raid-to-subjugate: real casualties, hatred, duress tribute, rebellion
  risk), refuse the scale (played, permanent: keeps all tribute; costs the
  ×1.25 logistics, the coalition, the table). Every beat offers REFUSE;
  knowledge never gates the scale. Proof: scripts/test-national-shapes-20261010.js
  (green ×3 seeds); regressions: test-scale-ladder + hierarchy-break green.
