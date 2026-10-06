# Knowledge-gating hot-tree audit — 2026-10-06 ~18:10–18:40 CDT (Worker B)

Steve's law: "If you don't know, it doesn't show." READ-ONLY on game code; no fixes applied.
Scope: the freshest surfaces on the hot tree — map geography reveal (7bec9f1/39f5437),
quest display (8c7dc00/c42fcf9), update banner (878b35c), new intro text + toast/speech-bubble
infra (dc0848e), bird-catch gating (d62b034), region-aware animal knowledge (543c785).
Prior audits (kgate-audit-20261006-muse.md F1–F5, knowledge-gating-audit2-20261006.md) were
read first; their fixes re-verified green (scripts/test-kgate-audit.js: 11 pass, 0 fail).
New mechanical checks: scripts/test-kgate-leaks-20261006.js (9 pass, 2 fail — the 2 fails
are the L1 leak asserts, expected-fail documentation).

Method: played slices with a FRESH codex in plain node (newGame → depart → capture say;
charred-kill mechanism; trap ordering; quest display template; unknown-lump pack line)
+ code-read of the new surfaces. No browser (headless Chromium hangs in this VM).
No game files modified. Tree was hot throughout (100 dirty files at start).

Severity: HIGH = narrator/pack names something the character can't know, on a hot path.
MEDIUM = same, colder path, or broken surface adjacent to knowledge display.

---

## REAL LEAKS

### L1 (HIGH) — Charred kill: carcass carries the TRUE species name while unknown
- **Files/lines:** game.js:8343-8346 (charred branch, no identify) · food.js foodCarcass
  (bakes `animal.name` raw into the item) · game.js:23054-23060 itemDisplayName
  (returns `it.name` raw for `meat_*` items)
- **What showed (played, fresh codex):** killed an unknown American Woodcock with a
  Searcaster (charsMeat) → pack shows **"American Woodcock (charred remains)"**
  while `encAnimalKnown('american_woodcock') === false` (encounters=1, needs 3).
- **What should gate it:** the identify-before-name rule the rest of the hunt code
  follows. The kill MESSAGE is clean ("Charred remains — about X kcal of edible
  bits", no species); the MISS message two lines down IS gated (game.js:8366,
  "KNOWLEDGE-GATED: the miss names only what you know"); the MONSTER carcass path
  is gated (game.js:22656: `name: this.monsterDisplayName(mdef.id) + ' (carcass)'`
  with comment "Killing it does NOT teach the true name"). The animal charred
  branch is the ungated sibling of all three.
- **Why it slipped:** every other kill/catch path calls `encIdentifyAnimal` before
  the name is said (trap game.js:3052, hunted game.js:8349, kills
  encounters.js:659/1785 — "a kill teaches you what it was"). The charred branch
  is the one path that creates a named carcass without teaching.
- **Suggested fix (fixer decides):** either add `encIdentifyAnimal(animal.id)` in the
  charred branch (consistent with "a kill teaches you" — the beam still leaves a
  body to learn from), OR route the carcass name through `encDescribeAnimal`
  (descriptor until known, matching the monster-carcass pattern). Note the
  itemDisplayName comment claims the stored name "is set at creation through the
  gated monsterDisplayName" — that comment is FALSE for foodCarcass (it uses raw
  `animal.name`); the comment or the code needs to change.

### L2 (MEDIUM) — system_task quest renders "undefined needs undefined undefined."
- **Files/lines:** game.js:13196 (quest object has `id`+`desc` only — no `text`,
  `giverName`, `qty`, `plant`) · app.js:10709 (fallback assumes villager-quest
  shape) · game.js:13612/13626 (checkQuest only clears bring/visit types)
- **What showed (played):** after `triggerEvent({id:'system_task'})` (day-12 timed
  event), the quest line renders **"📋 undefined needs undefined undefined."**
- **Knowledge angle:** not a leak — but the quest display is a fresh surface (landed
  in the last 20 min) and it's broken on arrival. Worse: the quest can NEVER clear
  (no type, no completion handler), so the broken line persists indefinitely.
  The `desc` field ("Bring a fully-identified plant (L3) to the System") is never
  read by the display.
- **Suggested fix:** give system_task a `text` (or make the display prefer `desc`
  when `text` is missing), and add a completion path (turn in an L3 plant to the
  System) or a type checkQuest understands.

---

## BORDERLINE / BY-DESIGN (flagged, not leaks)

### B1 — Map shows terrain for ALL tiles now (Steve's directive, confirm intent)
- 7bec9f1 + 39f5437 (17:49–18:01): "Map shows terrain for all tiles, fog only hides
  entities" / "Remove fog class from map tiles - show geography". Rendered tiles
  now show terrain color + TILE_GLYPH for every tile with data, visited or not.
- Tap-info stays gated: unseen → "Unexplored — you haven't been here." (app.js,
  dc0848e block). Entity glyphs (🐗), worn-path, depletion, shared classes all
  still require `seen`. Other-village 🏘️ requires `v.generated` (set on proximity,
  game.js:5219) — verified.
- Tile types are coarse biomes (forest_floor, grove, meadow, thicket, wetland,
  creek, trail_edge, ruin, haven) — no species names in colors/glyphs. `grove`
  implies nut trees, but that's diegetically visible from a distance.
- Flag because the reversal was fast: 17:49 "FOG OF WAR: unvisited is blank"
  → 18:01 "show geography", both tagged (Steve 2026-10-06). If Steve asked for it
  during a live playtest, it's design, not a leak — but the 12-minute flip-flop
  is worth his explicit confirmation. Also note the stale comment at app.js
  (~10720): "MINIMAP IS A MAP, NOT A TELEPORTER. Unexplored tiles are fully
  hidden" — no longer true.

