#!/usr/bin/env python3
"""
Shorts (9:16, 1080×1920, 28 sn) — aynı plakalardan dikey kırpım + büyük yazılar + CTA. Çıktı: shorts_28s.mp4 (+ shorts.srt)
0–3 kanca · 3–12 Portföy Ağı (KTJ) · 12–20 Tarama · 20–28 CTA
"""
import argparse
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_bumper as RB  # noqa: E402

H = os.path.dirname(os.path.abspath(__file__))
PL = os.path.join(H, "plates")
W, HH = 1080, 1920
F_H = ImageFont.truetype(RB.FONT_BLACK, 78)
F_S = ImageFont.truetype(RB.FONT_BOLD, 44)
F_T = ImageFont.truetype(RB.FONT_BLACK, 40)
_c: dict[str, Image.Image] = {}

VO = [
    (0.0, 3.0, "Fonun içinde NE var, biliyor musun?"),
    (3.0, 12.0, "KAP raporundan hisse hisse ağırlık. Tıkla, önceki aya göre farkı gör."),
    (12.0, 20.0, "Kendi kriterini kur, sonucu kanıtıyla gör."),
    (20.0, 28.0, "investliq.com — ücretsiz. Yatırım tavsiyesi değildir."),
]


def plate(n):
    if n not in _c:
        _c[n] = Image.open(os.path.join(PL, n + ".png")).convert("RGB")
    return _c[n]


def ease(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def crop_v(img, zoom, cx, cy):
    """Plakadan 9:16 kırpım: yükseklik = plaka yüksekliği / zoom, genişlik = 9/16'sı."""
    pw, ph = img.size
    ch = int(ph / zoom); cw = int(ch * 9 / 16)
    x0 = max(0, min(pw - cw, int(cx * pw - cw / 2))); y0 = max(0, min(ph - ch, int(cy * ph - ch / 2)))
    return img.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, HH), Image.LANCZOS)


def text_center(d, y, txt, font, fill, maxw=960):
    words, lines, cur = txt.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if font.getlength(t) > maxw and cur:
            lines.append(cur); cur = w
        else:
            cur = t
    lines.append(cur)
    for ln in lines:
        w = d.textlength(ln, font=font)
        d.text((W / 2 - w / 2, y), ln, font=font, fill=fill)
        y += font.size + 12
    return y


def frame(t):
    base = Image.new("RGB", (W, HH), RB.BG)
    if t < 3:  # kanca: koyu zemin + balon plakası arkada soluk
        bg = crop_v(plate("s3v_a"), 1.0 + 0.1 * ease(t / 3), 0.5, 0.45)
        base = Image.blend(base, bg, 0.35)
        d = ImageDraw.Draw(base)
        a = ease(t / 0.5)
        y = text_center(d, 640, "Fonun içinde", F_H, (241, 245, 249))
        y = text_center(d, y, "NE var?", F_H, (45, 212, 191))
        text_center(d, y + 30, "KTJ · Eylül 2026 · KAP raporu", F_S, (148, 163, 184))
        return base
    if t < 12:
        u = t - 3
        a = plate("s3v_a"); b = plate("s3v_b")
        z = 1.0 + 0.06 * ease(u / 9)
        fa = crop_v(a, z, 0.5, 0.45)
        if u < 4:
            return fa
        fb = crop_v(b, z, 0.5, 0.45)
        return Image.blend(fa, fb, ease((u - 4) / 0.6))
    if t < 20:
        u = t - 12
        a = plate("s5_screener_a"); b = plate("s5_screener_b")
        z = 1.0 + 0.08 * ease(u / 6)
        im = crop_v(a, z, 0.17, 0.5)
        if u > 5:
            im = Image.blend(im, crop_v(b, z, 0.17, 0.5), ease((u - 5) / 0.5))
        return im
    RB.SPONSOR = "Ücretsiz · Yatırım tavsiyesi değildir"
    return RB.frame(min(t - 20, 4.6), W, HH, True, 7).convert("RGB")


def overlays(im, t):
    im = im.convert("RGBA"); L = Image.new("RGBA", (W, HH), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    titles = {1: "Portföy Ağı", 2: "Tarama"}
    sc = 1 if 3 <= t < 12 else 2 if 12 <= t < 20 else 0
    if sc:
        tt = titles[sc]; w = d.textlength(tt, font=F_T) + 44
        d.rounded_rectangle([60, 300, 60 + w, 372], radius=14, fill=(14, 17, 22, 220), outline=(45, 212, 191, 180), width=2)
        d.text((82, 312), tt, font=F_T, fill=(241, 245, 249, 255))
    for s0, s1, txt in VO:
        if s0 <= t < s1 and t >= 3:
            a = min(1.0, (t - s0) / 0.3, (s1 - t) / 0.3)
            d2 = ImageDraw.Draw(L)
            words, lines, cur = txt.split(), [], ""
            for wd in words:
                tst = (cur + " " + wd).strip()
                if F_S.getlength(tst) > 920 and cur:
                    lines.append(cur); cur = wd
                else:
                    cur = tst
            lines.append(cur)
            y = 1380 if t < 20 else 1560
            for ln in lines:
                w = d2.textlength(ln, font=F_S)
                d2.rounded_rectangle([W / 2 - w / 2 - 20, y - 6, W / 2 + w / 2 + 20, y + 54], radius=10, fill=(0, 0, 0, int(160 * a)))
                d2.text((W / 2 - w / 2, y), ln, font=F_S, fill=(255, 255, 255, int(255 * a)))
                y += 58
    im.alpha_composite(L)
    return im.convert("RGB")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--fps", type=int, default=30); ap.add_argument("--out", default="shorts_28s.mp4"); a = ap.parse_args()
    n = int(28 * a.fps); out = os.path.join(H, a.out)
    ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{HH}", "-r", str(a.fps), "-i", "-",
                           "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    cuts = [3, 12, 20]
    for i in range(n):
        t = i / a.fps
        im = frame(t)
        for c in cuts:
            if c - 0.3 <= t < c:
                im = Image.blend(im, frame(c), ease((t - (c - 0.3)) / 0.3))
        im = overlays(im, t)
        if t > 27.5:
            im = Image.blend(im, Image.new("RGB", (W, HH), RB.BG), ease((t - 27.5) / 0.5))
        ff.stdin.write(im.tobytes())
    ff.stdin.close(); ff.wait()
    with open(os.path.join(H, "shorts.srt"), "w", encoding="utf-8") as f:
        for k, (s0, s1, txt) in enumerate(VO, 1):
            fmt = lambda s: f"00:00:{int(s):02d},{int((s % 1) * 1000):03d}"
            f.write(f"{k}\n{fmt(s0)} --> {fmt(s1)}\n{txt}\n\n")
    print("yazıldı:", out)


if __name__ == "__main__":
    main()
