#!/usr/bin/env python3
"""
investliQ 5 sn bumper (Ekonoskop giriş jeneriği sonrası reklam geçişi) — Pillow kareler + ffmpeg.
Kullanım: python3 render_bumper.py --out bumper_16x9.mp4 [--vertical] [--fps 30] [--sec 5]
Tasarım tokenları: src/index.css (bg #0E1116, surface #151A21, teal #2DD4BF, success #22C55E, danger #EF4444)
Font: Lato (Inter yerine; nihai render'da Inter ile değiştirilebilir — aynı optik ağırlık).
Sahne: 0.0–0.8 s logo scale-in · 0.6–1.6 s "Investli" + gradient "Q" yazılır · 1.4 s slogan · 2.2 s URL ·
       3.0–5.0 s sabit + alt satırda "Bu video investliQ desteğiyle" · son 0.4 s fade-out. Altta canlı-görünümlü ticker şeridi.
"""
import argparse
import math
import os
import random
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont

BG = (14, 17, 22)
SURF = (21, 26, 33)
TEAL = (45, 212, 191)
CYAN = (34, 211, 238)
EMER = (16, 185, 129)
SUCC = (34, 197, 94)
DANG = (239, 68, 68)
FG = (241, 245, 249)
FG2 = (148, 163, 184)
FG3 = (100, 116, 139)

FONT_BLACK = "/usr/share/fonts/truetype/lato/Lato-Black.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/lato/Lato-Bold.ttf"
FONT_MED = "/usr/share/fonts/truetype/lato/Lato-Medium.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
ICON = os.path.join(os.path.dirname(__file__), "..", "..", "public", "web-app-manifest-512x512.png")

SPONSOR = "Bu video investliQ desteğiyle hazırlanmıştır · Yatırım tavsiyesi değildir"
TICKER = [("XU100", "11.117", -0.92), ("USD", "49,69", -0.08), ("EUR", "55,67", -0.33), ("Altın", "6.403", -1.29),
          ("BTC", "80.474", -0.74), ("THYAO", "312,50", 1.42), ("ASELS", "336,50", 0.65), ("KTJ", "2,65", 1.08),
          ("Brent", "111,7", -4.30), ("CDS", "251", 0.0)]


def ease_out(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def load_icon(size: int) -> Image.Image:
    im = Image.open(ICON).convert("RGBA").resize((size, size), Image.LANCZOS)
    # köşeleri yuvarla (iOS ikon maskesi)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
    im.putalpha(mask)
    return im


def gradient_text(text: str, font: ImageFont.FreeTypeFont, c1, c2) -> Image.Image:
    bbox = font.getbbox(text)
    w, h = bbox[2] - bbox[0] + 8, bbox[3] - bbox[1] + 8
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).text((-bbox[0] + 4, -bbox[1] + 4), text, font=font, fill=255)
    grad = Image.new("RGBA", (w, h))
    gp = grad.load()
    for y in range(h):
        for x in range(w):
            t = (x / max(1, w) + y / max(1, h)) / 2
            gp[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def text_layer(img, xy, txt, font, color, alpha):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).text(xy, txt, font=font, fill=color + (int(255 * max(0, min(1, alpha))),))
    img.alpha_composite(layer)


