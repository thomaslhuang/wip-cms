import struct, io, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S = 1024
def icon(size=1024):
    W = 1024
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    # soft shadow under the tile
    sh = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((100, 112, 924, 936), 186, fill=(0, 0, 0, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(sh)
    # the tile: white to light gray
    tile = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    grad = Image.new("RGBA", (W, W))
    gd = ImageDraw.Draw(grad)
    for y in range(W):
        t = (y - 100) / 824
        c = int(255 - 18 * max(0, min(1, t)))
        gd.line([(0, y), (W, y)], fill=(c, c, min(255, c + 2), 255))
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle((100, 100, 924, 924), 186, fill=255)
    tile.paste(grad, (0, 0), mask)
    img.alpha_composite(tile)
    d = ImageDraw.Draw(img)
    # "w·i·p": the letters in near-black, the two dots in the accent blue
    f = ImageFont.truetype("/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf", 300)
    parts = [("w", (29, 29, 31, 255)), ("·", (10, 102, 216, 255)), ("i", (29, 29, 31, 255)), ("·", (10, 102, 216, 255)), ("p", (29, 29, 31, 255))]
    gap = -6
    widths = [d.textlength(t, font=f) for t, _ in parts]
    total = sum(widths) + gap * (len(parts) - 1)
    # centered on the tile, by the letters' x-height (so the descender of p hangs below)
    bx = d.textbbox((0, 0), "wip", font=f)
    xh = d.textbbox((0, 0), "w", font=f)
    x = (W - total) / 2
    y = 512 - (xh[1] + xh[3]) / 2 - 20
    for (t, color), w in zip(parts, widths):
        d.text((x, y), t, font=f, fill=color)
        x += w + gap
    return img
big = icon()
out = sys.argv[1]
big.save(out + "/icon-1024.png")
def png(sz):
    b = io.BytesIO(); big.resize((sz, sz), Image.LANCZOS).save(b, "PNG"); return b.getvalue()
entries = [(b"ic07", png(128)), (b"ic08", png(256)), (b"ic09", png(512)), (b"ic10", png(1024)), (b"ic11", png(32)), (b"ic12", png(64)), (b"ic13", png(256)), (b"ic14", png(512))]
body = b"".join(t + struct.pack(">I", len(d) + 8) + d for t, d in entries)
open(out + "/AppIcon.icns", "wb").write(b"icns" + struct.pack(">I", len(body) + 8) + body)
big.resize((180, 180), Image.LANCZOS).save(out + "/apple-touch-icon.png")
big.resize((64, 64), Image.LANCZOS).save(out + "/favicon.png")
