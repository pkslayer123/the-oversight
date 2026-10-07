# Codex knowledge levels — journal.js deepening (2026-10-07)

Worker assignment: queue #7 (knowledge gating). journal.js was clean at run start.

## What existed (not duplicated)
- Knowledge ladder L1–L4 in game.js (`identifyPlant`, harvest/taste-driven bumps).
- Teaching-quality model 0–3 in examine.js (`teachQuality`, sibling-owned) + `Scattering.Examine.teachPlant(pid, vid, {shown, hearsay})` with rules "shown properly lands deep", "hard plants can't be learned by hearsay". journal.js CALLS it; never reimplements.
- Regional familiarity in examine.js `learnDifficulty` + game.js `plantsByFamiliarity`.
- Emergent synergy ledger in progression.js — untouched (sibling-owned, dirty).
- A haul "teaching moment" in `returnToVillage`, but it taught a RANDOM species the teacher knew — not the haul. Steve's design says the haul return is the KEY teaching moment.

## What was added (journal.js only)
- **Per-item parts knowledge**: `plantPartsList` (parses `knowledgeLevels['2']` "Parts:" lines, e.g. dandelion roots/young leaves/petals; falls back to `uses[]`), `partKnown`, `learnPart` (first part learned lifts L1→L2 — the use IS the part — with a ★ say-line).
- **Thin knowledge**: `recordThinKnowledge` (poor teaching → partial note, never a mechanic; `thin=true`), `thickenKnowledge` (proper lesson over thin → "Confirmed:" beat).
- **Demonstration primitive**: `learnFromShowing(pid, vid, opts)` — routes through the sibling-owned `Scattering.Examine.teachPlant`, then layers parts/thin on top. Q3 shown-properly → all parts known + demonstrated flag; Q1 hearsay → thin note; checks `wrongTeaching` first (game.js owns bad knowledge).
- **Haul curriculum**: `haulTeachingMoment(items)` — teaches from the species actually carried home (dedup, skips meat_ and non-plants), greenest/most-trusted teacher per species, trust>30 gate, max 2 lessons per return, unnamed species first, honest "nobody knows your haul" line when no teacher qualifies.
- **Feel / honesty**: `codexPlantLine` (one-line progress: level, parts known, tasted, thin flag, teacher credit; null at k0), `knowledgeGaps` (plain-language unknowns, never leaks uses of unknown parts; [] at k0), `forageCue` (L2+ grid/forage coaching, known parts only; null below L2), `homeFamiliarityLine` (background/region familiarity as feel).
- **Wiring points** documented as code comments for game.js (`returnToVillage` → `haulTeachingMoment(this.prepStash().slice(-staged))`) and app.js (codex screen, forage grid). No other files touched.

## Verification
- `node --check src/js/journal.js` — clean.
- `node scripts/validate-ontology.js` — ✓ All 41 systems validated (header provides/rules updated; consumes extended). Note: validator regenerated `docs/ONTOLOGY.md` — left uncommitted in worktree (not part of this commit).
- Proof: `scripts/test-journal-knowledge-20261007.js` — **53/53 green**, deterministic (mulberry32, default seed 20261007, SEED override; SEED=42 also 53/53). Before/after: empty codex → haul moment grants Mara/Q3 dandelion L2+all parts vs Jesse/Q2 ghostroot name-only; thin Ren lesson → thin=true + 1 partial; Mara proper lesson → "Confirmed:" + thin cleared; k0 plants return null/[] everywhere (no leaks); trust gate blocks lessons at trust≤30; learnPart idempotent; double-run state identical.
