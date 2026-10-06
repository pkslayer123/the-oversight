# Wave-2 Difficulty Spec — Ready to Apply
**Date:** 2026-10-06 · **Status:** SPEC ONLY — tree hot (sibling actively editing game.js/monsters.json as of 12:38 CDT). Do NOT apply until `git status` is clean of sibling work.
**Authority:** Steve 2026-10-06: "Address those monster issues. Wave 2 needs to be harder. We gate with better loot and progress."

## Design principles
- Difficulty = pressure + decisions, not just bigger numbers. Every change makes a trick actually fire or a counterplay actually matter.
- The data files already promise mechanics the code doesn't implement (landlord rent/addenda/foreclosure, heckler Pile-On, understudy Opening Steal/Desperate Improv). The spec makes the code TRUE — no codex lies, in either direction.
- Loot: wave-2 drops better loot than wave-1 (tier 3 baseline, apex tier 4). Difficulty is the gate, not a wall.
- Knowledge gating untouched: unknown descriptors, codex stages, knownCue all hold.

## Overlap with sibling work (CHECK BEFORE APPLYING)
A sibling is/was adding `knownCue` + `armor`/`resistances` to landlord and union_rep, and removing dead `tbBatch4Cue` branches. Before applying:
1. `git log --oneline -5` — if sibling committed, rebase spec line numbers.
2. If sibling already added knownCue/armor to heckler/paparazzo/understudy, SKIP spec items H3/P3/U3.

---

## H. HECKLER REDESIGN (P0 — the set must happen)

**Problem:** Dies in ~3 rounds at shame ~0. Headliner (5) and compulsion never fire. Direct 10–14 out-threats the trick.

**Fix — the set is the point:**
- `monsters.json` heckler: `hp` [55,75] → **[85,100]**; `attack.damage` [10,14] → **[6,10]** (chip, not threat).
- `game.js` heckler AI block (~19437): jibe **every round** (remove the `Math.random() < 0.4` gate; keep miss-trigger for +1 bonus shame):
  - Each jibe: `m.hkShame++`. If `f.lastPlayerMissed`: `m.hkShame++` again + miss-specific jibe text ("It saw that. We ALL saw that.").
  - Headliner threshold: `shameNow >= 5` → **`>= 4`** (two places: phase transition ~19457, compulsion trigger ~19481).
  - Phase transition text: keep, update "(5+ SHAME" → "(4+ SHAME".
- Compulsion penalty (`tbPlayerStrike` ~15032): acting while `hkCompelled` adds **+1** shame (not +2). Text: `"See? SEE? Can't even listen." The defiance feeds it. (+1 SHAME)`.
- **PILE-ON (implement the codex promise):** in direct-telegraph resolve (~17738, next to the existing `hkLandedHit` marker): if `this.hkIs(m) && t.kind === 'player'` and `(m.hkShame || 0) >= 3`, `m.hkShame++` + say `"And THAT'S why nobody claps for you." (PILE-ON: +1 SHAME — it hits harder when you're already ashamed.)`
- `monsters.json` heckler: add `"knownCue": "The words are the weapon. Every jibe stacks SHAME (-1 damage each); misses get mocked twice. At 4 SHAME it goes HEADLINER: answer back (wait a turn, clear 3) or every act feeds it +1 more. Kill it fast or answer it — don't let it do a full set."`, `"armor": 0`, `"resistances": {}` (deliberate fragility — the mouth is the whole monster; already stated in weaknesses).
- `monsters.json` heckler: add `"loot": {"chance": 0.12, "tier": 2, "note": "Alien loot: low chance, tier scales with monster strength (Steve 2026-10-05)."}`.

**Fight math (spear 14–18/round):** 90 HP → ~6 rounds clean. Shame +1/round → headliner round 4, −4 damage by round 5 → the spiral bites unless you answer back (lose a turn, clear 3) or burst it down. The compulsion FIRES in normal fights.

---

## L. LANDLORD → APEX (P0 fixes + apex slot)

