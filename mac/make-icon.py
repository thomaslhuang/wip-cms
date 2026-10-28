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
    f = ImageFont.truetype("/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf", 330)
    text = "wip"
    bb = d.textbbox((0, 0), text, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (W - tw) / 2 - 34 - bb[0]
    y = (W - th) / 2 - 40 - bb[1]
    d.text((x, y), text, font=f, fill=(29, 29, 31, 255))
    # a blue text cursor after the word
    cx = x + bb[2] + 34
    d.rounded_rectangle((cx, y + bb[1] - 18, cx + 26, y + bb[3] + 22), 13, fill=(10, 102, 216, 255))
    f2 = ImageFont.truetype("/usr/share/fonts/opentype/inter/Inter-Medium.otf", 92)
    sub = "cms"
    b2 = d.textbbox((0, 0), sub, font=f2)
    d.text(((W - (b2[2] - b2[0])) / 2 - b2[0], 690), sub, font=f2, fill=(110, 110, 115, 255))
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
