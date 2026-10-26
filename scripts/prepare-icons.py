"""Size ImageGen PNG originals without replacing their transparent background.

Usage: python scripts/prepare-icons.py path/to/manifest.json
The manifest maps icon names to original PNG paths, including coin-small.
Requires Pillow. Original images remain untouched.

       python scripts/prepare-icons.py --repad
Re-crops the shipped PNGs in public/icons to their visible artwork and refills
the canvas at FILL, for when the originals are not at hand.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public' / 'icons'
FILL = 0.96  # 主體占畫面比例；只留極小透明邊，避免圖示在 UI 中顯得過小


def fit(image: Image.Image, size: int) -> Image.Image:
    """裁到可見內容，等比縮放至 FILL，置中貼回正方形透明畫布。"""
    alpha = image.getchannel('A')
    bounds = alpha.point(lambda a: 255 if a > 8 else 0).getbbox()
    if not bounds or alpha.getextrema()[0] != 0:
        raise ValueError('Expected transparent artwork')
    image = image.crop(bounds)
    edge = round(size * FILL)
    scale = edge / max(image.width, image.height)
    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    result = Image.new('RGBA', (size, size))
    result.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
    return result


def sized(source: Path, size: int) -> Image.Image:
    return fit(Image.open(source).convert('RGBA'), size)


def repad() -> None:
    """原圖不在手邊時，直接重新裁切已輸出的 PNG。小圖由 128px 版縮出，金幣小圖保留其簡化版本。"""
    names = sorted(p.stem for p in DEST.glob('*.png'))
    for name in names:
        large = Image.open(DEST / f'{name}.png').convert('RGBA')
        fit(large, 128).save(DEST / f'{name}.png', optimize=True)
        small_src = Image.open(DEST / 'small' / f'{name}.png').convert('RGBA') if name == 'coin' else large
        fit(small_src, 32).save(DEST / 'small' / f'{name}.png', optimize=True)
    print(f'Re-padded {len(names)} icons at FILL={FILL}')


def main() -> None:
    if sys.argv[1:] == ['--repad']:
        repad()
        return
    manifest = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
    (DEST / 'small').mkdir(parents=True, exist_ok=True)
    names = sorted(name for name in manifest if name != 'coin-small')
    for name in names:
        sized(Path(manifest[name]), 128).save(DEST / f'{name}.png', optimize=True)
        small_source = manifest['coin-small'] if name == 'coin' else manifest[name]
        sized(Path(small_source), 32).save(DEST / 'small' / f'{name}.png', optimize=True)

    # Review the actual shipped PNGs at three display sizes on the UI background.
    columns, cell_w, cell_h = 8, 150, 156
    rows = (len(names) + columns - 1) // columns
    sheet = Image.new('RGB', (columns * cell_w, rows * cell_h), '#1a1f25')
    draw = ImageDraw.Draw(sheet)
    for index, name in enumerate(names):
        x, y = index % columns * cell_w, index // columns * cell_h
        large = Image.open(DEST / f'{name}.png').convert('RGBA')
        large.thumbnail((88, 88), Image.Resampling.LANCZOS)
        sheet.paste(large, (x + 31, y + 4), large)
        small = Image.open(DEST / 'small' / f'{name}.png').convert('RGBA')
        sheet.paste(small, (x + 45, y + 94), small)
        tiny = small.resize((16, 16), Image.Resampling.LANCZOS)
        sheet.paste(tiny, (x + 89, y + 102), tiny)
        draw.text((x + 12, y + 134), name, fill='#f4ecdc')
    preview = ROOT / 'output' / 'playwright' / 'icons-preview.png'
    preview.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(preview)
    print(f'Prepared {len(names)} icons at 128px and 32px; preview: {preview}')


if __name__ == '__main__':
    main()
