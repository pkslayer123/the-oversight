# lifeseeds.json pool expansion — 2026-10-07 (Steve 2026-10-07)

Append-only expansion of the smallest unique-person backstory pools in
`src/data/lifeseeds.json`. Existing entries untouched; new entries match the
terse, weathered, pre-scattering voice and use only whitelisted placeholders
({kin}, {first}, {town}, {place}, {workplace}, {street}).

## Counts before → after

| pool | before | after |
|---|---|---|
| events | 15 | 27 (+12) |
| wants | 15 | 25 (+10) |
| wounds | 15 | 25 (+10) |
| places kinds | 8 | 14 (+6: school, church, woods, field, garage, clinic) |
| places names (total) | 33 | 73 (+40: 24 new-kind names, +16 variants on water/work/grave/road/hideout/market) |
| skillOrigins keys | 7 | 13 (+6: fishing, butchery, canning, sewing, carpentry, husbandry) |
| skillOrigins strings | 45 | 81 (+36, 6 per new key) |

kin (18) and regions (14) left as-is — not the smallest pools.

## Coherence notes

- Region towns remain real towns; fragments never cross regions (no region
  edits in this pass).
- {street} used only in place names (resolved to '5th' in places generation);
  not used in events/wants/wounds/skillOrigins where it is never filled.
- {place} used in skillOrigins (resolved via placeName()) but not in place
  names, matching existing usage.
- genLifeseed currently picks only the first two place kinds (home, cache);
  new kinds (school…clinic) extend the shared pool for downstream consumers
  (voice topics, keepsake resolution) and any future kind rotation.

## Proof

`scripts/test-lifeseeds-expansion-20261007.js` — ALL GREEN. Asserts:
- count targets above (every places kind ≥ 3 names, every skillOrigins key ≥ 5 origins)
- every template string uses only whitelisted placeholders
- no duplicate strings in expanded pools (283 strings scanned)
- new skillOrigins keys do not shadow any of the 78 abilities.json ids

Pre-existing WARN (out of scope, untouched kin pool): 4 exact-duplicate
fate strings shared across sibling relations (mother/father, older sister/
sister, younger brother/brother ×2). Not introduced by this expansion.
