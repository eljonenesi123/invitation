# Pen cutout: flood-fill the flat studio gray from the borders to transparent,
# feather the edge, un-mix the gray from edge pixels, crop, downscale.
#
# Usage (needs Python 3 with Pillow and NumPy):
#   python scripts/pen-cutout.py src/assets/pen.jpg src/assets/pen-cutout.png
#
# Expects a pen photographed on a flat (229, 229, 229) background, nib
# pointing down-left. Prints the output size and the nib tip as fractions of
# the image — copy those into PEN in src/components/SignatureReveal.jsx.
import sys
from collections import deque
from PIL import Image
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
h, w, _ = im.shape
bg = np.array([229, 229, 229], np.float32)
dist = np.sqrt(((im - bg) ** 2).sum(-1))

HARD, SOFT = 10.0, 42.0          # <HARD: background; >SOFT: fully pen
bgmask = np.zeros((h, w), bool)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if dist[y, x] < HARD and not bgmask[y, x]:
            bgmask[y, x] = True; q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if dist[y, x] < HARD and not bgmask[y, x]:
            bgmask[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and not bgmask[ny, nx] and dist[ny, nx] < HARD:
            bgmask[ny, nx] = True; q.append((ny, nx))

# Edge band: pixels next to the background get partial alpha from colour distance
alpha = np.where(bgmask, 0.0, 1.0)
near = np.zeros_like(bgmask)
for dy in (-2, -1, 0, 1, 2):
    for dx in (-2, -1, 0, 1, 2):
        near |= np.roll(np.roll(bgmask, dy, 0), dx, 1)
band = near & ~bgmask
alpha[band] = np.clip((dist[band] - HARD) / (SOFT - HARD), 0, 1)

# Remove the gray that was mixed into semi-transparent edge pixels
a = alpha[..., None]
rgb = np.where(a > 0.01, (im - bg * (1 - a)) / np.maximum(a, 0.01), 0)
rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)

ys, xs = np.nonzero(alpha > 0.05)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
crop = Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA')

# Nib tip = lowest opaque pixel
tip_y = ys.max(); tip_x = int(xs[ys == tip_y].mean())
scale = 420 / crop.height
out = crop.resize((round(crop.width * scale), 420), Image.LANCZOS)
out.save(dst, optimize=True)
print('size', out.size, 'tip fraction', round((tip_x - x0) / (x1 - x0), 4), round((tip_y - y0) / (y1 - y0), 4))
