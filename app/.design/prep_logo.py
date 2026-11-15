"""One-off: removes the white glow behind the logo and trims it.
Writes public/logo.png (transparent, trimmed). Kept for reference; not part of the build."""
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "acheinator-original.png")
OUT = os.path.join(HERE, "..", "public", "logo.png")
OUTLINE = 88  # grey level of the letter outline
PAD = 6

a = np.array(Image.open(SRC).convert("RGBA")).astype(np.float64)
rgb, alpha = a[..., :3], a[..., 3]
sat = rgb.max(-1) - rgb.min(-1)

# Gold fill is saturated and stays as it is. Grey pixels are the outline blended
# with the white glow: their darkness says how much of the pixel is outline.
grey = sat <= 40
coverage = np.clip((255 - rgb.min(-1)) / (255 - OUTLINE), 0, 1)
new_alpha = np.where(alpha == 0, 0, np.where(grey, 255 * coverage, alpha))
edge = grey & (coverage < 1)
rgb[edge] = OUTLINE

out = np.dstack([rgb, new_alpha]).round().clip(0, 255).astype(np.uint8)
ys, xs = np.nonzero(out[..., 3] > 8)
out = out[max(ys.min() - PAD, 0):ys.max() + PAD + 1, max(xs.min() - PAD, 0):xs.max() + PAD + 1]
Image.fromarray(out).save(OUT, optimize=True)
print("wrote", OUT, out.shape[1], "x", out.shape[0])

for name, bg in [("light", (251, 248, 241)), ("dark", (31, 29, 26))]:
    canvas = Image.new("RGBA", (out.shape[1] + 40, out.shape[0] + 40), bg + (255,))
    canvas.alpha_composite(Image.fromarray(out), (20, 20))
    canvas.convert("RGB").save(os.path.join(HERE, f"logo_on_{name}.png"))

# Favicon: the leading "a". Its outline is shared with the "c"; the gap between
# their fills ends at column 105 of the trimmed logo.
logo = Image.fromarray(out).crop((0, 0, 106, out.shape[0]))
logo = logo.crop(logo.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox())
side = max(logo.size) + 10
icon = Image.new("RGBA", (side, side), (0, 0, 0, 0))
icon.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2))
icon.resize((256, 256), Image.LANCZOS).save(os.path.join(HERE, "..", "src", "app", "icon.png"))
