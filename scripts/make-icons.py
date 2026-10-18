#!/usr/bin/env python3
"""
WISP - app icon generator (build/icon.png, build/icon.ico, build/icon.icns, build/icons/*.png)
Ionity (Pty) Ltd | AEDI | Policy 986 AED

Draws the WISP mark: a window frame wrapped in the Ionity brand gradient aura
(purple #5746E3 -> blue #3366FF -> cyan #00D2FF -> teal #00D4B8) with a bright
wisp comet running its edge, on the Ionity dark surface.
Requires Pillow:  pip install pillow
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build")
S = 1024
STOPS = [(0.0, (0x57, 0x46, 0xE3)), (0.38, (0x33, 0x66, 0xFF)), (0.72, (0x00, 0xD2, 0xFF)), (1.0, (0x00, 0xD4, 0xB8))]


def grad_color(t):
    t = max(0.0, min(1.0, t))
    for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
        if t <= b:
            k = (t - a) / (b - a)
            return tuple(int(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
    return STOPS[-1][1]


def diagonal_gradient(size):
    g = Image.new("RGB", (size, size))
    px = g.load()
    for y in range(size):
        for x in range(size):
            px[x, y] = grad_color((x + y) / (2 * size))
    return g


def rounded_mask(size, box, radius, width=None):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    if width:
        d.rounded_rectangle(box, radius=radius, outline=255, width=width)
    else:
        d.rounded_rectangle(box, radius=radius, fill=255)
    return m


def perimeter_point(box, r, s):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    sw, sh, arc = w - 2 * r, h - 2 * r, math.pi * r / 2
    segs = [sw, arc, sh, arc, sw, arc, sh, arc]
    L = sum(segs)
    d = (s % 1) * L
    i = 0
    while d > segs[i] and i < 7:
        d -= segs[i]
        i += 1
    t = d / segs[i] if segs[i] else 0
    if i == 0: return (x0 + r + t * sw, y0)
    if i == 2: return (x1, y0 + r + t * sh)
    if i == 4: return (x1 - r - t * sw, y1)
    if i == 6: return (x0, y1 - r - t * sh)
    centers = {1: (x1 - r, y0 + r, -math.pi / 2), 3: (x1 - r, y1 - r, 0), 5: (x0 + r, y1 - r, math.pi / 2), 7: (x0 + r, y0 + r, math.pi)}
    cx, cy, a0 = centers[i]
    a = a0 + t * math.pi / 2
    return (cx + math.cos(a) * r, cy + math.sin(a) * r)


def build():
    os.makedirs(OUT, exist_ok=True)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # tile: Ionity dark surface with a faint violet bloom
    tile = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = Image.new("RGB", (S, S))
    bpx = bg.load()
    for y in range(S):
        for x in range(S):
            k = y / S
            r = int(0x12 + (0x0B - 0x12) * k)
            g = int(0x16 + (0x0D - 0x16) * k)
            b = int(0x24 + (0x12 - 0x24) * k)
            bpx[x, y] = (r, g, b)
    bloom = Image.new("L", (S, S), 0)
    ImageDraw.Draw(bloom).ellipse((S * 0.15, S * 0.05, S * 1.05, S * 0.85), fill=70)
    bloom = bloom.filter(ImageFilter.GaussianBlur(160))
    bg = Image.composite(Image.new("RGB", (S, S), (0x3A, 0x2E, 0xA8)), bg, bloom)
    tile.paste(bg, (0, 0), rounded_mask(S, (40, 40, S - 40, S - 40), 210))
    img = Image.alpha_composite(img, tile)

    grad = diagonal_gradient(S)
    box = (232, 262, 792, 722)
    rad = 70

    # outer aura (wide blur), inner aura, crisp line
    for width, blur, alpha in ((60, 70, 0.75), (34, 26, 0.95), (18, 8, 1.0)):
        m = rounded_mask(S, box, rad, width).filter(ImageFilter.GaussianBlur(blur))
        m = m.point(lambda v: int(min(255, v * alpha * 1.35)))
        layer = Image.new("RGBA", (S, S))
        layer.paste(grad, (0, 0), m)
        img = Image.alpha_composite(img, layer)
    line = rounded_mask(S, box, rad, 16)
    layer = Image.new("RGBA", (S, S))
    layer.paste(grad, (0, 0), line)
    img = Image.alpha_composite(img, layer)

    # window chrome hints inside the frame
    chrome = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(chrome)
    for i, cx in enumerate((300, 340, 380)):
        d.ellipse((cx - 11, 318 - 11, cx + 11, 318 + 11), fill=(255, 255, 255, 60 if i else 90))
    for j, (y, w) in enumerate(((410, 360), (470, 300), (530, 380), (590, 220))):
        d.rounded_rectangle((300, y, 300 + w, y + 22), radius=11, fill=(255, 255, 255, 46))
    img = Image.alpha_composite(img, chrome)

    # the wisp: a comet running the top-right corner with a tapering trail
    glow = Image.new("L", (S, S), 0)
    core = Image.new("L", (S, S), 0)
    gd, cd = ImageDraw.Draw(glow), ImageDraw.Draw(core)
    head = 0.40
    N = 70
    for i in range(N, -1, -1):
        f = i / N
        x, y = perimeter_point(box, rad, head - f * 0.26)
        fall = (1 - f) ** 1.5
        rr = 10 + 34 * fall
        gd.ellipse((x - rr, y - rr, x + rr, y + rr), fill=int(255 * fall))
        cr = 3 + 16 * fall
        cd.ellipse((x - cr, y - cr, x + cr, y + cr), fill=int(255 * fall))
    glow = glow.filter(ImageFilter.GaussianBlur(22))
    core = core.filter(ImageFilter.GaussianBlur(4))
    cyan = Image.new("RGBA", (S, S), (0x7F, 0xE8, 0xFF, 255))
    white = Image.new("RGBA", (S, S), (255, 255, 255, 255))
    img = Image.alpha_composite(img, Image.composite(cyan, Image.new("RGBA", (S, S)), glow))
    img = Image.alpha_composite(img, Image.composite(white, Image.new("RGBA", (S, S)), core))

    # motes
    motes = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(motes)
    for (s, off, r) in ((0.08, 40, 9), (0.17, 62, 6), (0.62, 48, 8), (0.71, 30, 5), (0.86, 58, 7), (0.95, 36, 5)):
        x, y = perimeter_point(box, rad, s)
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        vx, vy = x - cx, y - cy
        n = math.hypot(vx, vy) or 1
        x, y = x + vx / n * off, y + vy / n * off
        md.ellipse((x - r, y - r, x + r, y + r), fill=255)
    motes = motes.filter(ImageFilter.GaussianBlur(3))
    img = Image.alpha_composite(img, Image.composite(Image.new("RGBA", (S, S), (0xB8, 0xF4, 0xFF, 255)), Image.new("RGBA", (S, S)), motes))

    # keep everything inside the tile
    clip = rounded_mask(S, (40, 40, S - 40, S - 40), 210)
    a = ImageChops.multiply(img.getchannel("A"), clip)
    img.putalpha(a)

    img.save(os.path.join(OUT, "icon.png"))
    icons = os.path.join(OUT, "icons")
    os.makedirs(icons, exist_ok=True)
    for sz in (16, 24, 32, 48, 64, 128, 256, 512):
        img.resize((sz, sz), Image.LANCZOS).save(os.path.join(icons, f"{sz}x{sz}.png"))
    img.save(os.path.join(OUT, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    img.save(os.path.join(OUT, "icon.icns"))
    print("icons written to", OUT)


if __name__ == "__main__":
    build()
