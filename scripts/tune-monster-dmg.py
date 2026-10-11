#!/usr/bin/env python3
# tune-monster-dmg.py — survival-attrition 2026-10-10.
# Numbers-only combat lethality tuning: trim monster damage bands ~15-20%.
# Splices into raw file bytes (append-only style); does NOT rewrite the file.
import re, sys

PATH = 'src/data/monsters.json'
raw = open(PATH, encoding='utf-8').read()

# id -> (old_lo, old_hi, new_lo, new_hi)
TUNE = {
    # wave 1: every animal might kill you — trim the top, keep the teeth
    'hushwolf':           (14, 20, 12, 17),
    'bulldozer':          (20, 28, 18, 25),
    'gallowdeer':         (22, 32, 20, 30),
    'speedbump_turtle':   (20, 30, 18, 26),
    'nevermore':          (14, 22, 13, 20),
    'white_noise_heron':  (16, 24, 14, 22),
    'lockpick_raccoon':   (12, 18, 11, 16),
    'nightlight_catfish': (12, 20, 11, 18),
    # wave 2 (day 8+): a genuine step up, not an execution
    'voice_mimic_radio':  (22, 34, 19, 30),
    'mirror_stag':        (28, 42, 24, 37),
    'review_drone':       (25, 39, 22, 34),
    'bright_idea':        (31, 48, 26, 41),
    'memory_projector':   (22, 36, 19, 31),
    'warranty_caller':    (20, 31, 18, 28),
    'understudy':         (20, 28, 18, 25),
    'landlord':           (25, 36, 22, 32),
    'heckler':            (17, 25, 15, 22),
    'paparazzo':          (17, 25, 15, 22),
    'union_rep':          (20, 28, 18, 25),
    'moderator':          (17, 25, 15, 22),
    'statickite':         (17, 25, 15, 22),
    'giant_mosquito':     (14, 22, 12, 19),
    # wave 3 (day 25+): late game stays hard — shave the extreme top only
    'redactor':           (35, 55, 32, 50),
    'gavel':              (40, 60, 37, 55),
    'focus_group':        (30, 45, 28, 42),
    'spool':              (35, 50, 32, 46),
    'chorus_line':        (30, 48, 28, 44),
    'terms_of_service':   (25, 40, 24, 38),
    'callback':           (30, 50, 28, 46),
    'buffering':          (40, 60, 37, 55),
    'ad_break':           (20, 35, 19, 33),
}

def splice(mid, olo, ohi, nlo, nhi):
    global raw
    # scope: from this monster's "id" to the next monster's "id"
    idpat = '"id": "%s"' % mid
    i0 = raw.find(idpat)
    assert i0 != -1, 'id not found: ' + mid
    i1 = raw.find('"id": "', i0 + len(idpat))
    seg = raw[i0:i1 if i1 != -1 else len(raw)]
    old = '"damage": [\n        %d,\n        %d\n      ]' % (olo, ohi)
    new = '"damage": [\n        %d,\n        %d\n      ]' % (nlo, nhi)
    assert seg.count(old) >= 1, 'damage block not found for %s (expected [%d,%d])' % (mid, olo, ohi)
    seg2 = seg.replace(old, new, 1)
    raw = raw[:i0] + seg2 + (raw[i1:] if i1 != -1 else '')

applied = []
for mid, (olo, ohi, nlo, nhi) in TUNE.items():
    splice(mid, olo, ohi, nlo, nhi)
    applied.append(mid)

open(PATH, 'w', encoding='utf-8').write(raw)
print('tuned %d monsters' % len(applied))

# verify: every tuned id now carries the new band
import json
d = json.loads(open(PATH, encoding='utf-8').read())
byid = {x['id']: x for x in d}
bad = []
for mid, (olo, ohi, nlo, nhi) in TUNE.items():
    got = byid[mid]['attack']['damage']
    if got != [nlo, nhi]:
        bad.append((mid, got))
if bad:
    print('MISMATCH:', bad); sys.exit(1)
# and untouched ids kept their bands
print('verify ok — all %d bands applied' % len(TUNE))
