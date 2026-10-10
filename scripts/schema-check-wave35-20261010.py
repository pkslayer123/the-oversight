#!/usr/bin/env python3
# schema-check-wave35-20261010.py — validates the 26 new wave-3/4/5 entries
# against src/data/schemas.json (mirrors scripts/validate-data.js logic).
# The real validator crashes pre-existing on events.json, so this covers the
# new content. Exit non-zero on any error.
import json, re, sys

ROOT = '/home/hatch/workspace/worktrees/prog-waves'
schemas = json.load(open(f'{ROOT}/src/data/schemas.json'))
monsters = json.load(open(f'{ROOT}/src/data/monsters.json'))
NEW_IDS = ["redactor","gavel","focus_group","spool","chorus_line","terms_of_service",
  "callback","buffering","ad_break","congregation","strike","influencer","audit",
  "reunion","suburb","eulogy","algorithm","eater","cancellation","editor","rerun",
  "spoiler","timeslot","nielsen","finale","network_note"]

errs = []
def err(m): errs.append(m)

def check_type(val, spec, where):
    if spec.endswith('?') and (val is None):
        return True
    base = spec[:-1] if spec.endswith('?') else spec
    if base == 'string': return isinstance(val, str)
    if base == 'number': return isinstance(val, (int, float)) and not isinstance(val, bool)
    if base == 'boolean': return isinstance(val, bool)
    if base == 'object': return isinstance(val, dict)
    m = re.fullmatch(r'number\[(\d+)\.\.(\d+)\]', base)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        if lo == 2 and hi == 2:  # tuple [2..2]: array of 2 numbers
            return isinstance(val, list) and len(val) == 2 and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in val)
        return isinstance(val, (int, float)) and not isinstance(val, bool) and lo <= val <= hi
    m = re.fullmatch(r'string\[(\d+)\.\.(\d+)\]', base)
    if m:
        return isinstance(val, list) and len(val) == int(m.group(1)) and all(isinstance(v, str) for v in val)
    if base == 'string[]': return isinstance(val, list) and all(isinstance(v, str) for v in val)
    return False

sch = schemas['monster']
allowed = set(sch['types'].keys())
biomes = {b['id'] for b in json.load(open(f'{ROOT}/src/data/biomes.json'))}
biomes |= set(schemas.get('refAllowlist', {}).get('biome', []))

by_id = {m['id']: m for m in monsters}
if len(by_id) != len(monsters): err("duplicate monster ids in file")
if len(monsters) != 56: err(f"expected 56 monsters, got {len(monsters)}")

for mid in NEW_IDS:
    m = by_id.get(mid)
    if not m: err(f"{mid}: missing"); continue
    w = f"monsters.json[{mid}]"
    for req in sch['required']:
        if req not in m: err(f"{w}: missing required '{req}'")
    for k in m:
        if k.startswith('$') or k not in allowed: err(f"{w}: unknown field '{k}'"); continue
        spec = sch['types'][k]
        v = m[k]
        if isinstance(spec, list):  # enum
            vals = v if isinstance(v, list) else [v]
            if not all(x in spec for x in vals): err(f"{w}: '{k}'={v} not in enum")
        elif isinstance(spec, dict):  # nested
            if k == 'attack':
                for sk, ss in spec.items():
                    if not check_type(v.get(sk), ss, w): err(f"{w}: attack.{sk} type/range mismatch (spec {ss}, got {v.get(sk)!r})")
                if v.get('pattern') and v['pattern'].get('type') not in \
                   ['beam','charge','line','burst','direct','rush','ambush','single']:
                    err(f"{w}: attack.pattern.type unsupported: {v['pattern'].get('type')}")
            elif k == 'edible':
                for sk, ss in spec.items():
                    if not check_type(v.get(sk), ss, w): err(f"{w}: edible.{sk} mismatch (got {v.get(sk)!r})")
            elif k == 'codexStages':
                for sk in ['unknown','observed','slain']:
                    if not isinstance(v.get(sk), str) or not v[sk].strip(): err(f"{w}: codexStages.{sk} must be non-empty string")
                # knowledge gate: unknown must not name the true name or mechanics
                u = v['unknown'].lower(); nm = m['name'].lower()
                # allow the name only if the unknown is a "strange descriptor" that doesn't use the true name
                if m['name'].lower().replace('the ','') in u and len(m['name']) > 4:
                    # the true name appearing in unknown leaks — flag
                    if m['name'].lower() in u: err(f"{w}: codexStages.unknown leaks the true name")
            elif k == 'loot':
                for sk, ss in spec.items():
                    if v.get(sk) is not None and not check_type(v.get(sk), ss, w): err(f"{w}: loot.{sk} mismatch")
            else:  # generic nested (encounter, cues)
                if not isinstance(v, dict): err(f"{w}: '{k}' must be object")
        else:
            if not check_type(v, spec, w): err(f"{w}: '{k}' type/range mismatch (spec {spec}, got {v!r})")
    # sanity ranges
    if m.get('hp') and not (m['hp'][0] < m['hp'][1] and m['hp'][0] > 0): err(f"{w}: hp range insane {m['hp']}")
    if m.get('attack',{}).get('damage') and not (m['attack']['damage'][0] < m['attack']['damage'][1]): err(f"{w}: dmg range insane")
    for b in m.get('biomes', []):
        if b not in biomes: err(f"{w}: dangling biome ref '{b}'")
    if not (0 <= (m.get('pierce') or 0) <= 0.9): err(f"{w}: pierce out of range {m.get('pierce')}")
    # wave bands (anchored): wave -> expected hp band
    wv = m.get('wave')
    hp0 = m['hp'][0]
    if wv == 3 and not (200 <= hp0 <= 400): err(f"{w}: w3 hp[0]={hp0} outside anchored band [200,400]")
    if wv == 4 and not (800 <= hp0 <= 1400): err(f"{w}: w4 hp[0]={hp0} outside anchored band [800,1400]")
    if wv == 5 and not (1000 <= hp0 <= 1900): err(f"{w}: w5 hp[0]={hp0} outside anchored band [1000,1900]")

# emoji uniqueness: no doubling for distinct things
emos = {}
for m in monsters:
    e = m.get('emoji')
    if e: emos.setdefault(e, []).append(m['id'])
for e, ids in emos.items():
    if len(ids) > 1: err(f"emoji doubling: {e} on {ids}")

if errs:
    print(f"SCHEMA CHECK: {len(errs)} error(s)")
    for e in errs: print("  X " + e)
    sys.exit(1)
print(f"SCHEMA CHECK: OK — 26 new entries schema-clean, 56 total, {len(set(m.get('emoji') for m in monsters))} unique emoji")