### B2 — d62b034's hunted-catch "unknown" branch is unreachable (dead code, not a leak)
- game.js:8349 calls `encIdentifyAnimal(animal.id)` (encounters → 3 → known) BEFORE
  the `encAnimalKnown` check at 8352, so the `else` branch ("You don't know what it
  is yet") can never fire. The gate is defense-in-depth; the name is earned by the
  identify, consistent with trap (3052) and kills (encounters.js:659/1785).
  "A body in hand teaches you" is the standing rule. Noted so a future reader
  doesn't "fix" the ordering and break the design.

### B3 — Quest fallback uses raw giverName (narrow, likely unreachable)
- app.js:10709 fallback: `giverName + ' needs ' + qty + ' ' + plant` uses the RAW
  first name. Only fires when `text` is missing (old saves). The one real case —
  the debt-collector quest pre-c42fcf9 — introduces the giver ("I'm {first}") and
  sets knownNames in the same breath, so the name is earned. New quests always
  set `text` with gated `displayName`. No live leak; the fallback's real problem
  is L2.

### B4 — Wake-up speech states the finder's former occupation
- characterGen.json wakeUpSpeeches: "I'm {first}. I was a {occ}, back in {origin}."
  This is the NPC disclosing their OWN past in dialogue — diegetic self-report,
  not the narrator leaking. The F5 fix (whoTag) concerned NPCs you haven't spoken
  to; here you've just met them. Clean.

---

## CLEAN (verified this run, played or read)

- **Fresh scenario start:** newGame → depart with fresh codex names no unknown animal
  or tree species (played, C1).
- **Toast system + speech bubbles (dc0848e):** infrastructure landed, but ZERO
  game-message callers — `Game.toast`/`showSpeechBubble` are dormant. No leak
  possible yet. WATCH: when messages get routed through these, each caller needs
  the same gating as `say` (they bypass the narration box).
- **Update banner (878b35c):** shows "✅ Updated to build \<hash\>" only — build
  metadata, not fiction. Clean.
- **Bird-catch gating (d62b034):** hunted message now routes through
  encDescribeAnimal/encAnimalKnown (with the B2 caveat). american_woodcock is not
  `common`, correctly unknown to a fresh codex (played, C2).
- **Region-aware animal knowledge (543c785 + encounters.js:93-117):** `common`
  auto-knowledge now requires origin-tag/region overlap. Tightens, doesn't leak.
- **Trap catch (game.js:3050-3053):** `encIdentifyAnimal(catchId)` runs BEFORE the
  `caught a ${animal.name}` say — identify-before-name order verified (C4).
- **Unknown plant lumps:** name "unknown shoots", kcalEach 0, edible false → pack
  line shows no kcal number and no species (played, C6). The "?" kcal convention
  for inedible meat holds.
- **Corpse loot-as-action:** corpses.js:383 renders through gated `itemDisplayName`.
  The betrayal auto-loot removal (audit 2) holds.
- **Monster carcass:** game.js:22656 uses gated `monsterDisplayName` — the correct
  pattern L1's animal path should mirror.
- **Codex:** codexEntries only lists identified plants; kcal gated on prepKnown
  (separate track, Steve 2026-10-05); codexInProgress uses descriptors. Clean.
- **Village map (codex):** gates on the village-union `seen` — its own designed
  gate ("everywhere the village has walked, pooled together"). Not the world map.
- **Exile flow:** messages use gated displayName/whoTag; no species named.
- **Prior fixes F1–F5:** still green on the hot tree (test-kgate-audit.js 11/11).
- **Telegraph default:** dc0848e flipped the grid telegraph gate to default-hidden
  (`known=false`) — a leak fix, correct direction.
- **New intro text (obColdOpen):** "dirt in your mouth… sky the wrong color" —
  sensory/flavor, no names, stats, or coaching. Clean.

---

## UNVERIFIED

- **Chat/notification action-section erasure (the known systemic bug):** NOT
  reproducible by code read. `.ord-actions` is written only by the initial render
  (app.js:10698) and syncAfterMove (10501); `refresh()` rebuilds the whole screen;
  chatView renders into `.ord-narration`, inlineView into its own slot, toasts
  into `#toast-layer`. No path targets or wipes the actions section. There is no
  notification-feed system in the code at all (no `notif*` anywhere) — the closest
  thing is the dormant toast-layer. Live behavior UNVERIFIED (no browser here);
  the bug as described does not exist in the current architecture.
- **Map geography visuals:** code-read only; actual rendered tiles not seen
  (no browser).
- **Moderator narration** (audit 2's unchecked item, game.js:20436/20446/20463):
  still out of scope, not re-checked.
- **Audit 2's wave-2 leaks** (understudy beats, union_rep picket/walkout, paparazzo,
  landlord): not re-checked this run — assumed still open per audit 2 unless a
  sibling fixed them.

## Suggested next actions (for the fixer — NOT done here)
1. L1: add `encIdentifyAnimal(animal.id)` to the charred branch OR gate the
   carcass name via `encDescribeAnimal`; fix the false comment on itemDisplayName
   or make foodCarcass actually use the gated name.
2. L2: give system_task a displayable `text` (or prefer `desc`), and a completion
   path so it doesn't linger forever.
3. Confirm B1 with Steve (map geography intent), and update the stale
   "Unexplored tiles are fully hidden" comment.
4. When toast/speech-bubble get their first callers, audit each message for gating.
