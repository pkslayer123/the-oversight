#!/usr/bin/env python3
# assemble-wave35-20261010.py — one-shot: builds the 26 entries from the three
# part files and byte-splices them into src/data/monsters.json (no rewrite of
# existing entries — the file mixes escaped/raw unicode styles; AGENTS.md:
# match style, avoid cosmetic churn).
import json, io, sys

NS = {}
exec(open('scripts/gen-wave35-part1.py').read(), NS)
exec(open('scripts/gen-wave35-part2.py').read(), NS)
exec(open('scripts/gen-wave35-part3.py').read(), NS)
M = NS['M']
assert len(M) == 26, f"expected 26, got {len(M)}"
ids = [m['id'] for m in M]
assert len(set(ids)) == 26, "duplicate ids in new entries"
print("new ids:", ", ".join(ids))

# validate against existing file: no id collisions
old = json.load(open('src/data/monsters.json'))
old_ids = {m['id'] for m in old}
clash = old_ids & set(ids)
assert not clash, f"id collision: {clash}"

# dump new entries in the file's older escaped style (ensure_ascii)
buf = io.StringIO()
json.dump(M, buf, indent=2, ensure_ascii=True)
new_text = buf.getvalue()
# json.dump of a list gives "[\n  {...}\n]"; strip the brackets -> entry text
assert new_text.startswith('[') and new_text.rstrip().endswith(']')
inner = new_text[1:new_text.rfind(']')].strip('\n')

raw = open('src/data/monsters.json', 'r', encoding='utf-8').read()
assert raw.rstrip().endswith(']'), "unexpected file tail"
stripped = raw.rstrip()
assert stripped.endswith(']')
body = stripped[:-1].rstrip()  # drop final ]
assert body.endswith('}'), "last entry doesn't end with }"
out = body + ',\n' + inner + '\n]\n'
open('src/data/monsters.json', 'w', encoding='utf-8').write(out)

# verify: parses, 56 entries, old entries byte-identical
d = json.load(open('src/data/monsters.json'))
assert len(d) == 56, len(d)
raw2 = open('src/data/monsters.json', 'r', encoding='utf-8').read()
assert raw2.startswith(raw[:len(body)]), "existing entries modified!"
print(f"OK: 56 monsters ({len(old)} old byte-identical + 26 new)")