**Problem:** Spread is one-shot, +2 heal irrelevant, trick skipped by stand-and-trade, no apex above the deer.

**Fix — implement what the data already promises (rent/addenda/foreclosure):**
- `monsters.json` landlord: `hp` [90,120] → **[150,170]** (apex — matches the deer ceiling); `attack.damage` [18,26] → **[20,28]**.
- `game.js` landlord block (~19373):
  - Replace one-shot spread with recurring Addenda:
    ```js
    m.llAddenda = m.llAddenda || 0;
    const nextAddendumAt = 2 + m.llAddenda * 3; // fires at 2, 5, 8, 11 claimed
    if ((m.llClaimed || 0) >= nextAddendumAt) {
      m.llAddenda++;
      // ... existing spread code (3 adjacent tiles) ...
      this.say(`"ADDENDUM #${m.llAddenda}: this agreement now covers a WIDER AREA." The leased ground spreads. (Rent rises.)`);
    }
    ```
  - **RENT (the data promises it, the code doesn't do it):** at the START of the landlord's turn (top of the `llIs(m)` block, after phase init): if player fighter is on a claimed tile, rent = `1 + (m.llAddenda || 0)` (foreclosure doubles — see below); `this.tbDamage('p', rent, 'rent', m.key)` + say `"Rent comes due. (${rent})"`. First time, use the fuller text.
  - **Heal scales:** `m.hp + 2` → `m.hp + Math.min(1 + (m.llAddenda || 0), 5)` ("the land pays rent" — each Addendum raises it, capped at +5).
  - **FORECLOSURE (the phase exists in data, never fires):** when `m.llAddenda >= 3`, `this.encSetPhase(m, 'foreclosing')` + say `"FORECLOSURE. The lease is absolute. The ground itself is collecting."` — rent doubled while foreclosing.
- `monsters.json` landlord slain text: ALREADY TRUE under this spec (rent per round, addenda, spread waves). No change needed. Verify after applying.
- `monsters.json` landlord: add `"loot": {"chance": 0.2, "tier": 4, "note": "Alien loot: low chance, tier scales with monster strength (Steve 2026-10-05)."}` (apex drops the best).
- Sibling already added armor 3 / psychic 0.5 / knownCue — DO NOT duplicate.

**Fight math (apex):** 160 HP, spear 14–18 → ~10 rounds if you could stand still. You can't: 20–28 direct + rent 2–5/round on claimed ground + the ground shrinks every 3 claims. Kite or die. This is the fight veterans get nervous about.

---

## P. PAPARAZZO RETUNE (P1 — exclusive must fire)

**Problem:** Prediction +1/flash, exclusive at 5 — unreachable in 3–4 round fights.

**Fix — clean photos teach more:**
- `game.js` ~17787: `m.pzPrediction = Math.min(5, (m.pzPrediction || 0) + 1)` →
  ```js
  const hitPlayer = hitFighters.some(o => o.kind === 'player' && o.alive);
  m.pzPrediction = Math.min(5, (m.pzPrediction || 0) + (hitPlayer ? 2 : 1));
  ```
  (A clean photo of your dodge teaches +2; a miss still teaches +1.)
- Say-text: update to reflect the faster learning ("it got a clean shot of your dodge (+2)").
- `monsters.json` paparazzo: `hp` [65,85] → **[70,90]** (a little more room for the arc).
- `monsters.json` paparazzo: add `"knownCue": "The flash is the least of it. Every photo teaches it your dodge: a HIT teaches +2 prediction, a miss +1. At 5 PREDICTION the flash is UNBLOCKABLE — break line of sight. Never dodge the same way twice."`, `"armor": 1`, `"resistances": {}` (thin casing, all lens).
- `monsters.json` paparazzo: add `"loot": {"chance": 0.15, "tier": 3, "note": "Alien loot: low chance, tier scales with monster strength (Steve 2026-10-05)."}`.

**Reachability:** 2 flash-hits + 1 miss = 5 in ~3 flashes (~6 rounds). Tight, earned, real.

---

## U. UNDERSTUDY (P0 codex lies + P1 pacing)

**Problem:** Codex advertises Opening Steal + Desperate Improv (unimplemented). Arc (rehearse@2, perform@4) blows by in ~2 rounds.

**Fix — implement both, compress the arc:**
- `game.js` understudy block (~19325): performing threshold `totalSeen >= 4` → **`>= 3`**.
- **OPENING STEAL (implement):** in the `usSeen` recording block (~15057-15080), also persist the player's best: `scholar.usBestMove = {name: wname, dmg: rec.dmg}` whenever a new max is recorded. In the understudy block, before the watching-phase early return: if `!m.usOpened && scholar.usBestMove`, set `m.usOpened = true` and immediately declare a direct attack using the best move at 50% fidelity: say `"It opens with YOUR move. It's been watching longer than this fight."` (The fiction: understudies talk. It studied you before the fight.)
- **DESPERATE IMPROV (implement):** in the understudy attack branch (~19348+): if `m.hp < m.maxHp * 0.3` and 2+ distinct moves in `m.usSeen`, declare TWO directs (two different best moves) instead of one: say `"It's losing — so it stops rehearsing and starts IMPROVISING. Two of your moves, back to back."` Second telegraph: reuse the declare path with the second-best move. (Implementation: set a flag `m.usImprov = true`; after the first telegraph resolves... simplest honest version: declare the first, and queue the second by setting `m.telegraph2` — OR simpler: make the single telegraph deal both moves' damage with a combined cue. PREFER the honest two-telegraph version only if the resolve path supports it; otherwise combined-damage single telegraph with clear text. Document the choice in the commit.)
- `monsters.json` understudy: `hp` [70,95] → **[80,100]**.
- `monsters.json` understudy: add `"knownCue": "It has no moves — only yours. Two views to rehearse, three to perform at 80%. Its OPENING STEAL uses your best known move cold. Below 30% HP it IMPROVISES: two of your moves per turn. Switch weapons mid-fight or kill it before the third observation."`, `"armor": 0`, `"resistances": {}` (no tricks of its own — deliberate).
- `monsters.json` understudy: add `"loot": {"chance": 0.15, "tier": 3, "note": "Alien loot: low chance, tier scales with monster strength (Steve 2026-10-05)."}`.

---

## R. UNION REP LOOT
- `monsters.json` union_rep: add `"loot": {"chance": 0.15, "tier": 3, "note": "Alien loot: low chance, tier scales with monster strength (Steve 2026-10-05)."}`.
- (Sibling did armor/knownCue — don't duplicate.)

## G. THE SIX (review_drone, voice_mimic_radio, memory_projector, warranty_caller, bright_idea, mirror_stag)
- No number changes. They MEET the bar; the difficulty jump comes from the apex + the five fixed escalations. Blind inflation is not difficulty.

## Loot gating summary (wave-2 > wave-1)
| Monster | Loot |
|---|---|
| heckler | 0.12 / tier 2 |
| paparazzo | 0.15 / tier 3 |
| understudy | 0.15 / tier 3 |
| union_rep | 0.15 / tier 3 |
| landlord (APEX) | 0.20 / tier 4 |
| (existing six) | 0.15 / tier 2–3 (unchanged — already above wave-1's 0.08–0.12 / tier 1–2) |

Wave-1 stays 0.08–0.12 / tier 1–2 (gallowdeer tier 4 at 0.22 excepted as the wave-1 boss). The wave-capped roll (`rollAlienLoot`) needs no changes.

## Verification (after applying)
1. `node scripts/test-wave2-difficulty.js` — green.
2. `node scripts/validate-ontology.js` — green (no header changes, but run it).
3. Playtest each of the four reworked monsters as a player: does the second act FIRE, does the fight FEEL harder and fair?
4. Re-read the three slain texts — no move names the code doesn't implement.
