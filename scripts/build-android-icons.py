"""Собирает android-иконки из единственного источника src-tauri/icons/icon.png.

Смысл: tauri icon вырезает шар почти под самый край adaptive-канвы (108dp), поэтому на
лончере скульптуру обрезает по маске. Здесь задаётся доля канвы, которую занимает шар.

лончеры ведут себя по-разному: одни рисуют всю канву 108dp как плитку, другие режут до
центральных 72dp (тогда шар выглядит в 1.5 раза крупнее). наш (honor unihome) рисует всю
канву — проверено по фото собственной иконки: шар 0.46 канвы читался как 0.47 плитки.
поэтому --scale задаётся прямо как доля плитки у референса: 0.56.

    python scripts/build-android-icons.py --scale 0.56
    python scripts/build-android-icons.py --scale 0.62 --preview .tmp-icon/preview.png
"""

import argparse
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src-tauri" / "icons" / "icon.png"
OUT = ROOT / "src-tauri" / "icons" / "android"
GEN = ROOT / "src-tauri" / "gen" / "android"

BG = (9, 9, 11, 255)  # тот же #09090b, что в values/ic_launcher_background.xml
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
CANVAS_DP = 108  # adaptive: 108dp канва, 72dp видимая зона
LEGACY_DP = 48  # обычная иконка без маски


def sculpture() -> Image.Image:
    """Шар из icon.png с альфой по силуэту: фон вокруг — плоский тёмный."""
    src = Image.open(SRC).convert("RGBA")
    bbox = src.convert("L").point(lambda v: 255 if v > 40 else 0).getbbox()
    crop = src.crop(bbox)

    # заливка от края помечает внешний фон; всё, что не помечено, — шар вместе
    # с тёмными складками внутри силуэта
    flood = crop.convert("L").point(lambda v: 255 if v > 40 else 0)
    for corner in ((0, 0), (flood.width - 1, 0), (0, flood.height - 1), (flood.width - 1, flood.height - 1)):
        if flood.getpixel(corner) == 0:
            ImageDraw.floodfill(flood, corner, 128)
    crop.putalpha(flood.point(lambda v: 0 if v == 128 else 255))
    return crop


def scaled(img: Image.Image, diameter: int) -> Image.Image:
    w = max(1, round(img.width * diameter / max(img.width, img.height)))
    h = max(1, round(img.height * diameter / max(img.width, img.height)))
    return img.resize((w, h), Image.LANCZOS)


def foreground(ball: Image.Image, size: int, share: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    art = scaled(ball, round(size * share))
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def legacy(ball: Image.Image, size: int, share: float, rounded: bool) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    if rounded:
        draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    else:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.22), fill=255)
    canvas.paste(Image.new("RGBA", (size, size), BG), (0, 0), mask)
    art = scaled(ball, round(size * share))
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def preview(ball: Image.Image, share: float, path: Path, before: Path | None) -> None:
    """Лента: как выглядит на лончере — было, стало сквирклом, стало кругом."""
    tile = 180  # видимая зона маски, 72dp

    def visible(fg: Image.Image) -> Image.Image:
        inset = (fg.width - round(fg.width * 2 / 3)) // 2
        return fg.crop((inset, inset, fg.width - inset, fg.height - inset)).resize((tile, tile), Image.LANCZOS)

    def masked(fg: Image.Image, shape: str) -> Image.Image:
        base = Image.new("RGBA", (tile, tile), BG)
        base.alpha_composite(visible(fg), (0, 0))
        m = Image.new("L", (tile, tile), 0)
        d = ImageDraw.Draw(m)
        if shape == "circle":
            d.ellipse((0, 0, tile - 1, tile - 1), fill=255)
        else:
            d.rounded_rectangle((0, 0, tile - 1, tile - 1), radius=round(tile * 0.28), fill=255)
        base.putalpha(m)
        return base

    new_fg = foreground(ball, round(tile * 1.5), share)
    tiles = [masked(new_fg, "squircle"), masked(new_fg, "circle")]
    if before:
        tiles.insert(0, masked(Image.open(before).convert("RGBA"), "squircle"))

    sheet = Image.new("RGBA", (tile * len(tiles) + 24 * (len(tiles) - 1) + 16, tile + 32), (24, 24, 27, 255))
    for i, img in enumerate(tiles):
        sheet.alpha_composite(img, (i * (tile + 24) + 8, 16))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=float, default=0.56, help="доля adaptive-канвы под шар")
    ap.add_argument("--legacy-scale", type=float, default=0.56, help="доля обычной иконки под шар")
    ap.add_argument("--preview", type=Path)
    ap.add_argument("--before", type=Path, help="старая foreground-иконка для сравнения в превью")
    args = ap.parse_args()

    ball = sculpture()
    if args.preview:
        preview(ball, args.scale, args.preview, args.before)

    for density, factor in DENSITIES.items():
        d = OUT / f"mipmap-{density}"
        d.mkdir(parents=True, exist_ok=True)
        canvas = round(CANVAS_DP * factor)
        foreground(ball, canvas, args.scale).save(d / "ic_launcher_foreground.png", optimize=True)

        size = round(LEGACY_DP * factor)
        legacy(ball, size, args.legacy_scale, rounded=False).save(d / "ic_launcher.png", optimize=True)
        legacy(ball, size, args.legacy_scale, rounded=True).save(d / "ic_launcher_round.png", optimize=True)

    # tauri раскладывает mipmap в проект android только при инициализации, дальше res/
    # остаётся тем, что было на машине. без этой синхронизации ассеты уезжают в APK
    # в старом виде и правка иконки видна только в git.
    res = GEN / "app" / "src" / "main" / "res"
    if res.is_dir():
        for path in OUT.rglob("*"):
            if path.is_file():
                target = res / path.relative_to(OUT)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, target)
        print(f"synced {OUT.relative_to(ROOT)} -> {res.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
