"""
Generate placeholder "photography" for outlet profile pages.

These stand in for the real photos an outlet admin will upload. They are
deliberately shallow-depth-of-field interior impressions — a lit wall/horizon,
soft vertical elements (curtains, doorways, panels) and scattered bokeh
highlights (candles, downlights) — so they read as tastefully out-of-focus spa
shots rather than as flat CSS gradients, and so overlaid text stays legible.

Light is accumulated linearly and then tone-mapped with a filmic rolloff, so
highlights bloom and roll off instead of hard-clipping to flat white.

Deterministic: every image is seeded, so re-running produces identical files.

Usage:  python3 scripts/gen-outlet-photos.py
Output: public/img/outlets/<outlet-id>/cover.jpg + gallery-N.jpg
"""

import os
import numpy as np
from PIL import Image, ImageFilter

OUT_ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "img", "outlets")

COVER_SIZE = (1920, 800)     # hero banner on the outlet profile page
GALLERY_SIZE = (1200, 900)   # 4:3 facility photos


def hexf(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def render(w, h, palette, seed, horizon=0.62, blur_frac=0.012, exposure=112.0):
    """
    palette = dict(base, wall, warm, cool)
      base : deepest shadow tone
      wall : the lit surface behind everything
      warm : candle / downlight highlights
      cool : accent light (window, LED cove)
    """
    rng = np.random.default_rng(seed)
    aspect = w / h

    gx = np.linspace(0.0, 1.0, w)[None, :]
    gy = np.linspace(0.0, 1.0, h)[:, None]

    base = hexf(palette["base"])
    wall = hexf(palette["wall"])
    warm = hexf(palette["warm"])
    cool = hexf(palette["cool"])

    # --- linear light accumulation -------------------------------------
    light = np.zeros((h, w, 3), dtype=np.float64)
    light += base[None, None, :] * 0.55

    # lit wall falling off toward the floor, meeting a soft horizon line
    wall_amt = np.clip(1.0 - np.abs(gy - horizon * 0.55) / 0.85, 0, 1) ** 1.8
    floor = np.clip((gy - horizon) / (1.0 - horizon + 1e-6), 0, 1)
    wall_amt = wall_amt * (1.0 - 0.72 * floor)
    light += wall[None, None, :] * wall_amt[:, :, None] * 0.85

    # a brighter grazing band right at the horizon — reads as a lit cove
    cove = np.exp(-((gy - horizon) ** 2) / (2 * 0.045 ** 2))
    light += wall[None, None, :] * cove[:, :, None] * 0.55

    # soft vertical elements: curtains / panels / door reveals
    n_cols = rng.integers(4, 7)
    for _ in range(n_cols):
        cx = rng.uniform(-0.05, 1.05)
        width = rng.uniform(0.05, 0.16)
        strength = rng.uniform(0.18, 0.5)
        tint = warm if rng.random() < 0.5 else cool
        col = np.exp(-((gx - cx) ** 2) / (2 * width ** 2))
        col = col * np.clip(1.0 - floor * 1.15, 0, 1)
        light += tint[None, None, :] * col[:, :, None] * strength

    # bokeh highlights — a few large, softly defocused light sources.
    # Kept well below the tone-map knee so they keep their tint instead of
    # burning out into flat white discs.
    n_bokeh = rng.integers(7, 12)
    for _ in range(n_bokeh):
        cx = rng.uniform(0.02, 0.98)
        cy = rng.uniform(0.06, horizon + 0.06)
        r = rng.uniform(0.025, 0.085)
        tint = warm if rng.random() < 0.8 else cool
        strength = rng.uniform(0.35, 0.85) * (0.5 if cy > horizon else 1.0)
        d2 = (((gx - cx) * aspect) ** 2 + (gy - cy) ** 2) / (r ** 2)
        # flat-ish core with a soft edge = defocused aperture disc
        disc = np.exp(-(d2 ** 1.6) * 0.9)
        light += tint[None, None, :] * disc[:, :, None] * strength * 26

    # faint reflection of the scene in the floor
    refl = np.clip((gy - horizon) / 0.4, 0, 1) * 0.16
    light += wall[None, None, :] * refl[:, :, None]

    # --- filmic tone map: highlights roll off instead of clipping -------
    img = 255.0 * (1.0 - np.exp(-light / exposure))

    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    out = out.filter(ImageFilter.GaussianBlur(max(w, h) * blur_frac))

    arr = np.asarray(out).astype(np.float64)

    # vignette
    vx = (gx - 0.5) * 2
    vy = (gy - 0.5) * 2
    arr *= (1.0 - 0.34 * np.clip(vx ** 2 * 0.8 + vy ** 2, 0, 1.5))[:, :, None]

    # gentle S-curve for contrast, then grain
    n = arr / 255.0
    arr = 255.0 * np.clip(n * n * (3 - 2 * n) * 0.82 + n * 0.18, 0, 1)
    arr += rng.normal(0, 3.2, arr.shape)

    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


# Palettes echo each outlet's character: Dago premium teal + candlelight,
# Setiabudi bright daylight sky, Pasteur modern after-dark indigo + amber.
SCENES = {
    "OUT-001": {
        "cover": dict(base="#07100f", wall="#14403a", warm="#ffcf94", cool="#37d6b4"),
        "gallery": [
            dict(base="#08120f", wall="#17453c", warm="#ffd8a2", cool="#3fd9b6"),  # lobby
            dict(base="#0a0d18", wall="#232a52", warm="#e6c9ff", cool="#8aa0ff"),  # VIP sanctuary
            dict(base="#140a10", wall="#48222f", warm="#ffb9b2", cool="#e0808f"),  # couple suite
            dict(base="#07110f", wall="#194239", warm="#ffd79a", cool="#35cfae"),  # reflexology
            dict(base="#081007", wall="#1e4423", warm="#d8f0a4", cool="#5fbb72"),  # taman
            dict(base="#0b0c0e", wall="#2b3038", warm="#efe7d6", cool="#9aa6b4"),  # parkir
        ],
    },
    "OUT-002": {
        "cover": dict(base="#070f14", wall="#164058", warm="#ffdcaa", cool="#9fe2ff"),
        "gallery": [
            dict(base="#071016", wall="#18455f", warm="#ffe2b4", cool="#a8e6ff"),  # resepsionis
            dict(base="#140a0f", wall="#46232c", warm="#ffc0b6", cool="#e08c86"),  # couple suite
            dict(base="#06100f", wall="#16413f", warm="#ffdca8", cool="#4ad0dc"),  # reflexology
            dict(base="#0f0d07", wall="#3b361f", warm="#f7e6ae", cool="#c0a86a"),  # ruang tunggu
        ],
    },
    "OUT-003": {
        "cover": dict(base="#080914", wall="#252352", warm="#ffc98a", cool="#b39cff"),
        "gallery": [
            dict(base="#09091a", wall="#282559", warm="#e2d0ff", cool="#8f7ce8"),  # lobby modern
            dict(base="#06100f", wall="#154048", warm="#b4ecf7", cool="#46b4cc"),  # wet room
            dict(base="#100819", wall="#3f2350", warm="#f5bfee", cool="#a86ac0"),  # VIP
            dict(base="#0f0a06", wall="#3d2c18", warm="#ffdba6", cool="#c08f4a"),  # reflexology
        ],
    },
}


def main():
    total = 0
    for i, (outlet_id, scene) in enumerate(SCENES.items()):
        folder = os.path.join(OUT_ROOT, outlet_id.lower())
        os.makedirs(folder, exist_ok=True)

        cover = render(*COVER_SIZE, scene["cover"], seed=1000 + i, horizon=0.66, blur_frac=0.010)
        path = os.path.join(folder, "cover.jpg")
        cover.save(path, "JPEG", quality=82, optimize=True, progressive=True)
        total += 1
        print(f"  {outlet_id}/cover.jpg  {os.path.getsize(path) // 1024} KB")

        for j, pal in enumerate(scene["gallery"], start=1):
            g = render(*GALLERY_SIZE, pal, seed=2000 + i * 50 + j, horizon=0.60, blur_frac=0.013)
            p = os.path.join(folder, f"gallery-{j}.jpg")
            g.save(p, "JPEG", quality=82, optimize=True, progressive=True)
            total += 1
            print(f"  {outlet_id}/gallery-{j}.jpg  {os.path.getsize(p) // 1024} KB")

    print(f"\n{total} images written to public/img/outlets/")


if __name__ == "__main__":
    main()
