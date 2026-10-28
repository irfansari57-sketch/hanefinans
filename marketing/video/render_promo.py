#!/usr/bin/env python3
"""
Ana tanıtım videosu (16:9, 68 sn) — plakalar (scenes.py) + hareket (pan/zoom/crossfade) + alt başlık/altyazı + CTA.
Ses: yok (seslendirme ve müzik kurguda eklenir; vo.srt üretilir). Çıktı: tanitim_68s.mp4
Kullanım: python3 render_promo.py [--fps 30] [--out tanitim_68s.mp4] [--fast]  (--fast: 15 fps, hızlı önizleme)
"""
import argparse
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_bumper as RB  # noqa: E402

H = os.path.dirname(os.path.abspath(__file__))
PL = os.path.join(H, "plates")
D = json.load(open(os.path.join(H, "data.json"), encoding="utf-8"))
W, HH = 1920, 1080
F_SUB = ImageFont.truetype(RB.FONT_BOLD, 34)
F_LT = ImageFont.truetype(RB.FONT_BLACK, 26)
F_LT2 = ImageFont.truetype(RB.FONT_MED, 20)

_cache: dict[str, Image.Image] = {}


def plate(name: str) -> Image.Image:
    if name not in _cache:
        _cache[name] = Image.open(os.path.join(PL, name + ".png")).convert("RGB")
    return _cache[name]


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)  # smoothstep


def kb(img: Image.Image, zoom: float, cx: float, cy: float, y_off: int = 0) -> Image.Image:
    """Ken Burns: plakadan zoom'lu kırpım. cx,cy = 0..1 odak (plaka koordinatında), y_off = dikey kaydırma (px)."""
    pw, ph = img.size
    cw, ch = int(W / zoom), int(HH / zoom)
    x0 = int(cx * pw - cw / 2)
    y0 = int(cy * ph - ch / 2) + y_off
    x0 = max(0, min(pw - cw, x0))
    y0 = max(0, min(ph - ch, y0))
    return img.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, HH), Image.BILINEAR if zoom < 1.02 else Image.LANCZOS)


def blend(a: Image.Image, b: Image.Image, t: float) -> Image.Image:
    return Image.blend(a, b, ease(t))


LOWER_THIRDS = {
    2: ("Panel", "BIST · Fon · Kripto · Döviz — tek ekran, kaynak ve saat her kartta"),
    3: ("Portföy Ağı", "KAP aylık rapor → fonun içindeki hisseler, ağırlıklarıyla"),
    4: ("Hisse + Bilanço", "Fiyatın yanında mali tablolar · Bilanço Okuryazarlığı rehberi"),
    5: ("Tarama + Kural Alarmı", "Kendi kriterin, kanıtlı sonuç, koşul oluşunca bildirim"),
    6: ("Haber Akışı", "Kritik KAP başlıkları otomatik etiketlenir"),
    7: ("Portföy + Risk", "Bulut senkron · her cihazda aynı hesap"),
}


def scene_frame(t: float) -> tuple[Image.Image, int]:
    """t: saniye → (kare, sahne no)"""
    if t < 4:  # S1 başlık
        im = kb(plate("s1_title"), 1.0 + 0.04 * ease(t / 4), 0.5, 0.5)
        if t < 0.6:
            im = Image.blend(Image.new("RGB", (W, HH), RB.BG), im, ease(t / 0.6))
        return im, 1
    if t < 12:  # S2 panel kaydırma
        u = (t - 4) / 8
        p = plate("s2_panel")
        y = int(ease(u) * (p.height - HH))
        return kb(p, 1.0 + 0.03 * (1 - ease(min(1, u * 2))), 0.5, 0.0, y_off=y), 2
    if t < 22:  # S3 balonlar: zoom → panel
        u = t - 12
        a = plate("s3_bubbles_a"); b = plate("s3_bubbles_b")
        if u < 4.5:
            z = 1.0 + 0.18 * ease(u / 4.5)
            return kb(a, z, 0.26, 0.56), 3
        z = 1.18 - 0.14 * ease((u - 4.5) / 3.5)
        cx = 0.26 + 0.18 * ease((u - 4.5) / 3.5)
        fa, fb = kb(a, z, cx, 0.56), kb(b, z, cx, 0.56)
        if u < 5.1:
            return blend(fa, fb, (u - 4.5) / 0.6), 3
        return fb, 3
    if t < 30:  # S4 hisse/bilanço: soldan sağa pan
        u = (t - 22) / 8
        return kb(plate("s4_stock"), 1.10 - 0.06 * ease(u), 0.32 + 0.36 * ease(u), 0.62), 4
    if t < 40:  # S5 tarama → toast
        u = t - 30
        a = plate("s5_screener_a"); b = plate("s5_screener_b")
        z = 1.06 - 0.06 * ease(u / 5)
        fa = kb(a, z, 0.5, 0.45)
        if u < 6:
            return fa, 5
        fb = kb(b, z, 0.5, 0.45)
        if u < 6.5:
            return blend(fa, fb, (u - 6) / 0.5), 5
        return fb, 5
    if t < 50:  # S6 haber: kritik satıra zoom
        u = (t - 40) / 10
        return kb(plate("s6_news"), 1.0 + 0.12 * ease(u), 0.45, 0.26), 6
    if t < 58:  # S7 portföy → telefona pan
        u = (t - 50) / 8
        return kb(plate("s7_portfolio"), 1.0 + 0.06 * ease(u), 0.5, 0.52), 7
    # S8 CTA (bumper motoru, 10 sn)
    RB.SPONSOR = "Ücretsiz başla · Yatırım tavsiyesi değildir · Veriler kaynak ve saatiyle gösterilir"
    im = RB.frame(min(t - 58, 4.6), W, HH, False, 7).convert("RGB")
    return im, 8


