"""Generates the small JPEG fixtures used by the storage tests.
Run with: .local-stack/venv/bin/python scripts/make-test-photos.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "photos"
OUT.mkdir(parents=True, exist_ok=True)

def car(number, size=(1200, 800), colour=(214, 40, 40), sky=(159, 197, 168)):
    w, h = size
    im = Image.new("RGB", size, sky)
    d = ImageDraw.Draw(im)
    d.rectangle([0, int(h * 0.58), w, h], fill=(107, 91, 62))
    for x in range(0, w, max(60, w // 10)):
        d.polygon([(x, int(h * 0.58)), (x + 30, int(h * 0.25)), (x + 60, int(h * 0.58))], fill=(31, 77, 43))
    cx, cy, cw, ch = w // 2, int(h * 0.68), int(w * 0.5), int(h * 0.2)
    d.rounded_rectangle([cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2], 20, fill=colour, outline=(0, 0, 0), width=4)
    pw, ph = int(cw * 0.3), int(ch * 0.6)
    d.rectangle([cx - pw // 2, cy - ph // 2, cx + pw // 2, cy + ph // 2], fill="white", outline="black", width=3)
    try:
        font = ImageFont.load_default(size=max(16, int(ph * 0.75)))
    except TypeError:
        font = ImageFont.load_default()
    d.text((cx, cy), number, fill="black", font=font, anchor="mm")
    return im

def save(im, name, dt=None, offset=None):
    exif = Image.Exif()
    if dt:
        ifd = exif.get_ifd(0x8769)
        ifd[0x9003] = dt
        if offset:
            ifd[0x9011] = offset
    im.save(OUT / name, "JPEG", quality=70, exif=exif.tobytes() if dt else b"")

save(car("32"), "car32-a.jpg", "2026:03:14 09:12:05")
save(car("32", colour=(200, 30, 30)), "car32-b.jpg", "2026:03:14 09:12:06")
save(car("032", colour=(29, 78, 216)), "car032.jpg", "2026:03:14 10:00:00", "+00:00")
save(car("320", colour=(245, 158, 11)), "car320.jpg", "2026:07:01 10:00:00")
save(car("32", colour=(180, 20, 20), sky=(245, 158, 122)), "car32-c-noexif.jpg")
save(car("15", size=(800, 1200), colour=(14, 165, 233)), "portrait-15.jpg", "2026:03:14 11:31:00", "+01:00")
save(car("7", size=(3200, 2000)), "too-wide.jpg", "2026:03:14 09:00:00")
save(car("7", size=(500, 340)), "too-small.jpg")
Image.new("RGB", (900, 600), (0, 0, 0)).save(OUT / "really-a-png.jpg", "PNG")
for p in sorted(OUT.iterdir()):
    print(p.name, p.stat().st_size)
