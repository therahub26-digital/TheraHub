"""
Generate the placeholder photo for the "Lotus Bloom" app-wide background
preset (lib/brand.ts -> BACKGROUND_PRESETS -> key "lotus-bloom"), used by
the "Lotus" theme preset (components/ThemePresetPicker.tsx).

Reuses the same procedural renderer as scripts/gen-outlet-photos.py (linear
light accumulation + filmic tone map so highlights bloom instead of hard
clipping), just tuned toward a soft violet/rose "floating petals" abstract
instead of a room interior — this is meant to sit *behind* the whole app as
an ambient wallpaper, with a dark scrim layered on top by CSS, so it stays
deliberately soft, low local-contrast, and on the dark side.

Deterministic: seeded, so re-running reproduces an identical file.

Usage:  python3 scripts/gen-theme-bg.py
Output: public/img/theme/lotus-bloom.jpg
"""

import importlib.util
import os

HERE = os.path.dirname(__file__)
OUT_ROOT = os.path.join(HERE, "..", "public", "img", "theme")

# Reuse render() from gen-outlet-photos.py instead of duplicating it.
spec = importlib.util.spec_from_file_location("gen_outlet_photos", os.path.join(HERE, "gen-outlet-photos.py"))
gen_outlet_photos = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen_outlet_photos)
render = gen_outlet_photos.render

SIZE = (1920, 1080)

PALETTE = dict(
    base="#120a1a",   # deep violet-black shadow — matches the CSS scrim's start colour
    wall="#3a2050",   # saturated violet wash (not pastel — needs hue contrast against the highlights)
    warm="#e8639f",   # saturated rose/magenta petal highlight
    cool="#8f5be0",   # saturated violet-blue highlight
)


def main():
    os.makedirs(OUT_ROOT, exist_ok=True)
    img = render(
        *SIZE,
        PALETTE,
        seed=7301,
        horizon=0.42,      # push the "lit wall" band higher — reads as diffuse glow, not a room
        blur_frac=0.016,   # extra-soft: this sits behind UI, not the subject of attention
        exposure=170.0,    # darker headroom so bokeh highlights roll off into colour, not flat white
    )
    path = os.path.join(OUT_ROOT, "lotus-bloom.jpg")
    img.save(path, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"lotus-bloom.jpg  {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