def frame(t: float, W: int, H: int, vertical: bool, seed: int) -> Image.Image:
    img = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(img)
    # arka plan: aurora parıltı (iki yumuşak daire)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    r1 = int(min(W, H) * 0.45)
    gd.ellipse([W * 0.15 - r1, H * 0.1 - r1, W * 0.15 + r1, H * 0.1 + r1], fill=CYAN + (38,))
    gd.ellipse([W * 0.85 - r1, H * 0.9 - r1, W * 0.85 + r1, H * 0.9 + r1], fill=EMER + (46,))
    glow = glow.filter(ImageFilter.GaussianBlur(min(W, H) * 0.12))
    img.alpha_composite(glow)
    # ince grid
    step = 80
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdr = ImageDraw.Draw(grid)
    for x in range(0, W, step):
        gdr.line([(x, 0), (x, H)], fill=(255, 255, 255, 10))
    for y in range(0, H, step):
        gdr.line([(0, y), (W, y)], fill=(255, 255, 255, 10))
    img.alpha_composite(grid)

    scale = 1.0 if not vertical else 0.78
    cx, cy = W // 2, int(H * (0.44 if not vertical else 0.42))

    # 1) logo scale-in
    s = ease_out(t / 0.8)
    isz = int(200 * scale * (0.6 + 0.4 * s))
    if isz > 2:
        ic = load_icon(int(260 * scale)).resize((isz, isz), Image.LANCZOS)
        a = ic.split()[3].point(lambda p: int(p * min(1, t / 0.5)))
        ic.putalpha(a)
        img.alpha_composite(ic, (cx - isz // 2, cy - int(150 * scale) - isz // 2))

    # 2) wordmark
    tw = ease_out((t - 0.6) / 1.0)
    if tw > 0:
        f_big = ImageFont.truetype(FONT_BLACK, int(118 * scale))
        f_q = ImageFont.truetype(FONT_BLACK, int(136 * scale))
        word = "Investli"
        wb = f_big.getbbox(word)
        qimg = gradient_text("Q", f_q, CYAN, EMER)
        total = (wb[2] - wb[0]) + qimg.width - 10
        x0 = cx - total // 2
        y0 = cy + int(10 * scale)
        # yazılma efekti: harf harf
        n = max(0, min(len(word), int(round(tw * len(word)))))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.text((x0, y0), word[:n], font=f_big, fill=FG + (255,))
        if tw >= 0.99:
            layer.alpha_composite(qimg, (x0 + (wb[2] - wb[0]) - 10, y0 - int(14 * scale)))
            # teal alt çizgi
            ul = ease_out((t - 1.5) / 0.4)
            if ul > 0:
                ld.rounded_rectangle([x0, y0 + int(140 * scale), x0 + int(total * ul), y0 + int(146 * scale)], radius=3, fill=TEAL + (255,))
        img.alpha_composite(layer)

    # 3) slogan
    ts = ease_out((t - 1.4) / 0.6)
    if ts > 0:
        f_s = ImageFont.truetype(FONT_BOLD, int(34 * scale))
        txt = "YATIRIMCILAR İÇİN AKILLI VERİ PLATFORMU"
        bb = f_s.getbbox(txt)
        text_layer(img, (cx - (bb[2] - bb[0]) // 2, cy + int(175 * scale) + int((1 - ts) * 20)), txt, f_s, TEAL, ts)
    # 4) URL
    tu = ease_out((t - 2.2) / 0.5)
    if tu > 0:
        f_u = ImageFont.truetype(FONT_BLACK, int(56 * scale))
        txt = "investliq.com"
        bb = f_u.getbbox(txt)
        text_layer(img, (cx - (bb[2] - bb[0]) // 2, cy + int(240 * scale) + int((1 - tu) * 20)), txt, f_u, FG, tu)
    # 5) sponsor satırı
    tp = ease_out((t - 3.0) / 0.5)
    if tp > 0:
        f_p = ImageFont.truetype(FONT_MED, int(26 * scale))
        txt = SPONSOR
        bb = f_p.getbbox(txt)
        text_layer(img, (cx - (bb[2] - bb[0]) // 2, cy + int(330 * scale)), txt, f_p, FG2, tp)

    # 6) alt ticker şeridi (yavaş kayan)
    th = int(54 * scale)
    d.rectangle([0, H - th, W, H], fill=SURF + (255,))
    d.line([(0, H - th), (W, H - th)], fill=(40, 48, 58, 255))
    f_t = ImageFont.truetype(FONT_MONO, int(20 * scale))
    x = -int((t * 90) % 2400)
    while x < W + 600:
        for sym, px, ch in TICKER:
            col = SUCC if ch > 0 else DANG if ch < 0 else FG3
            arrow = "▲" if ch > 0 else "▼" if ch < 0 else "—"
            d.text((x, H - th + int(16 * scale)), sym, font=f_t, fill=FG2 + (255,))
            x += f_t.getlength(sym) + 10
            d.text((x, H - th + int(16 * scale)), px, font=f_t, fill=FG + (255,))
            x += f_t.getlength(px) + 10
            chs = f"{arrow}{abs(ch):.2f}%".replace(".", ",")
            d.text((x, H - th + int(16 * scale)), chs, font=f_t, fill=col + (255,))
            x += f_t.getlength(chs) + 34

    # fade out (son 0.4 sn)
    return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="bumper_16x9.mp4")
    ap.add_argument("--vertical", action="store_true")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--sec", type=float, default=5.0)
    a = ap.parse_args()
    W, H = (1080, 1920) if a.vertical else (1920, 1080)
    n = int(a.fps * a.sec)
    tmp = tempfile.mkdtemp(prefix="bumper_")
    for i in range(n):
        t = i / a.fps
        im = frame(t, W, H, a.vertical, 7)
        fade = 1.0
        if t > a.sec - 0.4:
            fade = max(0.0, (a.sec - t) / 0.4)
        if t < 0.3:
            fade = min(fade, t / 0.3)
        if fade < 1.0:
            black = Image.new("RGBA", (W, H), BG + (255,))
            im = Image.blend(black, im, fade)
        im.convert("RGB").save(os.path.join(tmp, f"f_{i:04d}.png"))
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-framerate", str(a.fps), "-i", os.path.join(tmp, "f_%04d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", a.out], check=True)
    print("yazıldı:", a.out, f"({n} kare)")


if __name__ == "__main__":
    main()
