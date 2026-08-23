from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter
import os

W, H = 1200, 630
src = Image.open('og-raw.png').convert('RGB')
src = ImageEnhance.Brightness(src).enhance(1.32)
src = ImageEnhance.Contrast(src).enhance(1.12)
target_ar = W / H
sw, sh = src.size
if sw / sh > target_ar:
    nw = int(sh * target_ar); x0 = (sw - nw) // 2
    src = src.crop((x0, 0, x0 + nw, sh))
else:
    nh = int(sw / target_ar); y0 = (sh - nh) // 3
    src = src.crop((0, y0, sw, y0 + nh))
canvas = src.resize((W, H), Image.LANCZOS).convert('RGBA')

overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
od = ImageDraw.Draw(overlay)
for y in range(H):
    t = max(0, (y - (H - 240)) / 240)
    od.line([(0, y), (W, y)], fill=(5, 6, 9, int(215 * t * t)))
for x in range(W):
    t = max(0, 1 - x / 620)
    od.line([(x, 0), (x, H)], fill=(5, 6, 9, int(70 * t * t)))
canvas = Image.alpha_composite(canvas, overlay)

def font(size, bold=False):
    p = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    return ImageFont.truetype(p, size) if os.path.exists(p) else ImageFont.load_default()

def text_soft_shadow(base, pos, text, fnt, fill, blur=3, off=4):
    """Draw text with a single soft blurred shadow on a separate layer."""
    sh_layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh_layer)
    sd.text((pos[0] + off, pos[1] + off), text, font=fnt, fill=(0, 0, 0, 255))
    if blur > 0:
        sh_layer = sh_layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(sh_layer)
    d = ImageDraw.Draw(base)
    d.text(pos, text, font=fnt, fill=fill)

text_soft_shadow(canvas, (42, H - 160), 'POOP SOULS', font(102, True), (246, 244, 236), blur=4, off=5)
text_soft_shadow(canvas, (46, H - 68), 'A DARK BOWELS LEGEND', font(31, True), (226, 172, 82), blur=2, off=3)
text_soft_shadow(canvas, (46, H - 33), 'THREE ZONES  ·  THREE BOSSES  ·  DEATH IS REAL', font(22, False), (205, 210, 222), blur=2, off=2)

ptext = 'hermespertti.github.io'
ptw = ImageDraw.Draw(canvas).textlength(ptext, font=font(20, True))
text_soft_shadow(canvas, (W - 36 - ptw, 26), ptext, font(20, True), (145, 198, 255), blur=2, off=2)

os.makedirs('public', exist_ok=True)
canvas.convert('RGB').save('public/og-image.png', optimize=True)
print('og-image.png', os.path.getsize('public/og-image.png'), 'bytes')
