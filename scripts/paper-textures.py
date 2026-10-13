# Paper textures for the card surfaces, as seamless tiles.
#
# Usage (needs Python 3 with Pillow and NumPy):
#   python scripts/paper-textures.py src/assets
#
# Writes:
#   texture-linen.png  cream card stock: crossed linen fibres + fine grain
#   texture-weave.png  navy paper: fine woven tooth with yarn irregularity
#
# Each tile is light-and-shadow with alpha: white where the surface catches
# light, a dark tone where it dips, with the strength carried in the alpha
# channel (a few percent). That lets one tile sit over its surface colour
# with normal blending.
# Built by filtering noise in the frequency domain, so the tiles wrap
# seamlessly. (The envelope photo's own grain is JPEG block noise, so the
# weave is synthesised to match its matte look rather than sampled.)
import sys
from pathlib import Path

import numpy as np
from PIL import Image

rng = np.random.default_rng(20261109)


def filtered_noise(n, response):
    """White noise shaped by a frequency response — periodic by construction."""
    fx = np.fft.fftfreq(n)[None, :]
    fy = np.fft.fftfreq(n)[:, None]
    spectrum = np.fft.fft2(rng.standard_normal((n, n))) * response(fx, fy)
    out = np.real(np.fft.ifft2(spectrum))
    return (out - out.mean()) / out.std()


def to_tile(dev, strength, cap, dark=(0, 0, 0)):
    """Signed deviation → white / dark tone, alpha = |dev| × strength."""
    alpha = np.clip(np.abs(dev) * strength, 0, cap)
    rgb = np.where((dev > 0)[..., None], np.array([255, 255, 255]), np.array(dark))
    # Quantised alpha keeps the PNG small without visible banding
    a8 = np.round(alpha * 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, a8]).astype(np.uint8), 'RGBA')


def linen(n=256):
    across = filtered_noise(n, lambda fx, fy: np.exp(-(fx / 0.018) ** 2 - (fy / 0.22) ** 2))
    down = filtered_noise(n, lambda fx, fy: np.exp(-(fx / 0.22) ** 2 - (fy / 0.018) ** 2))
    grain = filtered_noise(n, lambda fx, fy: np.exp(-(fx**2 + fy**2) / 0.3**2))
    dev = 0.55 * across + 0.45 * down + 0.4 * grain
    # Warm brown fibres, ~2% typical, never above ~5.5%
    return to_tile(dev / dev.std(), strength=0.018, cap=0.055, dark=(110, 85, 50))


def weave(n=240, period=3):
    # Over/under threads: warp (vertical) and weft (horizontal) alternate per cell
    y, x = np.mgrid[0:n, 0:n]
    cell_over = ((x // period) + (y // period)) % 2 == 0
    # Rounded thread profile across each thread (raised centre, darker edges)
    across_x = np.cos((x % period + 0.5) / period * np.pi * 2) * -0.5 + 0.5
    across_y = np.cos((y % period + 0.5) / period * np.pi * 2) * -0.5 + 0.5
    threads = np.where(cell_over, across_x, across_y) - 0.5
    # Yarn irregularity: slow variation along threads, plus fine fibre noise
    slub = filtered_noise(n, lambda fx, fy: np.exp(-(fx**2 + fy**2) / 0.04**2))
    fibre = filtered_noise(n, lambda fx, fy: np.exp(-(fx**2 + fy**2) / 0.35**2))
    dev = threads * (1 + 0.35 * slub) * 1.6 + 0.45 * fibre
    return to_tile(dev / dev.std(), strength=0.035, cap=0.1, dark=(0, 4, 16))


if __name__ == '__main__':
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'src/assets')
    linen().save(out / 'texture-linen.png', optimize=True)
    weave().save(out / 'texture-weave.png', optimize=True)
    for name in ('texture-linen.png', 'texture-weave.png'):
        print(name, (out / name).stat().st_size, 'bytes')
