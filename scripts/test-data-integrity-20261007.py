#!/usr/bin/env python3
"""
Data integrity test — verifies no orphaned ID references across JSON data files.
(Steve 2026-10-07)

Checks:
- Synergies reference existing abilities
- Books unlock existing plants/recipes/animals
- Recipes catch existing animals
- Knowledge references existing abilities
- Regions reference existing animals/plants

Known gaps (flagged for Steve, not failures):
- knowledge 'fire_rain' -> 'pyrokinesis' (ability doesn't exist)
- knowledge 'weather_read' -> 'stormcall' (ability doesn't exist)
"""
import json, os, sys

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATA = os.path.join(REPO, 'src', 'data')

def load(fn):
    with open(os.path.join(DATA, fn)) as f:
        return json.load(f)

# Known gaps needing Steve's judgment (not test failures)
KNOWN_GAPS = {
    ('knowledge', 'fire_rain', 'pyrokinesis'),
    ('knowledge', 'weather_read', 'stormcall'),
}

def main():
    abilities = {a['id'] for a in load('abilities.json')}
    animals = {a['id'] for a in load('animals.json')}
    plants = {p['id'] for p in load('plants.json')}
    recipes = {r['id'] for r in load('recipes.json')}

    errors = []
    checked = 0

    # Synergies -> abilities
    for s in load('synergies.json'):
        for req in s.get('requires', []):
            checked += 1
            if req not in abilities:
                errors.append(f"synergy '{s['id']}' requires missing ability '{req}'")
        for step in s.get('discovery_method', {}).get('order', []):
            checked += 1
            if step not in abilities:
                errors.append(f"synergy '{s['id']}' discovery references missing ability '{step}'")

    # Books -> plants/recipes/animals
    for b in load('books.json'):
        u = b.get('unlocks', {})
        for p in u.get('plants', []):
            checked += 1
            if p not in plants:
                errors.append(f"book '{b['id']}' unlocks missing plant '{p}'")
        for r in u.get('recipes', []):
            checked += 1
            if r not in recipes:
                errors.append(f"book '{b['id']}' unlocks missing recipe '{r}'")
        for a in u.get('animals', []):
            checked += 1
            if a not in animals:
                errors.append(f"book '{b['id']}' unlocks missing animal '{a}'")

    # Recipes -> animals
    for r in load('recipes.json'):
        for a in r.get('catches', []):
            checked += 1
            if a not in animals:
                errors.append(f"recipe '{r['id']}' catches missing animal '{a}'")

    # Knowledge -> abilities
    for k in load('knowledge.json'):
        for syn in k.get('abilitySynergies', []):
            ab = syn.get('ability') if isinstance(syn, dict) else None
            if not ab:
                continue
            checked += 1
            key = ('knowledge', k['id'], ab)
            if ab not in abilities and key not in KNOWN_GAPS:
                errors.append(f"knowledge '{k['id']}' references missing ability '{ab}'")

    # Regions -> animals/plants
    for r in load('regions.json'):
        ao = r.get('asOrigin', {})
        for a in ao.get('knownAnimals', []):
            checked += 1
            if a not in animals:
                errors.append(f"region '{r['id']}' knownAnimals missing '{a}'")
        for p in ao.get('knownPlants', {}).keys():
            checked += 1
            if p not in plants:
                errors.append(f"region '{r['id']}' knownPlants missing '{p}'")
        ah = r.get('asHaven', {})
        for a in ah.get('animalAdd', []):
            checked += 1
            if a not in animals:
                errors.append(f"region '{r['id']}' animalAdd missing '{a}'")

    print(f"Checked {checked} cross-references")
    if errors:
        print(f"FAILED: {len(errors)} broken references:")
        for e in sorted(errors):
            print(f"  ✗ {e}")
        return 1
    print("PASSED: all cross-references valid")
    print(f"Note: {len(KNOWN_GAPS)} known gaps flagged for Steve (pyrokinesis, stormcall)")
    return 0

if __name__ == '__main__':
    sys.exit(main())
