#!/usr/bin/env python3
"""Скачивание шрифтов инструмента «Надпись» (packages/app/src/text/fonts).

Пять шрифтов под SIL OFL 1.1 берутся из репозитория Google Fonts **как есть**,
вместе с текстом лицензии. Файлы намеренно не обрезаются под наш алфавит: у
четырёх из пяти семейств имя защищено оговоркой Reserved Font Name, а обрезка
по OFL-FAQ 2.6 считается изменением шрифта, после которого прежнее имя носить
нельзя. Экономия в мегабайт не стоит переименования «PT Sans» во что-то своё —
тем более что шрифты не входят в бандл первого экрана: браузер берёт их только
когда ребёнок открыл инструмент.

Запуск:  python3 scripts/fetch-fonts.py
"""

import urllib.request
from pathlib import Path

БАЗА = "https://raw.githubusercontent.com/google/fonts/main/ofl"

# (каталог в google/fonts, файл шрифта)
ШРИФТЫ = [
    ("ptsans", "PT_Sans-Web-Regular.ttf"),
    ("ptserif", "PT_Serif-Web-Regular.ttf"),
    ("ptmono", "PTM55FT.ttf"),
    ("badscript", "BadScript-Regular.ttf"),
    ("ruslandisplay", "RuslanDisplay-Regular.ttf"),
]

ВЫХОД = Path(__file__).resolve().parent.parent / "packages" / "app" / "src" / "text" / "fonts"


def скачать(адрес: str, цель: Path) -> None:
    urllib.request.urlretrieve(адрес, цель)
    print(f"{цель.name}: {цель.stat().st_size} байт")


def main() -> int:
    ВЫХОД.mkdir(parents=True, exist_ok=True)
    for каталог, файл in ШРИФТЫ:
        скачать(f"{БАЗА}/{каталог}/{файл}", ВЫХОД / файл)
        # Лицензия распространяется вместе со шрифтом — этого требует пункт 2 OFL.
        скачать(f"{БАЗА}/{каталог}/OFL.txt", ВЫХОД / f"OFL-{каталог}.txt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
