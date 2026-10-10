# Break-it: knowledge system (r2, 2026-10-09)

**Target:** knowledge system (index 2). **Verdict: BROKE + FIXED** — 7 catches, all repaired with proofs.
**Canon read:** docs/CANON.md, CONVERSATIONS.md, TRUTH.md, PERCEPTION.md, PEOPLE-JOURNAL.md.
No dedicated knowledge-system canon doc exists (canon lives in the five above + Steve's standing laws); nothing was invented.

## Attacks attempted (all four)

- **EXPLOIT:** repeated identifyPlant (XP farm?), repeated teachPlant (trust farm?), tradeKnowledge repeats, gossip/ask loops (knowledge inflation?), journalLearn reward spam, encounter ticking.
- **SOFTLOCK:** empty/unteachable haul, unknown-plant journal ops, duplicate facts, doubts for gone villagers, conversation past-deflect.
- **HONESTY:** codex card labels vs engine (L1 Named/L2 Parts/L3 Uses/L4 Mastery); believed-wrong (wrongAs) name consistency across every surface; examine/perceive name leaks; trader offer lines; grant-path say ordering.
- **DEAD-CODE:** all six modules in index.html load order; every journal API's callers; stale test asserting a removed API; ontology header claims vs code.

## Catches & fixes

### 1. HONESTY — codex card leaked L2/L3 knowledge at L1 (game.js, app.js)
`codexEntries()` returned `text: p.codex` ungated, and app.js rendered it at every level ≥ 1 — while the card itself labels levels "L1 · Named, L2 · Parts, L3 · Uses, L4 · Mastery". 15/45 plants had codex text revealing parts/uses at L1 (dandelion: *"Every part is edible — leaves, flowers, roots"* at L1; pokeweed: *"Processed right it's food"*; mayapple: *"Delicious fruit under a poison umbrella"*). kcal/prep/uses were properly gated — the summary text was the hole.
**Fix:** `text` is now the full designer summary, earned at mastery only (`lvl >= 4 ? p.codex : null`); `knowledge` (knowledgeLevels[lvl]) already carries L1–L3. app.js renders the text block only when present (and escapes it now).
**Proof:** `scripts/test-break-knowledge-r2.js` A1–A3 (18/18 × 3 seeds).

### 2. HONESTY — believed-wrong name fiction collapsed outside the codex card (game.js, journal.js)
A taught-wrong plant carries `wrongAs`; the codex card headlines the false name "(as taught)" — but inventory, pantry, grid here-list, species recognition, forage gain lines, quest text, node epithets, journal progress lines, forage cues, haul narration, trade offers, and the combine hint all showed the TRUE name. You "believed" Chickweed; your pack said Dandelion.
**Fix:** new `Game.plantCalledName(pid)` believed-name funnel; `plantDisplayName` routes through it; 14 display sites swept (speciesHereLine, speciesRecognition, questPlantRef, forage gain, node epithet, fireside/fire-report/fieldwork narration, medName, eat-kcal line, tradeKnowledge offer lines now speak the *trader's* belief, combineKnowledge hint, _grantPlant resolves wrongAs *before* its say). Mechanics still key off the real pid. journal.js uses a `_calledName` helper that degrades gracefully in stub harnesses.
**Proof:** r2 B1–B5 (believed name everywhere; true name restored after resolveWrongName; mechanics unaffected).

### 3. EXPLOIT — teachPlant trust farmed past the 40 cap (game.js)
`teachPlant`'s direct block caps trust at 40 ("talk gets you to 40") — but the trailing `observe('share_knowledge', {target: vid})` drifted trust again with no cap. Measured: 30 repeated bad-education lessons (3 ticks each, no cost) took a stranger's trust 10 → **73**.
**Fix:** `trustMoved: true` on the observe call — the exact giveFood precedent (socialite r5): opinion still forms for everyone; trust moves only through the capped deed path.
**Proof:** r2 C2 (30 lessons → capped at 40, still >10).

### 4. HONESTY — examineDescription leaked mid-string name mentions (examine.js)
The name scrub only stripped a LEADING name. A description like "old-timers swear leakweed only grows…" leaked mid-string (latent: real data is clean, but the `examine_never_names` rule is explicit). Caught by the repaired gate test.
**Fix:** global case-insensitive scrub of the full name (leading strip preserved), replaced with 'it'.
**Proof:** `scripts/test-knowledge-gate-20261006.js` check 2 (11/11 green).

### 5. HONESTY — perceive promised nuts on nutless trees (perceive.js)
Unknown-species trees hinted *"A nut tree. There might be nuts."* — but ~30% of trees are pine (no nuts), and known pines got the same line. The 2026-10-06 gate test asserted no nut promise; the code had drifted.
**Fix:** unknown → *"A tree. Worth a closer look."*; nut hint only for oak/hickory species (known or not).
**Proof:** gate test checks 7–8.

### 6. DEAD/BROKEN — `scripts/test-knowledge-gate-20261006.js` was RED
It asserted `Ex.teachPlant` / `Ex.teachQuality` / `Game.personTeachTopics` / `Game.teachFromPerson` — all removed in the 2026-10-08 teaching-model migration. The suite crashed on load: a dead safety net.
**Fix:** retired the dead-API sections (coverage now lives in test-journal-knowledge-20261007.js + test-break-knowledge-r2.js), kept the valid examine/perceive/recognition core, added a guard that examine.js never re-grows a divergent teaching primitive, rewrote the narrative playtest on the live API. 11/11 green.

### 7. ONTOLOGY — journal.js header cited code that doesn't exist
`quality_model_borrowed` claimed "teaching quality 0-3 lives in examine.js" and consumed `Scattering.Examine.teachPlant` — neither exists (also broke the header grammar: multi-line continuations silently truncated the block). Fixed to the real model (quality assessed in learnFromShowing over Game.teachPlant). `validate-ontology.js`: 52/52 systems, release permitted. docs/ONTOLOGY.md regenerated (2 lines).

## Held (attacked, resisted — documented, not fixed)
- **identifyPlant** is one-shot: second call returns false, no repeat integrate XP.
- **journalLearn** dedupes by value: repeat facts return false, no reward-line spam.
- **tradeKnowledge** sells rungs not repeats: L0→L2, L2→L3, then honest 'known' refusal; counterfeit (wrongAs) plants can't pay.
- **Gossip loops** move social intel only — no plant-knowledge inflation path found; `askAbout('gossip')` never grants codex entries.
- **combineKnowledge** requires harvests ≥ 3 AND a strictly deeper source; capped at the source's depth.
- **learnFromShowing → teachPlant → identifyPlant** chain is live: haulTeachingMoment teaches parts for real (D2 proves L2 + parts + demonstrated flag), not narration.
- **Doubts** surface via journal ❓ notes and close when the villager is gone (E3).
- **BEASTS codex** is stage-gated (name/stage/attacks each gated); no full-text leak class there.
- **truth.js lie substitution** covers journal's inner wrap (vp swap happens before journal reads) — the journal records what you were *told*, per TRUTH.md.

## Sibling sweep (same bug classes, related systems)
- Trust double-pay: audited all 20 `observe()` call sites — give_food/theft/intimidation already `trustMoved`; social verbs already `noTrust`; confront-backfired and order move trust for one party only via observe. teachPlant was the only hole.
- Believed-name: swept every `${p.name}`/`${plant.name}` display site in game.js; remaining true-name uses are correct (contested/callout/resolve beats where the player knows the truth, true identifications, villager-knowledge reports).
- Codex-text class: `p.codex` had exactly one consumer (codexEntries). No other full-text leak.

## Pre-existing failures (verified identical on pristine code — NOT mine)
- `test-journal-depth-20261007.js`: lifeseed register cast fails (seed 20261007).
- `test-knowledge-leaks-20261007.js`: crashes in combat (`seTickFighter` not a function) — stale combat harness.
- `test-perceive.js`: 2 stale checks (monster `identifyMonster` API gone; stash material shape changed) — 24 pass.

## Known-unwired (documented, not built — UI passes own them)
`forageCue`, `homeFamiliarityLine`, `marginaliaFor` have no non-test callers (API live, tested, awaiting the grid/UI pass per journal.js wiring notes); `doubtsHTML` awaits a dedicated DOUBTS section (doubts surface via journal notes today). Modules all load — no Alien-Players-class dead module.

## Proof results
- `scripts/test-break-knowledge-r2.js`: **18/18 × 3 seeds** (20261009, 777, 424242)
- `scripts/test-knowledge-gate-20261006.js`: 11/11
- `test-break-knowledge-deadcode/softlock/firesidewrong/wrongwipe/tradeecon/sibling-teach-20261008`, `test-haul-teaching-moment-20261008` (15/15), `test-journal-knowledge-20261007` (52), `test-truth` (42): all green
- `node scripts/validate-ontology.js`: 52/52, release permitted
- `node --check`: game.js, journal.js, examine.js, perceive.js, app.js clean

## Files changed
- src/js/game.js — codex text gate; plantCalledName + believed-name sweep (14 sites); teachPlant trustMoved; _grantPlant resolve-before-say; trader belief lines
- src/js/journal.js — _calledName helper + believed names in 5 spots; ontology header corrections
- src/js/examine.js — mid-string name scrub
- src/js/perceive.js — nut-honest tree hints
- src/js/app.js — codex card renders gated text only
- docs/ONTOLOGY.md — regenerated (2 lines)
- scripts/test-break-knowledge-r2.js — NEW proof (18 checks × 3 seeds)
- scripts/test-knowledge-gate-20261006.js — repaired (was red)
