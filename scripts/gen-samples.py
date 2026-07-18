#!/usr/bin/env python3
"""生成 LUMENFORGE 内置示例图库 —— 高明暗对比、适合浮雕切片"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "samples")
os.makedirs(OUT, exist_ok=True)
S = 600
random.seed(7)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ---------- 1. 山峦 ----------
def mountains():
    img = Image.new("RGB", (S, S))
    d = ImageDraw.Draw(img)
    top, bottom = (242, 236, 224), (198, 196, 200)
    for y in range(S):
        d.line([(0, y), (S, y)], fill=lerp(top, bottom, y / S))
    # 落日
    d.ellipse([S * 0.62, S * 0.16, S * 0.78, S * 0.32], fill=(214, 96, 60))
    # 三层山脊，越远越亮
    layers = [
        (0.52, (148, 140, 150), 0.055),
        (0.66, (86, 82, 96), 0.075),
        (0.82, (26, 25, 34), 0.095),
    ]
    for base, color, rough in layers:
        pts = [(0, S)]
        phase = random.uniform(0, 9)
        for x in range(0, S + 1, 4):
            y = S * base + math.sin(x / S * 9 + phase) * S * rough * 0.6 \
                + math.sin(x / S * 23 + phase * 2) * S * rough * 0.4
            pts.append((x, y))
        pts.append((S, S))
        d.polygon(pts, fill=color)
    img.filter(ImageFilter.GaussianBlur(0.6)).save(os.path.join(OUT, "mountains.png"))


# ---------- 2. 星球 ----------
def planet():
    img = Image.new("RGB", (S, S), (240, 233, 220))
    d = ImageDraw.Draw(img)
    # 星点
    for _ in range(46):
        x, y = random.uniform(0, S), random.uniform(0, S)
        r = random.uniform(1, 3)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(120, 118, 130))
    cx, cy, r = S / 2, S * 0.52, S * 0.30
    # 行星本体：竖向渐变球
    for i in range(100):
        t = i / 99
        rr = r * math.sqrt(1 - (2 * t - 1) ** 2)
        yy = cy - r + 2 * r * t
        shade = lerp((58, 56, 72), (16, 16, 24), t)
        d.line([(cx - rr, yy), (cx + rr, yy)], fill=shade, width=3)
    # 条纹带
    for k, (t0, t1, c) in enumerate([(0.30, 0.40, (255, 92, 31)), (0.55, 0.62, (214, 96, 60))]):
        yy0, yy1 = cy - r + 2 * r * t0, cy - r + 2 * r * t1
        d.chord([cx - r, cy - r, cx + r, cy + r], 0, 180, fill=None)
        for yy in range(int(yy0), int(yy1)):
            t = (yy - (cy - r)) / (2 * r)
            rr = r * math.sqrt(max(0, 1 - (2 * t - 1) ** 2))
            d.line([(cx - rr, yy), (cx + rr, yy)], fill=c, width=1)
    # 环
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse([cx - r * 1.7, cy - r * 0.42, cx + r * 1.7, cy + r * 0.42],
               outline=(30, 30, 40, 255), width=14)
    ring = ring.rotate(-16, center=(cx, cy), resample=Image.BICUBIC)
    img.paste(ring, (0, 0), ring)
    img.filter(ImageFilter.GaussianBlur(0.5)).save(os.path.join(OUT, "planet.png"))


# ---------- 3. 印章「印」 ----------
def seal():
    img = Image.new("RGB", (S, S), (238, 230, 214))
    d = ImageDraw.Draw(img)
    ink = (148, 38, 30)
    # 边框
    d.rounded_rectangle([70, 70, S - 70, S - 70], radius=28, outline=ink, width=22)
    # 字
    font = None
    for path, idx in [("/System/Library/Fonts/PingFang.ttc", 2),
                      ("/System/Library/Fonts/STHeiti Medium.ttc", 0),
                      ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0)]:
        try:
            font = ImageFont.truetype(path, 300, index=idx)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()
    bbox = d.textbbox((0, 0), "印", font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((S - w) / 2 - bbox[0], (S - h) / 2 - bbox[1]), "印", font=font, fill=ink)
    # 做旧噪点
    px = img.load()
    for _ in range(2600):
        x, y = random.randrange(S), random.randrange(S)
        r, g, b = px[x, y]
        n = random.randint(-26, 26)
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    img.filter(ImageFilter.GaussianBlur(0.4)).save(os.path.join(OUT, "seal.png"))


# ---------- 4. 等高线 ----------
def contours():
    img = Image.new("RGB", (S, S), (241, 236, 226))
    d = ImageDraw.Draw(img)
    cx, cy = S * 0.5, S * 0.55
    bands = 11
    for i in range(bands, 0, -1):
        t = i / bands
        rx, ry = S * 0.52 * t, S * 0.42 * t
        wobble = 1 + 0.16 * math.sin(i * 2.1)
        color = lerp((233, 226, 212), (24, 24, 32), 1 - t)
        d.ellipse([cx - rx * wobble, cy - ry, cx + rx * wobble, cy + ry], fill=color)
    # 副峰
    for i in range(6, 0, -1):
        t = i / 6
        rx, ry = S * 0.2 * t, S * 0.16 * t
        color = lerp((200, 194, 184), (40, 40, 52), 1 - t)
        d.ellipse([S * 0.78 - rx, S * 0.24 - ry, S * 0.78 + rx, S * 0.24 + ry], fill=color)
    img.filter(ImageFilter.GaussianBlur(0.6)).save(os.path.join(OUT, "contours.png"))


mountains()
planet()
seal()
contours()
print("samples written to", os.path.abspath(OUT))
