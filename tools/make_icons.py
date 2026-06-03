#!/usr/bin/env python3
"""Generate app icons (black-leather diary cover + white ink checkmark) as PNGs.

Pure stdlib (zlib + struct) PNG encoder so it runs without Pillow/ImageMagick.
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")

# Black-leather cover: subtle top-to-bottom gradient + white ink + faint frame.
TOP = (28, 28, 30)
BOTTOM = (8, 8, 9)
INK = (245, 245, 243)
FRAME = (90, 90, 92)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def dist_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def make_png(size):
    # Checkmark geometry, scaled to icon size.
    s = size
    thickness = s * 0.085
    # Three points of the check (left-bottom elbow, then up-right).
    p1 = (s * 0.30, s * 0.55)
    p2 = (s * 0.44, s * 0.70)
    p3 = (s * 0.72, s * 0.34)

    # Notebook-cover frame inset from the edges.
    margin = s * 0.12
    fw = max(1.0, s * 0.012)  # frame line width

    raw = bytearray()
    for y in range(s):
        raw.append(0)  # filter type 0 for each scanline
        bg = lerp(TOP, BOTTOM, y / (s - 1))
        for x in range(s):
            # base leather background
            r, g, b = bg

            # faint frame: distance to the inset rectangle outline
            inside = margin <= x <= s - margin and margin <= y <= s - margin
            if inside:
                edge = min(x - margin, s - margin - x, y - margin, s - margin - y)
                fcov = max(0.0, min(1.0, (fw - edge) / 1.0 + 0.5)) * 0.6
                r = round(r + (FRAME[0] - r) * fcov)
                g = round(g + (FRAME[1] - g) * fcov)
                b = round(b + (FRAME[2] - b) * fcov)

            # white ink checkmark on top
            d = min(
                dist_to_segment(x, y, *p1, *p2),
                dist_to_segment(x, y, *p2, *p3),
            )
            cov = max(0.0, min(1.0, (thickness - d) / 1.5 + 0.5))
            r = round(r + (INK[0] - r) * cov)
            g = round(g + (INK[1] - g) * cov)
            b = round(b + (INK[2] - b) * cov)
            raw += bytes((r, g, b, 255))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", s, s, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    return png


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (180, 192, 512):
        path = os.path.join(OUT_DIR, f"icon-{size}.png")
        with open(path, "wb") as f:
            f.write(make_png(size))
        print("wrote", os.path.relpath(path))


if __name__ == "__main__":
    main()
