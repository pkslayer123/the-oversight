#!/usr/bin/env python3
"""
Visual regression testing without a browser (Steve 2026-10-06).

Renders game scenarios as SVG (via render-grid.js), converts to PNG
(via cairosvg), and compares pixel-by-pixel (via PIL).

Usage:
  python3 scripts/visual-regression.py baseline <scenario>  # Save baseline
  python3 scripts/visual-regression.py compare <scenario>   # Compare vs baseline
  python3 scripts/visual-regression.py sprites              # Compare all monster sprites

No browser needed. No Chromium. Just SVG -> PNG -> diff.
"""

import subprocess
import sys
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).parent.parent
BASELINE_DIR = ROOT / "scripts" / ".visual-baselines"
BASELINE_DIR.mkdir(exist_ok=True)

def render_scenario(scenario):
    """Render a scenario to SVG, return the SVG path."""
    result = subprocess.run(
        ["node", "scripts/render-grid.js", scenario],
        cwd=ROOT,
        capture_output=True,
        timeout=30
    )
    if result.returncode != 0:
        print(f"Failed to render {scenario}: {result.stderr.decode()[:200]}")
        return None
    return "/tmp/oversight-grid.svg"

def svg_to_png(svg_path, png_path):
    """Convert SVG to PNG using cairosvg."""
    import cairosvg
    with open(svg_path, 'rb') as f:
        svg_data = f.read()
    cairosvg.svg2png(bytestring=svg_data, write_to=png_path)
    return png_path

def compare_images(baseline_path, current_path):
    """Compare two PNGs, return diff percentage and diff image path."""
    from PIL import Image, ImageChops
    
    baseline = Image.open(baseline_path).convert('RGB')
    current = Image.open(current_path).convert('RGB')
    
    # Resize to match if different
    if baseline.size != current.size:
        current = current.resize(baseline.size)
    
    diff = ImageChops.difference(baseline, current)
    
    # Calculate diff percentage
    # Convert to grayscale, count non-zero pixels
    diff_gray = diff.convert('L')
    pixels = list(diff_gray.getdata())
    changed = sum(1 for p in pixels if p > 10)  # Threshold for noise
    total = len(pixels)
    pct = (changed / total) * 100
    
    # Save diff image (highlight changes in red)
    diff_path = str(current_path).replace('.png', '-diff.png')
    # Create a visual diff: red where different
    diff_visual = Image.new('RGB', baseline.size, (0, 0, 0))
    diff_pixels = diff_visual.load()
    base_pixels = baseline.load()
    curr_pixels = current.load()
    for y in range(baseline.size[1]):
        for x in range(baseline.size[0]):
            if abs(base_pixels[x, y][0] - curr_pixels[x, y][0]) > 10 or \
               abs(base_pixels[x, y][1] - curr_pixels[x, y][1]) > 10 or \
               abs(base_pixels[x, y][2] - curr_pixels[x, y][2]) > 10:
                diff_pixels[x, y] = (255, 0, 0)  # Red for changed
            else:
                diff_pixels[x, y] = base_pixels[x, y]
    diff_visual.save(diff_path)
    
    return pct, diff_path

def cmd_baseline(scenario):
    svg = render_scenario(scenario)
    if not svg:
        sys.exit(1)
    png = str(BASELINE_DIR / f"{scenario}.png")
    svg_to_png(svg, png)
    print(f"✅ Baseline saved: {png}")

def cmd_compare(scenario):
    baseline = BASELINE_DIR / f"{scenario}.png"
    if not baseline.exists():
        print(f"No baseline for {scenario}. Run 'baseline' first.")
        sys.exit(1)
    
    svg = render_scenario(scenario)
    if not svg:
        sys.exit(1)
    
    current = f"/tmp/{scenario}-current.png"
    svg_to_png(svg, current)
    
    pct, diff_path = compare_images(str(baseline), current)
    
    print(f"\n=== VISUAL DIFF: {scenario} ===")
    print(f"Changed pixels: {pct:.2f}%")
    print(f"Diff image: {diff_path}")
    
    if pct < 0.1:
        print("✅ No visual change")
    elif pct < 5:
        print("⚠️  Minor visual change")
    else:
        print("❌ Significant visual change")

def cmd_sprites():
    """Render all monster sprites and check for visual regressions."""
    import json
    
    with open(ROOT / "src/data/monsters.json") as f:
        monsters = json.load(f)
    
    with open(ROOT / "src/js/sprites.js") as f:
        sprites_src = f.read()
    
    def get_sprite(mid):
        idx = sprites_src.find(mid + ':')
        if idx < 0:
            return None
        s = sprites_src.find('<svg', idx)
        e = sprites_src.find('</svg>', s)
        if s < 0 or e < 0:
            return None
        raw = sprites_src[s:e+6]
        # Unescape JS template literal escapes
        raw = raw.replace('\\"', '"').replace('\\n', '\n')
        return raw
    
    print(f"Checking {len(monsters)} monster sprites...\n")
    
    for m in monsters:
        for form in ['calm', 'aggro']:
            sid = f"{m['id']}_{form}"
            sprite = get_sprite(sid)
            if not sprite:
                print(f"  ❌ {sid}: MISSING")
                continue
            
            # Wrap in a full SVG document for rendering
            # Sprites are 32x32 viewBox, render at 128x128 for visibility
            full_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 32 32">
                <rect width="32" height="32" fill="#2a2a3e"/>
                {sprite[sprite.find('>')+1:sprite.rfind('<')]}
            </svg>'''
            
            png_path = str(BASELINE_DIR / f"sprite-{sid}.png")
            baseline_exists = os.path.exists(png_path)
            
            tmp_png = f"/tmp/sprite-{sid}.png"
            import cairosvg
            cairosvg.svg2png(bytestring=full_svg.encode(), write_to=tmp_png)
            
            if not baseline_exists:
                shutil.move(tmp_png, png_path)
                print(f"  📸 {sid}: baseline saved")
            else:
                pct, _ = compare_images(png_path, tmp_png)
                if pct < 0.1:
                    print(f"  ✅ {sid}: unchanged")
                else:
                    print(f"  ⚠️  {sid}: {pct:.1f}% changed")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    cmd = sys.argv[1]
    if cmd == "baseline" and len(sys.argv) > 2:
        cmd_baseline(sys.argv[2])
    elif cmd == "compare" and len(sys.argv) > 2:
        cmd_compare(sys.argv[2])
    elif cmd == "sprites":
        cmd_sprites()
    else:
        print(__doc__)
        sys.exit(1)
