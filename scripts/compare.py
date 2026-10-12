# usage: python3 compare.py <dirA> <dirB> <outdir>
# Side-by-side montage (A left, B right) per screenshot, plus the share of pixels that differ.
import sys, os
from PIL import Image, ImageChops
a, b, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
for name in sorted(f for f in os.listdir(a) if f.endswith('.png')):
    if not os.path.exists(os.path.join(b, name)): print(f'{name}: missing in {b}'); continue
    A, B = Image.open(os.path.join(a, name)).convert('RGB'), Image.open(os.path.join(b, name)).convert('RGB')
    d = ImageChops.difference(A, B).convert('L').point(lambda v: 255 if v > 24 else 0)
    share = sum(d.histogram()[255:]) / (A.width * A.height)
    m = Image.new('RGB', (A.width + B.width + 8, max(A.height, B.height)), (255, 0, 0))
    m.paste(A, (0, 0)); m.paste(B, (A.width + 8, 0))
    m.save(os.path.join(out, name))
    print(f'{name}: {share * 100:.2f}% pixels differ')