def draw_overlays(im: Image.Image, t: float, scene: int, t_scene_start: float) -> Image.Image:
    im = im.convert("RGBA")
    layer = Image.new("RGBA", (W, HH), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # alt başlık (lower third) — sahne 2..7, ilk 0.6 sn'de kayarak gelir
    if scene in LOWER_THIRDS:
        a = ease((t - t_scene_start) / 0.6)
        title, sub = LOWER_THIRDS[scene]
        x = 48 - int((1 - a) * 60)
        y = 158
        tw = max(d.textlength(title, font=F_LT), d.textlength(sub, font=F_LT2)) + 44
        d.rounded_rectangle([x, y, x + tw, y + 84], radius=14, fill=(14, 17, 22, int(215 * a)), outline=(45, 212, 191, int(160 * a)), width=2)
        d.rectangle([x, y + 14, x + 5, y + 70], fill=(45, 212, 191, int(255 * a)))
        d.text((x + 22, y + 12), title, font=F_LT, fill=(241, 245, 249, int(255 * a)))
        d.text((x + 22, y + 48), sub, font=F_LT2, fill=(148, 163, 184, int(255 * a)))
    # altyazı (VO metni) — alt bant
    for s0, s1, txt in D["vo"]:
        if s0 <= t < s1:
            a = min(1.0, (t - s0) / 0.3, (s1 - t) / 0.3)
            lines = wrap(txt, F_SUB, 1500)
            y = HH - 60 - 46 * len(lines)
            for ln in lines:
                w = d.textlength(ln, font=F_SUB)
                d.rounded_rectangle([W / 2 - w / 2 - 18, y - 4, W / 2 + w / 2 + 18, y + 44], radius=8, fill=(0, 0, 0, int(150 * a)))
                d.text((W / 2 - w / 2, y), ln, font=F_SUB, fill=(255, 255, 255, int(255 * a)))
                y += 46
    im.alpha_composite(layer)
    return im.convert("RGB")


def wrap(txt: str, font, maxw: int) -> list[str]:
    words, lines, cur = txt.split(), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if font.getlength(test) > maxw and cur:
            lines.append(cur); cur = w
        else:
            cur = test
    if cur:
        lines.append(cur)
    return lines


SCENE_STARTS = {1: 0, 2: 4, 3: 12, 4: 22, 5: 30, 6: 40, 7: 50, 8: 58}
XFADE = 0.4  # sahne geçişi crossfade (sn)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--out", default="tanitim_68s.mp4")
    ap.add_argument("--fast", action="store_true")
    ap.add_argument("--sec", type=float, default=68.0)
    ap.add_argument("--start", type=float, default=0.0)  # segment render (araç zaman sınırı) → ffmpeg concat
    a = ap.parse_args()
    fps = 15 if a.fast else a.fps
    n = int(a.sec * fps); i0 = int(a.start * fps)
    out = os.path.join(H, a.out)
    ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{HH}", "-r", str(fps), "-i", "-",
                           "-c:v", "libx264", "-preset", "medium" if not a.fast else "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for i in range(i0, n):
        t = i / fps
        im, sc = scene_frame(t)
        # sahne geçişi: bir sonraki sahnenin başına yaklaşırken crossfade
        for s_no, s_t in SCENE_STARTS.items():
            if s_no > 1 and s_t - XFADE <= t < s_t:
                nxt, _ = scene_frame(s_t)
                im = blend(im, nxt, (t - (s_t - XFADE)) / XFADE)
        im = draw_overlays(im, t, sc, SCENE_STARTS[sc])
        if t > a.sec - 0.5:
            im = Image.blend(im, Image.new("RGB", (W, HH), RB.BG), ease((t - (a.sec - 0.5)) / 0.5))
        ff.stdin.write(im.tobytes())
        if i % (fps * 5) == 0:
            print(f"{t:5.1f}s / {a.sec:.0f}s", flush=True)
    ff.stdin.close(); ff.wait()
    # SRT
    with open(os.path.join(H, "vo.srt"), "w", encoding="utf-8") as f:
        for k, (s0, s1, txt) in enumerate(D["vo"], 1):
            fmt = lambda s: f"{int(s//3600):02d}:{int(s%3600//60):02d}:{int(s%60):02d},{int((s%1)*1000):03d}"
            f.write(f"{k}\n{fmt(s0)} --> {fmt(s1)}\n{txt}\n\n")
    print("yazıldı:", out, "ve vo.srt")


if __name__ == "__main__":
    main()
