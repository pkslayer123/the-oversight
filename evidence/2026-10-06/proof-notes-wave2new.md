# Telegraph visual proof — 5 NEW wave-2 monsters — 2026-10-06

Worker: visual-proof (wave-2-new). 10 captures in `evidence/2026-10-06/tg-{understudy,landlord,heckler,paparazzo,unionrep}-{unknown,known}.png`
(+ `.svg` sources, `telegraph-proof-wave2new-20261006.json` summary). Capture helper:
`scripts/render-telegraph-wave2new.js` (new file, scripts-only, no game edits).

## Method
Same proven pattern as `scripts/render-telegraph-proof.js`: real combat driven in
node (day1 base → re-seat monster adjacent → `Game.startCombat` → drive turns
until `m.telegraph` declares → hold windup), grid rendered through the REAL
`tbAllTelegraphCells()` bucket routing extracted verbatim from `src/js/app.js`,
rasterized with cairosvg at 390px wide. One driver difference: the Understudy
only declares after SEEING the player's weapon twice (usSeen>=2), so its driver
hunts — moves adjacent and lands two real `Game.tbPlayerStrike` spear hits —
instead of passing turns. (Headless Chromium still hangs on every page load in
this VM; cairosvg path only.)

## Readability verdicts (390px, player eye) — ALL PASS

- **Understudy** — PASS. Unknown: dread cue only ("It goes still. It is doing
  the thing you do before you do it."), zero buckets — gating holds. Known:
  purple direct lockOn on the player's cell + distinct known cue ("YOUR MOVE."
  It does Fire-hardened spear — yours, at 50%.) + earned coaching ("Your Move
  locks onto one target — moving won't dodge it."). The purple outline reads
  clearly around the player marker. Phase badge at capture: rehearsing.
- **Landlord** — PASS. Unknown: dread cue only, zero buckets, but the CLAIM is
  visible — 5 claimed tiles render (§ + dashed brown border, script-side
  terraform overlay). The claim is terraform, not a telegraph bucket, and it is
  NOT knowledge-gated — correct: you can SEE the signs staked in the dirt even
  on first contact; what you can't see is the eviction strike. Known: purple
  direct lockOn on the player's cell + "EVICTION NOTICE." cue + coaching.
  Phase: collecting. The § claim markers and the purple lockOn are visually
  distinct — no confusion between "ground is owned" and "you are targeted".
- **Heckler** — PASS. Unknown: dread cue only ("It leans in, grinning. 'Oh, this
  ought to be good.'"), zero buckets. Known: purple direct lockOn on player +
  "'You call that a swing?' It demonstrates. Poorly. On purpose. (Light
  direct.)" + coaching. The "Light direct" parenthetical is honest about the
  threat level — good tonal match for the fiction.
- **Paparazzo** — PASS. Unknown: dread cue only ("The lens steadies. You hear
  the shutter think about it."), zero buckets — the 25-cell burst is fully
  hidden from first-timers. Known: crisp 5×5 orange burst radius centered on
  the player + "'Say cheese.' The lens steadies. (Flash incoming — freeze 1
  turn. Prediction 0/5.)" + coaching ("Flash Photography hits everything close
  around it."). The burst reads instantly at 390px.
- **Union Rep** — PASS. Unknown: dread cue only, zero buckets. Known: purple
  direct lockOn on player + "'Grievance filed.' It licks the pencil. (Modest
  direct — the allies are the threat.)" + coaching. Capture shows the summoned
  picket ally (second red marker) — the rep organizes even in the proof fight;
  its telegraph stays clean because the ally's pattern is also unknown (gated).

## Knowledge gating — verified working as designed
All five: unknown captures show cue text + dread only, every bucket empty.
Known captures show the full pattern. This is the same gate as the earlier
batch (tbAllTelegraphCells: "If pattern not learned, skip entirely").

**Bonus gating find (design working, not a bug):** the Paparazzo's UNKNOWN
capture lists its attack as "the attack", not "Flash Photography" —
`encAttackName` gates the attack NAME itself behind pattern knowledge. The
name appears only in the known capture. Consistent with "if you don't know, it
doesn't show."

## Broken / missing — none
All 10 targets declared and rendered on the first full run (the Understudy
driver needed real strikes; the smoke test confirmed usSeen>=2 → declare).

## Observations for Steve / later runs (not bugs, judgment calls)
1. **Four of five new monsters are `direct` (purple lockOn).** They
   differentiate via cue text and coaching, not grid shape — which matches the
   fiction (each is a personal, targeted menace: a copied move, an eviction, a
   taunt, a grievance). But visually, four purple single-cell lockOns in a row
   could blur together across fights. The Paparazzo's burst is the visual
   outlier. Steve-call whether the direct four want more distinct grid voices
   (like the wave-2 group C per-monster routing) or whether the cue-first
   differentiation is enough.
2. **Understudy known cue names the weapon** ("It does Fire-hardened spear —
   yours, at 50%."). If the player switches weapons mid-fight, the cue follows
   the best-seen weapon — worth a capture later with a mid-fight weapon swap to
   prove the cue tracks.
3. **Landlord's claimed tiles are visible pre-learning** (terraform, ungated).
   Matches the fiction (signs in the dirt are visible). If Steve ever wants
   the claim hidden until observed, that's a design change, not a rendering bug.
