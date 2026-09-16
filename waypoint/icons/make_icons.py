#!/usr/bin/env python3
"""Generate Waypoint PWA icons as PNGs, no third-party deps.

Design: a warm off-white ground with a pacific-teal rounded square and a
sunset-coral map "waypoint" pin (teardrop + inner dot). Two variants:
  - icon-192 / icon-512: normal icons, art inset with padding.
  - maskable-512: full-bleed teal ground, pin kept inside the 80% safe zone,
    so Android's mask can crop the edges without eating the mark.

Run:  python3 make_icons.py
"""
import struct, zlib, math

# palette
CREAM   = (0xF6, 0xF1, 0xE7)
TEAL    = (0x15, 0x70, 0x71)
TEAL_D  = (0x0E, 0x52, 0x53)
CORAL   = (0xCE, 0x5B, 0x3A)
WHITE   = (0xFF, 0xFB, 0xF4)


def blend(bg, fg, a):
    return tuple(int(round(bg[i] * (1 - a) + fg[i] * a)) for i in range(3))


def write_png(path, size, pixels):
    """pixels: flat list of (r,g,b) length size*size."""
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        row = y * size
        for x in range(size):
            r, g, b = pixels[row + x]
            raw += bytes((r, g, b))
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
        return c
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def rounded_rect_a(x, y, rx0, ry0, rx1, ry1, radius):
    """coverage 0..1 of point (x,y) inside a rounded rect (approx AA)."""
    # distance outside the rect (0 inside straight edges)
    cx = min(max(x, rx0 + radius), rx1 - radius)
    cy = min(max(y, ry0 + radius), ry1 - radius)
    dx = x - cx
    dy = y - cy
    d = math.hypot(dx, dy)
    # inside straight region
    if rx0 <= x <= rx1 and ry0 <= y <= ry1 and (radius == 0 or d <= radius):
        # AA on the corner arc
        if d > radius - 1:
            return max(0.0, radius - d + 0.5) if d > radius - 0.5 else 1.0
        return 1.0
    return 0.0


def disc_a(x, y, cx, cy, r):
    d = math.hypot(x - cx, y - cy)
    if d <= r - 0.5:
        return 1.0
    if d >= r + 0.5:
        return 0.0
    return r + 0.5 - d


def pin_coverage(x, y, cx, cy, r):
    """Teardrop pin: circle of radius r centered (cx,cy) + triangle tip below.
    Returns coverage 0..1."""
    a = disc_a(x, y, cx, cy, r)
    # triangle from circle sides down to a tip
    tip_y = cy + r * 2.4
    # linear narrowing
    if cy <= y <= tip_y:
        t = (y - cy) / (tip_y - cy)
        half = r * (1 - t)
        dx = abs(x - cx)
        if dx <= half - 0.5:
            a = max(a, 1.0)
        elif dx <= half + 0.5:
            a = max(a, half + 0.5 - dx)
    return a


def render(size, maskable):
    px = [CREAM] * (size * size) if not maskable else [TEAL] * (size * size)
    s = size
    if maskable:
        # full-bleed teal; slight radial darkening at edges for depth
        for y in range(s):
            for x in range(s):
                pass  # flat teal ground already set
        pad = s * 0.14          # keep pin within safe zone
        plate = None
    else:
        # inset teal rounded plate on cream
        pad = s * 0.09
        rad = s * 0.22
        for y in range(s):
            for x in range(s):
                a = rounded_rect_a(x + 0.5, y + 0.5, pad, pad, s - pad, s - pad, rad)
                if a > 0:
                    px[y * s + x] = blend(px[y * s + x], TEAL, a)

    # pin geometry (centered, slightly high so the tip sits near center-bottom)
    cx = s * 0.5
    r = s * (0.20 if not maskable else 0.185)
    cy = s * (0.40 if not maskable else 0.40)

    for y in range(s):
        for x in range(s):
            fx, fy = x + 0.5, y + 0.5
            a = pin_coverage(fx, fy, cx, cy, r)
            if a > 0:
                px[y * s + x] = blend(px[y * s + x], CORAL, a)
    # inner dot (cream) — the "waypoint"
    dr = r * 0.42
    for y in range(s):
        for x in range(s):
            a = disc_a(x + 0.5, y + 0.5, cx, cy, dr)
            if a > 0:
                px[y * s + x] = blend(px[y * s + x], WHITE, a)
    return px


for size, mask, name in [
    (192, False, "icon-192.png"),
    (512, False, "icon-512.png"),
    (512, True,  "maskable-512.png"),
]:
    write_png(name, size, render(size, mask))
    print("wrote", name)
